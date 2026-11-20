import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WhatsappInboundMessage } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone, normalized } from './whatsapp-report.types';
import {
  customerDraftSchema,
  customerQuestion,
  customerSummary,
  emptyCustomerDraft,
  WhatsappCustomerAiService,
} from './whatsapp-customer-ai.service';

export const customerChannelEnabled = () =>
  process.env.WHATSAPP_CUSTOMERS_ENABLED === 'true';
const eligible = Prisma.sql`m."employeeId" IS NULL AND (m."status" LIKE 'CUSTOMER_%' OR (m."status" = 'REJECTED' AND m."error" = 'UNKNOWN_OR_AMBIGUOUS_EMPLOYEE'))`;
const pendingReply =
  'Gracias. Tu solicitud quedó recibida para revisión de oficina. Aún no es una reserva: oficina confirmará disponibilidad, precio y entrega.';
@Injectable()
export class WhatsappCustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: WhatsappCustomerAiService,
  ) {}

  private async employeePhones() {
    const employees = await this.prisma.employee.findMany({
      select: { phone: true },
    });
    return [
      ...new Set(
        employees
          .map((e) => normalizePhone(e.phone))
          .filter((p): p is string => !!p),
      ),
    ];
  }
  async assertCustomerPhone(phone: string) {
    if (
      normalizePhone(phone) !== phone ||
      (await this.employeePhones()).includes(phone)
    )
      throw new NotFoundException('Conversación no encontrada');
  }

  async canReply(phone: string, handoff = false) {
    if (
      !customerChannelEnabled() ||
      (await this.employeePhones()).includes(phone)
    )
      return false;
    const chat = await this.prisma.whatsappCustomerChat.findUnique({
      where: { phone },
    });
    return !!chat && (!chat.paused || handoff);
  }

  // Shares the signed, idempotent inbound queue and durable reply outbox with employee reports.
  // A phone lease serializes AI drafts and confirmations across replicas.
  async process(message: WhatsappInboundMessage) {
    if (
      !customerChannelEnabled() ||
      (await this.employeePhones()).includes(message.phone)
    )
      return false;
    await this.prisma.whatsappCustomerChat.upsert({
      where: { phone: message.phone },
      create: {
        phone: message.phone,
        draft: emptyCustomerDraft(),
        leaseUntil: new Date(0),
      },
      update: {},
    });
    const token = randomUUID();
    const claimed = await this.prisma.$transaction(async (tx) => {
      const lease = await tx.whatsappCustomerChat.updateMany({
        where: { phone: message.phone, leaseUntil: { lte: new Date() } },
        data: { leaseToken: token, leaseUntil: new Date(Date.now() + 180000) },
      });
      if (!lease.count) return false;
      const first = await tx.whatsappInboundMessage.findFirst({
        where: {
          phone: message.phone,
          status: { in: ['QUEUED', 'PROCESSING'] },
        },
        orderBy: [{ sentAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      if (first?.id !== message.id) {
        await tx.whatsappCustomerChat.update({
          where: { phone: message.phone },
          data: { leaseToken: null, leaseUntil: new Date(0) },
        });
        return false;
      }
      const claim = await tx.whatsappInboundMessage.updateMany({
        where: { id: message.id, status: 'QUEUED' },
        data: { status: 'PROCESSING', attempts: { increment: 1 } },
      });
      if (!claim.count)
        await tx.whatsappCustomerChat.update({
          where: { phone: message.phone },
          data: { leaseToken: null, leaseUntil: new Date(0) },
        });
      return claim.count > 0;
    });
    if (!claimed) return true;
    try {
      const chat = await this.prisma.whatsappCustomerChat.findUniqueOrThrow({
        where: { phone: message.phone },
      });
      let draft = customerDraftSchema
        .catch(emptyCustomerDraft())
        .parse(chat.draft);
      const stale =
        !chat.lastCustomerAt ||
        chat.lastCustomerAt.getTime() < message.sentAt.getTime() - 23 * 3600000;
      if (stale) draft = emptyCustomerDraft();
      let awaitingConfirmation = stale ? false : chat.awaitingConfirmation;
      let paused = chat.paused;
      let reply: string | null = null;
      let handoff = false;
      let submit = false;
      const command = normalized(message.text);
      const expired = message.sentAt.getTime() < Date.now() - 23 * 3600000;
      if (!paused && !expired) {
        if (
          ['asesor', 'oficina', 'humano', 'hablar con asesor'].includes(command)
        ) {
          paused = true;
          handoff = true;
          reply =
            'Dejé tu conversación para revisión de oficina. El asistente queda en pausa. Puedes escribir aquí los detalles de tu solicitud.';
        } else if (['cancelar', 'cancelar pedido'].includes(command)) {
          draft = emptyCustomerDraft();
          awaitingConfirmation = false;
          reply =
            'Descarté el borrador actual. Las solicitudes que ya enviaste siguen pendientes de revisión. ¿Qué equipo necesitas?';
        } else if (
          awaitingConfirmation &&
          [
            'si',
            'si confirmar',
            'confirmar',
            'si correcto',
            'correcto',
          ].includes(command)
        ) {
          if (customerQuestion(draft))
            throw new Error('Incomplete confirmation');
          const summarySent = chat.confirmationMessageId
            ? await this.prisma.whatsappInboundMessage.findFirst({
                where: {
                  id: chat.confirmationMessageId,
                  phone: message.phone,
                  replySentAt: { not: null },
                },
              })
            : null;
          submit = !!summarySent;
          reply = submit ? pendingReply : customerSummary(draft);
        } else if (message.type !== 'text' && !message.text.trim()) {
          reply =
            'Recibí tu mensaje. Para completar el pedido, escribe los datos por texto. Los audios y documentos aún necesitan revisión de oficina.\n' +
            (awaitingConfirmation
              ? customerSummary(draft)
              : customerQuestion(draft));
        } else {
          try {
            draft = await this.ai.extract(message.text, draft, message.sentAt);
            const question = customerQuestion(draft);
            awaitingConfirmation = !question;
            reply = question ?? customerSummary(draft);
          } catch {
            paused = true;
            handoff = true;
            reply =
              'Tu mensaje quedó guardado para revisión de oficina. El asistente no pudo completar el pedido y queda en pausa; puedes dejar aquí los detalles por escrito.';
          }
        }
      }
      await this.prisma.$transaction(async (tx) => {
        const owns = await tx.whatsappCustomerChat.updateMany({
          where: {
            phone: message.phone,
            leaseToken: token,
            leaseUntil: { gt: new Date() },
          },
          data: { leaseUntil: new Date(Date.now() + 15000) },
        });
        if (!owns.count) throw new Error('Customer lease lost');
        if (submit)
          await tx.whatsappCustomerRequest.create({
            data: {
              phone: message.phone,
              sourceMessageId: message.id,
              details: {
                ...draft,
                requestedAt: message.sentAt.toISOString(),
                timezone: 'America/Bogota',
              },
            },
          });
        await tx.whatsappCustomerChat.update({
          where: { phone: message.phone },
          data: {
            draft: submit ? emptyCustomerDraft() : draft,
            awaitingConfirmation: submit ? false : awaitingConfirmation,
            paused,
            lastCustomerAt: message.sentAt,
            confirmationMessageId:
              !submit && awaitingConfirmation && reply ? message.id : null,
            leaseToken: null,
            leaseUntil: new Date(0),
          },
        });
        await tx.whatsappInboundMessage.update({
          where: { id: message.id },
          data: {
            status: 'CUSTOMER_PROCESSED',
            replyText: reply,
            replyKind: handoff ? 'CUSTOMER_HANDOFF' : 'CUSTOMER_TEXT',
            error: null,
          },
        });
      });
    } catch {
      await this.prisma.$transaction(async (tx) => {
        const owns = await tx.whatsappCustomerChat.updateMany({
          where: { phone: message.phone, leaseToken: token },
          data: { leaseToken: null, leaseUntil: new Date(0), paused: true },
        });
        if (owns.count)
          await tx.whatsappInboundMessage.update({
            where: { id: message.id },
            data: {
              status: 'CUSTOMER_FAILED',
              error: 'CUSTOMER_REVIEW_REQUIRED',
              replyText: null,
            },
          });
      });
    }
    return true;
  }

  private async customerNames() {
    const rows = await this.prisma.customer.findMany({
      where: { active: true },
      select: {
        name: true,
        phone: true,
        documentsPhone: true,
        billingPhone: true,
        billingAlternatePhone: true,
        contactDirectory: true,
      },
    });
    const names = new Map<string, Set<string>>();
    for (const c of rows) {
      const contacts = Array.isArray(c.contactDirectory)
        ? c.contactDirectory
        : [];
      const phones = [
        c.phone,
        c.documentsPhone,
        c.billingPhone,
        c.billingAlternatePhone,
        ...contacts.map((v) =>
          typeof v === 'object' && v && 'phone' in v ? String(v.phone) : null,
        ),
      ];
      for (const value of phones) {
        const phone = normalizePhone(value);
        if (!phone) continue;
        const set = names.get(phone) ?? new Set<string>();
        set.add(c.name);
        names.set(phone, set);
      }
    }
    return names;
  }
  async list(search = '', status = 'all', page = 0) {
    if (
      !Number.isInteger(page) ||
      page < 0 ||
      page > 10000 ||
      !['all', 'pending', 'reviewed', 'paused'].includes(status)
    )
      throw new BadRequestException('Filtro inválido');
    const [employees, names] = await Promise.all([
      this.employeePhones(),
      this.customerNames(),
    ]);
    const matching = [...names.entries()]
      .filter(([, ns]) =>
        [...ns].some((n) => normalized(n).includes(normalized(search))),
      )
      .map(([p]) => p);
    const exclusion = employees.length
      ? Prisma.sql`AND m."phone" NOT IN (${Prisma.join(employees)})`
      : Prisma.empty;
    const searchClause = search.trim()
      ? Prisma.sql`AND (m."phone" LIKE ${`%${search.replace(/[^0-9]/g, '') || 'no-phone'}%`} ${matching.length ? Prisma.sql`OR m."phone" IN (${Prisma.join(matching)})` : Prisma.empty})`
      : Prisma.empty;
    const filter =
      status === 'pending'
        ? Prisma.sql`WHERE c."reviewedThrough" IS NULL OR c."reviewedThrough" < g.latest`
        : status === 'reviewed'
          ? Prisma.sql`WHERE c."reviewedThrough" >= g.latest`
          : status === 'paused'
            ? Prisma.sql`WHERE c."paused" = true`
            : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{
        phone: string;
        latest: Date;
        count: bigint;
        reviewedThrough: Date | null;
        paused: boolean | null;
        text: string | null;
      }>
    >(Prisma.sql`
      WITH g AS (SELECT m."phone", MAX(m."createdAt") AS latest, COUNT(*) AS count FROM "WhatsappInboundMessage" m WHERE ${eligible} ${exclusion} ${searchClause} GROUP BY m."phone")
      SELECT g.*, c."reviewedThrough", c."paused", (SELECT x."text" FROM "WhatsappInboundMessage" x WHERE x."phone"=g."phone" AND x."employeeId" IS NULL ORDER BY x."createdAt" DESC, x."id" DESC LIMIT 1) AS text
      FROM g LEFT JOIN "WhatsappCustomerChat" c ON c."phone"=g."phone" ${filter} ORDER BY g.latest DESC, g."phone" ASC LIMIT 51 OFFSET ${page * 50}`);
    return {
      enabled: customerChannelEnabled(),
      nextPage: rows.length > 50 ? page + 1 : null,
      chats: rows.slice(0, 50).map((r) => ({
        phone: r.phone,
        customers: [...(names.get(r.phone) ?? [])],
        latest: r.latest,
        count: Number(r.count),
        pending: !r.reviewedThrough || r.reviewedThrough < r.latest,
        paused: !!r.paused,
        preview: r.text || 'Mensaje adjunto',
      })),
    };
  }
  async detail(phone: string, before?: string) {
    await this.assertCustomerPhone(phone);
    const beforeRow = before
      ? await this.prisma.whatsappInboundMessage.findFirst({
          where: { id: before, phone, employeeId: null },
        })
      : null;
    if (before && !beforeRow) throw new BadRequestException('Página inválida');
    const [chat, messages, requests] = await Promise.all([
      this.prisma.whatsappCustomerChat.findUnique({ where: { phone } }),
      this.prisma.whatsappInboundMessage.findMany({
        where: {
          phone,
          employeeId: null,
          ...(beforeRow
            ? {
                OR: [
                  { createdAt: { lt: beforeRow.createdAt } },
                  { createdAt: beforeRow.createdAt, id: { lt: beforeRow.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 101,
        select: {
          id: true,
          text: true,
          type: true,
          sentAt: true,
          createdAt: true,
          replyText: true,
          replySentAt: true,
          error: true,
        },
      }),
      this.prisma.whatsappCustomerRequest.findMany({
        where: { phone },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);
    if (!messages.length && !chat)
      throw new NotFoundException('Conversación no encontrada');
    const visible = messages.slice(0, 100);
    const names = await this.customerNames();
    return {
      phone,
      customers: [...(names.get(phone) ?? [])],
      draft: chat?.draft ?? emptyCustomerDraft(),
      paused: !!chat?.paused,
      notes: chat?.notes ?? '',
      reviewedThrough: chat?.reviewedThrough ?? null,
      latest: before ? null : (visible[0]?.createdAt ?? null),
      messages: visible.reverse(),
      before: messages.length > 100 ? visible[0].id : null,
      requests,
    };
  }
  async review(
    phone: string,
    body: { notes: string; paused: boolean; reviewedThrough?: string },
    userId: string,
  ) {
    await this.assertCustomerPhone(phone);
    const latest = await this.prisma.whatsappInboundMessage.findFirst({
      where: { phone, employeeId: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) throw new NotFoundException('Conversación no encontrada');
    const reviewedThrough = body.reviewedThrough
      ? new Date(body.reviewedThrough)
      : undefined;
    if (
      reviewedThrough &&
      (!Number.isFinite(reviewedThrough.getTime()) ||
        reviewedThrough > latest.createdAt)
    )
      throw new BadRequestException('Fecha inválida');
    return this.prisma.$transaction(async (tx) => {
      // Do not overwrite a draft while a worker holds its lease.
      await tx.whatsappCustomerChat.upsert({
        where: { phone },
        create: { phone, draft: emptyCustomerDraft(), leaseUntil: new Date(0) },
        update: {},
      });
      const result = await tx.whatsappCustomerChat.updateMany({
        where: { phone, leaseUntil: { lte: new Date() } },
        data: {
          notes: body.notes,
          paused: body.paused,
          ...(reviewedThrough ? { reviewedThrough, reviewedBy: userId } : {}),
        },
      });
      if (!result.count)
        throw new ConflictException(
          'El bot está procesando un mensaje. Intenta de nuevo.',
        );
      if (body.paused)
        await tx.whatsappInboundMessage.updateMany({
          where: {
            phone,
            replyKind: { in: ['CUSTOMER_TEXT', 'CUSTOMER_HANDOFF'] },
            replySentAt: null,
          },
          data: { replyText: null },
        });
      return { ok: true };
    });
  }
}
