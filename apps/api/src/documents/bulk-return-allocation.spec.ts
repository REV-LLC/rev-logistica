import { Prisma } from '@prisma/client';
import { allocateBulkReturnItems, BulkReturnHistory, planBulkReturnAllocation } from './bulk-return-allocation';

const decimal = (n: string | number) => new Prisma.Decimal(n);
const day = (n: number) => new Date(`2026-10-${String(n).padStart(2, '0')}T12:00:00Z`);
const line = (id: string, quantity: string | number, extra = {}) => ({
  id, skuId: 'sku', assetId: null, accessoryId: null, quantity: decimal(quantity), condition: 'owner',
  sourceDocumentItemId: null, compositionNodeId: `node-${id}`, parentCompositionNodeId: null,
  parentSourceDocumentItemId: null, parentLegacyOriginId: null, componentParentAssetId: null, ...extra,
});
const arrival = (id: string, quantity: string | number, date = 1, extra = {}): BulkReturnHistory => ({
  id: `ledger-${id}`, skuId: 'sku', ownerWarehouseId: 'owner', movementType: 'OUT',
  quantity: decimal(quantity).negated(), effectiveAt: day(date), reversedByDocumentId: null,
  document: { id: `doc-${id}`, type: 'REMISSION', status: 'CONFIRMED', docDate: day(date), items: [line(id, quantity)] }, ...extra,
});
const returned = (id: string, quantity: string | number, date: number, source?: string): BulkReturnHistory => ({
  ...arrival(id, quantity, date), quantity: decimal(quantity), movementType: 'IN',
  document: { id: `doc-${id}`, type: 'RETURN', status: 'CONFIRMED', docDate: day(date),
    items: [line(id, quantity, { sourceDocumentItemId: source ?? null })] },
});
const summary = (history: BulkReturnHistory[], quantity: string | number, date = 10) =>
  planBulkReturnAllocation(history, [line('current', quantity)], day(date)).get('current')!
    .map(p => [p.source?.id ?? null, p.quantity.toString()]);

describe('BULK returns by reference/owner/worksite, internal FIFO', () => {
  it('ignores a stale client-selected source and takes the oldest delivery', () => {
    const history = [arrival('old-34', 34), arrival('selected-8', 8, 2), arrival('new-10', 10, 3)];
    const plans = planBulkReturnAllocation(history, [line('current', 10, { sourceDocumentItemId: 'selected-8' })], day(10));
    expect(plans.get('current')!.map(p => [p.source!.id, p.quantity.toString()])).toEqual([['old-34', '10']]);
    expect(history[0].quantity.toString()).toBe('-34');
  });
  it('splits a return between as many oldest remissions as necessary', () => {
    expect(summary([arrival('first', 8), arrival('second', 4, 2), arrival('third', 5, 3)], 14))
      .toEqual([['first', '8'], ['second', '4'], ['third', '2']]);
  });
  it('accounts for partial linked returns and never reuses their quantities', () => {
    expect(summary([arrival('first', 8), arrival('second', 8, 2), returned('previous', 3, 3, 'first')], 10))
      .toEqual([['first', '5'], ['second', '5']]);
  });
  it('preserves older explicit non-FIFO returns instead of rewriting history', () => {
    expect(summary([arrival('first', 8), arrival('second', 8, 2), returned('previous', 6, 3, 'second')], 10))
      .toEqual([['first', '8'], ['second', '2']]);
  });
  it('deducts old unlinked returns FIFO as well', () => {
    expect(summary([arrival('first', 3), arrival('second', 5, 2), returned('legacy', 4, 3)], 4))
      .toEqual([['second', '4']]);
  });
  it('sums repeated rows from the same request before accepting the total', () => {
    expect(() => planBulkReturnAllocation([arrival('first', 8)], [line('a', 5), line('b', 5)], day(10)))
      .toThrow('saldo total');
    const plans = planBulkReturnAllocation([arrival('first', 8), arrival('second', 4, 2)], [line('a', 5), line('b', 5)], day(10));
    expect(plans.get('b')!.map(p => p.quantity.toString())).toEqual(['3', '2']);
  });
  it('does not borrow stock from another owner or SKU', () => {
    const otherOwner = arrival('other-owner', 100, 1, { ownerWarehouseId: 'other', document: null });
    const otherSku = arrival('other-sku', 100, 1, { skuId: 'other', document: null });
    expect(() => summary([arrival('first', 8), otherOwner, otherSku], 10)).toThrow('saldo total');
  });
  it('handles fractional quantities without rounding away or inventing stock', () => {
    expect(summary([arrival('first', '0.1'), arrival('second', '0.2', 2)], '0.3')).toEqual([['first', '0.1'], ['second', '0.2']]);
    expect(() => summary([arrival('first', '0.3')], '0.300000000000000000000000000001')).toThrow('saldo total');
  });
  it('cannot return a future delivery even when it exists now', () => {
    expect(() => summary([arrival('first', 8), arrival('future', 10, 12)], 10, 10)).toThrow('saldo total');
  });
  it('refuses a backdated return that would invalidate an already confirmed later return', () => {
    expect(() => summary([arrival('first', 8), returned('later', 8, 12, 'first')], 2, 10)).toThrow('saldo total');
  });
  it('reserves later confirmed returns but still allows the free total from another remission', () => {
    expect(summary([arrival('first', 8), arrival('second', 8, 2), returned('later', 8, 12, 'first')], 5, 10))
      .toEqual([['second', '5']]);
  });
  it('supports pre-cutover ledger-only deliveries without manufacturing origins', () => {
    expect(summary([arrival('old', 5, 1, { document: null }), arrival('new', 8, 2)], 7))
      .toEqual([[null, '5'], ['new', '2']]);
  });
  it('does not manufacture an origin for a v2 remission missing its documentary items', () => {
    const entry = arrival('first', 8); entry.document!.items = [];
    expect(() => summary([entry], 2)).toThrow('conciliación');
  });
  it('respects provider-transit returns exactly like physical warehouse returns', () => {
    const previous = returned('previous', 3, 3, 'first'); previous.movementType = 'TRANSIT';
    expect(summary([arrival('first', 8), previous], 5)).toEqual([['first', '5']]);
  });
  it.each([0, -1, 'NaN', 'Infinity'])('rejects invalid quantity %s', quantity => {
    expect(() => summary([arrival('first', 8)], quantity)).toThrow('mayor que cero');
  });
  it('retains the stable ordering of several equal-date lots', () => {
    expect(summary([arrival('a', 2), arrival('b', 2)], 3)).toEqual([['a', '2'], ['b', '1']]);
  });
});

