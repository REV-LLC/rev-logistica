import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@prisma/client';
import { BalanceReportsService } from './balance-reports.service';
import {
  BalanceOwnership,
  BalanceReportKind,
  GetBalanceReportDto,
} from './dto/get-balance-report.dto';

const own = {
  id: 'own',
  name: 'Bodega REV',
  type: 'OWN',
  active: true,
  ownerCompany: { id: 'rev', name: 'REV', category: 'INTERNAL' },
};
const provider = {
  id: 'provider',
  name: 'Bodega AAA',
  type: 'ALLY',
  active: true,
  ownerCompany: { id: 'aaa', name: 'AAA', category: 'PROVIDER' },
};
const sites = [
  {
    id: 'site-a',
    alias: 'Frente norte',
    active: true,
    customer: { id: 'customer-a', name: 'Cliente A' },
    worksite: { name: 'Las Mercedes' },
  },
  {
    id: 'site-b',
    alias: null,
    active: false,
    customer: { id: 'customer-b', name: 'Cliente B' },
    worksite: { name: 'Las Mercedes' },
  },
];
function fixture() {
  const snapshots = new Map(
    sites.map((site, index) => [
      site.id,
      {
        bulk: [
          {
            skuId: 'plank',
            skuName: 'Tablón',
            ownerWarehouseId: own.id,
            quantity: index ? 8 : 3,
          },
          {
            skuId: 'plank',
            skuName: 'Tablón',
            ownerWarehouseId: provider.id,
            quantity: index ? 0 : 6,
          },
        ],
        serial: [
          {
            assetId: `asset-${index}`,
            description: 'Minicargador',
            internalNumber: index + 1,
            ownerWarehouseId: own.id,
            isImplement: false,
            quantity: 1,
          },
        ],
      },
    ]),
  );
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest
      .fn()
      .mockResolvedValue([{ queriedAt: new Date('2026-10-28T14:00:00Z') }]),
    customer: {
      findUnique: jest.fn(
        async ({ where }) =>
          sites.find((site) => site.customer.id === where.id)?.customer ?? null,
      ),
    },
    customerWorksite: { findMany: jest.fn().mockResolvedValue(sites) },
    warehouse: { findMany: jest.fn().mockResolvedValue([own, provider]) },
    stockLedger: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue(
        sites.map((site) => ({
          customerWorksiteId: site.id,
          skuId: 'plank',
          assetId: null,
          ownerWarehouseId: own.id,
          movementType: 'OUT',
          _sum: { quantity: -1 },
        })),
      ),
    },
    accessoryBalance: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = {
    $transaction: jest.fn(async (callback) => callback(tx)),
    customerWorksite: tx.customerWorksite,
    warehouse: tx.warehouse,
  };
  const inventory = {
    getOnSiteInventory: jest.fn(async (id) => snapshots.get(id)),
    getWarehouseInventory: jest.fn(async (id) => ({
      bulk: [
        {
          skuId: 'plank',
          skuName: 'Tablón',
          ownerWarehouseId: id === own.id ? provider.id : provider.id,
          quantity: id === own.id ? 4 : 100,
        },
      ],
      serial: [
        {
          assetId: 'bucket',
          description: 'Balde',
          internalNumber: 2,
          ownerWarehouseId: own.id,
          quantity: 1,
          isImplement: true,
          status: 'IN',
        },
        {
          assetId: 'virtual-asset',
          description: 'Equipo de catálogo',
          ownerWarehouseId: provider.id,
          quantity: 1,
          status: 'OUT',
        },
      ],
    })),
  };
  return {
    service: new BalanceReportsService(prisma as never, inventory as never),
    inventory,
    tx,
    prisma,
    snapshots,
  };
}
const query = (
  report: BalanceReportKind,
  extra: Partial<GetBalanceReportDto> = {},
): GetBalanceReportDto => ({
  report,
  ownership: BalanceOwnership.ALL,
  ...extra,
});

