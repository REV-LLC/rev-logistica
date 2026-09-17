import { AssetsService } from '../assets/assets.service';
import { InventoryService } from './inventory.service';
import { type SerializedLedgerMovement } from './serialized-ledger-location';

type ReadMovement = SerializedLedgerMovement & {
  warehouse: { id: string; name: string; type: string } | null;
  customerWorksite: {
    id: string;
    alias: string;
    customer: { id: string; name: string };
    worksite: { id: string; name: string };
  } | null;
};

const physicalWarehouse = { id: 'own', name: 'Nuestra bodega', type: 'OWN' };
const providerWarehouse = { id: 'provider', name: 'Proveedor', type: 'ALLY' };
const worksite = {
  id: 'site', alias: 'Obra destino',
  customer: { id: 'customer', name: 'Cliente' },
  worksite: { id: 'worksite', name: 'Obra destino' },
};
const registered = new Date('2026-09-08T12:00:00.000Z');
const effective = new Date('2026-09-03T12:00:00.000Z');

function movement(overrides: Partial<ReadMovement> = {}): ReadMovement {
  return {
    id: 'opening', assetId: 'asset-a', ownerWarehouseId: 'provider',
    warehouseId: 'own', warehouse: physicalWarehouse,
    customerWorksiteId: null, customerWorksite: null,
    movementType: 'ADJUST', quantity: 1, isOpeningBalance: true,
    refDocumentId: null, refDocumentType: null,
    effectiveAt: registered, createdAt: registered,
    ...overrides,
  };
}

function transfer(deltaMs = 0, type = 'PROVIDER_PICKUP'): ReadMovement[] {
  const source = movement({
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', isOpeningBalance: false,
    refDocumentId: 'transfer', refDocumentType: type,
    movementType: 'OUT', quantity: -1, effectiveAt: effective,
    warehouseId: 'provider', warehouse: providerWarehouse,
  });
  const destination = movement({
    id: '00000000-0000-0000-0000-000000000001', isOpeningBalance: false,
    refDocumentId: 'transfer', refDocumentType: type,
    movementType: 'IN', quantity: 1,
    effectiveAt: new Date(effective.getTime() + deltaMs),
    createdAt: new Date(registered.getTime() + deltaMs),
  });
  return [source, destination];
}

/** Keep the balance projection independent so reads cannot silently rewrite it. */
function fixture(rows: ReadMovement[], quantity = 1, assetsCount = 1) {
  const sku = {
    id: 'sku', name: 'MEZCLADORA', active: true,
    assetFamily: { id: 'family', name: 'MEZCLADORAS', code: 'MIX', controlType: 'SERIAL' },
    assetSubfamily: { id: 'subfamily', name: 'ESTÁNDAR', code: 'STD' },
  };
  const assets = Array.from({ length: assetsCount }, (_, index) => ({
    id: index === 0 ? 'asset-a' : `asset-${index}`,
    skuId: sku.id, warehouseOwnerId: 'provider', active: true,
    internalNumber: index + 1, sku,
  }));
  const prisma = {
    warehouse: {
      findUnique: jest.fn(async ({ where }) => ({
        ...(where.id === 'own' ? physicalWarehouse : providerWarehouse),
        ownerCompany: { name: 'Proveedor' },
      })),
      findMany: jest.fn().mockResolvedValue([{ ...providerWarehouse, ownerCompany: { name: 'Proveedor' } }]),
    },
    customerWorksite: {
      findUnique: jest.fn().mockResolvedValue(worksite),
      findMany: jest.fn().mockResolvedValue([]),
    },
    asset: {
      findUnique: jest.fn().mockResolvedValue(assets[0]),
      findMany: jest.fn().mockResolvedValue(assets),
    },
    sku: { findMany: jest.fn().mockResolvedValue([sku]) },
    stockLedger: {
      groupBy: jest.fn(async ({ by, where }) => {
        if (!by.includes('assetId')) return [];
        if (where.customerWorksiteId === 'site') {
          return assets.map(asset => ({ assetId: asset.id, movementType: 'OUT', _sum: { quantity: -quantity } }));
        }
        if (where.warehouseId === 'own') {
          return assets.map(asset => ({ assetId: asset.id, _sum: { quantity } }));
        }
        return [];
      }),
      findMany: jest.fn().mockResolvedValue(rows),
    },
  };
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  return {
    prisma, cache,
    inventory: new InventoryService(prisma as never, cache as never),
    assets: new AssetsService(prisma as never, cache as never),
  };
}

