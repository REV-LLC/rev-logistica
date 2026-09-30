import { calculateAnnex } from './annex-engine';
import type { AnnexInput } from './annex-input';
import { commercialNodesAt } from '../commercial-profiles/commercial-history-v2';
const policy: AnnexInput['policy'] = {
  version: 'QA',
  includeReturnDay: true,
  excludedWeekdays: [],
  excludeHolidays: false,
  holidays: [],
  holidayCalendarConfirmed: true,
  minimumHoursPerMachineDay: '6',
};
const lot: AnnexInput['rentals'][number] = {
  id: 'lot',
  skuId: 'sku',
  assetId: 'machine',
  label: 'Equipo libre',
  deliveredOn: '2026-10-01',
  quantity: '1',
  source: { reference: 'remission-line', origin: 'INVENTORY' },
  returns: [],
  pricing: { basePrice: '100' },
  waivedDays: [],
};
const input = (rentals: AnnexInput['rentals']): AnnexInput => ({
  period: { from: '2026-10-01', to: '2026-10-15', through: '2026-10-05' },
  policy,
  rentals,
  machineDays: [],
});
describe('v2 annex charges', () => {
  it('keeps every contextual zero row without changing a paid parent total', () => {
    const child = {
      ...lot,
      id: 'child',
      assetId: undefined,
      accessoryId: 'accessory',
      source: { reference: 'child-source', origin: 'INVENTORY' as const },
      commercial: {
        schemaVersion: 2 as const,
        status: 'RESOLVED' as const,
        contextualZero: true,
        parts: [],
      },
    };
    const result = calculateAnnex(input([lot, child]));
    expect(result.lines).toHaveLength(10);
    expect(result.totals.rentalNet).toBe('500.00');
    expect(
      result.lines
        .filter((l) => l.key.startsWith('child:'))
        .every((l) => l.basePrice === '0.00' && l.net === '0.00'),
    ).toBe(true);
  });
  it('limits each modality to its interval without double billing transition day', () => {
    const first = {
      ...lot,
      id: 'lot@2026-10-01',
      commercialInterval: {
        rentalId: 'lot',
        from: '2026-10-01',
        to: '2026-10-03',
      },
    };
    const second = {
      ...lot,
      id: 'lot@2026-10-04',
      commercialInterval: {
        rentalId: 'lot',
        from: '2026-10-04',
        to: '2026-10-05',
      },
      metering: {
        minimumMeters: '0',
        pricing: { basePrice: '10' },
        reports: [
          {
            date: '2026-10-04',
            meters: '12',
            source: { reference: 'report', origin: 'PHYSICAL' as const },
          },
        ],
      },
    };
    const result = calculateAnnex(input([first, second]));
    expect(result.lines.filter((l) => l.kind === 'DAY')).toHaveLength(3);
    expect(result.totals.rentalNet).toBe('420.00');
  });
  it('does not reset a day minimum when the same mode composition changes', () => {
    const mode = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'General',
      unit: 'DAY' as const,
      minimum: { value: '10', basis: 'PER_RENTAL' as const },
      pricing: { source: 'FIXED' as const, amount: '100' },
      conditions: [],
      parts: [],
    };
    const commercial = {
      schemaVersion: 2 as const,
      status: 'RESOLVED' as const,
      mode,
      parts: [],
    };
    const returns = [
      {
        date: '2026-10-05',
        quantity: '1',
        source: { reference: 'return', origin: 'INVENTORY' as const },
      },
    ];
    const first = {
      ...lot,
      id: 'lot@2026-10-01',
      returns,
      commercial,
      commercialInterval: {
        rentalId: 'lot',
        from: '2026-10-01',
        to: '2026-10-03',
      },
    };
    const second = {
      ...lot,
      id: 'lot@2026-10-04',
      returns,
      commercial,
      commercialInterval: {
        rentalId: 'lot',
        from: '2026-10-04',
        to: '2026-10-05',
      },
    };
    const result = calculateAnnex(input([first, second]));
    expect(result.totals.rentalNet).toBe('1000.00');
    expect(
      result.lines.filter((l) => l.key.includes(':minimum:')),
    ).toHaveLength(1);
  });
  it('returns reduce the specific original node only after return day', () => {
    const delivery = {
      id: 'delivery',
      type: 'REMISSION',
      docDate: new Date('2026-10-01T12:00Z'),
      items: [
        {
          id: 'a',
          compositionNodeId: 'n',
          accessoryId: 'piece',
          quantity: 2,
          accessory: { name: 'A' },
        },
      ],
    };
    const returned = {
      id: 'return',
      type: 'RETURN',
      docDate: new Date('2026-10-03T12:00Z'),
      items: [{ id: 'r', sourceDocumentItemId: 'a', quantity: 1 }],
    };
    expect(
      commercialNodesAt([delivery, returned] as any, '2026-10-03')[0].quantity,
    ).toBe(2);
    expect(
      commercialNodesAt([delivery, returned] as any, '2026-10-04')[0].quantity,
    ).toBe(1);
  });
});

