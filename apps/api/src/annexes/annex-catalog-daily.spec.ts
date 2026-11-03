import { restoreStandaloneDailyCatalog } from './annex-catalog-daily';
import { calculateAnnex } from './annex-engine';
import type { AnnexInput } from './annex-input';
import type { CommercialDocument } from '../commercial-profiles/commercial-history-v2';

type Rental = AnnexInput['rentals'][number];
const physical: Rental = {
  id: 'delivery',
  skuId: 'sku',
  label: 'Equipo diario',
  deliveredOn: '2026-10-01',
  quantity: '5',
  source: { reference: 'delivery', origin: 'INVENTORY' },
  pricing: { basePrice: '165' },
  waivedDays: [],
  returns: [
    {
      date: '2026-10-10',
      quantity: '2',
      source: { reference: 'return', origin: 'INVENTORY' },
    },
  ],
};
const unresolved: Rental = {
  ...physical,
  id: 'delivery@2026-10-01',
  returns: [],
  pricing: { basePrice: '0' },
  commercial: {
    status: 'REVIEW',
    parts: [],
    reason: 'No existe modalidad comercial congelada para este elemento',
  },
};
function restore(
  unit = 'DAY',
  rental = unresolved,
  documents: CommercialDocument[] = [],
  original = physical,
) {
  return restoreStandaloneDailyCatalog(
    [original],
    new Map([['delivery', unit]]),
    documents,
    {
      rentals: [rental],
      machineDays: [],
      issues: [],
    },
  );
}
describe('standalone daily catalog recovery', () => {
  it('calculates visible quantity and days after a historical partial return', () => {
    const result = calculateAnnex({
      period: { from: '2026-10-16', to: '2026-10-31', through: '2026-10-27' },
      policy: {
        version: 'REV-1', includeReturnDay: true, excludedWeekdays: [],
        excludeHolidays: false, holidays: [], holidayCalendarConfirmed: true,
        minimumHoursPerMachineDay: '6',
      },
      rentals: restore().rentals, machineDays: [],
    });
    expect(result.lines).toHaveLength(12);
    expect(result.lines.every((line) => line.quantity === '3' && line.billableUnits === '1')).toBe(true);
    expect(result.totals.rentalNet).toBe('5940.00');
  });
  it('does not reinterpret a historical hourly catalog entry as daily', () => {
    const rental = { ...unresolved, commercial: { ...unresolved.commercial!, catalog: { unit: 'HOUR', price: '165' } } };
    expect(restore('DAY', rental).rentals).toEqual([rental]);
  });
  it('preserves physical quantities, partial returns and current price when commercial metadata is absent', () => {
    expect(restore().rentals).toEqual([physical]);
    expect(unresolved.returns).toEqual([]);
  });
  it('keeps a zero-priced rental instead of omitting its quantities', () => {
    const original = { ...physical, pricing: { basePrice: '0' } };
    expect(restore('DAY', unresolved, [], original).rentals).toEqual([
      original,
    ]);
  });
  it.each(['HOUR', 'METER', ''])(
    'does not infer daily billing for %s',
    (unit) => {
      expect(restore(unit).rentals).toEqual([unresolved]);
    },
  );
  it('does not resolve unrelated review problems', () => {
    const rental = {
      ...unresolved,
      commercial: { ...unresolved.commercial!, reason: 'Composición ambigua' },
    };
    expect(restore('DAY', rental).rentals).toEqual([rental]);
  });
  it('does not overwrite an explicit price profile', () => {
    const rental = {
      ...unresolved,
      commercial: { ...unresolved.commercial!, profileId: 'agreed-price' },
    };
    expect(restore('DAY', rental).rentals).toEqual([rental]);
  });
  it('does not independently bill a parent with documented components', () => {
    const documents = [
      {
        items: [
          { id: 'parent', skuId: 'sku' },
          { id: 'child', skuId: 'other', parentSourceDocumentItemId: 'parent' },
        ],
      },
    ] as unknown as CommercialDocument[];
    expect(restore('DAY', unresolved, documents).rentals).toEqual([unresolved]);
  });
  it('does not independently bill a documented included component', () => {
    const documents = [
      {
        items: [{ id: 'child', skuId: 'sku', parentLegacyOriginId: 'parent' }],
      },
    ] as unknown as CommercialDocument[];
    expect(restore('DAY', unresolved, documents).rentals).toEqual([unresolved]);
  });
});
