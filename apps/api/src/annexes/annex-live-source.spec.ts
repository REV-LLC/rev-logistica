import { Prisma } from '@prisma/client';
import { calculateAnnex } from './annex-engine';
import { AnnexSourceService } from './annex-source.service';
import type { AnnexInput } from './annex-input';
jest.mock('./annex-commercial-source', () => ({
  applyCommercialComposition: async (_tx: unknown, rentals: unknown) => ({
    rentals,
    machineDays: [],
    issues: [],
  }),
}));
it('reads the database on each consultation and applies saved rules without creating a revision', async () => {
  const saved: AnnexInput = {
    period: { from: '2026-10-01', to: '2026-10-03', through: '2026-10-03' },
    policy: {
      version: 'test',
      includeReturnDay: true,
      excludedWeekdays: [],
      excludeHolidays: false,
      holidays: [],
      holidayCalendarConfirmed: true,
      minimumHoursPerMachineDay: '6',
    },
    rentals: [
      {
        id: 'delivery',
        skuId: '550b304a-e782-4dd8-bfc2-87c90f7f8f8c',
        label: 'Equipo',
        quantity: '1',
        deliveredOn: '2026-10-01',
        returns: [],
        waivedDays: [],
        source: { reference: 'delivery', origin: 'INVENTORY' },
        pricing: { basePrice: '100', discountPercent: '10' },
      },
    ],
    machineDays: [],
    transport: {
      outbound: { quantity: '0', unitPrice: '0' },
      rows: [
        {
          id: 'delivery-trip',
          direction: 'outbound',
          description: 'Entrega',
          quantity: '1',
          unitPrice: '30',
        },
        {
          id: 'return-trip',
          direction: 'return',
          description: 'Recogida',
          quantity: '1',
          unitPrice: '20',
        },
      ],
      return: { quantity: '0', unitPrice: '0' },
    },
  };
  saved.additionalCharges = [
    {
      id: 'replacement',
      skuId: 'eb66aaf3-b010-4f9d-9825-857a2c3d4d43',
      type: 'REPLACEMENT',
      description: 'Pieza perdida',
      quantity: '2',
      unitPrice: '0.01',
    },
  ];
  const sku = {
    id: saved.rentals[0].skuId,
    name: 'Equipo',
    price: new Prisma.Decimal(100),
    chargeType: 'DAY',
  };
  const rows = [
    {
      id: 'delivery',
      movementType: 'OUT',
      quantity: new Prisma.Decimal(-1),
      effectiveAt: new Date('2026-10-01T12:00:00Z'),
      ownerWarehouseId: 'owner',
      assetId: null,
      reversedByDocumentId: null,
      document: null,
      sku,
    },
  ];
  const tx = {
    customerWorksite: {
      findUnique: async () => ({ id: 'site', customerId: 'customer' }),
    },
    stockLedger: {
      aggregate: async () => ({ _max: { effectiveAt: null } }),
      findMany: jest.fn(async () => rows),
    },
    annexDraft: {
      findMany: async ({where}: {where: {customerWorksiteId: string; periodTo: {lt: Date}}}) =>
        where.customerWorksiteId === '00000000-0000-4000-8000-000000000001' &&
        saved.period.to < where.periodTo.lt.toISOString().slice(0, 10)
          ? [{revisions: [{input: saved, result: calculateAnnex(saved)}]}]
          : [],
      findFirst: jest.fn(async ({where}: {where: {customerWorksiteId: string; periodFrom: Date; periodTo: Date}}) =>
        where.customerWorksiteId === '00000000-0000-4000-8000-000000000001' &&
        where.periodFrom.toISOString().slice(0, 10) === saved.period.from &&
        where.periodTo.toISOString().slice(0, 10) === saved.period.to
          ? {revision: 3, revisions: [{input: saved}]}
          : null),
    },
    appSetting: { findUnique: async () => null },
  };
  const service = new AnnexSourceService({
    $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
  } as never);
  const query = () =>
    service.prepare(
      '00000000-0000-4000-8000-000000000001',
      saved.period.from,
      saved.period.to,
      saved.period.through,
      true,
    );
  expect((await query()).result.summary.subtotal).toBe('320.02');
  rows[0].quantity = new Prisma.Decimal(-2);
  sku.price = new Prisma.Decimal(200);
  const second = await query();
  expect(second.result.summary.subtotal).toBe('1130.02');
  expect(second.input.transport?.rows).toEqual(saved.transport!.rows);
  expect(second.input.additionalCharges).toEqual(saved.additionalCharges);
  expect(second.revision).toBe(3);
  expect(tx.stockLedger.findMany).toHaveBeenCalledTimes(2);
  expect(tx.annexDraft.findFirst).toHaveBeenCalledTimes(2);
  expect(saved.rentals[0].quantity).toBe('1');
  // An exceptional base survives live queries only for its exact worksite/cut.
  saved.rentals[0].pricing = {basePrice:'250',basePriceOverride:'250',discountPercent:'10',adjustmentSource:'MANUAL'};
  const exceptional = await query();
  expect(exceptional.input.rentals[0].pricing.basePrice).toBe('250.00');
  expect(exceptional.result.summary.subtotal).toBe('1400.02');
  const otherSite = await service.prepare('00000000-0000-4000-8000-000000000002', saved.period.from, saved.period.to, saved.period.through, true);
  const nextCut = await service.prepare('00000000-0000-4000-8000-000000000001', '2026-10-16', '2026-10-17', '2026-10-17', true);
  for (const other of [otherSite, nextCut]) {
    expect(other.input.rentals[0].pricing.basePrice).toBe('200.00');
    expect(other.input.rentals[0].pricing.basePriceOverride).toBeUndefined();
    expect(other.revision).toBe(0);
  }
  expect(sku.price.toString()).toBe('200');
  saved.worksiteRates = [{skuId: sku.id, quantityBasis: 'UNIT', unitPrice: '350.50'}];
  const original = await query();
  expect(original.input.worksiteRates).toEqual(saved.worksiteRates);
  expect(original.result.summary.subtotal).toBe('1400.02');
  // A new delivery of the same SKU also inherits the price; the same customer at a different site doesn't.
  rows[0].id = 'new-delivery';
  const later = (site: string) => service.prepare(site, '2026-11-01', '2026-11-03', '2026-11-03', true);
  const remembered = await later('00000000-0000-4000-8000-000000000001');
  expect(remembered.input.rentals[0].pricing).toMatchObject({effectivePrice:'350.50',basePrice:'350.50',adjustmentSource:'WORKSITE'});
  expect(remembered.result.summary.subtotal).toBe('2103.00');
  expect(remembered.input.worksiteRates).toBeUndefined();
  const unrelated = await later('00000000-0000-4000-8000-000000000002');
  expect(unrelated.result.summary.subtotal).toBe('1200.00');
  expect(sku.price.toString()).toBe('200');
});

