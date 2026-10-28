import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';
import {
  BalanceOwnership,
  BalanceReportKind,
  GetBalanceReportDto,
} from './dto/get-balance-report.dto';
import type {
  BalanceReportRow,
  BalanceReportSource,
} from './balance-report.types';
import { resolveLatestSerializedMovements } from './serialized-ledger-location';
import {
  getWorksiteQuantityDelta,
  WORKSITE_BALANCE_MOVEMENT_TYPES,
} from './worksite-ledger-balance';

const warehouseSelect = {
  id: true,
  name: true,
  type: true,
  active: true,
  ownerCompany: { select: { id: true, name: true, category: true } },
} satisfies Prisma.WarehouseSelect;
const siteSelect = {
  id: true,
  alias: true,
  active: true,
  customer: { select: { id: true, name: true } },
  worksite: { select: { name: true } },
} satisfies Prisma.CustomerWorksiteSelect;
type Warehouse = Prisma.WarehouseGetPayload<{ select: typeof warehouseSelect }>;
type Site = Prisma.CustomerWorksiteGetPayload<{ select: typeof siteSelect }>;
const titles: Record<BalanceReportKind, string> = {
  general: 'Saldo general de inventario',
  worksites: 'Saldos en obra por cliente',
  customers: 'Saldos por cliente',
  providers: 'Saldos de proveedores',
  warehouses: 'Saldos de bodega',
};

