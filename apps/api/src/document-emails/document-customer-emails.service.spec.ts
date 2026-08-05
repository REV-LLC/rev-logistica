import { DocumentCustomerEmailsService } from './document-customer-emails.service';

describe('DocumentCustomerEmailsService', () => {
  const document = {
    id: 'document-1',
    type: 'REMISSION',
    status: 'CONFIRMED',
    consecutive: 'RM000001',
    docDate: new Date('2026-08-03T12:00:00.000Z'),
    notes: null,
    officeModifiedAt: null,
    customerDraftEmailedAt: null,
    customerFinalEmailedAt: null,
    warehouse: { id: 'warehouse-1', name: 'Principal' },
    customerWorksite: {
      id: 'customer-worksite-1',
      alias: null,
      customer: {
        id: 'customer-1',
        name: 'Cliente prueba',
        email: 'general@cliente.test',
        documentsEmail: 'documentos@cliente.test',
      },
      worksite: { id: 'worksite-1', name: 'Obra norte', address: 'Calle 1' },
    },
    creator: {
      id: 'user-1',
      email: 'operador@rev.test',
      employee: { name: 'Ana', lastName: 'Pérez' },
    },
    files: [
      {
        id: 'photo-1',
        fileType: 'PHOTO_EVIDENCE',
        category: 'PHOTO_EVIDENCE',
        displayName: 'Entrega.jpg',
        originalName: 'photo.jpg',
        storageKey: 'https://files.test/photo.jpg',
        mimeType: 'image/jpeg',
      },
      {
        id: 'signature-1',
        fileType: 'SIGNATURE_RECEIVED',
        category: 'SIGNATURE_RECEIVED',
        displayName: 'Firma.png',
        originalName: 'signature.png',
        storageKey: 'https://files.test/signature.png',
        mimeType: 'image/png',
      },
    ],
    items: [],
  };

  it('sends the confirmed document PDF, evidence and receiver signature', async () => {
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((operations: Array<Promise<unknown>>) =>
          Promise.all(operations),
        ),
      document: {
        findUnique: jest.fn().mockResolvedValue(document),
        update: jest.fn().mockResolvedValue({ id: document.id }),
      },
      documentEmailDelivery: {
        upsert: jest.fn().mockResolvedValue({ id: 'email-delivery-1' }),
        update: jest.fn().mockResolvedValue({ id: 'email-delivery-1' }),
      },
    };
    const mail = {
      sendMail: jest.fn().mockResolvedValue({ sent: true }),
    };
    const pdf = {
      render: jest.fn().mockResolvedValue(Buffer.from('pdf-content')),
      fileName: jest.fn().mockReturnValue('remision-RM000001.pdf'),
    };
    const service = new DocumentCustomerEmailsService(
      prisma as any,
      mail as any,
      pdf as any,
    );

    await expect(service.sendFinalIfNeeded(document.id)).resolves.toEqual({
      sent: true,
    });
    expect(mail.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'documentos@cliente.test',
        attachments: [
          expect.objectContaining({
            filename: 'remision-RM000001.pdf',
            contentType: 'application/pdf',
          }),
          expect.objectContaining({ filename: 'evidencia-fotografica-1.jpg' }),
          expect.objectContaining({ filename: 'firma-quien-recibe-1.png' }),
        ],
      }),
    );
    expect(prisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: document.id },
        data: { customerFinalEmailedAt: expect.any(Date) },
      }),
    );
    expect(prisma.documentEmailDelivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          documentId_kind: { documentId: document.id, kind: 'FINAL' },
        },
        create: expect.objectContaining({
          email: 'documentos@cliente.test',
          subject: 'Remision RM000001 aprobada',
          attachmentNames: [
            'remision-RM000001.pdf',
            'evidencia-fotografica-1.jpg',
            'firma-quien-recibe-1.png',
          ],
        }),
      }),
    );
  });
});
