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
  emptyDraft,
  HELP,
  IncomingWhatsappMessage,
  normalized,
  normalizePhone,
} from './whatsapp-report.types';

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
      let draft =
        conversation.employeeId === employee.id &&
        conversation.expiresAt > new Date()
          ? (conversation.draft as unknown as Draft)
          : emptyDraft();
      const command = normalized(message.text);
      let reply = '';
      let confirmation = false;
      if (['cancelar', 'cancel', 'menu', 'ayuda', 'inicio'].includes(command)) {
        draft = emptyDraft();
        reply = `Borrador cancelado. ${HELP}`;
      } else if (!['text', 'image', 'interactive'].includes(message.type)) {
        reply =
          'Por ahora envía el reporte por escrito y las fotos como imagen. Los audios y documentos no se registran.\n' +
          HELP;
      } else if (
        ['si', 'confirmar', 'confirmo', 'correcto'].includes(command) &&
        message.type !== 'image'
      ) {
        if (!draft.ready)
          reply = 'Todavía faltan datos para registrar. ' + HELP;
        else confirmation = true;
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
            const resolution = await this.records.resolve(draft);
            draft.ready = Boolean(resolution.target);
            draft.targetKey = resolution.target
              ? JSON.stringify(resolution.target)
              : undefined;
            reply =
              resolution.question ??
              this.records.summary(draft, resolution.target!);
          } else reply = HELP;
        }
      }
      // Re-resolve on confirmation. No AI-supplied IDs can reach domain writes.
      const resolution = confirmation
        ? await this.records.resolve(draft)
        : null;
      if (confirmation && !resolution?.target) {
        reply = resolution?.question ?? HELP;
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
      }
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
          }
          await tx.whatsappConversation.update({
            where: { phone: message.phone },
            data: {
              employeeId: employee.id,
              draft: draft as unknown as Prisma.InputJsonValue,
              expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
              leaseUntil: new Date(0),
              leaseToken: null,
            },
          });
          await tx.whatsappInboundMessage.update({
            where: { id: message.id },
            data: { status: 'PROCESSED', replyText: reply, error: null },
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
        await this.cloud.reply(message.phone, message.replyText!);
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