describe('atomic persistence of internal allocations', () => {
  it('only updates the new return, preserves cutoffs/damage and source parents, never tariffs', async () => {
    const first = arrival('first', 8), second = arrival('second', 4, 2);
    first.document!.items[0] = { ...first.document!.items[0], compositionParent: { id: 'real-parent' }, componentParentAssetId: 'machine' };
    const item = { ...line('current', 10), documentId: 'draft', conditionNote: 'Borde golpeado',
      billingCutoffDate: day(10), commercialSnapshot: { untouched: true } };
    const serial = { ...line('serial', 1), skuId: null, assetId: 'machine' };
    const tx = {
      $queryRaw: jest.fn(async () => []),
      stockLedger: { findMany: jest.fn(async (_query: { where: unknown }) => [first, second]) },
      documentItem: { update: jest.fn(async ({ data }) => ({ ...item, ...data })), createMany: jest.fn(async () => ({ count: 1 })) },
    };
    const result = await allocateBulkReturnItems(tx as never, { id: 'draft', type: 'RETURN', customerWorksiteId: 'site', docDate: day(10), items: [item, serial] as never });
    expect(result.map(i => i.quantity?.toString())).toEqual(['8', '2', '1']);
    expect(result[0]).toMatchObject({ id: 'current', sourceDocumentItemId: 'first', parentSourceDocumentItemId: 'real-parent', componentParentAssetId: 'machine' });
    expect(result[1]).toMatchObject({ sourceDocumentItemId: 'second', conditionNote: item.conditionNote, billingCutoffDate: item.billingCutoffDate, commercialSnapshot: item.commercialSnapshot });
    expect(result[1].id).not.toBe('current'); expect(result[2]).toBe(serial);
    expect(tx.documentItem.update.mock.calls[0][0].where).toEqual({ id: 'current' });
    expect(tx.documentItem.update.mock.calls[0][0].data).not.toHaveProperty('commercialSnapshot');
    expect(tx.stockLedger.findMany.mock.calls[0][0].where).toMatchObject({ customerWorksiteId: 'site', assetId: null, OR: [{ skuId: 'sku', ownerWarehouseId: 'owner' }] });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.stockLedger.findMany.mock.invocationCallOrder[0]);
  });
  it.each(['REMISSION', 'RETURN'])('does not rewrite September documents (%s)', async type => {
    const items = [line('current', 1)];
    expect(await allocateBulkReturnItems({} as never, { id: 'old', type, customerWorksiteId: 'site', docDate: new Date('2026-09-30T12:00:00Z'), items: items as never })).toBe(items);
  });
  it('does not touch serialized or legacy accessory returns', async () => {
    const items = [{ ...line('serial', 1), skuId: null, assetId: 'machine' }, { ...line('acc', 1), skuId: null, accessoryId: 'old-accessory' }];
    expect(await allocateBulkReturnItems({} as never, { id: 'draft', type: 'RETURN', customerWorksiteId: 'site', docDate: day(10), items: items as never })).toBe(items);
  });
});
