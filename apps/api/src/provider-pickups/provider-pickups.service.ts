import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentStatus,
  DocumentType,
  MovementType,
  Prisma,
  Role,
  WarehouseType,
} from '@prisma/client';
import type { Cache } from 'cache-manager';
import { physicalWarehouseLedgerWhere } from '../inventory/warehouse-stock-balance';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProviderPickupDto } from './dto/create-provider-pickup.dto';

const PROVIDER_DOCUMENT_CATEGORY = 'COMPROBANTE_SALIDA_PROVEEDOR';
const CONSECUTIVE_PREFIX = 'TRP';

type PickupItem = {
  skuId?: string | null;
  assetId?: string | null;
  quantity: number | Prisma.Decimal;
};

type ProviderStockItem = {
  key: string;
  type: 'BULK' | 'SERIAL';
  skuId: string | null;
  assetId: string | null;
  name: string;
  family: string;
  subfamily: string | null;
  reference: string | null;
  availableQuantity: number;
};

@Injectable()
export class ProviderPickupsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async listOptions() {
    const [providers, destinations] = await Promise.all([
      this.prisma.warehouse.findMany({
        where: { type: WarehouseType.ALLY, active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      this.prisma.warehouse.findMany({
        where: { type: WarehouseType.OWN, active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ]);
    return { providers, destinations };
  }

  async listProviderStock(providerWarehouseId: string) {
    const provider = await this.assertProvider(
      providerWarehouseId,
      this.prisma,
    );
    const rows = await this.prisma.stockLedger.groupBy({
      by: ['skuId', 'assetId'],
      where: {
        ...physicalWarehouseLedgerWhere(provider.id),
        ownerWarehouseId: provider.id,
      },
      _sum: { quantity: true },
    });
    const availableRows = rows.filter(
      (row) => Number(row._sum.quantity ?? 0) > 0,
    );
    const skuIds = availableRows.flatMap((row) =>
      row.skuId ? [row.skuId] : [],
    );
    const assetIds = availableRows.flatMap((row) =>
      row.assetId ? [row.assetId] : [],
    );
    const [skus, assets] = await Promise.all([
      this.prisma.sku.findMany({
        where: { id: { in: skuIds }, active: true },
        select: {
          id: true,
          name: true,
          assetFamily: { select: { name: true, controlType: true } },
          assetSubfamily: { select: { name: true } },
        },
      }),
      this.prisma.asset.findMany({
        where: {
          id: { in: assetIds },
          active: true,
          warehouseOwnerId: provider.id,
        },
        select: {
          id: true,
          publicCode: true,
          serialOrEngine: true,
          internalNumber: true,
          brand: true,
          model: true,
          description: true,
          sku: {
            select: {
              id: true,
              name: true,
              assetFamily: { select: { name: true } },
            },
          },
        },
      }),
    ]);
    const skuById = new Map(skus.map((sku) => [sku.id, sku] as const));
    const assetById = new Map(
      assets.map((asset) => [asset.id, asset] as const),
    );

    const result: ProviderStockItem[] = [];
    availableRows.forEach((row) => {
      const availableQuantity = Number(row._sum.quantity ?? 0);
      if (row.skuId) {
        const sku = skuById.get(row.skuId);
        if (!sku || sku.assetFamily.controlType !== 'BULK') return;
        result.push({
          key: `sku:${sku.id}`,
          type: 'BULK',
          skuId: sku.id,
          assetId: null,
          name: sku.name,
          family: sku.assetFamily.name,
          subfamily: sku.assetSubfamily?.name ?? null,
          reference: null,
          availableQuantity,
        });
        return;
      }
      if (row.assetId) {
        const asset = assetById.get(row.assetId);
        if (!asset) return;
        const reference =
          [asset.brand, asset.model].filter(Boolean).join(' ') ||
          asset.serialOrEngine ||
          asset.publicCode;
        result.push({
          key: `asset:${asset.id}`,
          type: 'SERIAL',
          skuId: null,
          assetId: asset.id,
          name: asset.sku.name,
          family: asset.sku.assetFamily.name,
          subfamily: null,
          reference,
          availableQuantity: Math.min(1, availableQuantity),
        });
      }
    });
    return result;
  }

  async listRecent(user: { id: string; role: Role }) {
    const documents = await this.prisma.document.findMany({
      where: {
        type: DocumentType.PROVIDER_PICKUP,
        createdBy: user.role === Role.DRIVER ? user.id : undefined,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 30,
      select: {
        id: true,
        consecutive: true,
        status: true,
        docDate: true,
        notes: true,
        providerWarehouse: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
        files: {
          where: { category: PROVIDER_DOCUMENT_CATEGORY },
          select: { id: true, originalName: true, mimeType: true },
        },
        providerPickupItems: {
          select: { quantity: true, skuId: true, assetId: true },
        },
      },
    });
    return documents.map((document) => ({
      ...document,
      itemCount: document.providerPickupItems.length,
      unitCount: document.providerPickupItems.reduce(
        (sum, item) => sum + Number(item.quantity),
        0,
      ),
      providerPickupItems: undefined,
    }));
  }

  async createDraft(
    payload: CreateProviderPickupDto,
    user: { id: string; role: Role },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const [provider, destination] = await Promise.all([
        this.assertProvider(payload.providerWarehouseId, tx),
        tx.warehouse.findFirst({
          where: {
            id: payload.destinationWarehouseId,
            type: WarehouseType.OWN,
            active: true,
          },
          select: { id: true, name: true },
        }),
      ]);
      if (!destination)
        throw new BadRequestException('La bodega REV de destino no es válida');

      const items = this.normalizeItems(payload.items);
      await this.assertAvailable(provider.id, items, tx);
      const consecutive = await this.nextConsecutive(tx);

      return tx.document.create({
        data: {
          type: DocumentType.PROVIDER_PICKUP,
          status: DocumentStatus.DRAFT,
          consecutive,
          providerWarehouseId: provider.id,
          warehouseId: destination.id,
          createdBy: user.id,
          notes: payload.notes?.trim() || null,
          providerPickupItems: {
            create: items.map((item) => ({
              skuId: item.skuId,
              assetId: item.assetId,
              quantity: new Prisma.Decimal(item.quantity),
            })),
          },
        },
        select: { id: true, consecutive: true },
      });
    });
  }

  async confirm(documentId: string, user: { id: string; role: Role }) {
    let result:
      | {
          id: string;
          consecutive: string | null;
          status: DocumentStatus;
          sourceId: string;
          destinationId: string;
        }
      | undefined;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        result = await this.prisma.$transaction(
          async (tx) => {
            const document = await tx.document.findUnique({
              where: { id: documentId },
              include: {
                files: {
                  where: { category: PROVIDER_DOCUMENT_CATEGORY },
                  select: { id: true, providerWarehouseId: true },
                },
                providerPickupItems: true,
              },
            });
            if (!document || document.type !== DocumentType.PROVIDER_PICKUP) {
              throw new NotFoundException(
                'Traslado desde proveedor no encontrado',
              );
            }
            if (document.status !== DocumentStatus.DRAFT) {
              throw new BadRequestException('El traslado ya fue procesado');
            }
            if (user.role === Role.DRIVER && document.createdBy !== user.id) {
              throw new ForbiddenException(
                'Este traslado pertenece a otro conductor',
              );
            }
            if (!document.providerWarehouseId || !document.warehouseId) {
              throw new BadRequestException(
                'El traslado no tiene origen o destino',
              );
            }
            if (
              !document.files.some(
                (file) =>
                  file.providerWarehouseId === document.providerWarehouseId,
              )
            ) {
              throw new BadRequestException(
                'Debes adjuntar el documento físico entregado por el proveedor',
              );
            }

            const items = this.normalizeItems(document.providerPickupItems);
            await this.assertAvailable(document.providerWarehouseId, items, tx);

            await tx.stockLedger.createMany({
              data: items.flatMap((item) => [
                {
                  movementType: MovementType.OUT,
                  warehouseId: document.providerWarehouseId!,
                  ownerWarehouseId: document.providerWarehouseId!,
                  customerWorksiteId: null,
                  refDocumentId: document.id,
                  refDocumentType: DocumentType.PROVIDER_PICKUP,
                  skuId: item.skuId,
                  assetId: item.assetId,
                  quantity: new Prisma.Decimal(item.quantity).negated(),
                  createdBy: user.id,
                },
                {
                  movementType: MovementType.IN,
                  warehouseId: document.warehouseId!,
                  ownerWarehouseId: document.providerWarehouseId!,
                  customerWorksiteId: null,
                  refDocumentId: document.id,
                  refDocumentType: DocumentType.PROVIDER_PICKUP,
                  skuId: item.skuId,
                  assetId: item.assetId,
                  quantity: new Prisma.Decimal(item.quantity),
                  createdBy: user.id,
                },
              ]),
            });
            const assetIds = items.flatMap((item) =>
              item.assetId ? [item.assetId] : [],
            );
            if (assetIds.length) {
              await tx.asset.updateMany({
                where: { id: { in: assetIds } },
                data: { warehouseCurrentId: document.warehouseId },
              });
            }
            const confirmed = await tx.document.update({
              where: { id: document.id },
              data: { status: DocumentStatus.CONFIRMED, docDate: new Date() },
              select: { id: true, consecutive: true, status: true },
            });
            return {
              ...confirmed,
              sourceId: document.providerWarehouseId,
              destinationId: document.warehouseId,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 3
        ) {
          continue;
        }
        throw error;
      }
    }
    if (!result)
      throw new BadRequestException('No fue posible confirmar el traslado');
    await Promise.all([
      this.invalidateWarehouse(result.sourceId),
      this.invalidateWarehouse(result.destinationId),
    ]);
    return result;
  }

  private normalizeItems(items: PickupItem[]) {
    const seen = new Set<string>();
    return items.map((item, index) => {
      const hasSku = Boolean(item.skuId);
      const hasAsset = Boolean(item.assetId);
      if (hasSku === hasAsset) {
        throw new BadRequestException(
          `El ítem ${index + 1} debe ser BULK o SERIAL`,
        );
      }
      const quantity = Number(item.quantity);
      if (
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        (hasAsset && quantity !== 1)
      ) {
        throw new BadRequestException(
          `La cantidad del ítem ${index + 1} no es válida`,
        );
      }
      const key = hasSku ? `sku:${item.skuId}` : `asset:${item.assetId}`;
      if (seen.has(key)) throw new BadRequestException('Hay ítems repetidos');
      seen.add(key);
      return {
        skuId: hasSku ? item.skuId! : null,
        assetId: hasAsset ? item.assetId! : null,
        quantity,
      };
    });
  }

  private async assertAvailable(
    providerWarehouseId: string,
    items: ReturnType<ProviderPickupsService['normalizeItems']>,
    tx: Prisma.TransactionClient,
  ) {
    const skuIds = items.flatMap((item) => (item.skuId ? [item.skuId] : []));
    const assetIds = items.flatMap((item) =>
      item.assetId ? [item.assetId] : [],
    );
    const [rows, skus, assets] = await Promise.all([
      tx.stockLedger.groupBy({
        by: ['skuId', 'assetId'],
        where: {
          ...physicalWarehouseLedgerWhere(providerWarehouseId),
          ownerWarehouseId: providerWarehouseId,
          OR: [
            ...(skuIds.length ? [{ skuId: { in: skuIds } }] : []),
            ...(assetIds.length ? [{ assetId: { in: assetIds } }] : []),
          ],
        },
        _sum: { quantity: true },
      }),
      tx.sku.findMany({
        where: {
          id: { in: skuIds },
          active: true,
          assetFamily: { controlType: 'BULK' },
        },
        select: { id: true },
      }),
      tx.asset.findMany({
        where: {
          id: { in: assetIds },
          active: true,
          warehouseOwnerId: providerWarehouseId,
        },
        select: { id: true },
      }),
    ]);
    if (skus.length !== skuIds.length || assets.length !== assetIds.length) {
      throw new BadRequestException(
        'Uno o más ítems no pertenecen al inventario del proveedor',
      );
    }
    const available = new Map(
      rows.map((row) => [
        row.skuId ? `sku:${row.skuId}` : `asset:${row.assetId}`,
        Number(row._sum.quantity ?? 0),
      ]),
    );
    for (const item of items) {
      const key = item.skuId ? `sku:${item.skuId}` : `asset:${item.assetId}`;
      const stock = available.get(key) ?? 0;
      if (stock < item.quantity) {
        throw new BadRequestException(
          `Inventario insuficiente en la bodega del proveedor. Disponible: ${stock}`,
        );
      }
    }
  }

  private async assertProvider(
    providerWarehouseId: string,
    tx: Prisma.TransactionClient | PrismaService,
  ) {
    const provider = await tx.warehouse.findFirst({
      where: {
        id: providerWarehouseId,
        type: WarehouseType.ALLY,
        active: true,
      },
      select: { id: true, name: true },
    });
    if (!provider) throw new NotFoundException('Proveedor no encontrado');
    return provider;
  }

  private async nextConsecutive(tx: Prisma.TransactionClient) {
    const documents = await tx.document.findMany({
      where: {
        type: DocumentType.PROVIDER_PICKUP,
        consecutive: { startsWith: CONSECUTIVE_PREFIX },
      },
      select: { consecutive: true },
    });
    const next =
      documents.reduce((max, document) => {
        const value =
          Number(document.consecutive?.replace(CONSECUTIVE_PREFIX, '')) || 0;
        return Math.max(max, value);
      }, 0) + 1;
    return `${CONSECUTIVE_PREFIX}${String(next).padStart(6, '0')}`;
  }

  private async invalidateWarehouse(warehouseId: string) {
    const baseKey = `inventory:warehouse:${warehouseId}`;
    await Promise.all([
      this.cacheManager.del(baseKey),
      this.cacheManager.del(`${baseKey}:default`),
      this.cacheManager.del(`${baseKey}:include-zero`),
    ]);
  }
}
