import { InventoryService } from './inventory.service';
import { AssetsService } from '../assets/assets.service';
import { serializedBalanceConsistency } from './serialized-balance-consistency';
import { resolveLatestSerializedMovements, type SerializedLedgerMovement } from './serialized-ledger-location';

const warehouse = { id: 'own', name: 'Nuestra bodega', type: 'OWN' };
const site = { id: 'site', alias: 'San Fernando', worksite: { name: 'San Fernando' } };
const sku = { id: 'sku', name: 'Equipo propio', active: true };

function movement(id: string, type: string, quantity: number, day: number, onSite = false) {
  return {
    id, assetId: 'asset', ownerWarehouseId: warehouse.id, movementType: type, quantity,
    warehouseId: type === 'ON_SITE' ? null : warehouse.id,
    warehouse: type === 'ON_SITE' ? null : warehouse,
    customerWorksiteId: onSite ? site.id : null, customerWorksite: onSite ? site : null,
    isOpeningBalance: id === 'opening', refDocumentId: id, refDocumentType: null,
    effectiveAt: new Date(`2026-07-${String(day).padStart(2, '0')}T12:00:00Z`),
    createdAt: new Date(`2026-07-${String(day).padStart(2, '0')}T13:00:00Z`),
  };
}

const opening = () => movement('opening', 'ADJUST', 1, 1);
const outgoing = () => movement('delivery', 'ON_SITE', 1, 3, true);

function fixture(rows: ReturnType<typeof movement>[], active = true) {
  const asset = { id: 'asset', skuId: sku.id, warehouseOwnerId: warehouse.id, warehouseOwner: warehouse, active, sku, ledger: rows };
  const assetFind = jest.fn().mockResolvedValue([asset]);
  const prisma = {
    warehouse: { findUnique: jest.fn().mockResolvedValue(warehouse), findMany: jest.fn().mockResolvedValue([warehouse]) },
    asset: { findMany: assetFind, findUnique: jest.fn().mockResolvedValue(asset) },
    sku: { findMany: jest.fn().mockResolvedValue([sku]) },
    customerWorksite: { findMany: jest.fn().mockResolvedValue([]) },
    stockLedger: {
      findMany: jest.fn().mockResolvedValue(rows),
      groupBy: jest.fn(async ({ by, where }) => {
        if (!by.includes('assetId')) return [];
        const selected = rows.filter((row) => where.movementType === 'ON_SITE'
          ? row.movementType === 'ON_SITE' && row.ownerWarehouseId === where.ownerWarehouseId
          : row.warehouseId === where.warehouseId);
        return [{ assetId: asset.id, _sum: { quantity: selected.reduce((sum, row) => sum + row.quantity, 0) } }];
      }),
    },
  };
  return { service: new InventoryService(prisma as never, { get: jest.fn(), set: jest.fn() } as never),
    assets: new AssetsService(prisma as never, {} as never), assetFind };
}

describe('own equipment balance and status agree', () => {
  it('keeps a dispatched asset in the catalogue, with zero warehouse stock and an on-site balance', async () => {
    const { service, assetFind } = fixture([opening(), outgoing()]);
    const result = await service.getOwnerAssetCatalog(warehouse.id);
    expect(result.serial[0]).toMatchObject({ status: 'OUT', quantity: 0, isAvailableInOwnerWarehouse: false,
      location: { type: 'WORKSITE', name: 'San Fernando' },
      balance: { warehouseQuantity: 0, worksiteQuantity: 1, isConsistent: true, issue: null } });
    expect(assetFind.mock.calls[0][0].select.ledger.take).toBeUndefined();
    expect((await service.getWarehouseInventory(warehouse.id)).serial).toEqual([]);
  });

  it('shows availability only after the return and its balance agree', async () => {
    const { service } = fixture([opening(), outgoing(), movement('return', 'IN', 1, 4, true)]);
    expect((await service.getOwnerAssetCatalog(warehouse.id)).serial[0]).toMatchObject({
      status: 'IN', quantity: 1, isAvailableInOwnerWarehouse: true,
      balance: { warehouseQuantity: 1, worksiteQuantity: 0, isConsistent: true } });
    expect((await service.getWarehouseInventory(warehouse.id)).serial[0]).toMatchObject({ status: 'IN', quantity: 1 });
  });

  it('flags a return dated before its delivery and excludes it from dispatchable stock', async () => {
    const { service, assets } = fixture([opening(), outgoing(), movement('backdated-return', 'IN', 1, 2, true)]);
    expect((await service.getOwnerAssetCatalog(warehouse.id)).serial[0]).toMatchObject({
      status: 'INCONSISTENT', quantity: 1, isAvailableInOwnerWarehouse: false,
      location: { type: 'UNKNOWN' },
      balance: { warehouseQuantity: 1, worksiteQuantity: 0, isConsistent: false, issue: 'LOCATION_MISMATCH' } });
    expect((await service.getWarehouseInventory(warehouse.id)).serial).toEqual([]);
    expect(await assets.getAssetLocation('asset')).toMatchObject({
      locationType: 'INCONSISTENT', warehouse: null, customerWorksite: null,
      balance: { warehouseQuantity: 1, worksiteQuantity: 0, isConsistent: false } });
  });

  it('handles modern signed OUT dispatches and compensating reversals without changing ledger sums', async () => {
    const { service } = fixture([opening(), movement('dispatch', 'OUT', -1, 3, true),
      movement('return', 'IN', 1, 4, true), movement('reverse-return', 'OUT', -1, 5, true)]);
    expect((await service.getOwnerAssetCatalog(warehouse.id)).serial[0]).toMatchObject({
      status: 'OUT', quantity: 0, balance: { warehouseQuantity: 0, worksiteQuantity: 1, isConsistent: true } });
  });

  it('does not turn an inactive asset into available equipment even with a balance of one', async () => {
    const { service } = fixture([opening()], false);
    expect((await service.getOwnerAssetCatalog(warehouse.id)).serial[0]).toMatchObject({
      status: 'INACTIVE', quantity: 1, isAvailableInOwnerWarehouse: false });
  });

  it.each([
    ['duplicate stock', [opening(), movement('duplicate', 'ADJUST', 1, 2)]],
    ['negative stock', [movement('negative', 'ADJUST', -1, 2)]],
    ['multiple worksites despite a net total of one', [opening(), outgoing(),
      { ...movement('other', 'ON_SITE', 1, 4, true), customerWorksiteId: 'other-site' }]],
    ['fractional stock', [movement('fraction', 'ADJUST', 0.5, 2)]],
  ])('does not certify %s', (_label, rows) => {
    const history = rows as SerializedLedgerMovement[];
    expect(serializedBalanceConsistency(history, warehouse.id,
      resolveLatestSerializedMovements(history).get('asset')?.locationMovement)).toMatchObject({
      isConsistent: false, issue: 'INVALID_BALANCE' });
  });

  it('retains an asset without movements as unknown, not available', async () => {
    const { service } = fixture([]);
    expect((await service.getOwnerAssetCatalog(warehouse.id)).serial[0]).toMatchObject({
      status: 'UNKNOWN', quantity: 0, isAvailableInOwnerWarehouse: false,
      balance: { issue: 'NO_MOVEMENTS', isConsistent: false } });
  });
});
