import { DocumentType, MovementType } from '@prisma/client';
import { InventoryService } from './inventory.service';

const methods = ['moveOut', 'moveOnSite', 'moveIn', 'moveReturnTransit'] as const;

function fixture(method: typeof methods[number]) {
  const tx = {
    document: { findUnique: jest.fn().mockResolvedValue({
      id: 'document', type: method === 'moveIn' || method === 'moveReturnTransit'
        ? DocumentType.RETURN : DocumentType.REMISSION,
      customerWorksiteId: 'site', docDate: new Date('2026-08-17T12:00:00Z'),
      notes: 'Fecha documento: 2026-08-17',
    }) },
    warehouse: {
      findUnique: jest.fn().mockResolvedValue({ id: 'warehouse' }),
      findMany: jest.fn().mockResolvedValue([{ id: 'owner' }]),
    },
    customerWorksite: { findUnique: jest.fn().mockResolvedValue({ id: 'site' }) },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'sku' }]),
    stockLedger: {
      groupBy: jest.fn().mockResolvedValue([{
        skuId: 'sku', assetId: null, ownerWarehouseId: 'owner', warehouseId: 'owner',
        movementType: MovementType.ON_SITE, _sum: { quantity: 5 },
      }]),
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'ledger', ...data })),
    },
  };
  if (method === 'moveOnSite') {
    tx.stockLedger.groupBy.mockResolvedValueOnce([{
      skuId: 'sku', assetId: null, ownerWarehouseId: 'owner', warehouseId: 'owner',
      movementType: MovementType.ADJUST, _sum: { quantity: 5 },
    }]).mockResolvedValue([]);
  }
  const prisma = {
    warehouse: { findMany: jest.fn().mockResolvedValue([{ id: 'owner' }]) },
    $transaction: jest.fn((run) => run(tx)),
  };
  const cache = { del: jest.fn().mockResolvedValue(undefined) };
  const service = new InventoryService(prisma as never, cache as never);
  const input = {
    documentId: 'document', warehouseId: 'warehouse', customerWorksiteId: 'site',
    items: [{ skuId: 'sku', ownerWarehouseId: 'owner', quantity: 2 }],
  };
  return { tx, prisma, cache, service, input };
}

describe.each(methods)('%s transaction ownership', (method) => {
  it('uses the enclosing transaction for all work and leaves cache invalidation to its caller', async () => {
    const f = fixture(method);
    await expect(f.service[method](f.input, 'operator', f.tx as never))
      .resolves.toEqual({ count: 1, ids: ['ledger'] });
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    expect(f.prisma.warehouse.findMany).not.toHaveBeenCalled();
    expect(f.tx.warehouse.findMany).toHaveBeenCalled();
    expect(f.tx.stockLedger.create).toHaveBeenCalledTimes(1);
    expect(f.tx.stockLedger.create.mock.calls[0][0].data.effectiveAt)
      .toEqual(new Date('2026-08-17T05:00:00Z'));
    expect(f.cache.del).not.toHaveBeenCalled();
  });

  it('retains the standalone transaction and post-transaction cache invalidation', async () => {
    const f = fixture(method);
    await expect(f.service[method](f.input, 'operator')).resolves.toEqual({ count: 1, ids: ['ledger'] });
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(f.cache.del).toHaveBeenCalled();
    expect(f.tx.stockLedger.create.mock.invocationCallOrder[0]).toBeLessThan(f.cache.del.mock.invocationCallOrder[0]);
  });

  it('propagates a ledger write failure without invalidating caches', async () => {
    const f = fixture(method);
    const failure = new Error('synthetic write failure');
    f.tx.stockLedger.create.mockRejectedValueOnce(failure);
    await expect(f.service[method](f.input, 'operator', f.tx as never)).rejects.toBe(failure);
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    expect(f.cache.del).not.toHaveBeenCalled();
  });
});
