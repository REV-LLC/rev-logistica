import { Prisma } from '@prisma/client';
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
      outbound: { quantity: '1', unitPrice: '50' },
      return: { quantity: '0', unitPrice: '0' },
    },
  };
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
  expect((await query()).result.summary.subtotal).toBe('320.00');
  rows[0].quantity = new Prisma.Decimal(-2);
  sku.price = new Prisma.Decimal(200);
  const second = await query();
  expect(second.result.summary.subtotal).toBe('1130.00');
  expect(second.revision).toBe(3);
  expect(tx.stockLedger.findMany).toHaveBeenCalledTimes(2);
  expect(tx.annexDraft.findFirst).toHaveBeenCalledTimes(2);
  expect(saved.rentals[0].quantity).toBe('1');
});
