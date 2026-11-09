import { Prisma } from '@prisma/client';
import { inventoryToAnnex, InventorySourceRow } from './annex-inventory';
import { calculateAnnex } from './annex-engine';
import { AnnexInput, parseAnnexInput } from './annex-input';
import { AnnexSourceService } from './annex-source.service';

jest.mock('./annex-commercial-source', () => ({
  applyCommercialComposition: async (
    _tx: unknown,
    rentals: AnnexInput['rentals'],
  ) => ({ rentals, machineDays: [], issues: [] }),
}));

const day = (date: string) => new Date(`${date}T17:00:00-05:00`);
const period = { from: '2026-10-01', to: '2026-10-15', through: '2026-10-15' };
const policy: AnnexInput['policy'] = {
  version: 'test',
  includeReturnDay: true,
  excludedWeekdays: [],
  excludeHolidays: false,
  holidays: [],
  holidayCalendarConfirmed: true,
  minimumHoursPerMachineDay: '6',
};
const item = (quantity: number, cutoff: string | null, owner = 'owner') => ({
  skuId: 'sku',
  assetId: null,
  condition: owner,
  quantity: new Prisma.Decimal(quantity),
  billingCutoffDate: cutoff ? day(cutoff) : null,
});
function movement(
  id: string,
  quantity: number,
  date: string,
  items?: ReturnType<typeof item>[],
): InventorySourceRow {
  return {
    id,
    movementType: quantity < 0 ? 'OUT' : 'IN',
    quantity: new Prisma.Decimal(quantity),
    effectiveAt: day(date),
    ownerWarehouseId: 'owner',
    assetId: null,
    reversedByDocumentId: null,
    sku: {
      id: 'sku',
      name: 'Referencia genérica',
      price: new Prisma.Decimal(100),
      chargeType: 'DAY',
    },
    document: {
      id: `doc-${id}`,
      consecutive: `DOC-${id}`,
      status: 'CONFIRMED',
      items,
    },
  };
}
function prepared(rows: InventorySourceRow[], cut = period): AnnexInput {
  return {
    period: cut,
    policy: { ...policy },
    rentals: inventoryToAnnex(rows, cut).rentals,
    machineDays: [],
  };
}

