import { NotificationDeliveryStatus } from '@prisma/client';
import { DocumentCustomerMessagesService } from './document-customer-messages.service';

describe('DocumentCustomerMessagesService', () => {
  it('deduplicates document, customer and worksite phones before sending WhatsApp', async () => {
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'document-1',
          shareToken: 'share-token',
          type: 'REMISSION',
          consecutive: 'RM000001',
          recipientPhone: '+573001234567',
          recipientPhones: ['+573001234567', '+573111111111', '+573222222222'],
          customerWorksite: {
            customer: { name: 'Cliente', phone: '3001234567' },
            worksite: { phone: '3111111111' },
          },
        }),
      },
      documentMessageDelivery: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest
          .fn()
          .mockResolvedValueOnce({ id: 'delivery-whatsapp-1' })
          .mockResolvedValueOnce({ id: 'delivery-whatsapp-2' })
          .mockResolvedValueOnce({ id: 'delivery-whatsapp-3' }),
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
    process.env.PUBLIC_API_URL = 'https://api.example.test';
    const service = new DocumentCustomerMessagesService(
      prisma as any,
      transport as any,
    );

    await expect(service.sendDraft('document-1')).resolves.toMatchObject({
      sent: 3,
      failed: 0,
      recipients: 3,
      link: 'https://app.example.test/documents/shared/share-token',
    });
    expect(transport.sendWhatsapp).toHaveBeenCalledTimes(3);
    expect(transport.sendWhatsapp).toHaveBeenCalledWith(
      '+573001234567',
      expect.objectContaining({
        link: 'https://app.example.test/documents/shared/share-token',
        document: {
          link: 'https://api.example.test/public/documents/share-token/pdf',
          filename: 'remision-RM000001.pdf',
        },
      }),
    );
    expect(prisma.documentMessageDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery-whatsapp-1' },
      data: expect.objectContaining({
        status: NotificationDeliveryStatus.ACCEPTED,
        providerMessageId: 'wamid.document-1',
      }),
    });
  });
});
