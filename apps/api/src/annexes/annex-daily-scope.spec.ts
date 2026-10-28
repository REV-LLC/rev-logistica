import {
  assertDailyAnnex,
  dailyRentals,
  isDailyRental,
} from './annex-daily-scope';
import { calculateAnnex } from './annex-engine';
import type { AnnexInput } from './annex-input';
const rental = (id: string, unit = 'DAY', price = '100') => ({
  id,
  skuId: id,
  label: id,
  deliveredOn: '2026-10-01',
  quantity: '1',
  source: { reference: id, origin: 'INVENTORY' as const },
  returns: [],
  waivedDays: [],
  pricing: { basePrice: price },
  commercial: {
    status: 'REVIEW' as const,
    catalog: { unit, price },
    parts: [],
  },
});
const input = (): AnnexInput => ({
  period: { from: '2026-10-01', to: '2026-10-15', through: '2026-10-02' },
  policy: {
    version: 'TEST',
    includeReturnDay: true,
    excludedWeekdays: [],
    excludeHolidays: false,
    holidays: [],
    holidayCalendarConfirmed: true,
    minimumHoursPerMachineDay: '6',
  },
  rentals: [],
  machineDays: [],
});
it('retains daily bulk and assets including explicit zero, without mutating snapshots', () => {
  const rows = [
    rental('bulk'),
    { ...rental('asset', 'DAY', '0'), assetId: 'asset' },
    rental('hour', 'HOUR'),
    rental('meter', 'METER'),
  ];
  const before = structuredClone(rows);
  expect(dailyRentals(rows, []).rentals.map((r) => r.id)).toEqual([
    'bulk',
    'asset',
  ]);
  expect(rows).toEqual(before);
});
it('rejects measurements even when they are attached to a nominal daily row', () => {
  expect(
    isDailyRental({
      ...rental('x'),
      metering: {
        minimumMeters: '0',
        pricing: { basePrice: '0' },
        reports: [],
      },
    }),
  ).toBe(false);
});
it('rejects hourly reports and non-daily payloads at the write boundary', () => {
  const value = input();
  value.rentals = [rental('hour', 'HOUR')];
  expect(() => assertDailyAnnex(value)).toThrow('solo admite');
  value.rentals = [];
  value.machineDays = [
    {
      assetId: 'a',
      label: 'a',
      date: '2026-10-01',
      status: 'PENDING',
      reports: [],
      pricing: { basePrice: '0' },
    },
  ];
  expect(() => assertDailyAnnex(value)).toThrow('solo admite');
});
it('excludes included pieces of excluded parents transitively', () => {
  const parent = { ...rental('parent', 'HOUR'), assetId: 'parent' };
  const child = {
    ...rental('child'),
    assetId: 'child',
    includedIn: { assetId: 'parent', label: 'parent', documentItemId: 'doc1' },
  };
  const grandchild = {
    ...rental('piece'),
    includedIn: { assetId: 'child', label: 'child', documentItemId: 'doc2' },
  };
  expect(
    dailyRentals(
      [parent, child, grandchild, rental('independent')],
      [],
    ).rentals.map((r) => r.id),
  ).toEqual(['independent']);
});
it('preserves the daily amount, discount and manual day override', () => {
  const value = input();
  const { commercial, ...row } = rental('bulk');
  value.rentals = [
    {
      ...row,
      quantity: '2',
      pricing: { basePrice: '100', discountPercent: '10' },
      dayAdjustments: [
        { from: '2026-10-01', to: '2026-10-02', days: 3, quantity: '2' },
      ],
    },
  ];
  expect(calculateAnnex(assertDailyAnnex(value)).totals.rentalNet).toBe(
    '540.00',
  );
});

it('keeps independent pieces and later daily intervals of the same asset', () => {
  const parent = {
    ...rental('parent', 'HOUR'),
    assetId: 'parent',
    commercialInterval: { from: '2026-10-01', to: '2026-10-02' },
  };
  parent.commercial.parts = [
    { skuId: 'piece', treatment: 'INCLUDED', label: 'piece' },
  ] as never[];
  const independent = rental('piece');
  const later = {
    ...rental('later'),
    includedIn: {
      assetId: 'parent',
      label: 'parent',
      documentItemId: 'later-doc',
    },
    commercialInterval: { from: '2026-10-03', to: '2026-10-04' },
  };
  expect(
    dailyRentals([parent, independent, later], []).rentals.map((r) => r.id),
  ).toEqual(['piece', 'later']);
});
