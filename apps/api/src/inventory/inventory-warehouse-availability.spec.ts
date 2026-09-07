import { DocumentType, MovementType } from '@prisma/client';
import { InventoryService } from './inventory.service';

describe('InventoryService warehouse availability', () => {
  const warehouseId = '11111111-1111-4111-8111-111111111111';
  const ownerWarehouseId = '22222222-2222-4222-8222-222222222222';
  const worksiteId = '33333333-3333-4333-8333-333333333333';
  const skuId = '44444444-4444-4444-8444-444444444444';
  const assetId = '55555555-5555-4555-8555-555555555555';

  function createService(
    groupBy: jest.Mock,
    latestMovement = {
      assetId,
      movementType: MovementType.ADJUST,
      warehouseId,
      customerWorksiteId: null,
      effectiveAt: new Date('2026-08-01T12:00:00.000Z'),
    },
  ) {
    const create = jest.fn().mockResolvedValue({ id: 'ledger-1' });
    const tx = {
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({ id: warehouseId }),
      },
      customerWorksite: {
        findUnique: jest.fn().mockResolvedValue({ id: worksiteId }),
      },
      document: {
        findUnique: jest.fn().mockResolvedValue({
          type: DocumentType.REMISSION,
          docDate: new Date('2026-08-01T12:00:00.000Z'),
        }),
      },
      stockLedger: {
        groupBy,
        create,
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([latestMovement]),
      },
      asset: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: assetId, warehouseOwnerId: ownerWarehouseId },
          ]),
        update: jest.fn().mockResolvedValue({ id: assetId }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: assetId }]),
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
      warehouse: {
        findMany: jest.fn().mockResolvedValue([{ id: ownerWarehouseId }]),
      },
    };
    const cache = { del: jest.fn().mockResolvedValue(undefined) };

    return {
      service: new InventoryService(prisma as never, cache as never),
      create,
    };
  }

  it('counts a completed return in the warehouse even when it retains worksite traceability', async () => {
    const groupBy = jest
      .fn()
      .mockResolvedValue([{ skuId, ownerWarehouseId, _sum: { quantity: 8 } }]);
    const { service, create } = createService(groupBy);

    await expect(
      service.moveOut(
        {
          warehouseId,
          customerWorksiteId: worksiteId,
          items: [{ skuId, ownerWarehouseId, quantity: 8 }],
        },
        'user-1',
      ),
    ).resolves.toMatchObject({ count: 1 });

    expect(groupBy).toHaveBeenCalledWith({
      by: ['skuId', 'ownerWarehouseId'],
      where: { warehouseId, skuId: { in: [skuId] } },
      _sum: { quantity: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: MovementType.OUT,
        warehouseId,
        customerWorksiteId: worksiteId,
        refDocumentId: null,
        refDocumentType: null,
        skuId,
        assetId: null,
        ownerWarehouseId,
        quantity: -8,
        effectiveAt: expect.any(Date),
        createdBy: 'user-1',
      }),
    });
  });

  it('counts returned serial equipment in the physical warehouse balance', async () => {
    const groupBy = jest
      .fn()
      .mockResolvedValueOnce([{ assetId, _sum: { quantity: 1 } }])
      .mockResolvedValueOnce([]);
    const { service, create } = createService(groupBy);

    await expect(
      service.moveOut(
        {
          warehouseId,
          customerWorksiteId: worksiteId,
          items: [{ assetId, ownerWarehouseId }],
        },
        'user-1',
      ),
    ).resolves.toMatchObject({ count: 1 });

    expect(groupBy).toHaveBeenNthCalledWith(1, {
      by: ['assetId'],
      where: { warehouseId, assetId: { in: [assetId] } },
      _sum: { quantity: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: MovementType.OUT,
        warehouseId,
        customerWorksiteId: worksiteId,
        refDocumentId: null,
        refDocumentType: null,
        skuId: null,
        assetId,
        ownerWarehouseId,
        quantity: -1,
        effectiveAt: expect.any(Date),
        createdBy: 'user-1',
      }),
    });
  });

  it('rejects a dispatch when prior worksite-linked OUT movements exhausted physical stock', async () => {
    const groupBy = jest
      .fn()
      .mockResolvedValue([{ skuId, ownerWarehouseId, _sum: { quantity: 0 } }]);
    const { service, create } = createService(groupBy);

    await expect(
      service.moveOut(
        {
          warehouseId,
          customerWorksiteId: worksiteId,
          items: [{ skuId, ownerWarehouseId, quantity: 1 }],
        },
        'user-1',
      ),
    ).rejects.toThrow('Stock insuficiente');

    expect(groupBy).toHaveBeenCalledWith({
      by: ['skuId', 'ownerWarehouseId'],
      where: { warehouseId, skuId: { in: [skuId] } },
      _sum: { quantity: true },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects serial movement when the global ledger location is another worksite', async () => {
    const groupBy = jest.fn();
    const { service, create } = createService(groupBy, {
      assetId,
      movementType: MovementType.ON_SITE,
      warehouseId: null,
      customerWorksiteId: '66666666-6666-4666-8666-666666666666',
      effectiveAt: new Date('2026-08-01T12:00:00.000Z'),
    });

    await expect(
      service.moveOut(
        {
          warehouseId,
          customerWorksiteId: worksiteId,
          items: [{ assetId, ownerWarehouseId }],
        },
        'user-1',
      ),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ASSET_LOCATION_CONFLICT' }) });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a backdated document when a later asset movement exists', async () => {
    const groupBy = jest.fn();
    const { service, create } = createService(groupBy, {
      assetId,
      movementType: MovementType.ADJUST,
      warehouseId,
      customerWorksiteId: null,
      effectiveAt: new Date('2026-08-02T12:00:00.000Z'),
    });

    await expect(
      service.moveOut(
        {
          warehouseId,
          customerWorksiteId: worksiteId,
          documentId: '77777777-7777-4777-8777-777777777777',
          items: [{ assetId, ownerWarehouseId }],
        },
        'user-1',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RETROACTIVE_INVENTORY_MOVEMENT' }),
    });
    expect(create).not.toHaveBeenCalled();
  });
});