const cases: Array<[string, () => ReadMovement[], string, string]> = [
  ['a new same-time dispatch appended from an older transaction after a legacy pickup', () => [...transfer(), movement({
    id: '00000000-0000-0000-0000-000000000000', appendOrder: 1,
    isOpeningBalance: false, effectiveAt: effective,
    createdAt: new Date(registered.getTime() - 1000),
    movementType: 'OUT', quantity: -1,
    customerWorksiteId: 'site', customerWorksite: worksite,
    refDocumentId: 'dispatch', refDocumentType: 'REMISSION',
  })], 'OUT', 'WORKSITE'],
  ['new append sequence precedence over an inverted transaction clock', () => [
    ...transfer().map((row, index) => ({ ...row, appendOrder: index + 1 })),
    movement({
      id: '00000000-0000-0000-0000-000000000000', appendOrder: 3,
      isOpeningBalance: false, effectiveAt: effective,
      createdAt: new Date(registered.getTime() - 1000),
      movementType: 'OUT', quantity: -1,
      customerWorksiteId: 'site', customerWorksite: worksite,
      refDocumentId: 'dispatch', refDocumentType: 'REMISSION',
    }),
  ], 'OUT', 'WORKSITE'],
  ['OUT UUID greater at identical timestamps', () => transfer(), 'IN', 'WAREHOUSE'],
  ['legacy pair with a one-millisecond registration and effective-date gap', () => transfer(1), 'IN', 'WAREHOUSE'],
  ['custody receipt pair with OUT UUID greater', () => {
    const [out, incoming] = transfer(0, 'PROVIDER_RECEIPT');
    return [
      { ...out, warehouseId: 'own', warehouse: physicalWarehouse },
      { ...incoming, warehouseId: 'provider', warehouse: providerWarehouse },
    ];
  }, 'IN', 'WAREHOUSE'],
  ['single-IN provider receipt from transit', () => [movement({
    isOpeningBalance: false, refDocumentId: 'receipt', refDocumentType: 'PROVIDER_RECEIPT',
    movementType: 'IN', warehouseId: 'provider', warehouse: providerWarehouse,
  })], 'IN', 'WAREHOUSE'],
  ['incomplete pickup with only OUT', () => [transfer()[0]], 'UNKNOWN', 'UNKNOWN'],
  ['incomplete pickup with only IN', () => [transfer()[1]], 'UNKNOWN', 'UNKNOWN'],
  ['ambiguous duplicate destination', () => {
    const rows = transfer();
    return [...rows, { ...rows[1], id: 'duplicate', warehouseId: 'third' }];
  }, 'UNKNOWN', 'UNKNOWN'],
  ['mismatched transfer owners', () => {
    const [out, incoming] = transfer();
    return [out, { ...incoming, ownerWarehouseId: 'other-owner' }];
  }, 'UNKNOWN', 'UNKNOWN'],
  ['an IN preceding its OUT', () => transfer(-1), 'UNKNOWN', 'UNKNOWN'],
  ['a real dispatch after a complete transfer', () => [...transfer(), movement({
    id: 'dispatch', isOpeningBalance: false, movementType: 'OUT', quantity: -1,
    refDocumentId: 'remission', refDocumentType: 'REMISSION',
    effectiveAt: new Date(effective.getTime() + 1000),
    customerWorksiteId: 'site', customerWorksite: worksite,
  })], 'OUT', 'WORKSITE'],
  ['late catalogue registration after a real historical dispatch', () => [movement(), movement({
    id: 'dispatch', isOpeningBalance: false, movementType: 'ON_SITE', quantity: 1,
    warehouseId: null, warehouse: null, effectiveAt: effective,
    customerWorksiteId: 'site', customerWorksite: worksite,
    refDocumentId: 'remission', refDocumentType: 'REMISSION',
  })], 'OUT', 'WORKSITE'],
  ['a real transit movement', () => [movement({
    isOpeningBalance: false, movementType: 'TRANSIT', warehouseId: null, warehouse: null,
    customerWorksiteId: 'site', customerWorksite: worksite,
  })], 'TRANSIT', 'TRANSIT'],
  ['negative latest adjustment despite a positive balance projection', () => [movement({ quantity: -1 })], 'UNKNOWN', 'UNKNOWN'],
  ['zero latest IN despite a positive balance projection', () => [movement({ movementType: 'IN', quantity: 0 })], 'UNKNOWN', 'UNKNOWN'],
  ['missing history despite a positive balance projection', () => [], 'UNKNOWN', 'UNKNOWN'],
];

