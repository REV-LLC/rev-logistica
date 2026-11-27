import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  WhatsappCustomerService,
  customerChannelEnabled,
} from './whatsapp-customer.service';
import { WhatsappCloudService } from './whatsapp-cloud.service';
export const officeMessageSelect = {
  id: true,
  text: true,
  actorName: true,
  status: true,
  error: true,
  createdAt: true,
  sentAt: true,
  deliveredAt: true,
  readAt: true,
} as const;
@Injectable()
export class WhatsappOfficeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: WhatsappCustomerService,
    private readonly cloud: WhatsappCloudService,
  ) {}
  async list(phone: string, before?: string) {
    await this.customers.assertCustomerPhone(phone);
    const cursor = before
      ? await this.prisma.whatsappOfficeMessage.findFirst({
          where: { id: before, phone },
        })
      : null;
    if (before && !cursor) throw new BadRequestException('Página inválida');
    const rows = await this.prisma.whatsappOfficeMessage.findMany({
      where: {
        phone,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
      select: officeMessageSelect,
    });
    return {
      messages: rows.slice(0, 50).reverse(),
      before: rows.length > 50 ? rows[49].id : null,
    };
  }
  async send(phone: string, text: string, id: string, userId: string) {
    await this.customers.assertCustomerPhone(phone);
    text = text.trim();
    if (!text || text.length > 4000)
      throw new BadRequestException(
        'Escribe un mensaje de hasta 4000 caracteres.',
      );
    const existing = await this.prisma.whatsappOfficeMessage.findUnique({
      where: { id },
    });
    if (existing) {
      if (
        existing.phone !== phone ||
        existing.actorUserId !== userId ||
        existing.text !== text
      )
        throw new ConflictException(
          'Esta solicitud ya corresponde a otro mensaje.',
        );
      const { providerMessageId, actorUserId, phoneNumberId, ...safe } =
        existing;
      return safe;
    }
    if (
      !customerChannelEnabled() ||
      process.env.WHATSAPP_REPORTS_ENABLED !== 'true'
    )
      throw new ConflictException('El canal WhatsApp está desactivado.');
    const actor = await this.prisma.user.findFirst({
      where: { id: userId, active: true, role: { in: ['ADMIN', 'OFFICE'] } },
      select: {
        role: true,
        employee: { select: { name: true, lastName: true } },
      },
    });
    if (!actor) throw new NotFoundException('Usuario de oficina no disponible');
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    if (
      !phoneNumberId ||
      !process.env.WHATSAPP_ACCESS_TOKEN?.trim() ||
      !/^v\d+\.\d+$/.test(process.env.WHATSAPP_API_VERSION?.trim() ?? '')
    )
      throw new ConflictException('WhatsApp no está configurado.');
    const token = randomUUID();
    const prepared = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.whatsappInboundMessage.findFirst({
        where: {
          phone,
          phoneNumberId,
          employeeId: null,
          sentAt: { lte: new Date() },
        },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true },
      });
      if (!latest || latest.sentAt.getTime() <= Date.now() - 24 * 3600000)
        throw new ConflictException(
          'La ventana de 24 horas terminó. El cliente debe escribir de nuevo para responder sin plantilla.',
        );
      const locked = await tx.whatsappCustomerChat.updateMany({
        where: { phone, leaseUntil: { lte: new Date() } },
        data: {
          leaseToken: token,
          leaseUntil: new Date(Date.now() + 60000),
          paused: true,
          awaitingConfirmation: false,
          confirmationMessageId: null,
        },
      });
      if (!locked.count)
        throw new ConflictException(
          'Hay un mensaje en proceso. Espera unos segundos e intenta de nuevo.',
        );
      await tx.whatsappInboundMessage.updateMany({
        where: {
          phone,
          phoneNumberId,
          replyKind: { in: ['CUSTOMER_TEXT', 'CUSTOMER_HANDOFF'] },
          replySentAt: null,
        },
        data: { replyText: null },
      });
      return tx.whatsappOfficeMessage.create({
        data: {
          id,
          phone,
          phoneNumberId,
          actorUserId: userId,
          actorName: actor.employee
            ? `${actor.employee.name} ${actor.employee.lastName ?? ''}`.trim()
            : actor.role === 'ADMIN'
              ? 'Administración'
              : 'Oficina',
          text,
          status: 'SENDING',
        },
        select: officeMessageSelect,
      });
    });
    try {
      let providerMessageId: string;
      try {
        providerMessageId = await this.cloud.sendOfficeText(phone, text);
      } catch (error) {
        const rejected = !!(
          error &&
          typeof error === 'object' &&
          'rejected' in error &&
          error.rejected === true
        );
        return await this.prisma.whatsappOfficeMessage.update({
          where: { id },
          data: {
            status: rejected ? 'FAILED' : 'UNCERTAIN',
            error: rejected ? 'META_REJECTED' : 'SEND_UNCONFIRMED',
          },
          select: officeMessageSelect,
        });
      }
      return await this.prisma.whatsappOfficeMessage.update({
        where: { id: prepared.id },
        data: {
          status: 'SENT',
          providerMessageId,
          sentAt: new Date(),
          error: null,
        },
        select: officeMessageSelect,
      });
    } finally {
      await this.prisma.whatsappCustomerChat.updateMany({
        where: { phone, leaseToken: token },
        data: { leaseToken: null, leaseUntil: new Date(0) },
      });
    }
  }
}
