import { DocumentType, MovementType, StockLedger, WarehouseType } from '@prisma/client';
import { AssetsService } from '../assets/assets.service';
import { InventoryService } from './inventory.service';

describe('serialized catalogue creation followed by historical delivery', () => {
  const registered = new Date('2026-09-04T16:00:00.000Z');
  const delivered = new Date('2026-09-01T12:00:00.000Z');
  const ownerWarehouseId = 'owner-warehouse';
  const assetId = 'ecomax-asset';

  function setup(ownerType: WarehouseType, warehouseCurrentId: string) {
    const rows: StockLedger[] = [];
    const family = { id: 'family', name: 'EQUIPO', code: 'EQUIPO', controlType: 'SERIAL' };
    const subfamily = { id: 'subfamily', assetFamilyId: family.id, code: 'STANDARD', active: true };
    const sku = {
      id: 'sku', assetFamilyId: family.id, assetSubfamilyId: subfamily.id,
      assetFamily: family, assetSubfamily: subfamily, active: true,
    };
    const warehouse = {
      findUnique: jest.fn(async ({ where }) => ({
        id: where.id, name: where.id, type: where.id === ownerWarehouseId ? ownerType : 'OWN',
      })),
      findMany: jest.fn().mockResolvedValue([{ id: ownerWarehouseId }]),
    };
    const tx = {
      warehouse,
      assetFamily: { findUnique: jest.fn().mockResolvedValue(family) },
      assetSubfamily: { findUnique: jest.fn().mockResolvedValue(subfamily) },
      sku: {
        findUnique: jest.fn().mockResolvedValue(sku),
        findMany: jest.fn().mockResolvedValue([sku]),
        update: jest.fn().mockResolvedValue(sku),
        upsert: jest.fn().mockResolvedValue(sku),
      },
      assetInternalCounter: { upsert: jest.fn().mockResolvedValue({ nextNumber: 2 }) },
      asset: {
        create: jest.fn(async ({ data }) => ({ id: assetId, createdAt: registered, ...data })),
        findMany: jest.fn().mockResolvedValue([{ id: assetId, warehouseOwnerId: ownerWarehouseId }]),
        update: jest.fn().mockResolvedValue({ id: assetId }),
      },
      document: { findUnique: jest.fn().mockResolvedValue({ type: DocumentType.REMISSION, docDate: delivered }) },
      customerWorksite: { findUnique: jest.fn().mockResolvedValue({ id: 'worksite' }) },
      $queryRaw: jest.fn().mockResolvedValue([{ id: assetId }]),
      stockLedger: {
        create: jest.fn(async ({ data }) => {
          const row = {
            id: `ledger-${rows.length + 1}`, createdAt: registered, effectiveAt: registered,
            isOpeningBalance: false, refDocumentId: null, refDocumentType: null, ...data,
          } as StockLedger;
          rows.push(row);
          return row;
        }),
        findMany: jest.fn(async ({ where, orderBy }) => rows
          .filter((row) => where.assetId.in.includes(row.assetId))
          .sort((a, b) => {
            for (const clause of orderBy) {
              const [field, direction] = Object.entries(clause)[0];
              const left = a[field as keyof StockLedger];
              const right = b[field as keyof StockLedger];
              const delta = left instanceof Date && right instanceof Date
                ? left.getTime() - right.getTime()
                : typeof left === 'boolean' && typeof right === 'boolean'
                  ? Number(left) - Number(right)
                  : String(left).localeCompare(String(right));
              if (delta !== 0) return direction === 'desc' ? -delta : delta;
            }
            return 0;
          })),
        groupBy: jest.fn(async ({ where }) => {
          const matched = rows.filter((row) =>
            where.assetId.in.includes(row.assetId)
            && (!where.warehouseId || row.warehouseId === where.warehouseId)
            && (!where.ownerWarehouseId || row.ownerWarehouseId === where.ownerWarehouseId)
            && (!where.movementType || row.movementType === where.movementType));
          return matched.length
            ? [{ assetId, _sum: { quantity: matched.reduce((total, row) => total + Number(row.quantity), 0) } }]
            : [];
        }),
      },
    };
    const prisma = { ...tx, $transaction: jest.fn((callback) => callback(tx)) };
    const cache = { del: jest.fn().mockResolvedValue(undefined) };
    const inventory = new InventoryService(prisma as never, cache as never);
    const assets = new AssetsService(prisma as never, cache as never);
    const dispatch = {
      warehouseId: warehouseCurrentId, customerWorksiteId: 'worksite', documentId: 'RM019144',
      items: [{ assetId, ownerWarehouseId }],
    };
    return { inventory, assets, tx, rows, dispatch, warehouseCurrentId };
  }

  type Fixture = ReturnType<typeof setup>;
  const creators: Array<[string, (fixture: Fixture) => Promise<unknown>]> = [
    ['InventoryService.createSerializedAsset', ({ inventory, warehouseCurrentId }) => inventory.createSerializedAsset({
      family: { id: 'family' }, subfamily: { id: 'subfamily' }, sku: { id: 'sku' },
      ownerWarehouseId, warehouseCurrentId, asset: { brand: 'ECOMAX' },
    }, 'operator')],
    ['InventoryService.createMotorAsset', ({ inventory, tx, warehouseCurrentId }) => inventory['createMotorAsset'](
      { fuel: 'GASOLINA', brand: 'HONDA' }, ownerWarehouseId, warehouseCurrentId, 'operator', tx as never,
    )],
    ['AssetsService.createAsset', ({ assets, warehouseCurrentId }) => assets.createAsset({
      skuId: 'sku', warehouseOwnerId: ownerWarehouseId, warehouseCurrentId, brand: 'ECOMAX',
    }, 'operator')],
  ];
  const ownerLocations: Array<[WarehouseType, string]> = [
    ['OWN', ownerWarehouseId],
    ['OWN', 'other-physical-warehouse'],
    ['ALLY', ownerWarehouseId],
    ['ALLY', 'other-physical-warehouse'],
  ];

  async function expectHistoricalDelivery(fixture: Fixture) {
    const { inventory, rows, dispatch, tx } = fixture;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      assetId, ownerWarehouseId, warehouseId: dispatch.warehouseId,
      isOpeningBalance: true, quantity: 1, effectiveAt: registered, createdAt: registered,
    });
    await expect(inventory.moveOut(dispatch, 'operator')).resolves.toMatchObject({ count: 1 });
    expect(rows[1]).toMatchObject({
      movementType: MovementType.OUT, quantity: -1, isOpeningBalance: false,
      refDocumentId: 'RM019144', effectiveAt: delivered, createdAt: registered,
    });
    expect(rows[0].effectiveAt).toEqual(registered);

    // The September 4 catalogue row must never supersede the real September 1 delivery.
    tx.stockLedger.create.mockClear();
    await expect(inventory.moveOut(dispatch, 'operator')).rejects.toMatchObject({
      response: { code: 'ASSET_LOCATION_CONFLICT' },
    });
    expect(tx.stockLedger.create).not.toHaveBeenCalled();
    expect(rows).toHaveLength(2);
  }

  describe.each(creators)('%s', (_name, create) => {
    it.each(ownerLocations)('allows a historical first delivery for %s stock registered at %s and prevents a duplicate', async (ownerType, location) => {
      const fixture = setup(ownerType, location);
      await create(fixture);
      await expectHistoricalDelivery(fixture);
    });
  });

  it.each([ownerWarehouseId, 'other-physical-warehouse'])('allows historical delivery after catalogue provider receipt at %s', async (location) => {
    const fixture = setup('ALLY', location);
    await fixture.inventory.createProviderReceipts({
      supplierWarehouseId: ownerWarehouseId, custodyWarehouseId: location,
      items: [{ skuId: 'sku', brand: 'ECOMAX' }],
    }, 'operator');
    await expectHistoricalDelivery(fixture);
  });

  it('still rejects an older delivery when a real later movement exists', async () => {
    const fixture = setup('OWN', ownerWarehouseId);
    await creators[0][1](fixture);
    await fixture.tx.stockLedger.create({ data: {
      ...fixture.rows[0], id: 'real-return', movementType: MovementType.IN,
      effectiveAt: new Date('2026-09-03T12:00:00.000Z'), isOpeningBalance: false,
      refDocumentId: 'real-return-document', refDocumentType: DocumentType.RETURN,
    } });
    fixture.tx.stockLedger.create.mockClear();
    await expect(fixture.inventory.moveOut(fixture.dispatch, 'operator')).rejects.toMatchObject({
      response: { code: 'RETROACTIVE_INVENTORY_MOVEMENT' },
    });
    expect(fixture.tx.stockLedger.create).not.toHaveBeenCalled();
  });

  it('still rejects dispatch from a different warehouse than the catalogue location', async () => {
    const fixture = setup('OWN', 'other-physical-warehouse');
    await creators[0][1](fixture);
    fixture.tx.stockLedger.create.mockClear();
    await expect(fixture.inventory.moveOut({ ...fixture.dispatch, warehouseId: ownerWarehouseId }, 'operator')).rejects.toMatchObject({
      response: { code: 'ASSET_LOCATION_CONFLICT' },
    });
    expect(fixture.tx.stockLedger.create).not.toHaveBeenCalled();
  });
});