describe('serialized inventory read models use complete event location', () => {
  it('uses the canonical asset ID returned by PostgreSQL for an uppercase UUID URL', async () => {
    const canonical = 'aabbccdd-0000-4000-a000-000000000001';
    const { assets, prisma } = fixture([movement({ assetId: canonical })]);
    prisma.asset.findUnique.mockResolvedValue({ id: canonical } as never);
    expect((await assets.getAssetLocation(canonical.toUpperCase())).locationType).toBe('WAREHOUSE');
  });
  it.each(cases)('warehouse view resolves %s without changing stock', async (_name, buildRows, status, locationType) => {
    const { inventory } = fixture(buildRows());
    const result = await inventory.getWarehouseInventory('own');
    expect(result.serial).toHaveLength(1);
    expect(result.serial[0]).toMatchObject({ status, quantity: 1, location: { type: locationType } });
  });

  it.each(cases)('on-site view resolves %s without changing its historical balance', async (_name, buildRows, status) => {
    const { inventory } = fixture(buildRows());
    const result = await inventory.getOnSiteInventory('site');
    expect(result.serial).toHaveLength(1);
    expect(result.serial[0]).toMatchObject({ status, quantity: 1 });
  });

  it.each(cases)('asset detail resolves %s consistently', async (_name, buildRows, _status, locationType) => {
    const { assets } = fixture(buildRows());
    const result = await assets.getAssetLocation('asset-a');
    expect(result.locationType).toBe(
      locationType === 'WORKSITE' ? 'CUSTOMER_WORKSITE'
        : locationType === 'TRANSIT' ? 'IN_TRANSIT' : locationType,
    );
    if (locationType === 'WAREHOUSE') expect(result.warehouse).not.toBeNull();
    else expect(result.warehouse).toBeNull();
  });

  it('shows the matched destination name, not the OUT source warehouse', async () => {
    const { inventory, assets } = fixture(transfer());
    const warehouse = await inventory.getWarehouseInventory('own');
    expect(warehouse.serial[0]).toMatchObject({ location: { type: 'WAREHOUSE', name: 'Nuestra bodega' } });
    expect((await assets.getAssetLocation('asset-a')).warehouse).toMatchObject({ id: 'own', name: 'Nuestra bodega' });
  });

  it('fetches full histories in one batch for warehouse and on-site views, never per asset', async () => {
    const { inventory, prisma } = fixture(transfer(), 1, 2);
    await inventory.getWarehouseInventory('own');
    await inventory.getOnSiteInventory('site');
    expect(prisma.stockLedger.findMany).toHaveBeenCalledTimes(2);
    for (const [query] of prisma.stockLedger.findMany.mock.calls) {
      expect(query).toMatchObject({
        where: { assetId: { in: ['asset-a', 'asset-1'] } },
        select: { id: true, assetId: true, ownerWarehouseId: true, refDocumentId: true,
          refDocumentType: true, warehouseId: true, customerWorksiteId: true, quantity: true,
          isOpeningBalance: true, effectiveAt: true, createdAt: true, appendOrder: true },
      });
      expect(query).not.toHaveProperty('take');
    }
  });

  it('does not resurrect exhausted stock while resolving a complete transfer', async () => {
    const { inventory, prisma } = fixture(transfer(), 0);
    expect((await inventory.getWarehouseInventory('own')).serial).toEqual([]);
    expect((await inventory.getOnSiteInventory('site')).serial).toEqual([]);
    expect(prisma.stockLedger.findMany).not.toHaveBeenCalled();
  });

  it('does not look up movement history for an absent asset', async () => {
    const { assets, prisma } = fixture(transfer());
    prisma.asset.findUnique.mockResolvedValue(null as never);
    await expect(assets.getAssetLocation('missing')).rejects.toThrow('Asset not found');
    expect(prisma.stockLedger.findMany).not.toHaveBeenCalled();
  });
});
