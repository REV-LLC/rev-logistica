import { Prisma } from '@prisma/client';
import { inventoryToAnnex, type InventorySourceRow } from './annex-inventory';
import { calculateAnnex } from './annex-engine';
const period = { from: '2026-09-16', to: '2026-09-30', through: '2026-09-25' };
function row(
  id: string,
  movementType: string,
  quantity: string,
  date: string,
  extra: Partial<InventorySourceRow> = {},
): InventorySourceRow {
  return {
    id,
    movementType,
    quantity: new Prisma.Decimal(quantity),
    effectiveAt: new Date(`${date}T12:00:00Z`),
    ownerWarehouseId: 'owner',
    assetId: null,
    reversedByDocumentId: null,
    sku: {
      id: 'sku',
      name: 'Andamio',
      price: new Prisma.Decimal(100),
      chargeType: 'DAY',
    },
    document: { status: 'CONFIRMED', consecutive: id },
    ...extra,
  };
}
describe('inventory source adapter', () => {
  it('reconstructs the initial balance and allocates partial returns FIFO without another document entry', () => {
    const result = inventoryToAnnex(
      [
        row('a', 'OUT', '-3', '2026-09-01'),
        row('b', 'ON_SITE', '2', '2026-09-17'),
        row('c', 'IN', '4', '2026-09-20'),
      ],
      period,
    );
    expect(result.rentals).toHaveLength(2);
    expect(result.rentals[0].returns[0].quantity).toBe('3');
    expect(result.rentals[1].returns[0].quantity).toBe('1');
    expect(result.issues).toEqual([]);
    const calculated = calculateAnnex({
      period,
      policy: {
        version: 'test',
        includeReturnDay: true,
        excludedWeekdays: [],
        excludeHolidays: false,
        holidays: [],
        holidayCalendarConfirmed: true,
        minimumHoursPerMachineDay: '6',
      },
      ...{ rentals: result.rentals, machineDays: [] },
    });
    expect(calculated.totals.rentalNet).toBe('2800.00');
  });
  it('does not mix quantities owned by different warehouses', () => {
    const result = inventoryToAnnex(
      [
        row('a', 'OUT', '-3', '2026-09-01'),
        row('b', 'IN', '1', '2026-09-20', { ownerWarehouseId: 'other' }),
      ],
      period,
    );
    expect(result.issues[0].code).toBe('INVENTORY_REVIEW');
    expect(result.rentals[0].returns).toEqual([]);
  });
  it('blocks over-returns, compensations and reversed rows instead of inventing balances', () => {
    for (const source of [
      [row('a', 'IN', '2', '2026-09-20')],
      [row('a', 'OUT', '2', '2026-09-20')],
      [
        row('a', 'OUT', '-2', '2026-09-20', {
          reversedByDocumentId: 'reversal',
        }),
      ],
    ]) {
      const result = inventoryToAnnex(source, period);
      expect(result.rentals).toEqual([]);
      expect(result.issues).toHaveLength(1);
    }
  });
  it('generates pending machine-days including weekends without inventing reports', () => {
    const machine = {
      assetId: 'machine',
      sku: {
        id: 'sku',
        name: 'CASE',
        price: new Prisma.Decimal(80000),
        chargeType: 'HOUR',
      },
    };
    const result = inventoryToAnnex(
      [
        row('a', 'OUT', '-1', '2026-09-18', machine),
        row('b', 'TRANSIT', '1', '2026-09-21', machine),
      ],
      period,
    );
    expect(result.machineDays.map((d) => d.date)).toEqual([
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
    ]);
    expect(
      result.machineDays.every(
        (d) => d.status === 'PENDING' && d.reports.length === 0,
      ),
    ).toBe(true);
  });
  it.each([null, new Prisma.Decimal(0)])('retains daily rentals with absent or zero prices (%s)', (price) => {
    const result = inventoryToAnnex(
      [
        row('a', 'ON_SITE', '3', '2026-09-01', {
          sku: { id: 'sku', name: 'Andamio', price, chargeType: 'DAY' },
        }),
      ],
      period,
    );
    expect(result.rentals).toHaveLength(1);
    expect(Number(result.rentals[0].pricing.basePrice)).toBe(0);
    expect(result.rentals[0].quantity).toBe('3');
    expect(result.issues).toEqual([]);
  });
  it.each([null, new Prisma.Decimal(0)])('retains hourly machines with absent or zero prices (%s)', (price) => {
    const result = inventoryToAnnex([row('a', 'OUT', '-1', '2026-09-16', {
      assetId: 'machine', sku: { id: 'sku', name: 'CASE', price, chargeType: 'HOUR' },
    })], period);
    expect(result.machineDays).toHaveLength(10);
    expect(result.machineDays.every(d => Number(d.pricing.basePrice) === 0)).toBe(true);
    expect(result.issues).toEqual([]);
  });
  it('drops rentals fully returned before the period and keeps a return on the first day', () => {
    expect(
      inventoryToAnnex(
        [
          row('a', 'OUT', '-1', '2026-09-01'),
          row('b', 'IN', '1', '2026-09-15'),
        ],
        period,
      ).rentals,
    ).toEqual([]);
    expect(
      inventoryToAnnex(
        [
          row('a', 'OUT', '-1', '2026-09-01'),
          row('b', 'IN', '1', '2026-09-16'),
        ],
        period,
      ).rentals,
    ).toHaveLength(1);
  });
  it('uses the Colombian date near UTC midnight', () => {
    const result = inventoryToAnnex(
      [
        row('a', 'OUT', '-1', '2026-09-17', {
          effectiveAt: new Date('2026-09-17T02:00:00Z'),
        }),
      ],
      period,
    );
    expect(result.rentals[0].deliveredOn).toBe('2026-09-16');
  });
  it('flags a serialized daily return and re-delivery on the same day for review', () => {
    const asset = { assetId: 'machine' };
    const result = inventoryToAnnex(
      [
        row('a', 'OUT', '-1', '2026-09-17', asset),
        row('b', 'IN', '1', '2026-09-20', asset),
        row('c', 'OUT', '-1', '2026-09-20', asset),
      ],
      period,
    );
    expect(result.rentals).toEqual([]);
    expect(result.issues[0].code).toBe('SAME_DAY_RENTALS');
  });
});