it('opens an invoiced snapshot without reading or recalculating current inventory', async () => {
  const input: AnnexInput = {
    period: { from: '2026-11-01', to: '2026-11-15', through: '2026-11-03' },
    policy: {
      version: 'test',
      vatPercent: 19,
      includeReturnDay: true,
      excludedWeekdays: [],
      excludeHolidays: false,
      holidays: [],
      holidayCalendarConfirmed: true,
      minimumHoursPerMachineDay: '6',
    },
    rentals: [],
    machineDays: [],
    transport: {
      outbound: { quantity: '1', unitPrice: '50000' },
      return: { quantity: '0', unitPrice: '0' },
    },
  };
  const savedResult = calculateAnnex(input);
  const tx = {
    customerWorksite: {
      findUnique: async () => ({ id: 'site', customerId: 'customer' }),
    },
    annexDraft: {
      findFirst: jest.fn(async () => ({
        id: 'draft',
        revision: 2,
        revisions: [
          {
            input,
            result: savedResult,
            sourceIssues: [],
            invoiceNumber: 'FE-3862',
          },
        ],
      })),
    },
    stockLedger: { findMany: jest.fn(), aggregate: jest.fn() },
  };
  const service = new AnnexSourceService({
    $transaction: (fn) => fn(tx),
  } as never);
  const result = await service.prepare(
    '00000000-0000-4000-8000-000000000001',
    '2026-11-01',
    '2026-11-15',
    '2026-11-10',
    true,
  );
  expect(result.input.period.through).toBe('2026-11-03');
  expect(result.result).toEqual(savedResult);
  expect(result.invoiceNumber).toBe('FE-3862');
  expect(result.draftId).toBe('draft');
  expect(tx.stockLedger.findMany).not.toHaveBeenCalled();
  expect(tx.stockLedger.aggregate).not.toHaveBeenCalled();
});