describe('Inventory balance exports', () => {
  it('skips fully returned native sites without dropping unconverted legacy stock at those sites', async () => {
    const { service, tx, inventory } = fixture();
    tx.stockLedger.groupBy.mockResolvedValue([
      {
        customerWorksiteId: 'site-a',
        skuId: 'plank',
        assetId: null,
        ownerWarehouseId: own.id,
        movementType: 'OUT',
        _sum: { quantity: -8 },
      },
      {
        customerWorksiteId: 'site-a',
        skuId: 'plank',
        assetId: null,
        ownerWarehouseId: own.id,
        movementType: 'IN',
        _sum: { quantity: 8 },
      },
    ] as never);
    tx.accessoryBalance.findMany.mockResolvedValue([
      {
        accessoryId: 'legacy',
        assetId: null,
        warehouseId: null,
        customerWorksiteId: 'site-a',
        transitDocumentId: null,
        quantity: 2,
        accessory: {
          id: 'legacy',
          name: 'Punta APT',
          kind: 'CONSUMABLE',
          ownerWarehouseId: own.id,
        },
      },
    ] as never);
    const result = await service.balances(query(BalanceReportKind.WORKSITES));
    expect(inventory.getOnSiteInventory).not.toHaveBeenCalled();
    expect(result.rows).toEqual([
      expect.objectContaining({
        itemKey: 'legacy:legacy',
        quantity: 2,
        locationId: 'site-a',
      }),
    ]);
  });
  it('uses one repeatable-read, read-only snapshot and the canonical uncached readers', async () => {
    const { service, prisma, tx, inventory } = fixture();
    const result = await service.balances(query(BalanceReportKind.GENERAL));
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      }),
    );
    expect(tx.$executeRaw.mock.calls[0][0][0]).toBe(
      'SET TRANSACTION READ ONLY',
    );
    expect(inventory.getOnSiteInventory).toHaveBeenCalledWith('site-a', tx);
    expect(inventory.getWarehouseInventory).toHaveBeenCalledWith(
      'own',
      false,
      tx,
    );
    expect(inventory.getWarehouseInventory).not.toHaveBeenCalledWith(
      'provider',
      false,
      tx,
    );
    expect(result.queriedAt).toBe('2026-10-28T14:00:00.000Z');
    expect(result.rowCount).toBe(result.rows.length);
    expect(
      result.rows.some((row) => row.itemKey === 'asset:virtual-asset'),
    ).toBe(false);
    expect(
      result.rows.find((row) => row.itemKey === 'asset:bucket'),
    ).toMatchObject({
      reference: 'Balde',
      identification: '#2',
      isImplement: true,
    });
  });

  it('keeps owners separate and exact client/worksite identities even with identical site names', async () => {
    const { service, inventory } = fixture();
    const result = await service.balances(
      query(BalanceReportKind.WORKSITES, {
        customerId: 'customer-a',
        customerWorksiteId: 'site-a',
      }),
    );
    expect(inventory.getOnSiteInventory).toHaveBeenCalledTimes(1);
    expect(inventory.getWarehouseInventory).not.toHaveBeenCalled();
    expect(
      result.rows
        .filter((row) => row.itemKey === 'sku:plank')
        .map((row) => [row.ownerName, row.quantity]),
    ).toEqual([
      ['AAA', 6],
      ['REV', 3],
    ]);
    expect(
      result.rows.every(
        (row) => row.customerId === 'customer-a' && row.locationId === 'site-a',
      ),
    ).toBe(true);
  });

  it('includes inactive sites when they still have inventory, with no silent first-page cap', async () => {
    const { service, inventory } = fixture();
    const result = await service.balances(query(BalanceReportKind.CUSTOMERS));
    expect(inventory.getOnSiteInventory).toHaveBeenCalledTimes(2);
    expect(result.rows.some((row) => row.locationId === 'site-b')).toBe(true);
    expect(result.rows.some((row) => row.quantity === 0)).toBe(false);
  });

  it('provider balances include custody and sites, not the supplier available catalogue or our own equipment', async () => {
    const { service, inventory } = fixture();
    const result = await service.balances(
      query(BalanceReportKind.PROVIDERS, { providerId: 'aaa' }),
    );
    expect(result.rows.every((row) => row.ownerId === 'aaa')).toBe(true);
    expect(result.rows.map((row) => row.quantity).sort()).toEqual([4, 6]);
    expect(inventory.getWarehouseInventory).toHaveBeenCalledTimes(1);
    expect(result.scope).toMatch(/No incluye existencias disponibles/);
  });

  it('warehouse export is physical stock, never a duplicate of its worksite totals', async () => {
    const { service, inventory, tx } = fixture();
    const result = await service.balances(
      query(BalanceReportKind.WAREHOUSES, { warehouseId: 'own' }),
    );
    expect(inventory.getOnSiteInventory).not.toHaveBeenCalled();
    expect(inventory.getWarehouseInventory).toHaveBeenCalledWith(
      'own',
      false,
      tx,
    );
    expect(
      result.rows.every(
        (row) => row.locationType === 'WAREHOUSE' && row.locationId === 'own',
      ),
    ).toBe(true);
    expect(
      result.rows.find((row) => row.itemKey === 'sku:plank')?.quantity,
    ).toBe(4);
  });

  it('subtracts only confirmed partial receipts from transit without putting those returns back in worksite balances', async () => {
    const { service, tx } = fixture();
    tx.stockLedger.findMany.mockResolvedValue([
      {
        skuId: 'hose',
        assetId: null,
        ownerWarehouseId: 'provider',
        quantity: new Prisma.Decimal(7),
        sku: { name: 'Manguera', isImplement: true },
        asset: null,
        providerReceiptItems: [{ quantity: new Prisma.Decimal(2) }],
      },
      {
        skuId: 'closed',
        assetId: null,
        ownerWarehouseId: 'provider',
        quantity: 3,
        sku: { name: 'Devuelto' },
        asset: null,
        providerReceiptItems: [{ quantity: 3 }],
      },
    ] as never);
    const result = await service.balances(query(BalanceReportKind.PROVIDERS));
    expect(result.rows.filter((row) => row.locationType === 'TRANSIT')).toEqual(
      [
        expect.objectContaining({
          itemKey: 'sku:hose',
          quantity: 5,
          isImplement: true,
        }),
      ],
    );
    expect(tx.stockLedger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          providerReceiptItems: {
            where: { receiptDocument: { status: 'CONFIRMED' } },
            select: { quantity: true },
          },
        }),
      }),
    );
  });

  it('includes unconverted implements but excludes converted bridges at the query boundary', async () => {
    const { service, tx } = fixture();
    tx.accessoryBalance.findMany.mockResolvedValue([
      {
        accessoryId: 'legacy',
        assetId: null,
        warehouseId: null,
        customerWorksiteId: 'site-a',
        transitDocumentId: null,
        quantity: 2,
        accessory: {
          id: 'legacy',
          name: 'Punta APT',
          kind: 'CONSUMABLE',
          ownerWarehouseId: 'provider',
        },
      },
    ] as never);
    const result = await service.balances(
      query(BalanceReportKind.WORKSITES, { customerWorksiteId: 'site-a' }),
    );
    expect(tx.accessoryBalance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { quantity: { not: 0 }, accessory: { implementBridge: null } },
      }),
    );
    expect(
      result.rows.find((row) => row.source === 'LEGACY_IMPLEMENT'),
    ).toMatchObject({
      reference: 'Punta APT',
      ownerName: 'AAA',
      quantity: 2,
      controlType: 'BULK',
    });
  });

  it('rejects mismatched worksite/customer and nonexistent explicit filters instead of exporting everybody', async () => {
    const { service } = fixture();
    await expect(
      service.balances(
        query(BalanceReportKind.WORKSITES, {
          customerId: 'customer-b',
          customerWorksiteId: 'site-a',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.balances(
        query(BalanceReportKind.WORKSITES, { customerWorksiteId: 'missing' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.balances(
        query(BalanceReportKind.CUSTOMERS, { customerId: 'missing' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.balances(
        query(BalanceReportKind.PROVIDERS, { providerId: 'missing' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.balances(
        query(BalanceReportKind.WAREHOUSES, { warehouseId: 'missing' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects unsupported filter combinations, preserves negative quantities for review, and filters ownership', async () => {
    const { service, snapshots } = fixture();
    await expect(
      service.balances(
        query(BalanceReportKind.GENERAL, { customerId: 'customer-a' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.balances(
        query(BalanceReportKind.PROVIDERS, {
          ownership: BalanceOwnership.INTERNAL,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    snapshots.get('site-a')!.bulk[0].quantity = -2;
    const result = await service.balances(
      query(BalanceReportKind.WORKSITES, {
        ownership: BalanceOwnership.INTERNAL,
      }),
    );
    expect(result.rows.every((row) => row.ownerCategory === 'INTERNAL')).toBe(
      true,
    );
    expect(result.rows.some((row) => row.quantity === -2)).toBe(true);
    expect(result.warnings).toContain(
      'El reporte contiene saldos negativos; requieren revisión de inventario.',
    );
  });

  it('validates enums and UUIDs; defaults are explicit', async () => {
    const valid = plainToInstance(GetBalanceReportDto, {});
    expect(await validate(valid)).toHaveLength(0);
    expect(valid.report).toBe('general');
    for (const bad of [
      { report: 'anything' },
      { customerId: 'bad' },
      { warehouseId: '' },
      { ownership: 'arbitrary' },
      { providerId: null, report: null },
    ]) {
      expect(
        (await validate(plainToInstance(GetBalanceReportDto, bad))).length,
      ).toBeGreaterThan(0);
    }
  });
});
