import {
  getInventoryDatePrecision,
  inventoryBusinessDay,
  inventoryEffectiveLowerBound,
  resolveSerializedEffectiveAt,
} from './business-date-ledger-order';
import { InventoryService } from './inventory.service';
import { resolveLatestSerializedMovements } from './serialized-ledger-location';

const day = new Date('2026-09-08T12:00:00.000Z');
const late = new Date('2026-09-08T15:00:00.000Z');
const dayStart = new Date('2026-09-08T05:00:00.000Z');

describe('explicit business-day inventory chronology', () => {
  it.each([
    ['Fecha documento: 2026-09-08', 'DAY'],
    ['Entrega: ON_SITE | FECHA DOCUMENTO: 2026-09-08 | Nota: prueba', 'DAY'],
    ['Fecha documento: 2026-09-08T12:00:00Z', 'INSTANT'],
    ['Fecha documento: 2026-09-08 12:00', 'INSTANT'],
    ['Fecha documento: 08/09/2026', 'INSTANT'],
    ['Fecha documento: 2026-09-09', 'INSTANT'],
    ['Fecha documento: 2026-02-31', 'INSTANT'],
    ['Fecha documento: inválida', 'INSTANT'],
    ['Fecha documento: ', 'INSTANT'],
    ['', 'INSTANT'],
    [undefined, 'INSTANT'],
  ])('classifies only a concordant, valid explicit ISO day: %s', (notes, precision) => {
    expect(getInventoryDatePrecision({ docDate: day, notes })).toBe(precision);
  });

  it('uses Bogotá calendar boundaries, not UTC calendar dates', () => {
    expect(inventoryBusinessDay(new Date('2026-09-09T04:59:59.999Z'))).toBe('2026-09-08');
    expect(inventoryBusinessDay(new Date('2026-09-09T05:00:00.000Z'))).toBe('2026-09-09');
  });

  it('uses the start of the declared day as lower bound, not the document noon representation', () => {
    expect(inventoryEffectiveLowerBound(day, 'DAY')).toEqual(dayStart);
    expect(inventoryEffectiveLowerBound(day, 'INSTANT')).toBe(day);
    expect(resolveSerializedEffectiveAt(day, new Date('2026-09-08T04:59:59.999Z'), 'DAY')).toEqual(dayStart);
  });

  it('uses the same-day latest instant without fabricating a time or changing the document date', () => {
    expect(resolveSerializedEffectiveAt(day, late, 'DAY')).toBe(late);
    expect(day.toISOString()).toBe('2026-09-08T12:00:00.000Z');
    expect(late.toISOString()).toBe('2026-09-08T15:00:00.000Z');
  });

  it('can append at the very last millisecond of the same business day', () => {
    const endOfDay = new Date('2026-09-09T04:59:59.999Z');
    expect(resolveSerializedEffectiveAt(day, endOfDay, 'DAY')).toBe(endOfDay);
    expect(resolveSerializedEffectiveAt(day, new Date('2026-09-09T05:00:00Z'), 'DAY')).toBeNull();
  });

  it('does not relax precise timestamps even within the same day', () => {
    expect(resolveSerializedEffectiveAt(day, late, 'INSTANT')).toBeNull();
    expect(resolveSerializedEffectiveAt(late, day, 'INSTANT')).toBe(late);
    expect(resolveSerializedEffectiveAt(day, day, 'INSTANT')).toBe(day);
  });

  function fixture() {
    const latest = {
      id: 'latest', assetId: 'asset', ownerWarehouseId: 'owner', warehouseId: 'own',
      customerWorksiteId: null, movementType: 'IN', quantity: 1,
      refDocumentId: 'return', refDocumentType: 'RETURN', isOpeningBalance: false,
      effectiveAt: late, createdAt: late, appendOrder: 1,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      stockLedger: { findMany: jest.fn().mockResolvedValue([latest]) },
      asset: { findMany: jest.fn().mockResolvedValue([{
        id: 'asset', description: 'Equipo de prueba', sku: { name: 'Equipo' },
        warehouseOwner: { name: 'Proveedor' },
      }]) },
      warehouse: { findUnique: jest.fn(async ({ where }) => ({ id: where.id, name: where.id })) },
    };
    return { latest, tx, service: new InventoryService({} as never, {} as never) };
  }

  it('returns a shared maximum for all locked assets without altering their histories', async () => {
    const { latest, tx, service } = fixture();
    const other = { ...latest, assetId: 'second', effectiveAt: new Date('2026-09-08T16:00:00Z') };
    tx.stockLedger.findMany.mockResolvedValue([latest, other]);
    const result = await service['lockAndAssertSerializedLocation'](
      tx as never, ['second', 'asset'], day, () => ({ type: 'WAREHOUSE', id: 'own' }), 'DAY',
    );
    expect(result).toBe(other.effectiveAt);
    expect(latest.effectiveAt).toBe(late);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.stockLedger.findMany.mock.calls[0][0].select.appendOrder).toBe(true);
  });

  it('still rejects a same-day source mismatch, never creates an implicit transfer', async () => {
    const { tx, service } = fixture();
    await expect(service['lockAndAssertSerializedLocation'](
      tx as never, ['asset'], day, () => ({ type: 'WAREHOUSE', id: 'different' }), 'DAY',
    )).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ASSET_LOCATION_CONFLICT' }) });
  });

  it('still rejects a real movement on a later business day', async () => {
    const { latest, tx, service } = fixture();
    latest.effectiveAt = new Date('2026-09-09T05:00:00Z');
    await expect(service['lockAndAssertSerializedLocation'](
      tx as never, ['asset'], day, () => ({ type: 'WAREHOUSE', id: 'own' }), 'DAY',
    )).rejects.toMatchObject({ response: expect.objectContaining({ code: 'RETROACTIVE_INVENTORY_MOVEMENT' }) });
  });

  it('keeps precise legacy callers strict by default', async () => {
    const { tx, service } = fixture();
    await expect(service['lockAndAssertSerializedLocation'](
      tx as never, ['asset'], day, () => ({ type: 'WAREHOUSE', id: 'own' }),
    )).rejects.toMatchObject({ response: expect.objectContaining({ code: 'RETROACTIVE_INVENTORY_MOVEMENT' }) });
  });

  it('keeps an undated opening from imposing an effective date or day restriction', async () => {
    const { latest, tx, service } = fixture();
    latest.isOpeningBalance = true;
    latest.effectiveAt = new Date('2026-09-10T15:00:00Z');
    expect(await service['lockAndAssertSerializedLocation'](
      tx as never, ['asset'], day, () => ({ type: 'WAREHOUSE', id: 'own' }), 'DAY',
    )).toEqual(dayStart);
  });

  it('keeps the business date for quantity-only operations without serialized locks', async () => {
    const { tx, service } = fixture();
    expect(await service['lockAndAssertSerializedLocation'](
      tx as never, [], day, () => ({ type: 'WAREHOUSE', id: 'own' }), 'DAY',
    )).toEqual(dayStart);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('does not place a date-only morning dispatch after a genuine 06:00 return', async () => {
    const { latest, tx, service } = fixture();
    const dispatch = {
      ...latest, movementType: 'OUT', quantity: -1, customerWorksiteId: 'site',
      effectiveAt: inventoryEffectiveLowerBound(day, 'DAY'),
      refDocumentId: 'dispatch', refDocumentType: 'REMISSION', appendOrder: 2,
    };
    tx.stockLedger.findMany.mockResolvedValue([dispatch] as never);
    const realReturnAt = new Date('2026-09-08T11:00:00.000Z');
    expect(await service['lockAndAssertSerializedLocation'](
      tx as never, ['asset'], realReturnAt, () => ({ type: 'WORKSITE', id: 'site' }), 'INSTANT',
    )).toBe(realReturnAt);
    const returned = {
      ...latest, refDocumentId: 'receipt', refDocumentType: 'RETURN',
      effectiveAt: realReturnAt, appendOrder: 3,
    };
    expect(resolveLatestSerializedMovements([dispatch, returned]).get('asset')?.locationMovement).toBe(returned);
    expect(dispatch.effectiveAt).toEqual(dayStart);
    expect(day.toISOString()).toBe('2026-09-08T12:00:00.000Z');
  });

  it.each(['moveOut', 'moveOnSite', 'moveIn', 'moveReturnTransit'] as const)(
    '%s persists the resolved same-day effectiveAt rather than the document hour', async (operation) => {
      const isReturn = operation === 'moveIn' || operation === 'moveReturnTransit';
      const origin = operation === 'moveOnSite' ? 'owner' : 'own';
      const source = {
        id: 'source', assetId: 'asset', ownerWarehouseId: 'owner', warehouseId: origin,
        customerWorksiteId: isReturn ? 'site' : null,
        movementType: isReturn ? 'OUT' : 'IN', quantity: isReturn ? -1 : 1,
        refDocumentId: 'previous', refDocumentType: isReturn ? 'REMISSION' : 'RETURN',
        isOpeningBalance: false, effectiveAt: late, createdAt: late, appendOrder: 1,
      };
      const document = {
        id: 'document', type: isReturn ? 'RETURN' : 'REMISSION',
        customerWorksiteId: 'site', docDate: day, notes: 'Fecha documento: 2026-09-08',
      };
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        document: { findUnique: jest.fn().mockResolvedValue(document) },
        warehouse: {
          findUnique: jest.fn(async ({ where }) => ({ id: where.id })),
          findMany: jest.fn().mockResolvedValue([{ id: 'owner', type: 'ALLY' }]),
        },
        customerWorksite: { findUnique: jest.fn().mockResolvedValue({ id: 'site' }) },
        asset: {
          findMany: jest.fn().mockResolvedValue([{ id: 'asset', warehouseOwnerId: 'owner' }]),
          update: jest.fn(), updateMany: jest.fn(),
        },
        stockLedger: {
          findMany: jest.fn().mockResolvedValue([source]),
          groupBy: jest.fn(async ({ where }) => {
            if (isReturn) return [{ skuId: null, assetId: 'asset', ownerWarehouseId: 'owner',
              movementType: 'OUT', _sum: { quantity: -1 } }];
            if (where.movementType) return [];
            return [{ assetId: 'asset', ownerWarehouseId: 'owner', warehouseId: origin, _sum: { quantity: 1 } }];
          }),
          create: jest.fn(async ({ data }) => ({ id: 'new-ledger', ...data })),
        },
      };
      const service = new InventoryService({} as never, {} as never);
      await service[operation]({
        documentId: 'document', warehouseId: 'own', customerWorksiteId: 'site',
        items: [{ assetId: 'asset', ownerWarehouseId: 'owner' }],
      }, 'operator', tx as never);
      expect(tx.stockLedger.create).toHaveBeenCalledTimes(1);
      expect(tx.stockLedger.create.mock.calls[0][0].data.effectiveAt).toBe(late);
      expect(tx.stockLedger.create.mock.calls[0][0].data).not.toHaveProperty('appendOrder');
      expect(document.docDate).toBe(day);
      expect(source.effectiveAt).toBe(late);
      expect(source.createdAt).toBe(late);
    },
  );
});
