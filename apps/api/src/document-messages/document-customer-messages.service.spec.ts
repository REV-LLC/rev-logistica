import { NotificationDeliveryStatus } from '@prisma/client';
import { DocumentCustomerMessagesService } from './document-customer-messages.service';

describe('DocumentCustomerMessagesService', () => {
  it('deduplicates equal receiver and customer phones and sends WhatsApp once', async () => {
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'document-1',
          shareToken: 'share-token',
          type: 'REMISSION',
          consecutive: 'RM000001',
          recipientPhone: '+573001234567',
          customerWorksite: {
            customer: { name: 'Cliente', phone: '3001234567' },
          },
        }),
      },
      documentMessageDelivery: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValueOnce({ id: 'delivery-whatsapp' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const transport = {
      sendWhatsapp: jest.fn().mockResolvedValue({
        sent: true,
        providerMessageId: 'wamid.document-1',
      }),
    };
    process.env.PUBLIC_WEB_URL = 'https://app.example.test';
    const service = new DocumentCustomerMessagesService(
      prisma as any,
      transport as any,
    );

    await expect(service.sendDraft('document-1')).resolves.toMatchObject({
      sent: 1,
      failed: 0,
      recipients: 1,
      link: 'https://app.example.test/documents/shared/share-token',
    });
    expect(transport.sendWhatsapp).toHaveBeenCalledTimes(1);
    expect(transport.sendWhatsapp).toHaveBeenCalledWith(
      '+573001234567',
      expect.objectContaining({
        link: 'https://app.example.test/documents/shared/share-token',
      }),
    );
    expect(prisma.documentMessageDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery-whatsapp' },
      data: expect.objectContaining({
        status: NotificationDeliveryStatus.ACCEPTED,
        providerMessageId: 'wamid.document-1',
      }),
    });
  });
});
