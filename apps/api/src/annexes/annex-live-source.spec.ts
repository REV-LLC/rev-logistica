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
        skuId: 'sku',
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
    id: 'sku',
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
      findMany: async () => [],
      findFirst: jest.fn(async () => ({
        revision: 3,
        revisions: [{ input: saved }],
      })),
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
