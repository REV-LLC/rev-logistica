import { DocumentType, MovementType } from '@prisma/client';
import { InventoryService } from './inventory.service';

describe('provider catalogue stock and late document entry', () => {
  const registered = new Date('2026-09-07T15:00:00Z');
  const delivered = new Date('2026-09-02T12:00:00Z');
  function setup(opening = true, quantity = 1) {
    const rows: any[] = [
      { id: 'opening-vibrator', createdAt: registered, refDocumentId: null, refDocumentType: null,
        assetId: 'vibrator', skuId: null, ownerWarehouseId: 'provider', warehouseId: 'provider',
        customerWorksiteId: null, movementType: MovementType.ADJUST, quantity: 1,
        effectiveAt: registered, isOpeningBalance: opening },
      { id: 'opening-hose', createdAt: registered, refDocumentId: null, refDocumentType: null,
        assetId: null, skuId: 'hose', ownerWarehouseId: 'provider', warehouseId: 'provider',
        customerWorksiteId: null, movementType: MovementType.ADJUST, quantity,
        effectiveAt: registered, isOpeningBalance: opening },
    ];
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      document: { findUnique: jest.fn().mockResolvedValue({ type: DocumentType.REMISSION, docDate: delivered }) },
      warehouse: { findUnique: jest.fn(async ({ where }) => ({ id: where.id, name: 'Proveedor' })) },
      customerWorksite: { findUnique: jest.fn().mockResolvedValue({ id: 'site' }) },
      asset: { findMany: jest.fn().mockResolvedValue([{ id: 'vibrator', warehouseOwnerId: 'provider' }]),
        update: jest.fn().mockResolvedValue({}) },
      stockLedger: {
        findFirst: jest.fn(async ({ where }) => rows.find(r => r.skuId === 'hose'
          && r.isOpeningBalance === where.isOpeningBalance && r.effectiveAt > where.effectiveAt.gt) ?? null),
        findMany: jest.fn(async ({ orderBy }) => {
          expect(orderBy[0]).toEqual({ isOpeningBalance: 'asc' });
          return rows.filter(r => r.assetId === 'vibrator').sort((a, b) =>
            Number(a.isOpeningBalance) - Number(b.isOpeningBalance)
            || b.effectiveAt.getTime() - a.effectiveAt.getTime());
        }),
        groupBy: jest.fn(async ({ by, where }) => {
          if (where.movementType) return [];
          return by.includes('assetId')
            ? [{ assetId: 'vibrator', _sum: { quantity: 1 } }]
            : [{ skuId: 'hose', ownerWarehouseId: 'provider', warehouseId: 'provider', _sum: { quantity } }];
        }),
        create: jest.fn(async ({ data }) => {
          rows.push({
            id: `ledger-${rows.length + 1}`, createdAt: registered,
            refDocumentId: null, refDocumentType: null, ...data, isOpeningBalance: false,
          });
          return { id: 'new-row' };
        }),
      },
    };
    const prisma = { $transaction: (fn: any) => fn(tx),
      warehouse: { findMany: jest.fn().mockResolvedValue([{ id: 'provider' }]) } };
    return { tx, rows, service: new InventoryService(prisma as never, { del: jest.fn() } as never) };
  }
  const payload = { documentId: 'remission', customerWorksiteId: 'site', items: [
    { assetId: 'vibrator', ownerWarehouseId: 'provider' },
    { skuId: 'hose', ownerWarehouseId: 'provider', quantity: 1 },
  ] };

  it('records delivery on Sep 2 for a vibrator and hose registered on Sep 7 without changing their audit dates', async () => {
    const { service, tx, rows } = setup();
    await expect(service.moveOnSite(payload, 'operator')).resolves.toEqual({ count: 2, ids: ['new-row', 'new-row'] });
    expect(tx.stockLedger.create).toHaveBeenCalledTimes(2);
    for (const call of tx.stockLedger.create.mock.calls) expect(call[0].data.effectiveAt).toEqual(delivered);
    expect(rows[0].effectiveAt).toEqual(registered);
    expect(rows[1].effectiveAt).toEqual(registered);
  });

  it('accepts a later quantity adjustment when the aggregate balance covers the delivery', async () => {
    const { service, rows } = setup();
    rows[1].isOpeningBalance = false;
    await expect(service.moveOnSite(payload, 'operator')).resolves.toMatchObject({ count: 2 });
  });

  it('still rejects a later real movement of the equipment', async () => {
    const { service, tx, rows } = setup();
    rows.push({ ...rows[0], isOpeningBalance: false, movementType: MovementType.ON_SITE, warehouseId: null, customerWorksiteId: 'other-site' });
    await expect(service.moveOnSite(payload, 'operator')).rejects.toMatchObject({ response: { code: 'RETROACTIVE_INVENTORY_MOVEMENT' } });
    expect(tx.stockLedger.create).not.toHaveBeenCalled();
  });

  it('does not allow a second delivery from the provider after the historical delivery', async () => {
    const { service, tx } = setup();
    await service.moveOnSite(payload, 'operator');
    tx.stockLedger.create.mockClear();
    await expect(service.moveOnSite(payload, 'operator')).rejects.toMatchObject({ response: { code: 'ASSET_LOCATION_CONFLICT' } });
    expect(tx.stockLedger.create).not.toHaveBeenCalled();
  });

  it('does not create missing bulk stock to accommodate an old document', async () => {
    const { service, tx } = setup(true, 0);
    await expect(service.moveOnSite(payload, 'operator')).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_STOCK' } });
    expect(tx.stockLedger.create).not.toHaveBeenCalled();
  });

  it.each([
    ['ALLY', null, 'provider', true],
    ['ALLY', { id: 'existing-movement' }, 'provider', false],
    ['OWN', null, 'provider', false],
    ['ALLY', null, 'physical-warehouse', false],
  ])('classifies first bulk stock only at its provider (%s, %s, %s)', async (type, existing, warehouseId, expected) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      sku: { findUnique: jest.fn().mockResolvedValue({ id: 'hose', assetFamily: { controlType: 'BULK' } }) },
      warehouse: { findUnique: jest.fn().mockResolvedValue({ id: 'provider', type }) },
      stockLedger: { findFirst: jest.fn().mockResolvedValue(existing), create: jest.fn().mockResolvedValue({ id: 'opening' }) },
    };
    const prisma = { $transaction: (fn: any) => fn(tx) };
    const service = new InventoryService(prisma as never, {} as never);
    await service.addBulkStock({ skuId: 'hose', ownerWarehouseId: 'provider', warehouseId: warehouseId as string, quantity: 1 }, 'operator');
    expect(tx.stockLedger.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isOpeningBalance: expected, quantity: 1 }) }));
  });
});