describe('documentary return billing cuts', () => {
  it('uses a daily asset cutoff to avoid billing overlap when it is delivered again on the physical return day', () => {
    const rows = [
      movement('d1', -1, '2026-10-01'),
      movement('r', 1, '2026-10-09', [item(1, '2026-10-08')]),
      movement('d2', -1, '2026-10-09'),
    ];
    rows.forEach((row) => {
      row.assetId = 'asset';
      row.document?.items?.forEach((i) => {
        i.assetId = 'asset';
      });
    });
    const adapted = inventoryToAnnex(rows, period);
    expect(adapted.issues).toEqual([]);
    expect(adapted.rentals).toHaveLength(2);
    expect(
      calculateAnnex({
        period,
        policy,
        rentals: adapted.rentals,
        machineDays: [],
      }).totals.rentalNet,
    ).toBe('1500.00');
  });

  it('rejects a cut before delivery instead of silently removing the rental', () => {
    expect(() =>
      prepared([
        movement('d', -1, '2026-10-02'),
        movement('r', 1, '2026-10-09', [item(1, '2026-09-30')]),
      ]),
    ).toThrow('anterior a la entrega');
  });

  it('bills the 8th for a return on the 9th, preserving physical dates, quantities and area', () => {
    const rows = [
      movement('delivery', -4, '2026-10-01'),
      movement('return', 4, '2026-10-09', [item(4, '2026-10-08')]),
    ];
    const original = JSON.stringify(rows);
    const input = prepared(rows);
    input.rentals[0].billingAreaM2 = '1.44';
    input.rentals[0].pricing = {
      basePrice: '3000',
      effectivePrice: '2750',
      adjustmentReason: 'Tarifa acordada',
    };
    expect(calculateAnnex(parseAnnexInput(input)).totals.rentalNet).toBe(
      '126720.00',
    );
    expect(input.rentals[0].returns[0]).toMatchObject({
      date: '2026-10-09',
      billingCutoffDate: '2026-10-08',
      quantity: '4',
    });
    expect(JSON.stringify(rows)).toBe(original);
    input.policy.includeReturnDay = false;
    expect(calculateAnnex(input).totals.rentalNet).toBe('126720.00');
  });

  it('splits partial return quantities by their own cuts and leaves the balance charging', () => {
    const input = prepared([
      movement('delivery', -6, '2026-10-01'),
      movement('return', 4, '2026-10-10', [
        item(2, '2026-10-08'),
        item(2, '2026-10-09'),
      ]),
    ]);
    const result = calculateAnnex(input);
    expect(result.totals.rentalNet).toBe('6400.00');
    expect(result.lines.find((l) => l.date === '2026-10-09')?.quantity).toBe(
      '4',
    );
    expect(result.lines.find((l) => l.date === '2026-10-10')?.quantity).toBe(
      '2',
    );
    expect(input.rentals[0].returns.map((r) => r.quantity)).toEqual(['2', '2']);
    expect(
      new Set(input.rentals[0].returns.map((r) => r.source.reference)).size,
    ).toBe(2);
  });

  it('allocates a document across multiple ledger rows once and keeps different owners separate', () => {
    const returns = [
      movement('r1', 2, '2026-10-10', [item(4, '2026-10-08')]),
      movement('r2', 2, '2026-10-10', [item(4, '2026-10-08')]),
    ];
    returns.forEach((row) => (row.document!.id = 'shared-doc'));
    const input = prepared([movement('d1', -4, '2026-10-01'), ...returns]);
    expect(calculateAnnex(input).totals.rentalNet).toBe('3200.00');
    const other = movement('other', 1, '2026-10-10', [
      item(1, '2026-10-09', 'other-owner'),
    ]);
    other.ownerWarehouseId = 'other-owner';
    other.document!.id = 'shared-doc';
    const otherDelivery = movement('other-delivery', -1, '2026-10-01');
    otherDelivery.ownerWarehouseId = 'other-owner';
    for (const row of [...returns, other])
      row.document!.items = [
        item(4, '2026-10-08'),
        item(1, '2026-10-09', 'other-owner'),
      ];
    expect(
      calculateAnnex(
        prepared([
          movement('d1', -4, '2026-10-01'),
          otherDelivery,
          ...returns,
          other,
        ]),
      ).totals.rentalNet,
    ).toBe('4100.00');
  });

  it('preserves legacy return-day behavior without a cut and rejects ambiguous quantities', () => {
    const input = prepared([
      movement('d', -4, '2026-10-01'),
      movement('r', 4, '2026-10-09'),
    ]);
    expect(calculateAnnex(input).totals.rentalNet).toBe('3600.00');
    input.policy.includeReturnDay = false;
    expect(calculateAnnex(input).totals.rentalNet).toBe('3200.00');
    expect(() =>
      prepared([
        movement('d', -4, '2026-10-01'),
        movement('r', 4, '2026-10-09', [item(3, '2026-10-08')]),
      ]),
    ).toThrow('No se pueden relacionar');
  });

  it.each([
    ['2026-10-05', '800.00'],
    ['2026-10-08', '800.00'],
    ['2026-10-09', '900.00'],
  ])(
    'credits two previous days toward a ten-day minimum with cut %s',
    (cutoff, total) => {
      const input = prepared([
        movement('d', -1, '2026-09-29'),
        movement('r', 1, '2026-10-09', [item(1, cutoff)]),
      ]);
      input.rentals[0].priorBillableDays = '2';
      input.policy.minimumDaysBySku = { sku: 10 };
      expect(calculateAnnex(input).totals.rentalNet).toBe(total);
    },
  );

  it('uses Bogotá dates and does not bring already cut quantities into the next fortnight', () => {
    const row = movement('r', 1, '2026-10-16', [item(1, '2026-10-15')]);
    row.document!.items![0].billingCutoffDate = new Date(
      '2026-10-16T02:00:00Z',
    );
    const rows = [movement('d', -1, '2026-10-01'), row];
    expect(calculateAnnex(prepared(rows)).totals.rentalNet).toBe('1500.00');
    expect(
      prepared(rows, {
        from: '2026-10-16',
        to: '2026-10-31',
        through: '2026-10-31',
      }).rentals,
    ).toEqual([]);
  });

  it('loads a physical return after the requested cut when its billing date is inside it', async () => {
    const rows = [
      movement('d', -1, '2026-10-01'),
      movement('r', 1, '2026-10-16', [item(1, '2026-10-08')]),
    ];
    const tx = {
      customerWorksite: {
        findUnique: async () => ({ id: 'site', customerId: 'customer' }),
      },
      stockLedger: {
        aggregate: async () => ({ _max: { effectiveAt: day('2026-10-16') } }),
        findMany: async ({ where }: { where: { effectiveAt: { lt: Date } } }) =>
          rows.filter((row) => row.effectiveAt < where.effectiveAt.lt),
      },
      annexDraft: { findMany: async () => [] },
      appSetting: { findUnique: async () => null },
    };
    const service = new AnnexSourceService({
      $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
    } as never);
    const result = await service.prepare(
      '00000000-0000-4000-8000-000000000001',
      period.from,
      period.to,
      period.through,
    );
    expect(result.result.totals.rentalNet).toBe('800.00');
    expect(result.input.rentals[0].returns[0].date).toBe('2026-10-16');
  });

  it.each([
    ['2026-09-04', '6000.00'],
    ['2026-09-30', '6000.00'],
  ])(
    'bills the corrected return exactly once, through %s',
    async (through, expected) => {
      const rev = '00000000-0000-4000-8000-000000000003';
      const dv = [item(15, '2026-09-04')];
      const superseded = movement('old', 15, '2026-09-04', dv);
      superseded.reversedByDocumentId = rev;
      const active = movement('valid', 15, '2026-09-04', dv);
      const inverse = movement('inverse', -15, '2026-09-14');
      for (const row of [superseded, active])
        row.document!.id = '00000000-0000-4000-8000-000000000002';
      inverse.document!.id = rev;
      const delivery = movement('delivery', -15, '2026-09-01');
      delivery.document!.id = '00000000-0000-4000-8000-000000000001';
      const rows = [
        delivery,
        superseded,
        active,
        inverse,
      ].map((row) => ({
        ...row,
        customerWorksiteId: 'site',
        skuId: 'sku',
        warehouseId: 'owner',
        refDocumentId: row.document!.id,
        document: {
          ...row.document!,
          type:
            row === inverse
              ? 'ADJUSTMENT'
              : row.movementType === 'IN'
                ? 'RETURN'
                : 'REMISSION',
        },
      }));
      const tx = {
        customerWorksite: {
          findUnique: async () => ({ id: 'site', customerId: 'customer' }),
        },
        stockLedger: {
          aggregate: async () => ({ _max: { effectiveAt: null } }),
          findMany: async ({
            where,
          }: {
            where: { effectiveAt: { lt?: Date; gte?: Date } };
          }) =>
            rows.filter((row) =>
              where.effectiveAt.lt
                ? row.effectiveAt < where.effectiveAt.lt
                : row.refDocumentId === rev &&
                  row.effectiveAt >= where.effectiveAt.gte!,
            ),
        },
        annexDraft: { findMany: async () => [] },
        appSetting: { findUnique: async () => null },
      };
      const service = new AnnexSourceService({
        $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
      } as never);
      const result = await service.prepare(
        '00000000-0000-4000-8000-000000000001',
        '2026-09-01',
        '2026-09-30',
        through,
      );
      expect(result.result.totals.rentalNet).toBe(expected);
      expect(result.input.rentals.flatMap((r) => r.returns)).toMatchObject([
        {
          quantity: '15',
          billingCutoffDate: '2026-09-04',
          source: { reference: active.id },
        },
      ]);
    },
  );
});
