import { NotificationDeliveryStatus } from '@prisma/client';
import { WhatsappWebhookService } from './whatsapp-webhook.service';

describe('WhatsappWebhookService', () => {
  it('marks a document message as delivered by provider message id', async () => {
    const prisma = {
      documentMessageDelivery: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notificationDelivery: {
        updateMany: jest.fn(),
      },
    };
    const service = new WhatsappWebhookService(prisma as any);

    await expect(
      service.process({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  statuses: [
                    {
                      id: 'wamid.123',
                      status: 'delivered',
                      timestamp: '1785769200',
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    ).resolves.toEqual({ received: true, processed: 1 });

    expect(prisma.documentMessageDelivery.updateMany).toHaveBeenCalledWith({
      where: { providerMessageId: 'wamid.123' },
      data: expect.objectContaining({
        status: NotificationDeliveryStatus.DELIVERED,
        deliveredAt: new Date(1785769200 * 1000),
      }),
    });
    expect(prisma.notificationDelivery.updateMany).not.toHaveBeenCalled();
  });

  it('stores a Meta delivery failure on a maintenance notification', async () => {
    const prisma = {
      documentMessageDelivery: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      notificationDelivery: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new WhatsappWebhookService(prisma as any);

    await expect(
      service.process({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  statuses: [
                    {
                      id: 'wamid.failed',
                      status: 'failed',
                      errors: [
                        { code: 131026, title: 'Message undeliverable' },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    ).resolves.toEqual({ received: true, processed: 1 });

    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: { providerMessageId: 'wamid.failed' },
      data: {
        status: NotificationDeliveryStatus.FAILED,
        error: 'Meta 131026: Message undeliverable',
      },
    });
  });
});
