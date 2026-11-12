import { Prisma } from '@prisma/client';
import { inventoryToAnnex } from './annex-inventory';
import { calculateAnnex } from './annex-engine';
import { applyInventoryLosses } from './annex-inventory-losses';
const period = { from: '2026-09-16', to: '2026-09-30', through: '2026-09-25' };
const sku = { id: 'sku', name: 'BASE COLLAR', price: new Prisma.Decimal(10), chargeType: 'DAY' };
const row = (id: string, movementType: string, qty: number, day: number) => ({ id, movementType, quantity: new Prisma.Decimal(qty), effectiveAt: new Date(`2026-09-${day}T12:00:00Z`), ownerWarehouseId: 'owner', assetId: null, sku, document: null, reversedByDocumentId: null });
const policy = { version: 'test', includeReturnDay: true, excludedWeekdays: [], excludeHolidays: false, holidays: [], holidayCalendarConfirmed: true, minimumHoursPerMachineDay: '6' };
it('stops billing lost units on the loss date even when the normal return day is billed', () => {
  const source = inventoryToAnnex([row('delivery', 'OUT', -100, 16), row('return', 'IN', 95, 20), row('loss', 'LOSS', 5, 22)], period);
  expect(source.issues).toEqual([]);
  expect(source.rentals[0].returns[1]).toMatchObject({ date: '2026-09-22', loss: true, quantity: '5' });
  const result = calculateAnnex({ period, policy, rentals: source.rentals, machineDays: [] });
  expect(result.lines.filter(line => line.kind === 'DAY').some(line => line.date >= '2026-09-22')).toBe(false);
  expect(result.lines.find(line => line.date === '2026-09-21')?.quantity).toBe('5');
});
it('keeps the loss out of an earlier cut and prevents duplicate cutoffs on repeated saves', () => {
  const source = inventoryToAnnex([row('delivery', 'OUT', -100, 16), row('return', 'IN', 95, 20)], period);
  const input = { period, policy, rentals: source.rentals, machineDays: [] };
  const losses = [{ id: 'loss-record', ledgerId: 'loss-ledger', skuId: 'sku', assetId: null, effectiveAt: new Date('2026-09-22T12:00:00Z'), allocations: [{ deliveryId: 'delivery', quantity: '5' }] }];
  applyInventoryLosses(input, losses); applyInventoryLosses(input, losses);
  expect(input.rentals[0].returns.filter(event => event.loss)).toHaveLength(1);
  const result = calculateAnnex({ ...input, period: { ...period, through: '2026-09-21' } });
  expect(result.lines.find(line => line.date === '2026-09-21')?.quantity).toBe('5');
});
