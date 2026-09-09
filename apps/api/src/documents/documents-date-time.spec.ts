import { DocumentStatus, DocumentType, Role } from '@prisma/client';
import { DocumentsService } from './documents.service';

describe('document date and time', () => {
  const selectedDate = new Date('2026-08-15T04:45:00.000Z');
  const notes = 'Fecha documento: 2026-08-14T23:45:00-05:00 | Entrega en portería';

  function setup(status: DocumentStatus = DocumentStatus.IN_PROGRESS) {
    const existing = {
      id: 'document-1',
      type: DocumentType.RETURN,
      status,
      consecutive: 'DV019123',
      createdBy: 'user-1',
      docDate: selectedDate,
      notes,
      recipientPhones: [],
    };
    const tx = {
      $executeRaw: jest.fn(),
      document: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(existing),
      },
      documentItem: { createMany: jest.fn(), deleteMany: jest.fn() },
      fileObject: { deleteMany: jest.fn(), create: jest.fn() },
    };
    const prisma = {
      document: { findUnique: jest.fn().mockResolvedValue(existing) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new DocumentsService(
      prisma as never, {} as never, {} as never, {} as never,
      { refresh: jest.fn() } as never,
    );
    return { service, tx };
  }

  it('stores the physical document timestamp instead of the registration time', async () => {
    const { service, tx } = setup();
    await service.createDocument({
      type: DocumentType.RETURN, number: '19123', notes, createdBy: 'user-1',
      recipientPhones: ['3001234567'],
    });
    expect(tx.document.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ docDate: selectedDate, consecutive: 'DV019123' }),
    }));
  });

  it('stores the selected timestamp and return cutoff when generating a request', async () => {
    const { service, tx } = setup();
    await service.createRequestDocument({
      type: DocumentType.RETURN, notes, createdBy: 'user-1', sendWhatsapp: false,
      items: [{ skuId: 'sku-1', quantity: 2 }],
    });
    expect(tx.document.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ docDate: selectedDate }),
    }));
    expect(tx.documentItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ billingCutoffDate: selectedDate })],
    });
  });

  it('preserves a late-night timestamp through autosave creation and unrelated updates', async () => {
    const { service, tx } = setup();
    await service.createAutosavedRequestDocument({
      type: DocumentType.RETURN, notes, createdBy: 'user-1',
    });
    expect(tx.document.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ docDate: selectedDate }),
    }));
    await service.updateAutosavedRequestDocument(
      'document-1', { type: DocumentType.RETURN }, { sub: 'user-1', role: Role.ADMIN },
    );
    expect(tx.document.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ docDate: selectedDate }),
    }));
  });

  it('updates the selected hour on a submitted draft', async () => {
    const { service, tx } = setup(DocumentStatus.DRAFT);
    await service.updateRequestDocument('document-1', {
      notes: 'Fecha documento: 2026-08-14T00:15:00-05:00', items: [],
    }, 'user-1');
    expect(tx.document.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ docDate: new Date('2026-08-14T05:15:00.000Z') }),
    }));
  });
});
