import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, WhatsappInboundMessage } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappCloudService } from './whatsapp-cloud.service';
import { WhatsappReportAiService } from './whatsapp-report-ai.service';
import { WhatsappReportRecordsService } from './whatsapp-report-records.service';
import {
  Draft,
  EquipmentReplyOptions,
  emptyDraft,
  HELP,
  IncomingWhatsappMessage,
  normalized,
  normalizePhone,
} from './whatsapp-report.types';

import {
  employeeGreeting,
  isGreeting,
  reportMenuText,
  selectionKind,
  selectionPrompt,
} from './whatsapp-menu';
import {
  equipmentPicker,
  equipmentReference,
  findEquipment,
} from './whatsapp-equipment';
import type { WhatsappReplyKind } from './whatsapp-menu';

const LEASE_MS = 180000;
const DRAFT_TTL_MS = 30 * 60000;
const enabled = () => process.env.WHATSAPP_REPORTS_ENABLED === 'true';

@Injectable()
export class WhatsappInboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappInboxService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloud: WhatsappCloudService,
    private readonly files: FilesService,
    private readonly ai: WhatsappReportAiService,
    private readonly records: WhatsappReportRecordsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 2000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async enqueue(messages: IncomingWhatsappMessage[], phoneNumberId?: string) {
    if (
      !enabled() ||
      !phoneNumberId ||
      phoneNumberId !== process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
    )
      return 0;
    let accepted = 0;
    for (const message of messages) {
      const phone = normalizePhone(message.from);
      const seconds = Number(message.timestamp);
      if (
        !message.id ||
        message.id.length > 250 ||
        !phone ||
        !Number.isFinite(seconds) ||
        seconds <= 0
      )
        continue;
      const sentAt = new Date(seconds * 1000);
      if (
        !Number.isFinite(sentAt.getTime()) ||
        sentAt.getTime() > Date.now() + 300000
      )
        continue;
      const text = (
        message.text?.body ??
        message.image?.caption ??
        message.interactive?.button_reply?.title ??
        message.interactive?.list_reply?.title ??
        ''
      ).slice(0, 4000);
      const result = await this.prisma.whatsappInboundMessage.createMany({
        data: [
          {
            providerMessageId: message.id,
            phone,
            phoneNumberId,
            type: (message.type ?? 'unknown').slice(0, 40),
            text,
            selectionId:
              message.type === 'interactive'
                ? (
                    message.interactive?.button_reply?.id ??
                    message.interactive?.list_reply?.id
                  )?.slice(0, 120)
                : null,
            mediaId:
              message.type === 'image'
                ? message.image?.id?.slice(0, 100)
                : null,
            sentAt,
          },
        ],
        skipDuplicates: true,
      });
      accepted += result.count;
    }
    return accepted;
  }

  async tick() {
    if (this.running || !enabled()) return;
    this.running = true;
    try {
      await this.prisma.whatsappInboundMessage.updateMany({
        where: {
          status: 'PROCESSING',
          updatedAt: { lt: new Date(Date.now() - LEASE_MS) },
        },
        data: { status: 'QUEUED', nextAttemptAt: new Date() },
      });
      const messages = await this.prisma.whatsappInboundMessage.findMany({
        where: { status: 'QUEUED', nextAttemptAt: { lte: new Date() } },
        orderBy: [{ sentAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        take: 10,
      });
      for (const message of messages) await this.processOne(message);
      await this.sendReplies();
    } catch {
      this.logger.error(
        'WhatsApp inbox worker failed; pending messages remain in the durable queue',
      );
    } finally {
      this.running = false;
    }
  }

  private async employeeForPhone(phone: string) {
    // Employee phone formats predate this channel. Normalize and reject any ambiguous ownership.
    const employees = await this.prisma.employee.findMany({
      where: { active: true, phone: { not: null } },
    });
    const matches = employees.filter((e) => normalizePhone(e.phone) === phone);
    if (matches.length !== 1) return null;
    const employee = matches[0];
    if (
      employee.userId &&
      !(await this.prisma.user.findFirst({
        where: { id: employee.userId, active: true },
      }))
    )
      return null;
    return employee;
  }

  private async processOne(message: WhatsappInboundMessage) {
    const employee = await this.employeeForPhone(message.phone);
    if (!employee || message.sentAt.getTime() < Date.now() - 23 * 3600000) {
      await this.prisma.whatsappInboundMessage.updateMany({
        where: { id: message.id, status: 'QUEUED' },
        data: {
          status: 'REJECTED',
          error: employee ? 'MESSAGE_EXPIRED' : 'UNKNOWN_OR_AMBIGUOUS_EMPLOYEE',
        },
      });
      return;
    }
    await this.prisma.whatsappConversation.upsert({
      where: { phone: message.phone },
      update: {},
      create: {
        phone: message.phone,
        employeeId: employee.id,
        draft: emptyDraft(),
        expiresAt: new Date(),
        leaseUntil: new Date(0),
      },
    });
    const token = randomUUID();
    const claimed = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.whatsappConversation.updateMany({
        where: { phone: message.phone, leaseUntil: { lte: new Date() } },
        data: {
          leaseUntil: new Date(Date.now() + LEASE_MS),
          leaseToken: token,
        },
      });
      if (!claim.count) return false;
      // Do not let a later message overtake a failed message in the same conversation.
      const first = await tx.whatsappInboundMessage.findFirst({
        where: {
          phone: message.phone,
          status: { in: ['QUEUED', 'PROCESSING'] },
        },
        orderBy: [{ sentAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      if (first?.id !== message.id) {
        await tx.whatsappConversation.update({
          where: { phone: message.phone },
          data: { leaseUntil: new Date(0), leaseToken: null },
        });
        return false;
      }
      const updated = await tx.whatsappInboundMessage.updateMany({
        where: { id: message.id, status: 'QUEUED' },
        data: {
          status: 'PROCESSING',
          attempts: { increment: 1 },
          employeeId: employee.id,
        },
      });
      return updated.count > 0;
    });
    if (!claimed) return;
    try {
      const conversation =
        await this.prisma.whatsappConversation.findUniqueOrThrow({
          where: { phone: message.phone },
        });
      const activeConversation =
        conversation.employeeId === employee.id &&
        conversation.expiresAt > new Date();
      let draft = activeConversation
        ? (conversation.draft as unknown as Draft)
        : emptyDraft();
      const command = normalized(message.text);
      const selected =
        message.type === 'interactive' ? message.selectionId : null;
      // Route stable IDs rather than localized titles; unknown selections can never confirm a report.
      const confirmationChoice = selected?.startsWith('report_confirm:');
      const validConfirmation =
        confirmationChoice &&
        selected!.slice('report_confirm:'.length) ===
          draft.confirmationMessageId;
      const choice =
        selected ??
        (!draft.kind
          ? (
              {
                '1': 'report_damage',
                '2': 'report_hour_meter',
                '3': 'report_request',
                '4': 'report_attendance',
              } as Record<string, string>
            )[command]
          : undefined) ??
        (draft.menuStage === 'ATTENDANCE'
          ? (
              {
                entrada: 'attendance_check_in',
                salida: 'attendance_check_out',
              } as Record<string, string>
            )[command]
          : undefined);
      let reply = '';
      let replyKind: WhatsappReplyKind = 'TEXT';
      let replyOptions: EquipmentReplyOptions | undefined;
      let confirmation = false;
      let offerConfirmation = false;
      const showEquipment = async (useMemory = true, page = 0) => {
        if (draft.kind !== 'DAMAGE' && draft.kind !== 'HOUR_METER') return;
        const remembered =
          useMemory && conversation.employeeId === employee.id
            ? equipmentReference(conversation.lastEquipment)
            : undefined;
        const picker = await equipmentPicker(
          this.prisma,
          draft.kind,
          remembered,
          page,
        );
        draft.equipmentMenu = picker.state;
        draft.ready = false;
        delete draft.confirmationMessageId;
        reply = picker.text;
        replyOptions = picker.options;
        replyKind = picker.options ? 'EQUIPMENT_MENU' : 'TEXT';
      };
      const resolveDraft = async () => {
        const resolution = await this.records.resolve(draft);
        if (resolution.needsEquipment) {
          await showEquipment(
            !draft.subjectReference && !draft.selectedEquipment,
          );
          return;
        }
        draft.ready = Boolean(resolution.target);
        offerConfirmation = draft.ready;
        draft.targetKey = resolution.target
          ? JSON.stringify(resolution.target)
          : undefined;
        reply =
          resolution.question ??
          this.records.summary(draft, resolution.target!);
      };
      if (
        choice === 'report_cancel' ||
        (!selected && ['cancelar', 'cancel'].includes(command))
      ) {
        draft = emptyDraft();
        reply = `Borrador cancelado.\n${reportMenuText(employee)}`;
        replyKind = 'REPORT_MENU';
      } else if (
        choice === 'report_menu' ||
        (!selected &&
          (['menu', 'ayuda', 'inicio'].includes(command) ||
            isGreeting(command)))
      ) {
        reply = reportMenuText(employee, Boolean(draft.kind));
        replyKind = 'REPORT_MENU';
      } else if (choice === 'report_attendance') {
        draft = {
          ...emptyDraft(),
          menuStage: 'ATTENDANCE',
          occurredAt: message.sentAt.toISOString(),
          sourceMessageIds: [message.providerMessageId],
        };
        reply =
          '¿Quieres registrar tu entrada o tu salida de la obra? Elige una opción.';
        replyKind = 'ATTENDANCE_MENU';
      } else if (choice && selectionKind(choice)) {
        draft = {
          ...emptyDraft(),
          kind: selectionKind(choice),
          occurredAt: message.sentAt.toISOString(),
          sourceMessageIds: [message.providerMessageId],
        };
        if (draft.kind === 'DAMAGE' || draft.kind === 'HOUR_METER')
          await showEquipment();
        else reply = selectionPrompt(choice);
      } else if (selected?.startsWith('equipment')) {
        const menu = draft.equipmentMenu;
        const [action, nonce, value] = selected.split(':');
        const sameMenu =
          menu && menu.token === nonce && menu.kind === draft.kind;
        const index =
          value && /^(0|[1-9][0-9]*)$/.test(value) ? Number(value) : -1;
        if (!sameMenu || !['DAMAGE', 'HOUR_METER'].includes(draft.kind ?? '')) {
          if (draft.kind === 'DAMAGE' || draft.kind === 'HOUR_METER')
            await showEquipment(false);
          else {
            reply = `Esa lista ya venció.\n${reportMenuText(employee)}`;
            replyKind = 'REPORT_MENU';
          }
        } else if (
          action === 'equipment_other' &&
          menu.recent &&
          value === undefined
        ) {
          await showEquipment(false);
        } else if (
          action === 'equipment_page' &&
          !menu.recent &&
          index >= 0 &&
          Math.abs(index - menu.page) === 1
        ) {
          await showEquipment(false, index);
        } else if (action === 'equipment' && menu.choices[index]) {
          const equipment = await findEquipment(
            this.prisma,
            menu.choices[index],
            menu.kind,
          );
          if (!equipment) await showEquipment(false);
          else {
            const changed = draft.selectedEquipment
              ? draft.selectedEquipment.id !== equipment.reference.id ||
                draft.selectedEquipment.type !== equipment.reference.type
              : !!draft.subjectReference &&
                normalized(draft.subjectReference) !==
                  normalized(equipment.subjectReference);
            if (changed) {
              draft.evidenceFileIds = [];
              draft.photoHours = null;
              draft.hours = null;
            }
            draft.selectedEquipment = equipment.reference;
            draft.subjectType = equipment.reference.type;
            draft.subjectReference = equipment.subjectReference;
            delete draft.equipmentMenu;
            delete draft.confirmationMessageId;
            draft.sourceMessageIds.push(message.providerMessageId);
            await resolveDraft();
            if (!draft.ready)
              reply = `Máquina seleccionada: ${equipment.label}\n${reply}`;
          }
        } else {
          await showEquipment(false);
        }
      } else if (
        !selected &&
        ['DAMAGE', 'HOUR_METER'].includes(draft.kind ?? '') &&
        [
          'otra maquina',
          'cambiar maquina',
          'ver maquinas',
          'lista',
          'maquinas',
          'elegir otra',
        ].includes(command)
      ) {
        await showEquipment(false);
      } else if (confirmationChoice && !validConfirmation) {
        reply = `Ese botón pertenece a un resumen anterior. Revisa el reporte actual antes de confirmarlo.\n${reportMenuText(employee, Boolean(draft.kind))}`;
        replyKind = 'REPORT_MENU';
      } else if (selected && !validConfirmation) {
        reply = `Esta opción ya no está disponible.\n${reportMenuText(employee, Boolean(draft.kind))}`;
        replyKind = 'REPORT_MENU';
      } else if (!['text', 'image', 'interactive'].includes(message.type)) {
        reply =
          'Por ahora envía el reporte por escrito y las fotos como imagen. Los audios y documentos no se registran.\n' +
          reportMenuText(employee, Boolean(draft.kind));
        replyKind = 'REPORT_MENU';
      } else if (
        validConfirmation ||
        (!selected &&
          ['si', 'confirmar', 'confirmo', 'correcto'].includes(command) &&
          message.type !== 'image')
      ) {
        if (!draft.ready) {
          reply = 'Todavía faltan datos para registrar. ' + HELP;
          replyKind = 'REPORT_MENU';
        } else confirmation = true;
      } else {
        const recentCount = await this.prisma.whatsappInboundMessage.count({
          where: {
            phone: message.phone,
            createdAt: { gte: new Date(Date.now() - 60000) },
          },
        });
        if (recentCount > 20)
          reply =
            'Recibí muchos mensajes seguidos. Espera un minuto y vuelve a enviar tu reporte.';
        else {
          let image:
            | Awaited<ReturnType<WhatsappCloudService['photo']>>
            | undefined;
          let evidenceId = message.evidenceFileObjectId;
          if (message.type === 'image') {
            if (!message.mediaId)
              throw new BadRequestException(
                'No pude recibir esa foto. Envíala de nuevo como imagen.',
              );
            if (draft.evidenceFileIds.length >= 6)
              throw new BadRequestException(
                'Puedes adjuntar hasta seis fotos por reporte. Confirma o cancela el borrador.',
              );
            image = await this.cloud.photo(message.mediaId);
            if (!evidenceId) {
              const uploaded = await this.files.storeWhatsappEvidence(
                employee.id,
                image,
              );
              evidenceId = uploaded.files[0].id;
              await this.prisma.whatsappInboundMessage.update({
                where: { id: message.id },
                data: { evidenceFileObjectId: evidenceId },
              });
            }
          }
          const parsed = await this.ai.extract(message.text, draft, image);
          const changedKind =
            parsed.kind && draft.kind && parsed.kind !== draft.kind;
          const changedTarget =
            (parsed.subjectReference &&
              draft.subjectReference &&
              normalized(parsed.subjectReference) !==
                normalized(draft.subjectReference)) ||
            (parsed.worksiteReference &&
              draft.worksiteReference &&
              normalized(parsed.worksiteReference) !==
                normalized(draft.worksiteReference)) ||
            (parsed.customerReference &&
              draft.customerReference &&
              normalized(parsed.customerReference) !==
                normalized(draft.customerReference));
          const base = changedKind
            ? emptyDraft()
            : changedTarget
              ? {
                  ...draft,
                  evidenceFileIds: [],
                  selectedEquipment: undefined,
                  equipmentMenu: undefined,
                  photoHours: null,
                  ready: false,
                }
              : draft;
          const supplied = Object.fromEntries(
            Object.entries(parsed).filter(([, value]) => value !== null),
          );
          draft = {
            ...base,
            ...supplied,
            ready: false,
            // Each report uses the timestamp of the first message of its own flow, supplied by Meta.
            occurredAt: base.kind
              ? base.occurredAt
              : message.sentAt.toISOString(),
            photoHours: image ? parsed.photoHours : base.photoHours,
            sourceMessageIds: [
              ...(base.sourceMessageIds ?? []),
              message.providerMessageId,
            ],
            evidenceFileIds: [
              ...new Set([
                ...base.evidenceFileIds,
                ...(evidenceId ? [evidenceId] : []),
              ]),
            ],
          };
          if (draft.kind) {
            await resolveDraft();
          } else {
            reply = reportMenuText(employee);
            replyKind = 'REPORT_MENU';
          }
        }
      }
      // Re-resolve on confirmation. No AI-supplied IDs can reach domain writes.
      const resolution = confirmation
        ? await this.records.resolve(draft)
        : null;
      if (confirmation && !resolution?.target) {
        if (resolution?.needsEquipment) await showEquipment(false);
        else reply = resolution?.question ?? HELP;
        draft.ready = false;
        confirmation = false;
      }
      if (
        confirmation &&
        draft.targetKey !== JSON.stringify(resolution!.target)
      ) {
        draft.targetKey = JSON.stringify(resolution!.target);
        reply =
          'La identificación del equipo u obra cambió. Revisa nuevamente:\n' +
          this.records.summary(draft, resolution!.target!);
        confirmation = false;
        offerConfirmation = true;
      }
      if (
        offerConfirmation &&
        !confirmation &&
        replyKind === 'TEXT' &&
        reply.length <= 1024
      )
        replyKind = 'CONFIRMATION';
      if (
        !activeConversation &&
        !reply.startsWith(employeeGreeting(employee)) &&
        replyKind !== 'REPORT_MENU'
      )
        reply = `${employeeGreeting(employee)}\n${reply}`;
      // Meta limits interactive message bodies to 1024 characters. Long confirmations remain complete text.
      if (replyKind === 'CONFIRMATION' && reply.length > 1024)
        replyKind = 'TEXT';
      if (replyKind === 'CONFIRMATION')
        draft.confirmationMessageId = message.id;
      await this.prisma.$transaction(
        async (tx) => {
          const ownership = await tx.whatsappConversation.updateMany({
            where: {
              phone: message.phone,
              leaseToken: token,
              leaseUntil: { gt: new Date() },
            },
            data: { leaseUntil: new Date(Date.now() + 30000) },
          });
          if (!ownership.count) throw new Error('Conversation lease lost');
          if (confirmation) {
            draft.sourceMessageIds = [
              ...(draft.sourceMessageIds ?? []),
              message.providerMessageId,
            ];
            const report = await this.records.record(
              tx,
              employee,
              draft,
              resolution!.target!,
              message.providerMessageId,
            );
            reply = `Registrado en REV Logística. Reporte ${report.id}. ${draft.kind === 'REQUEST' || draft.kind === 'DAMAGE' ? 'La alerta quedó creada para oficina y gerencia.' : ''}`;
            draft = emptyDraft();
            replyKind = 'REPORT_MENU';
          }
          await tx.whatsappConversation.update({
            where: { phone: message.phone },
            data: {
              employeeId: employee.id,
              ...(confirmation &&
              resolution?.target &&
              (resolution.target.assetId || resolution.target.vehicleId)
                ? {
                    lastEquipment: {
                      type: resolution.target.assetId ? 'ASSET' : 'VEHICLE',
                      id:
                        resolution.target.assetId ??
                        resolution.target.vehicleId!,
                    },
                  }
                : conversation.employeeId !== employee.id
                  ? { lastEquipment: Prisma.DbNull }
                  : {}),
              draft: draft as unknown as Prisma.InputJsonValue,
              expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
              leaseUntil: new Date(0),
              leaseToken: null,
            },
          });
          await tx.whatsappInboundMessage.update({
            where: { id: message.id },
            data: {
              status: 'PROCESSED',
              replyText: reply,
              replyKind,
              replyOptions: replyOptions
                ? (replyOptions as unknown as Prisma.InputJsonValue)
                : Prisma.DbNull,
              error: null,
            },
          });
        },
        { timeout: 15000 },
      );
    } catch (error) {
      const recoverableInput = error instanceof BadRequestException;
      const terminal = recoverableInput || message.attempts >= 4;
      await this.prisma.$transaction(async (tx) => {
        const owns = await tx.whatsappConversation.updateMany({
          where: { phone: message.phone, leaseToken: token },
          data: { leaseUntil: new Date(0), leaseToken: null },
        });
        if (!owns.count) return;
        // Mark the draft unconfirmed after a business validation failure.
        if (recoverableInput) {
          const current = await tx.whatsappConversation.findUniqueOrThrow({
            where: { phone: message.phone },
          });
          await tx.whatsappConversation.update({
            where: { phone: message.phone },
            data: { draft: { ...(current.draft as object), ready: false } },
          });
        }
        await tx.whatsappInboundMessage.update({
          where: { id: message.id },
          data: {
            status: terminal
              ? recoverableInput
                ? 'PROCESSED'
                : 'FAILED'
              : 'QUEUED',
            error: recoverableInput
              ? 'VALIDATION_REQUIRED'
              : 'PROCESSING_FAILED',
            nextAttemptAt: new Date(
              Date.now() + Math.min(300000, 10000 * 2 ** message.attempts),
            ),
            replyText: terminal
              ? recoverableInput
                ? error.message
                : 'No pude registrar este mensaje. Comunícate con oficina o vuelve a enviarlo más tarde. Tu mensaje quedó en la bandeja para revisión.'
              : null,
          },
        });
      });
      this.logger.warn({
        event: 'whatsapp_report_processing_failed',
        messageId: message.id,
        terminal,
      });
    }
  }

  private async sendReplies() {
    const replies = await this.prisma.whatsappInboundMessage.findMany({
      where: {
        replyText: { not: null },
        replySentAt: null,
        replyAttempts: { lt: 5 },
        nextAttemptAt: { lte: new Date() },
        sentAt: { gte: new Date(Date.now() - 23 * 3600000) },
      },
      orderBy: [{ sentAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: 20,
    });
    for (const message of replies) {
      // Durable compare-and-swap avoids duplicate sends by concurrent replicas.
      const claim = await this.prisma.whatsappInboundMessage.updateMany({
        where: {
          id: message.id,
          replySentAt: null,
          nextAttemptAt: { lte: new Date() },
        },
        data: {
          nextAttemptAt: new Date(Date.now() + LEASE_MS),
          replyAttempts: { increment: 1 },
        },
      });
      if (!claim.count) continue;
      try {
        if (message.replyKind === 'EQUIPMENT_MENU' && message.replyOptions) {
          await this.cloud.reply(
            message.phone,
            message.replyText!,
            message.replyKind,
            undefined,
            message.replyOptions as unknown as EquipmentReplyOptions,
          );
        } else if (message.replyKind === 'CONFIRMATION') {
          await this.cloud.reply(
            message.phone,
            message.replyText!,
            message.replyKind,
            message.id,
          );
        } else {
          await this.cloud.reply(
            message.phone,
            message.replyText!,
            message.replyKind,
          );
        }
        await this.prisma.whatsappInboundMessage.update({
          where: { id: message.id },
          data: { replySentAt: new Date() },
        });
      } catch {
        this.logger.warn({
          event: 'whatsapp_reply_failed',
          messageId: message.id,
        });
      }
    }
  }
}
