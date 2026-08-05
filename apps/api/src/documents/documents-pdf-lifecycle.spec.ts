import { DocumentStatus, DocumentType } from '@prisma/client';
import { DocumentsService } from './documents.service';

describe('DocumentsService PDF lifecycle', () => {
  it('generates and stores the PDF after creating a request draft', async () => {
    const tx = {
      document: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: 'document-1',
          type: DocumentType.REMISSION,
          status: DocumentStatus.DRAFT,
          consecutive: 'RM000001',
        }),
      },
      documentItem: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      fileObject: {
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const snapshots = {
      refresh: jest.fn().mockResolvedValue({ id: 'pdf-1' }),
    };
    const service = new DocumentsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      snapshots as never,
    );

    await service.createRequestDocument({
      type: DocumentType.REMISSION,
      customerWorksiteId: 'customer-worksite-1',
      warehouseId: 'warehouse-1',
      recipientPhones: ['3001234567'],
      createdBy: 'user-1',
      items: [
        {
          assetId: 'asset-1',
          ownerWarehouseId: 'warehouse-1',
        },
      ],
    });

    expect(snapshots.refresh).toHaveBeenCalledWith('document-1');
  });

  it('does not wait for the final email before completing approval', async () => {
    const document = {
      id: 'document-1',
      type: DocumentType.REMISSION,
      status: DocumentStatus.DRAFT,
      warehouseId: 'warehouse-1',
      customerWorksiteId: 'customer-worksite-1',
      docDate: new Date('2026-08-05T12:00:00.000Z'),
      notes: 'Entrega: WAREHOUSE',
      items: [
        {
          skuId: null,
          assetId: 'asset-1',
          quantity: null,
          condition: 'warehouse-1',
          requestedTag: null,
        },
      ],
      files: [],
    };
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue(document),
        update: jest.fn().mockResolvedValue({
          id: document.id,
          status: DocumentStatus.CONFIRMED,
          consecutive: 'RM000001',
        }),
      },
      warehouse: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const inventory = {
      moveOut: jest.fn().mockResolvedValue({ ok: true }),
    };
    const neverFinishes = new Promise(() => undefined);
    const emails = {
      sendFinalIfNeeded: jest.fn().mockReturnValue(neverFinishes),
    };
    const service = new DocumentsService(
      prisma as never,
      inventory as never,
      emails as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.approveRequestDocument(document.id, 'office-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        id: document.id,
        status: DocumentStatus.CONFIRMED,
      }),
    );
    expect(emails.sendFinalIfNeeded).toHaveBeenCalledWith(document.id);
  });
});
