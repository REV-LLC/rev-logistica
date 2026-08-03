import { Injectable } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from '@prisma/client';
import { normalizeStoredColombianPhone } from '../messaging/colombian-phone';
import { NotificationTransportService } from '../notifications/notification-transport.service';
import { PrismaService } from '../prisma/prisma.service';

type MessageKind = 'DRAFT' | 'FINAL';

@Injectable()
export class DocumentCustomerMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transport: NotificationTransportService,
  ) {}

  async sendDraft(documentId: string) {
    return this.send(documentId, 'DRAFT');
  }

  private async send(documentId: string, kind: MessageKind) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        shareToken: true,
        type: true,
        consecutive: true,
        recipientPhone: true,
        customerWorksite: {
          select: {
            customer: {
              select: { name: true, phone: true },
            },
          },
        },
      },
    });
    if (!document) return { sent: 0, skipped: 0, failed: 0, reason: 'not-found' as const };

    const phones = new Set(
      [
        normalizeStoredColombianPhone(document.recipientPhone),
        normalizeStoredColombianPhone(document.customerWorksite?.customer.phone),
      ].filter((phone): phone is string => Boolean(phone)),
    );
    if (!phones.size) {
      return { sent: 0, skipped: 0, failed: 0, reason: 'missing-recipient' as const };
    }

    const number = document.consecutive ?? document.id.slice(0, 8);
    const documentName = document.type === 'REMISSION' ? 'remisión'
      : document.type === 'RETURN' ? 'devolución' : 'documento';
    const link = this.buildPublicLink(document.shareToken);
    const message = {
      title: `${documentName[0].toUpperCase()}${documentName.slice(1)} ${number}`,
      body: `REV Logística comparte una copia de la ${documentName} ${number}.`,
      link,
      recipientName: document.customerWorksite?.customer.name || 'usuario',
    };
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const phone of phones) {
      const result = await this.dispatchOne(
        document.id,
        kind,
        NotificationChannel.WHATSAPP,
        phone,
        message,
      );
      if (result === 'sent') sent += 1;
      else if (result === 'failed') failed += 1;
      else skipped += 1;
    }
    return { sent, skipped, failed, recipients: phones.size, link };
  }

  private async dispatchOne(
    documentId: string,
    kind: MessageKind,
    channel: NotificationChannel,
    phone: string,
    message: { title: string; body: string; link: string; recipientName: string },
  ) {
    const key = { documentId, kind, channel, phone };
    const existing = await this.prisma.documentMessageDelivery.findUnique({
      where: { documentId_kind_channel_phone: key },
    });
    if (existing?.status === NotificationDeliveryStatus.SENT) return 'skipped';

    const delivery = await this.prisma.documentMessageDelivery.upsert({
      where: { documentId_kind_channel_phone: key },
      create: key,
      update: {},
    });
    const claimed = await this.prisma.documentMessageDelivery.updateMany({
      where: {
        id: delivery.id,
        status: {
          in: [
            NotificationDeliveryStatus.PENDING,
            NotificationDeliveryStatus.FAILED,
          ],
        },
      },
      data: { status: NotificationDeliveryStatus.SENDING, error: null },
    });
    if (!claimed.count) return 'skipped';

    try {
      const response = await this.transport.sendWhatsapp(phone, message);
      await this.prisma.documentMessageDelivery.update({
        where: { id: delivery.id },
        data: response.sent
          ? { status: NotificationDeliveryStatus.SENT, sentAt: new Date(), error: null }
          : { status: NotificationDeliveryStatus.FAILED, error: response.reason },
      });
      return response.sent ? 'sent' : 'failed';
    } catch (error) {
      await this.prisma.documentMessageDelivery.update({
        where: { id: delivery.id },
        data: {
          status: NotificationDeliveryStatus.FAILED,
          error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        },
      });
      return 'failed';
    }
  }

  private buildPublicLink(shareToken: string) {
    const configured = process.env.PUBLIC_WEB_URL?.trim()
      || process.env.ALLOWED_ORIGINS?.split(',')[0]?.trim()
      || 'http://localhost:3101';
    return `${configured.replace(/\/+$/, '')}/documents/shared/${shareToken}`;
  }
}
