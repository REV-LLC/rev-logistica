import { MovementType } from '@prisma/client';
import { InventoryService } from './inventory.service';

describe('InventoryService warehouse availability', () => {
  const warehouseId = '11111111-1111-4111-8111-111111111111';
  const ownerWarehouseId = '22222222-2222-4222-8222-222222222222';
  const worksiteId = '33333333-3333-4333-8333-333333333333';
  const skuId = '44444444-4444-4444-8444-444444444444';
  const assetId = '55555555-5555-4555-8555-555555555555';

  function createService(groupBy: jest.Mock) {
    const create = jest.fn().mockResolvedValue({ id: 'ledger-1' });
    const tx = {
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({ id: warehouseId }),
      },
      customerWorksite: {
        findUnique: jest.fn().mockResolvedValue({ id: worksiteId }),
      },
      stockLedger: { groupBy, create },
      asset: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: assetId, warehouseOwnerId: ownerWarehouseId },
          ]),
        update: jest.fn().mockResolvedValue({ id: assetId }),
      },
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
      data: {
        movementType: MovementType.OUT,
        warehouseId,
        customerWorksiteId: worksiteId,
        refDocumentId: null,
        refDocumentType: null,
        skuId,
        assetId: null,
        ownerWarehouseId,
        quantity: -8,
        createdBy: 'user-1',
      },
    });
  });

  it('counts returned serial equipment in the physical warehouse balance', async () => {
    const groupBy = jest
      .fn()
      .mockResolvedValue([{ assetId, _sum: { quantity: 1 } }]);
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

    expect(groupBy).toHaveBeenCalledWith({
      by: ['assetId'],
      where: { warehouseId, assetId: { in: [assetId] } },
      _sum: { quantity: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        movementType: MovementType.OUT,
        warehouseId,
        customerWorksiteId: worksiteId,
        refDocumentId: null,
        refDocumentType: null,
        skuId: null,
        assetId,
        ownerWarehouseId,
        quantity: -1,
        createdBy: 'user-1',
      },
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
});
