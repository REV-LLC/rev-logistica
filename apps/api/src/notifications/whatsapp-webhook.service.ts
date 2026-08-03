import { Injectable, Logger } from '@nestjs/common';
import { NotificationDeliveryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface MetaWebhookError {
  code?: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
}

interface MetaMessageStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: MetaWebhookError[];
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: { statuses?: MetaMessageStatus[] };
    }>;
  }>;
}

@Injectable()
export class WhatsappWebhookService {
  private readonly logger = new Logger(WhatsappWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(payload: MetaWebhookPayload) {
    if (payload.object !== 'whatsapp_business_account') {
      return { received: true, processed: 0 };
    }

    const statuses =
      payload.entry?.flatMap(
        (entry) =>
          entry.changes
            ?.filter((change) => change.field === 'messages')
            .flatMap((change) => change.value?.statuses ?? []) ?? [],
      ) ?? [];

    let processed = 0;
    for (const status of statuses) {
      if (!status.id) continue;
      const data = this.statusUpdate(status);
      if (!data) continue;

      const documentResult =
        await this.prisma.documentMessageDelivery.updateMany({
          where: { providerMessageId: status.id },
          data,
        });
      const notificationResult = documentResult.count
        ? { count: 0 }
        : await this.prisma.notificationDelivery.updateMany({
            where: { providerMessageId: status.id },
            data,
          });

      if (documentResult.count || notificationResult.count) {
        processed += 1;
      } else {
        this.logger.warn(
          `Unmatched WhatsApp status for provider message ${status.id.slice(0, 32)}`,
        );
      }
    }

    return { received: true, processed };
  }

  private statusUpdate(
    status: MetaMessageStatus,
  ): Prisma.DocumentMessageDeliveryUpdateManyMutationInput | null {
    const occurredAt = this.occurredAt(status.timestamp);
    switch (status.status?.toLowerCase()) {
      case 'sent':
        return {
          status: NotificationDeliveryStatus.ACCEPTED,
          sentAt: occurredAt,
          error: null,
        };
      case 'delivered':
        return {
          status: NotificationDeliveryStatus.DELIVERED,
          deliveredAt: occurredAt,
          error: null,
        };
      case 'read':
        return {
          status: NotificationDeliveryStatus.READ,
          readAt: occurredAt,
          error: null,
        };
      case 'failed':
        return {
          status: NotificationDeliveryStatus.FAILED,
          error: this.failureDetail(status.errors),
        };
      default:
        return null;
    }
  }

  private occurredAt(timestamp?: string) {
    const seconds = Number(timestamp);
    return Number.isFinite(seconds) && seconds > 0
      ? new Date(seconds * 1000)
      : new Date();
  }

  private failureDetail(errors?: MetaWebhookError[]) {
    if (!errors?.length) return 'WhatsApp delivery failed';
    return errors
      .map((error) =>
        [
          error.code ? `Meta ${error.code}` : undefined,
          error.title,
          error.message,
          error.error_data?.details,
        ]
          .filter(Boolean)
          .join(': '),
      )
      .join(' | ')
      .slice(0, 500);
  }
}