import { prepareCommercialV2 } from './annex-commercial-v2-source';
describe('document-driven commercial intervals', () => {
  const uuid = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const makeMode = (unit: 'DAY' | 'METER', presence: 'ABSENT' | 'PRESENT') => ({
    id: uuid(unit === 'DAY' ? 1 : 2),
    name: 'Modalidad genérica',
    unit,
    minimum: { value: '0', basis: 'PER_RENTAL' as const },
    pricing: {
      source: 'FIXED' as const,
      amount: unit === 'DAY' ? '100' : '10',
    },
    conditions: [{ groupId: uuid(3), presence, minimumQuantity: 1 }],
    parts: [{ groupId: uuid(3), treatment: 'INCLUDED' as const }],
  });
  const snapshot = {
    schemaVersion: 2,
    status: 'RESOLVED',
    catalog: { unit: 'DAY', price: '100' },
    parts: [],
    frozenProfile: {
      id: uuid(4),
      version: 1,
      effectiveFrom: '2026-10-01',
      groups: [
        {
          id: uuid(3),
          name: 'Implemento',
          selectors: [{ kind: 'ACCESSORY', id: uuid(5) }],
        },
      ],
      modes: [makeMode('DAY', 'ABSENT'), makeMode('METER', 'PRESENT')],
    },
  };
  const delivery = {
    id: 'delivery',
    type: 'REMISSION',
    docDate: new Date('2026-10-01T12:00Z'),
    items: [
      {
        id: 'a',
        assetId: 'machine',
        compositionNodeId: 'n',
        asset: { sku: { id: 'sku', name: 'Equipo inventado' } },
        commercialSnapshot: snapshot,
      },
    ],
  };
  const addition = {
    id: 'addition',
    type: 'REMISSION',
    docDate: new Date('2026-10-04T12:00Z'),
    items: [
      {
        id: 'b',
        parentSourceDocumentItemId: 'a',
        compositionNodeId: 'n2',
        accessoryId: uuid(5),
        quantity: 1,
        accessory: { name: 'Implemento' },
      },
    ],
  };
  const movement = {
    requestId: 'document:addition:item:b',
    documentId: 'addition',
    accessoryId: uuid(5),
    quantity: 1,
    from: { warehouseId: 'warehouse' },
    to: { customerWorksiteId: 'site' },
  };
  it('adds an implement on day four to an earlier delivery without resending the parent', () => {
    const result = prepareCommercialV2(
      [delivery, addition] as any,
      [{ lot, itemId: 'a' }],
      [movement],
      input([]).period,
      'site',
      [],
    );
    const parent = result.rentals.filter((r) => r.assetId === 'machine');
    expect(
      parent.map((r) => [
        r.commercial?.mode?.unit,
        r.commercialInterval?.from,
        r.commercialInterval?.to,
      ]),
    ).toEqual([
      ['DAY', '2026-10-01', '2026-10-03'],
      ['METER', '2026-10-04', '2026-10-05'],
    ]);
    parent[1].metering!.reports = [
      {
        date: '2026-10-04',
        meters: '12',
        source: { reference: 'measurement', origin: 'PHYSICAL' },
      },
    ];
    const calculated = calculateAnnex({
      ...input(result.rentals),
      machineDays: result.machineDays,
    });
    expect(calculated.totals.rentalNet).toBe('420.00');
    expect(calculated.lines.filter((l) => l.basePrice === '0.00')).toHaveLength(
      2,
    );
  });
  it('keeps an accessory without matching movement visible for review', () => {
    const result = prepareCommercialV2(
      [delivery, addition] as any,
      [{ lot, itemId: 'a' }],
      [],
      input([]).period,
      'site',
      [],
    );
    expect(
      result.rentals.find((r) => r.accessoryId === uuid(5))?.commercial?.status,
    ).toBe('REVIEW');
    expect(
      result.issues.some((i) => i.code === 'COMMERCIAL_MOVEMENT_REVIEW'),
    ).toBe(true);
  });
});