@Injectable()
export class BalanceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async options() {
    const [worksites, warehouses] = await Promise.all([
      this.prisma.customerWorksite.findMany({
        select: siteSelect,
        orderBy: { worksite: { name: 'asc' } },
      }),
      this.prisma.warehouse.findMany({
        select: warehouseSelect,
        orderBy: { name: 'asc' },
      }),
    ]);
    return { worksites, warehouses };
  }

  async balances(query: GetBalanceReportDto) {
    const byCustomer =
      query.report === BalanceReportKind.WORKSITES ||
      query.report === BalanceReportKind.CUSTOMERS;
    if ((query.customerId || query.customerWorksiteId) && !byCustomer) {
      throw new BadRequestException(
        'El filtro de cliente u obra corresponde a los reportes por cliente.',
      );
    }
    if (query.providerId && query.report !== BalanceReportKind.PROVIDERS) {
      throw new BadRequestException(
        'El filtro de proveedor corresponde al reporte de proveedores.',
      );
    }
    if (query.warehouseId && query.report !== BalanceReportKind.WAREHOUSES) {
      throw new BadRequestException(
        'El filtro de bodega corresponde al reporte de bodegas.',
      );
    }
    if (
      query.report === BalanceReportKind.PROVIDERS &&
      query.ownership === BalanceOwnership.INTERNAL
    ) {
      throw new BadRequestException(
        'El reporte de proveedores no puede filtrar inventario propio.',
      );
    }

    // One uncached, read-only snapshot. A movement approved during the download
    // cannot appear in one location but be absent from another in the same file.
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const [{ queriedAt }] = await tx.$queryRaw<
          { queriedAt: Date }[]
        >`SELECT transaction_timestamp() AS "queriedAt"`;
        const [sites, warehouses] = await Promise.all([
          tx.customerWorksite.findMany({ select: siteSelect }),
          tx.warehouse.findMany({ select: warehouseSelect }),
        ]);
        if (
          query.customerId &&
          !(await tx.customer.findUnique({
            where: { id: query.customerId },
            select: { id: true },
          }))
        ) {
          throw new NotFoundException('No se encontró el cliente.');
        }
        const selectedSite = sites.find(
          (site) => site.id === query.customerWorksiteId,
        );
        if (query.customerWorksiteId && !selectedSite)
          throw new NotFoundException('No se encontró la obra.');
        if (
          query.customerId &&
          selectedSite &&
          selectedSite.customer.id !== query.customerId
        ) {
          throw new BadRequestException(
            'La obra no pertenece al cliente seleccionado.',
          );
        }
        if (
          query.warehouseId &&
          !warehouses.some((warehouse) => warehouse.id === query.warehouseId)
        ) {
          throw new NotFoundException('No se encontró la bodega.');
        }
        if (
          query.providerId &&
          !warehouses.some(
            (warehouse) =>
              warehouse.ownerCompany.id === query.providerId &&
              warehouse.ownerCompany.category === 'PROVIDER',
          )
        ) {
          throw new NotFoundException('No se encontró el proveedor.');
        }
        const warehouseById = new Map(
          warehouses.map((warehouse) => [warehouse.id, warehouse]),
        );
        const siteById = new Map(sites.map((site) => [site.id, site]));
        const rows: BalanceReportRow[] = [];
        const warnings = new Set<string>();
        const keepOwner = (id: string | null | undefined) => {
          const owner = id ? warehouseById.get(id)?.ownerCompany : undefined;
          if (query.providerId && owner?.id !== query.providerId) return false;
          const ownership =
            query.report === BalanceReportKind.PROVIDERS
              ? BalanceOwnership.PROVIDER
              : query.ownership;
          return (
            ownership === BalanceOwnership.ALL || owner?.category === ownership
          );
        };
        const selectedSites = sites.filter(
          (site) =>
            (!query.customerId || site.customer.id === query.customerId) &&
            (!query.customerWorksiteId || site.id === query.customerWorksiteId),
        );
        const selectedWarehouses = warehouses.filter((warehouse) =>
          query.report === BalanceReportKind.WAREHOUSES
            ? !query.warehouseId || warehouse.id === query.warehouseId
            : warehouse.type === 'OWN',
        );
        const addInventory = (
          snapshot: BalanceReportSource,
          location: { warehouse?: Warehouse; site?: Site },
        ) => {
          for (const item of snapshot.bulk) {
            if (!item.quantity || !keepOwner(item.ownerWarehouseId)) continue;
            const row = this.baseRow(
              item.ownerWarehouseId,
              warehouseById,
              location,
            );
            rows.push({
              ...row,
              itemKey: `sku:${item.skuId}`,
              reference: item.skuName?.trim() || 'Referencia sin nombre',
              identification: '',
              controlType: 'BULK',
              isImplement: item.isImplement ?? false,
              quantity: item.quantity,
              source: 'INVENTORY',
            });
          }
          for (const item of snapshot.serial) {
            if (!item.quantity || !keepOwner(item.ownerWarehouseId)) continue;
            // The provider catalogue may list equipment held in another location.
            // Export physical stock only, not that catalogue's virtual availability.
            if (location.warehouse && item.status !== 'IN') continue;
            const row = this.baseRow(
              item.ownerWarehouseId,
              warehouseById,
              location,
            );
            rows.push({
              ...row,
              itemKey: `asset:${item.assetId}`,
              reference:
                item.description?.trim() ||
                item.skuName?.trim() ||
                'Equipo sin nombre',
              identification:
                item.internalNumber != null
                  ? `#${item.internalNumber}`
                  : item.serialOrEngine?.trim() || '',
              controlType: 'SERIAL',
              isImplement: item.isImplement ?? false,
              quantity: item.quantity,
              source: 'INVENTORY',
            });
          }
        };
        if (query.report !== BalanceReportKind.WAREHOUSES) {
          // Avoid re-reading every historical, already-empty worksite. Use the
          // same balance deltas as the canonical reader; legacy stock is added
          // independently below, including sites without any native movements.
          const candidates = selectedSites.length
            ? await tx.stockLedger.groupBy({
                by: [
                  'customerWorksiteId',
                  'skuId',
                  'assetId',
                  'ownerWarehouseId',
                  'movementType',
                ],
                where: {
                  customerWorksiteId: {
                    in: selectedSites.map((site) => site.id),
                  },
                  movementType: { in: [...WORKSITE_BALANCE_MOVEMENT_TYPES] },
                },
                _sum: { quantity: true },
              })
            : [];
          const itemBalances = new Map<
            string,
            { siteId: string; quantity: number }
          >();
          for (const item of candidates) {
            if (!item.customerWorksiteId) continue;
            const key = JSON.stringify([
              item.customerWorksiteId,
              item.skuId,
              item.assetId,
              item.ownerWarehouseId,
            ]);
            const balance = itemBalances.get(key) ?? {
              siteId: item.customerWorksiteId,
              quantity: 0,
            };
            balance.quantity += getWorksiteQuantityDelta(
              item.movementType,
              Number(item._sum.quantity ?? 0),
            );
            itemBalances.set(key, balance);
          }
          const occupiedSites = new Set(
            [...itemBalances.values()]
              .filter((item) => item.quantity !== 0)
              .map((item) => item.siteId),
          );
          for (const site of selectedSites) {
            if (!occupiedSites.has(site.id)) continue;
            // readClient bypasses the UI cache; fields come from the live projection.
            const snapshot = await this.inventory.getOnSiteInventory(
              site.id,
              tx,
            );
            addInventory(snapshot, { site });
          }
        }
        if (!byCustomer) {
          for (const warehouse of selectedWarehouses) {
            const snapshot = await this.inventory.getWarehouseInventory(
              warehouse.id,
              false,
              tx,
            );
            addInventory(snapshot, { warehouse });
          }
        }
        if (
          query.report === BalanceReportKind.GENERAL ||
          query.report === BalanceReportKind.PROVIDERS
        ) {
          const transits = await tx.stockLedger.findMany({
            where: {
              movementType: 'TRANSIT',
              refDocumentType: 'RETURN',
              reversedByDocumentId: null,
              document: { status: 'CONFIRMED' },
            },
            select: {
              ownerWarehouseId: true,
              customerWorksiteId: true,
              skuId: true,
              assetId: true,
              quantity: true,
              sku: { select: { name: true, isImplement: true } },
              asset: {
                select: {
                  description: true,
                  internalNumber: true,
                  serialOrEngine: true,
                  isImplement: true,
                  sku: { select: { name: true } },
                },
              },
              providerReceiptItems: {
                where: { receiptDocument: { status: 'CONFIRMED' } },
                select: { quantity: true },
              },
            },
          });
          for (const item of transits) {
            const pending =
              Number(item.quantity) -
              item.providerReceiptItems.reduce(
                (sum, receipt) => sum + Number(receipt.quantity),
                0,
              );
            if (pending <= 0 || !keepOwner(item.ownerWarehouseId)) continue;
            rows.push({
              ...this.baseRow(item.ownerWarehouseId, warehouseById, {}),
              itemKey: item.assetId
                ? `asset:${item.assetId}`
                : `sku:${item.skuId}`,
              reference:
                item.asset?.description?.trim() ||
                item.asset?.sku.name ||
                item.sku?.name ||
                'Referencia sin nombre',
              identification:
                item.asset?.internalNumber != null
                  ? `#${item.asset.internalNumber}`
                  : item.asset?.serialOrEngine || '',
              controlType: item.assetId ? 'SERIAL' : 'BULK',
              isImplement:
                item.asset?.isImplement ?? item.sku?.isImplement ?? false,
              locationType: 'TRANSIT',
              locationName: 'Pendiente de entrega al proveedor',
              quantity: pending,
              source: 'INVENTORY',
            });
          }
        }
        // Unconverted historical implements still have real stock. Bridges are
        // excluded: their native Asset/SKU is already present above.
        const legacy = await tx.accessoryBalance.findMany({
          where: { quantity: { not: 0 }, accessory: { implementBridge: null } },
          include: {
            accessory: {
              select: {
                id: true,
                name: true,
                kind: true,
                ownerWarehouseId: true,
              },
            },
          },
        });
        const parentIds = [
          ...new Set(
            legacy.flatMap((item) => (item.assetId ? [item.assetId] : [])),
          ),
        ];
        const parentMovements = parentIds.length
          ? await tx.stockLedger.findMany({
              where: { assetId: { in: parentIds } },
            })
          : [];
        const parentLocations =
          resolveLatestSerializedMovements(parentMovements);
        for (const item of legacy) {
          if (!keepOwner(item.accessory.ownerWarehouseId)) continue;
          let siteId = item.customerWorksiteId;
          let warehouseId = item.warehouseId;
          let inTransit = Boolean(item.transitDocumentId);
          if (item.assetId) {
            const parent = parentLocations.get(item.assetId)?.locationMovement;
            siteId =
              parent && ['OUT', 'ON_SITE'].includes(parent.movementType)
                ? parent.customerWorksiteId
                : null;
            warehouseId =
              parent &&
              ['IN', 'ADJUST'].includes(parent.movementType) &&
              Number(parent.quantity) > 0
                ? parent.warehouseId
                : null;
            inTransit = parent?.movementType === 'TRANSIT';
          }
          const site = siteId ? siteById.get(siteId) : undefined;
          const warehouse = warehouseId
            ? warehouseById.get(warehouseId)
            : undefined;
          if (
            byCustomer &&
            (!site ||
              !selectedSites.some((selected) => selected.id === site.id))
          )
            continue;
          if (
            query.report === BalanceReportKind.WAREHOUSES &&
            (!warehouse ||
              !selectedWarehouses.some(
                (selected) => selected.id === warehouse.id,
              ))
          )
            continue;
          if (
            !byCustomer &&
            query.report !== BalanceReportKind.WAREHOUSES &&
            warehouse &&
            warehouse.type !== 'OWN'
          )
            continue;
          const row = this.baseRow(
            item.accessory.ownerWarehouseId,
            warehouseById,
            { site, warehouse },
          );
          if (inTransit) {
            row.locationType = 'TRANSIT';
            row.locationName = 'Pendiente de entrega al proveedor';
          }
          if (!site && !warehouse && !inTransit)
            warnings.add(
              'Hay implementos antiguos con ubicación pendiente de revisar; se incluyen como ubicación sin confirmar.',
            );
          rows.push({
            ...row,
            itemKey: `legacy:${item.accessoryId}`,
            reference: item.accessory.name,
            identification: '',
            controlType:
              item.accessory.kind === 'INDIVIDUAL' ? 'SERIAL' : 'BULK',
            isImplement: true,
            quantity: item.quantity,
            source: 'LEGACY_IMPLEMENT',
          });
        }
        if (rows.length > 100000)
          throw new BadRequestException(
            'El reporte es demasiado grande. Selecciona un cliente, proveedor o bodega.',
          );
        if (rows.some((row) => row.quantity < 0))
          warnings.add(
            'El reporte contiene saldos negativos; requieren revisión de inventario.',
          );
        rows.sort(
          (a, b) =>
            a.customerName.localeCompare(b.customerName, 'es') ||
            a.worksiteName.localeCompare(b.worksiteName, 'es') ||
            a.locationName.localeCompare(b.locationName, 'es') ||
            a.ownerName.localeCompare(b.ownerName, 'es') ||
            a.reference.localeCompare(b.reference, 'es') ||
            a.identification.localeCompare(b.identification, 'es', {
              numeric: true,
            }),
        );
        return {
          report: query.report,
          title: titles[query.report],
          queriedAt: queriedAt.toISOString(),
          filters: {
            customer:
              sites.find((site) => site.customer.id === query.customerId)
                ?.customer.name ?? null,
            worksite: selectedSite
              ? `${selectedSite.worksite.name}${selectedSite.alias ? ` · ${selectedSite.alias}` : ''}`
              : null,
            provider:
              warehouses.find(
                (warehouse) => warehouse.ownerCompany.id === query.providerId,
              )?.ownerCompany.name ?? null,
            warehouse:
              warehouses.find((warehouse) => warehouse.id === query.warehouseId)
                ?.name ?? null,
            ownership:
              query.report === BalanceReportKind.PROVIDERS
                ? BalanceOwnership.PROVIDER
                : query.ownership,
          },
          scope:
            query.report === BalanceReportKind.PROVIDERS
              ? 'Inventario de proveedores en nuestras bodegas, obras y tránsito pendiente de entrega. No incluye existencias disponibles en la bodega del proveedor.'
              : byCustomer
                ? 'Inventario que permanece en obra, separado por referencia y propietario.'
                : query.report === BalanceReportKind.WAREHOUSES
                  ? 'Existencias físicas en las bodegas seleccionadas. No incluye equipos que estén en obra o en tránsito.'
                  : 'Inventario en nuestras bodegas, obras y tránsito pendiente de entrega. No incluye existencias disponibles en bodegas de proveedores.',
          warnings: [...warnings],
          rowCount: rows.length,
          rows,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 5000,
        timeout: 60000,
      },
    );
  }

  private baseRow(
    ownerWarehouseId: string | null | undefined,
    warehouses: Map<string, Warehouse>,
    location: { warehouse?: Warehouse; site?: Site },
  ) {
    const ownerWarehouse = ownerWarehouseId
      ? warehouses.get(ownerWarehouseId)
      : undefined;
    return {
      ownerId: ownerWarehouse?.ownerCompany.id ?? null,
      ownerName:
        ownerWarehouse?.ownerCompany.name ?? 'Propietario sin identificar',
      ownerCategory: ownerWarehouse?.ownerCompany.category ?? null,
      ownerWarehouseId: ownerWarehouseId ?? null,
      ownerWarehouseName:
        ownerWarehouse?.name ?? 'Bodega propietaria sin identificar',
      locationType: (location.site
        ? 'WORKSITE'
        : location.warehouse
          ? 'WAREHOUSE'
          : 'UNKNOWN') as BalanceReportRow['locationType'],
      locationId: location.site?.id ?? location.warehouse?.id ?? null,
      locationName:
        location.site?.worksite.name ??
        location.warehouse?.name ??
        'Ubicación sin confirmar',
      customerId: location.site?.customer.id ?? null,
      customerName: location.site?.customer.name ?? '',
      worksiteName: location.site?.worksite.name ?? '',
      worksiteAlias: location.site?.alias ?? '',
    };
  }
}
