import { Prisma } from '@prisma/client';
import { prepareCommercialV2 } from '../annexes/annex-commercial-v2-source';
import { calculateAnnex } from '../annexes/annex-engine';
import { inventoryToAnnex } from '../annexes/annex-inventory';
import { planBulkReturnAllocation, BulkReturnHistory } from './bulk-return-allocation';

describe('BULK FIFO compatibility with unchanged annex and billing engines', () => {
  it('closes the exact delivered lots at their own frozen prices, including the return day', () => {
    const date = (day: number) => new Date(`2026-10-0${day}T12:00:00Z`);
    const snapshot = (price: string) => ({ schemaVersion: 2, status: 'RESOLVED', parts: [], catalog: { unit: 'DAY', price },
      frozenProfile: { id: 'profile', version: 1, effectiveFrom: '2026-10-01', groups: [], modes: [{
        id: '00000000-0000-4000-8000-000000000001', name: 'Día', unit: 'DAY', minimum: { value: '0', basis: 'PER_RENTAL' },
        pricing: { source: 'FIXED', amount: price }, conditions: [], parts: [],
      }] } });
    const deliveries = [8, 6].map((quantity, index) => ({
      id: `delivery-${index}`, type: 'REMISSION', status: 'CONFIRMED', docDate: date(index + 1),
      items: [{ id: `line-${index}`, skuId: 'sku', assetId: null, accessoryId: null, condition: 'owner',
        quantity: new Prisma.Decimal(quantity), compositionNodeId: `node-${index}`, sourceDocumentItemId: null,
        parentCompositionNodeId: null, parentSourceDocumentItemId: null, parentLegacyOriginId: null, componentParentAssetId: null,
        sku: { id: 'sku', name: 'Referencia genérica', price: new Prisma.Decimal(index ? 200 : 100) },
        commercialSnapshot: snapshot(index ? '200' : '100') }],
    }));
    const unchanged = JSON.stringify(deliveries);
    const history = deliveries.map((document, index) => ({
      id: `ledger-${index}`, skuId: 'sku', ownerWarehouseId: 'owner', assetId: null,
      movementType: 'OUT', quantity: document.items[0].quantity.negated(), effectiveAt: document.docDate,
      reversedByDocumentId: null, document,
    }));
    const request = { id: 'return', skuId: 'sku', assetId: null, accessoryId: null, quantity: new Prisma.Decimal(10), condition: 'owner' };
    const plan = planBulkReturnAllocation(history as BulkReturnHistory[], [request], date(3)).get('return')!;
    const returned = { id: 'return-doc', type: 'RETURN', status: 'CONFIRMED', docDate: date(3),
      items: plan.map((p, index) => ({ ...request, id: `return-${index}`, sourceDocumentItemId: p.source!.id, quantity: p.quantity })) };
    const period = { from: '2026-10-01', to: '2026-10-15', through: '2026-10-04' };
    const lots = deliveries.map((d, index) => ({ itemId: d.items[0].id, lot: {
      id: `lot-${index}`, skuId: 'sku', label: 'Referencia genérica', deliveredOn: `2026-10-0${index + 1}`,
      quantity: d.items[0].quantity.toString(), source: { reference: d.items[0].id, origin: 'INVENTORY' as const },
      pricing: { basePrice: index ? '200' : '100' }, returns: [], waivedDays: [],
    } }));
    const prepared = prepareCommercialV2([...deliveries, returned] as never, lots, [], period, 'site', []);
    expect(prepared.issues).toEqual([]);
    const policy = { version: 'QA', includeReturnDay: true, excludedWeekdays: [], excludeHolidays: false,
      holidays: [], holidayCalendarConfirmed: true, minimumHoursPerMachineDay: '6' };
    const result = calculateAnnex({ period, policy, rentals: prepared.rentals, machineDays: prepared.machineDays });
    // First: 8*100*3=2400; second: 6*200*2 + 4*200*1=3200.
    expect(result.totals.rentalNet).toBe('5600.00');
    expect(JSON.stringify(deliveries)).toBe(unchanged);
    const physical = inventoryToAnnex([...history, { ...history[0], id: 'return-ledger', effectiveAt: date(3),
      movementType: 'IN', quantity: new Prisma.Decimal(10), document: returned }].map(row => ({
        ...row, document: { status: 'CONFIRMED', consecutive: null },
        sku: { id: 'sku', name: 'Referencia genérica', price: new Prisma.Decimal(100), chargeType: 'DAY' },
      })), period);
    expect(physical.issues).toEqual([]);
    expect(physical.rentals.map(r => r.returns[0]?.quantity)).toEqual(['8', '2']);
    expect(returned.items.map(i => i.sourceDocumentItemId)).toEqual(['line-0', 'line-1']);
  });
});
