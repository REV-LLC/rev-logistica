import { selectAnnexMode } from './annex-mode-selection';
import { calculateAnnex } from './annex-engine';
import type { AnnexInput } from './annex-input';
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mode = (id: number, unit: 'DAY' | 'HOUR' | 'METER', price: string) => ({
  id: uuid(id),
  name: `Modalidad ${id}`,
  unit,
  pricing: { source: 'FIXED' as const, amount: price },
  minimum: {
    value: '0',
    basis:
      unit === 'HOUR' ? ('PER_REPORTED_DAY' as const) : ('PER_RENTAL' as const),
  },
  conditions: [],
  parts: [],
});
function fixture(): AnnexInput {
  const modes = [
    mode(1, 'DAY', '100'),
    mode(2, 'METER', '10'),
    mode(3, 'HOUR', '50'),
  ];
  return {
    period: { from: '2026-10-01', to: '2026-10-15', through: '2026-10-03' },
    policy: {
      version: 'QA',
      includeReturnDay: true,
      excludedWeekdays: [],
      excludeHolidays: false,
      holidays: [],
      holidayCalendarConfirmed: true,
      minimumHoursPerMachineDay: '6',
    },
    machineDays: [],
    rentals: [
      {
        id: 'lot',
        skuId: 'sku',
        assetId: 'asset',
        label: 'Equipo arbitrario',
        deliveredOn: '2026-10-01',
        quantity: '1',
        source: { reference: 'source', origin: 'INVENTORY' },
        returns: [],
        waivedDays: [],
        pricing: { basePrice: '100' },
        commercialInterval: {
          rentalId: 'lot',
          from: '2026-10-01',
          to: '2026-10-03',
        },
        commercial: {
          schemaVersion: 2,
          status: 'RESOLVED',
          mode: modes[0],
          parts: [],
          frozenProfile: {
            id: uuid(4),
            version: 1,
            effectiveFrom: '2026-10-01',
            groups: [],
            modes,
          },
          catalog: { unit: 'DAY', price: '999' },
        },
      },
    ],
  };
}
const select = (input: AnnexInput, n: number) =>
  selectAnnexMode({ input, rentalId: 'lot', modeId: uuid(n) });
describe('manual annex mode selection', () => {
  it('uses the chosen frozen rate without changing inventory or converting reports', () => {
    const original = fixture();
    const next = select(original, 2);
    expect(next.rentals[0].pricing.basePrice).toBe('10');
    expect(next.rentals[0].metering?.reports).toEqual([]);
    expect(next.rentals[0].deliveredOn).toBe(original.rentals[0].deliveredOn);
    expect(next.rentals[0].commercial?.selectedModeId).toBe(uuid(2));
    expect(original.rentals[0].commercial?.mode?.unit).toBe('DAY');
  });
  it('preserves meter reports on switching away and back, without charging them as days', () => {
    const meters = select(fixture(), 2);
    meters.rentals[0].metering!.reports = [
      {
        date: '2026-10-02',
        meters: '12',
        source: { reference: 'report', origin: 'PHYSICAL' },
      },
    ];
    const days = select(meters, 1);
    expect(days.rentals[0].metering).toBeUndefined();
    expect(calculateAnnex(days).totals.rentalNet).toBe('300.00');
    const again = select(days, 2);
    expect(again.rentals[0].metering!.reports[0].meters).toBe('12');
    expect(calculateAnnex(again).totals.rentalNet).toBe('120.00');
  });
  it('supports configured hours and restores physical lot and reports', () => {
    const hours = select(fixture(), 3);
    expect(hours.rentals).toHaveLength(0);
    expect(hours.machineDays).toHaveLength(3);
    hours.machineDays[0].status = 'REPORTED';
    hours.machineDays[0].reports = [
      {
        hours: '2',
        employeeId: 'employee',
        source: { reference: 'hours', origin: 'PHYSICAL' },
      },
    ];
    const days = select(hours, 1);
    expect(days.rentals).toHaveLength(1);
    expect(days.machineDays).toHaveLength(0);
    expect(select(days, 3).machineDays[0].reports[0].hours).toBe('2');
  });
  it('rejects unknown modes and catalog rates in another unit', () => {
    expect(() => select(fixture(), 99)).toThrow('perfil guardado');
    const input = fixture();
    input.rentals[0].commercial!.frozenProfile!.modes[1].pricing = {
      source: 'CATALOG',
    };
    expect(() => select(input, 2)).toThrow('tarifa histórica');
  });
  it('keeps unresolved minima explicit while allowing the unit to change', () => {
    const input = fixture();
    input.rentals[0].commercial!.frozenProfile!.modes[1].minimum.value = '40';
    const next = select(input, 2);
    expect(next.rentals[0].commercial).toMatchObject({
      status: 'REVIEW',
      minimumReview: true,
      mode: { unit: 'METER' },
    });
    expect(calculateAnnex(next).totals.rentalNet).toBe('0.00');
    expect(
      calculateAnnex(next).issues.some((i) => i.code === 'COMMERCIAL_REVIEW'),
    ).toBe(true);
  });
});
