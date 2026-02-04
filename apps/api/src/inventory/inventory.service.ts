import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { MovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryAdjustDto } from './dto/create-inventory-adjust.dto';
import { CreateProviderReceiptDto } from './dto/create-provider-receipt.dto';
import { CreateInventoryInDto } from './dto/create-inventory-in.dto';
import { CreateInventoryOnSiteDto } from './dto/create-inventory-on-site.dto';
import { CreateInventoryOutDto } from './dto/create-inventory-out.dto';
import {
  GetInventoryLedgerDto,
  LEDGER_DEFAULT_TAKE,
  LEDGER_MAX_TAKE,
} from './dto/get-inventory-ledger.dto';
import { GetInventorySummaryDto } from './dto/get-inventory-summary.dto';
const WAREHOUSE_CACHE_TTL_SECONDS = 30;
const ON_SITE_CACHE_TTL_SECONDS = 30;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  private getWarehouseCacheKey(warehouseId: string) {
    return `inventory:warehouse:${warehouseId}`;
  }

  private getOnSiteCacheKey(customerWorksiteId: string) {
    return `inventory:on-site:${customerWorksiteId}`;
  }

  private async invalidateInventoryCache(params: {
    warehouseId?: string | null;
    customerWorksiteId?: string | null;
  }) {
    const keys: string[] = [];
    if (params.warehouseId) {
      keys.push(this.getWarehouseCacheKey(params.warehouseId));
    }
    if (params.customerWorksiteId) {
      keys.push(this.getOnSiteCacheKey(params.customerWorksiteId));
    }
    await Promise.all(keys.map((key) => this.cacheManager.del(key)));
  }

  private async assertDocumentExists(
    documentId: string,
    prismaClient: Prisma.TransactionClient | PrismaService,
  ) {
    const document = await prismaClient.document.findUnique({
      where: { id: documentId },
      select: { id: true },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
  }

  private parseLedgerCursor(cursor: string) {
    const raw = cursor.trim();
    let payload: { createdAt?: string; id?: string };

    try {
      if (raw.startsWith('{')) {
        payload = JSON.parse(raw);
      } else {
        payload = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
      }
    } catch {
      throw new BadRequestException('Invalid cursor');
    }

    if (!payload?.createdAt || !payload?.id) {
      throw new BadRequestException('Invalid cursor');
    }

    const createdAt = new Date(payload.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new BadRequestException('Invalid cursor');
    }

    return { createdAt, id: String(payload.id) };
  }

  private makeLedgerCursor(entry: { createdAt: Date; id: string }) {
    return Buffer.from(
      JSON.stringify({ createdAt: entry.createdAt.toISOString(), id: entry.id }),
    ).toString('base64');
  }

  private normalizeOperationItems(
    items: {
      skuId?: string;
      assetId?: string;
      quantity?: number;
      ownerWarehouseId: string;
    }[],
  ) {
    const bulkGroups = new Map<
      string,
      { skuId: string; ownerWarehouseId: string; quantity: number }
    >();
    const serialAssetIds = new Set<string>();
    const serialOwnerWarehouseByAsset = new Map<string, string>();

    items.forEach((item, index) => {
      const isBulk = !!item.skuId;
      const isSerial = !!item.assetId;

      if (isBulk === isSerial) {
        throw new BadRequestException(
          `Item ${index} must be BULK (skuId + quantity) or SERIAL (assetId)`,
        );
      }

      if (isBulk) {
        if (item.quantity == null || item.quantity <= 0) {
          throw new BadRequestException(`Item ${index} quantity must be > 0`);
        }

        const skuId = item.skuId as string;
        if (!item.ownerWarehouseId) {
          throw new BadRequestException(`Item ${index} ownerWarehouseId is required`);
        }
        const key = `${skuId}::${item.ownerWarehouseId}`;
        const current = bulkGroups.get(key);
        const quantity = (current?.quantity ?? 0) + item.quantity;
        bulkGroups.set(key, { skuId, ownerWarehouseId: item.ownerWarehouseId, quantity });
        return;
      }

      const assetId = item.assetId as string;
      if (serialAssetIds.has(assetId)) {
        throw new BadRequestException(`Item ${index} assetId is duplicated`);
      }
      serialAssetIds.add(assetId);
      if (!item.ownerWarehouseId) {
        throw new BadRequestException(`Item ${index} ownerWarehouseId is required`);
      }
      const existing = serialOwnerWarehouseByAsset.get(assetId);
      if (existing && existing !== item.ownerWarehouseId) {
        throw new BadRequestException(`Item ${index} assetId has conflicting ownerWarehouseId`);
      }
      serialOwnerWarehouseByAsset.set(assetId, item.ownerWarehouseId);
    });

    return {
      bulkGroups: [...bulkGroups.values()],
      serialAssetIds,
      serialOwnerWarehouseByAsset,
    };
  }

  async adjustInventory(payload: CreateInventoryAdjustDto, userId: string) {
    if (payload.documentId) {
      await this.assertDocumentExists(payload.documentId, this.prisma);
    }

    const ownerWarehouseIds = [
      ...new Set(payload.items.map((item) => item.ownerWarehouseId).filter(Boolean)),
    ];
    await this.assertOwnerWarehousesExist(ownerWarehouseIds);

    const serialAssetIds = [
      ...new Set(payload.items.filter((item) => item.assetId).map((item) => item.assetId as string)),
    ];
    const assets = serialAssetIds.length
      ? await this.prisma.asset.findMany({
          where: { id: { in: serialAssetIds } },
          select: { id: true, warehouseOwnerId: true },
        })
      : [];
    const assetOwnerById = new Map(
      assets.map((asset) => [asset.id, asset.warehouseOwnerId] as const),
    );

    const operations = payload.items.map((item, index) => {
      const isBulk = !!item.skuId;
      const isSerial = !!item.assetId;

      if (isBulk === isSerial) {
        throw new BadRequestException(
          `Item ${index} must be BULK (skuId + quantity) or SERIAL (assetId)`
        );
      }

      let quantity: number;

      if (isBulk) {
        if (item.quantity == null || item.quantity === 0) {
          throw new BadRequestException(`Item ${index} quantity must be != 0`);
        }

        quantity = item.quantity;
      } else {
        quantity = 1;
      }

      if (isSerial) {
        const assetOwnerWarehouseId = assetOwnerById.get(item.assetId as string);
        if (!assetOwnerWarehouseId) {
          throw new BadRequestException(`Item ${index} assetId not found`);
        }
        if (assetOwnerWarehouseId !== item.ownerWarehouseId) {
          throw new BadRequestException(
            `Item ${index} ownerWarehouseId does not match asset owner`,
          );
        }
      }

      const data = {
        movementType: MovementType.ADJUST,
        warehouseId: payload.warehouseId,
        customerWorksiteId: null,
        refDocumentId: payload.documentId ?? null,
        refDocumentType: null,
        skuId: isBulk ? item.skuId : null,
        assetId: isSerial ? item.assetId : null,
        ownerWarehouseId: item.ownerWarehouseId,
        quantity,
        createdBy: userId,
      } as const;

      return this.prisma.stockLedger.create({ data });
    });

    const created = await this.prisma.$transaction(operations);

    await this.invalidateInventoryCache({
      warehouseId: payload.warehouseId,
    });

    return {
      count: created.length,
      ids: created.map((entry) => entry.id),
    };
  }

  async moveOut(payload: CreateInventoryOutDto, userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      if (payload.documentId) {
        await this.assertDocumentExists(payload.documentId, tx);
      }

      const warehouse = await tx.warehouse.findUnique({
        where: { id: payload.warehouseId },
        select: { id: true },
      });
      if (!warehouse) {
        throw new NotFoundException('Warehouse not found');
      }

      const customerWorksite = await tx.customerWorksite.findUnique({
        where: { id: payload.customerWorksiteId },
        select: { id: true },
      });
      if (!customerWorksite) {
        throw new NotFoundException('Customer worksite not found');
      }

      const { bulkGroups, serialAssetIds, serialOwnerWarehouseByAsset } =
        this.normalizeOperationItems(payload.items);
      const ownerWarehouseIds = [
        ...new Set(payload.items.map((item) => item.ownerWarehouseId).filter(Boolean)),
      ];
      await this.assertOwnerWarehousesExist(ownerWarehouseIds);

      const bulkSkuIds = [...new Set(bulkGroups.map((group) => group.skuId))];
      const serialIds = [...serialAssetIds.values()];

      if (bulkSkuIds.length) {
        const bulkRows = await tx.stockLedger.groupBy({
          by: ['skuId', 'ownerWarehouseId'],
          where: {
            warehouseId: payload.warehouseId,
            customerWorksiteId: null,
            skuId: { in: bulkSkuIds },
          },
          _sum: { quantity: true },
        });
        const availableByGroup = new Map(
          bulkRows.map((row) => {
            const ownerWarehouseId = row.ownerWarehouseId ?? null;
            const key = `${row.skuId as string}::${ownerWarehouseId ?? 'null'}`;
            return [key, Number(row._sum.quantity ?? 0)] as const;
          }),
        );

        bulkGroups.forEach((group) => {
          const key = `${group.skuId}::${group.ownerWarehouseId ?? 'null'}`;
          const available = availableByGroup.get(key) ?? 0;
          if (available < group.quantity) {
            throw new BadRequestException(
              `Insufficient stock for skuId ${group.skuId}${group.ownerWarehouseId ? ` ownerWarehouse ${group.ownerWarehouseId}` : ''}`,
            );
          }
        });
      }

      if (serialIds.length) {
        const serialRows = await tx.stockLedger.groupBy({
          by: ['assetId'],
          where: {
            warehouseId: payload.warehouseId,
            customerWorksiteId: null,
            assetId: { in: serialIds },
          },
          _sum: { quantity: true },
        });
        const availableByAsset = new Map(
          serialRows.map((row) => [row.assetId as string, Number(row._sum.quantity ?? 0)]),
        );

        serialIds.forEach((assetId) => {
          const available = availableByAsset.get(assetId) ?? 0;
          if (available <= 0) {
            throw new BadRequestException(`Asset ${assetId} is not in warehouse`);
          }
        });
      }

      const assets = serialIds.length
        ? await tx.asset.findMany({
            where: { id: { in: serialIds } },
            select: { id: true, warehouseOwnerId: true },
          })
        : [];
      const ownerWarehouseByAsset = new Map(
        assets.map((asset) => [asset.id, asset.warehouseOwnerId] as const),
      );
      serialIds.forEach((assetId) => {
        const expectedOwnerWarehouseId = serialOwnerWarehouseByAsset.get(assetId);
        const assetOwnerWarehouseId = ownerWarehouseByAsset.get(assetId);
        if (!assetOwnerWarehouseId) {
          throw new BadRequestException(`Asset ${assetId} not found`);
        }
        if (expectedOwnerWarehouseId !== assetOwnerWarehouseId) {
          throw new BadRequestException(
            `Asset ${assetId} ownerWarehouseId does not match asset owner`,
          );
        }
      });

      const operations = [
        ...bulkGroups.map((group) =>
          tx.stockLedger.create({
            data: {
              movementType: MovementType.OUT,
              warehouseId: payload.warehouseId,
              customerWorksiteId: payload.customerWorksiteId,
              refDocumentId: payload.documentId ?? null,
              refDocumentType: null,
              skuId: group.skuId,
              assetId: null,
              ownerWarehouseId: group.ownerWarehouseId,
              quantity: -group.quantity,
              createdBy: userId,
            },
          }),
        ),
        ...serialIds.map((assetId) =>
          tx.stockLedger.create({
            data: {
              movementType: MovementType.OUT,
              warehouseId: payload.warehouseId,
              customerWorksiteId: payload.customerWorksiteId,
              refDocumentId: payload.documentId ?? null,
              refDocumentType: null,
              skuId: null,
              assetId,
              ownerWarehouseId: ownerWarehouseByAsset.get(assetId) ?? null,
              quantity: -1,
              createdBy: userId,
            },
          }),
        ),
      ];

      const created = await Promise.all(operations);

      return {
        count: created.length,
        ids: created.map((entry) => entry.id),
      };
    });

    await this.invalidateInventoryCache({
      warehouseId: payload.warehouseId,
      customerWorksiteId: payload.customerWorksiteId,
    });

    return result;
  }

  async moveOnSite(payload: CreateInventoryOnSiteDto, userId: string) {
    if (payload.documentId) {
      await this.assertDocumentExists(payload.documentId, this.prisma);
    }

    const customerWorksite = await this.prisma.customerWorksite.findUnique({
      where: { id: payload.customerWorksiteId },
      select: { id: true },
    });
    if (!customerWorksite) {
      throw new NotFoundException('Customer worksite not found');
    }

    const { bulkGroups, serialAssetIds, serialOwnerWarehouseByAsset } =
      this.normalizeOperationItems(payload.items);
    const ownerWarehouseIds = [
      ...new Set(payload.items.map((item) => item.ownerWarehouseId).filter(Boolean)),
    ];
    await this.assertOwnerWarehousesExist(ownerWarehouseIds);
    const bulkSkuIds = [...new Set(bulkGroups.map((group) => group.skuId))];
    const serialIds = [...serialAssetIds.values()];

    const assets = serialIds.length
      ? await this.prisma.asset.findMany({
          where: { id: { in: serialIds } },
          select: { id: true, warehouseOwnerId: true },
        })
      : [];
    const ownerWarehouseByAsset = new Map(
      assets.map((asset) => [asset.id, asset.warehouseOwnerId] as const),
    );
    serialIds.forEach((assetId) => {
      const expectedOwnerWarehouseId = serialOwnerWarehouseByAsset.get(assetId);
      const assetOwnerWarehouseId = ownerWarehouseByAsset.get(assetId);
      if (!assetOwnerWarehouseId) {
        throw new BadRequestException(`Asset ${assetId} not found`);
      }
      if (expectedOwnerWarehouseId !== assetOwnerWarehouseId) {
        throw new BadRequestException(
          `Asset ${assetId} ownerWarehouseId does not match asset owner`,
        );
      }
    });

    const operations = [
      ...bulkGroups.map((group) =>
        this.prisma.stockLedger.create({
          data: {
            movementType: MovementType.ON_SITE,
            warehouseId: null,
            ownerWarehouseId: group.ownerWarehouseId,
            customerWorksiteId: payload.customerWorksiteId,
            refDocumentId: payload.documentId ?? null,
            refDocumentType: null,
            skuId: group.skuId,
            assetId: null,
            quantity: group.quantity,
            createdBy: userId,
          },
        }),
      ),
      ...serialIds.map((assetId) =>
        this.prisma.stockLedger.create({
          data: {
            movementType: MovementType.ON_SITE,
            warehouseId: null,
            ownerWarehouseId: ownerWarehouseByAsset.get(assetId) ?? null,
            customerWorksiteId: payload.customerWorksiteId,
            refDocumentId: payload.documentId ?? null,
            refDocumentType: null,
            skuId: null,
            assetId,
            quantity: 1,
            createdBy: userId,
          },
        }),
      ),
    ];

    const created = await this.prisma.$transaction(operations);

    await this.invalidateInventoryCache({
      customerWorksiteId: payload.customerWorksiteId,
    });

    return {
      count: created.length,
      ids: created.map((entry) => entry.id),
    };
  }

  async moveIn(payload: CreateInventoryInDto, userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      if (payload.documentId) {
        await this.assertDocumentExists(payload.documentId, tx);
      }

      const warehouse = await tx.warehouse.findUnique({
        where: { id: payload.warehouseId },
        select: { id: true },
      });
      if (!warehouse) {
        throw new NotFoundException('Warehouse not found');
      }

      const customerWorksite = await tx.customerWorksite.findUnique({
        where: { id: payload.customerWorksiteId },
        select: { id: true },
      });
      if (!customerWorksite) {
        throw new NotFoundException('Customer worksite not found');
      }

      const { bulkGroups, serialAssetIds, serialOwnerWarehouseByAsset } =
        this.normalizeOperationItems(payload.items);
      const ownerWarehouseIds = [
        ...new Set(payload.items.map((item) => item.ownerWarehouseId).filter(Boolean)),
      ];
      await this.assertOwnerWarehousesExist(ownerWarehouseIds);
      const bulkSkuIds = [...new Set(bulkGroups.map((group) => group.skuId))];
      const serialIds = [...serialAssetIds.values()];

      if (bulkSkuIds.length) {
        const onSiteRows = await tx.stockLedger.groupBy({
          by: ['skuId', 'ownerWarehouseId'],
          where: {
            customerWorksiteId: payload.customerWorksiteId,
            warehouseId: null,
            skuId: { in: bulkSkuIds },
          },
          _sum: { quantity: true },
        });
        const inRows = await tx.stockLedger.groupBy({
          by: ['skuId', 'ownerWarehouseId'],
          where: {
            customerWorksiteId: payload.customerWorksiteId,
            movementType: MovementType.IN,
            skuId: { in: bulkSkuIds },
          },
          _sum: { quantity: true },
        });
        const onSiteByGroup = new Map(
          onSiteRows.map((row) => {
            const ownerWarehouseId = row.ownerWarehouseId ?? null;
            const key = `${row.skuId as string}::${ownerWarehouseId ?? 'null'}`;
            return [key, Number(row._sum.quantity ?? 0)] as const;
          }),
        );
        const returnedByGroup = new Map(
          inRows.map((row) => {
            const ownerWarehouseId = row.ownerWarehouseId ?? null;
            const key = `${row.skuId as string}::${ownerWarehouseId ?? 'null'}`;
            return [key, Number(row._sum.quantity ?? 0)] as const;
          }),
        );

        bulkGroups.forEach((group) => {
          const key = `${group.skuId}::${group.ownerWarehouseId ?? 'null'}`;
          const onSite = onSiteByGroup.get(key) ?? 0;
          const returned = returnedByGroup.get(key) ?? 0;
          const net = onSite - returned;
          if (net < group.quantity) {
            throw new BadRequestException(
              `Insufficient on-site stock for skuId ${group.skuId} at customer worksite`,
            );
          }
        });
      }

      if (serialIds.length) {
        const onSiteRows = await tx.stockLedger.groupBy({
          by: ['assetId'],
          where: {
            customerWorksiteId: payload.customerWorksiteId,
            warehouseId: null,
            assetId: { in: serialIds },
          },
          _sum: { quantity: true },
        });
        const inRows = await tx.stockLedger.groupBy({
          by: ['assetId'],
          where: {
            customerWorksiteId: payload.customerWorksiteId,
            movementType: MovementType.IN,
            assetId: { in: serialIds },
          },
          _sum: { quantity: true },
        });
        const onSiteByAsset = new Map(
          onSiteRows.map((row) => [row.assetId as string, Number(row._sum.quantity ?? 0)]),
        );
        const returnedByAsset = new Map(
          inRows.map((row) => [row.assetId as string, Number(row._sum.quantity ?? 0)]),
        );

        serialIds.forEach((assetId) => {
          const onSite = onSiteByAsset.get(assetId) ?? 0;
          const returned = returnedByAsset.get(assetId) ?? 0;
          const net = onSite - returned;
          if (net <= 0) {
            throw new BadRequestException(
              `Asset ${assetId} is not currently on-site for this customer worksite`,
            );
          }
        });
      }

      const assets = serialIds.length
        ? await tx.asset.findMany({
            where: { id: { in: serialIds } },
            select: { id: true, warehouseOwnerId: true },
          })
        : [];
      const ownerWarehouseByAsset = new Map(
        assets.map((asset) => [asset.id, asset.warehouseOwnerId] as const),
      );
      serialIds.forEach((assetId) => {
        const expectedOwnerWarehouseId = serialOwnerWarehouseByAsset.get(assetId);
        const assetOwnerWarehouseId = ownerWarehouseByAsset.get(assetId);
        if (!assetOwnerWarehouseId) {
          throw new BadRequestException(`Asset ${assetId} not found`);
        }
        if (expectedOwnerWarehouseId !== assetOwnerWarehouseId) {
          throw new BadRequestException(
            `Asset ${assetId} ownerWarehouseId does not match asset owner`,
          );
        }
      });

      const operations = [
        ...bulkGroups.map((group) =>
          tx.stockLedger.create({
            data: {
              movementType: MovementType.IN,
              warehouseId: payload.warehouseId,
              customerWorksiteId: payload.customerWorksiteId,
              refDocumentId: payload.documentId ?? null,
              refDocumentType: null,
              skuId: group.skuId,
              assetId: null,
              ownerWarehouseId: group.ownerWarehouseId,
              quantity: group.quantity,
              createdBy: userId,
            },
          }),
        ),
        ...serialIds.map((assetId) =>
          tx.stockLedger.create({
            data: {
              movementType: MovementType.IN,
              warehouseId: payload.warehouseId,
              customerWorksiteId: payload.customerWorksiteId,
              refDocumentId: payload.documentId ?? null,
              refDocumentType: null,
              skuId: null,
              assetId,
              ownerWarehouseId: ownerWarehouseByAsset.get(assetId) ?? null,
              quantity: 1,
              createdBy: userId,
            },
          }),
        ),
      ];

      const created = await Promise.all(operations);

      return {
        count: created.length,
        ids: created.map((entry) => entry.id),
      };
    });

    await this.invalidateInventoryCache({
      warehouseId: payload.warehouseId,
      customerWorksiteId: payload.customerWorksiteId,
    });

    return result;
  }

  async getWarehouseInventory(warehouseId: string) {
    const cacheKey = this.getWarehouseCacheKey(warehouseId);
    const cached = await this.cacheManager.get<{
      warehouseId: string;
      bulk: unknown[];
      serial: unknown[];
    }>(cacheKey);
    if (cached) {
      return cached;
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    const bulkRows = await this.prisma.stockLedger.groupBy({
      by: ['skuId'],
      where: {
        warehouseId,
        customerWorksiteId: null,
        skuId: { not: null },
      },
      _sum: { quantity: true },
    });

    const serialRows = await this.prisma.stockLedger.groupBy({
      by: ['assetId'],
      where: {
        warehouseId,
        customerWorksiteId: null,
        assetId: { not: null },
      },
      _sum: { quantity: true },
    });

    const bulkBase = bulkRows
      .map((row) => ({
        skuId: row.skuId as string,
        quantity: Number(row._sum.quantity ?? 0),
      }));

    const serialBase = serialRows
      .map((row) => ({
        assetId: row.assetId as string,
        quantity: Number(row._sum.quantity ?? 0),
      }));

    const assetIds = [...new Set(serialBase.map((row) => row.assetId))];
    const assets = assetIds.length
      ? await this.prisma.asset.findMany({
          where: { id: { in: assetIds } },
          select: {
            id: true,
            serialOrEngine: true,
            description: true,
            skuId: true,
            imageFileObjectId: true,
            internalNumber: true,
            weight: true,
            assetFamily: {
              select: { code: true, name: true },
            },
          },
        })
      : [];
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

    const skuIds = [
      ...new Set([
        ...bulkBase.map((row) => row.skuId),
        ...assets.map((asset) => asset.skuId),
      ]),
    ];
    const skus = skuIds.length
      ? await this.prisma.sku.findMany({
          where: { id: { in: skuIds } },
          select: {
            id: true,
            name: true,
            imageUrl: true,
            imageFileObjectId: true,
            unitWeight: true,
          },
        })
      : [];
    const skusById = new Map(skus.map((sku) => [sku.id, sku]));

    const bulk = bulkBase
      .map((row) => {
        const sku = skusById.get(row.skuId);

        return {
          skuId: row.skuId,
          skuName: sku?.name ?? null,
          imageUrl: sku?.imageUrl ?? null,
          imageFileObjectId: sku?.imageFileObjectId ?? null,
          unitWeight: sku?.unitWeight ?? null,
          storageLocation: { warehouseId },
          quantity: row.quantity,
        };
      })
      .sort((a, b) => (a.skuName ?? '').localeCompare(b.skuName ?? ''));

    const serial = serialBase
      .map((row) => {
        const asset = assetsById.get(row.assetId);
        const sku = asset ? skusById.get(asset.skuId) : undefined;
        const assetImageFileObjectId = asset?.imageFileObjectId ?? null;
        const skuImageFileObjectId = sku?.imageFileObjectId ?? null;

        return {
          assetId: row.assetId,
          serialOrEngine: asset?.serialOrEngine ?? null,
          description: asset?.description ?? null,
          internalNumber: asset?.internalNumber ?? null,
          assetFamily: asset?.assetFamily ?? null,
          weight: asset?.weight ?? null,
          storageLocation: { warehouseId },
          assetImageFileObjectId,
          skuImageFileObjectId,
          imageFileObjectId: assetImageFileObjectId ?? skuImageFileObjectId ?? null,
          quantity: row.quantity,
        };
      })
      .sort((a, b) => (a.serialOrEngine ?? '').localeCompare(b.serialOrEngine ?? ''));

    if (serial.some((row) => row.quantity !== 1)) {
      console.warn('Inventory serial quantity != 1 detected', {
        warehouseId,
        count: serial.filter((row) => row.quantity !== 1).length,
      });
    }

    const result = {
      warehouseId,
      bulk,
      serial,
    };

    await this.cacheManager.set(cacheKey, result, WAREHOUSE_CACHE_TTL_SECONDS);

    return result;
  }

  async getOnSiteInventory(customerWorksiteId: string) {
    const cacheKey = this.getOnSiteCacheKey(customerWorksiteId);
    const cached = await this.cacheManager.get<{
      customerWorksiteId: string;
      bulk: unknown[];
      serial: unknown[];
    }>(cacheKey);
    if (cached) {
      return cached;
    }

    const customerWorksite = await this.prisma.customerWorksite.findUnique({
      where: { id: customerWorksiteId },
      select: { id: true },
    });

    if (!customerWorksite) {
      throw new NotFoundException('Customer worksite not found');
    }

    const bulkOnSiteRows = await this.prisma.stockLedger.groupBy({
      by: ['skuId'],
      where: {
        customerWorksiteId,
        warehouseId: null,
        skuId: { not: null },
      },
      _sum: { quantity: true },
    });
    const bulkInRows = await this.prisma.stockLedger.groupBy({
      by: ['skuId'],
      where: {
        customerWorksiteId,
        movementType: MovementType.IN,
        skuId: { not: null },
      },
      _sum: { quantity: true },
    });

    const serialOnSiteRows = await this.prisma.stockLedger.groupBy({
      by: ['assetId'],
      where: {
        customerWorksiteId,
        warehouseId: null,
        assetId: { not: null },
      },
      _sum: { quantity: true },
    });
    const serialInRows = await this.prisma.stockLedger.groupBy({
      by: ['assetId'],
      where: {
        customerWorksiteId,
        movementType: MovementType.IN,
        assetId: { not: null },
      },
      _sum: { quantity: true },
    });

    const bulkOnSiteBySku = new Map(
      bulkOnSiteRows.map((row) => [row.skuId as string, Number(row._sum.quantity ?? 0)]),
    );
    const bulkInBySku = new Map(
      bulkInRows.map((row) => [row.skuId as string, Number(row._sum.quantity ?? 0)]),
    );
    const bulkNet = [...new Set([...bulkOnSiteBySku.keys(), ...bulkInBySku.keys()])].map(
      (skuId) => ({
        skuId,
        quantity: (bulkOnSiteBySku.get(skuId) ?? 0) - (bulkInBySku.get(skuId) ?? 0),
      }),
    );
    const bulkNegative = bulkNet.filter((row) => row.quantity < 0);
    if (bulkNegative.length) {
      console.warn('On-site bulk negative quantity detected', {
        customerWorksiteId,
        count: bulkNegative.length,
        items: bulkNegative.map((row) => ({ skuId: row.skuId, quantity: row.quantity })),
      });
    }
    const bulkBase = bulkNet.filter((row) => row.quantity !== 0);

    const serialOnSiteByAsset = new Map(
      serialOnSiteRows.map((row) => [row.assetId as string, Number(row._sum.quantity ?? 0)]),
    );
    const serialInByAsset = new Map(
      serialInRows.map((row) => [row.assetId as string, Number(row._sum.quantity ?? 0)]),
    );
    const serialNet = [
      ...new Set([...serialOnSiteByAsset.keys(), ...serialInByAsset.keys()]),
    ].map((assetId) => ({
      assetId,
      quantity:
        (serialOnSiteByAsset.get(assetId) ?? 0) -
        (serialInByAsset.get(assetId) ?? 0),
    }));
    const serialNegative = serialNet.filter((row) => row.quantity < 0);
    if (serialNegative.length) {
      console.warn('On-site serial negative quantity detected', {
        customerWorksiteId,
        count: serialNegative.length,
        items: serialNegative.map((row) => ({ assetId: row.assetId, quantity: row.quantity })),
      });
    }
    const serialBase = serialNet.filter((row) => row.quantity > 0);

    const assetIds = [...new Set(serialBase.map((row) => row.assetId))];
    const assets = assetIds.length
      ? await this.prisma.asset.findMany({
          where: { id: { in: assetIds } },
          select: {
            id: true,
            serialOrEngine: true,
            description: true,
            skuId: true,
            imageFileObjectId: true,
            internalNumber: true,
            weight: true,
            assetFamily: {
              select: { code: true, name: true },
            },
          },
        })
      : [];
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

    const skuIds = [
      ...new Set([
        ...bulkBase.map((row) => row.skuId),
        ...assets.map((asset) => asset.skuId),
      ]),
    ];
    const skus = skuIds.length
      ? await this.prisma.sku.findMany({
          where: { id: { in: skuIds } },
          select: {
            id: true,
            name: true,
            controlType: true,
            imageUrl: true,
            imageFileObjectId: true,
            unitWeight: true,
          },
        })
      : [];
    const skusById = new Map(skus.map((sku) => [sku.id, sku]));

    const bulk = bulkBase
      .map((row) => {
        const sku = skusById.get(row.skuId);

        return {
          skuId: row.skuId,
          skuName: sku?.name ?? null,
          controlType: sku?.controlType ?? null,
          imageUrl: sku?.imageUrl ?? null,
          imageFileObjectId: sku?.imageFileObjectId ?? null,
          unitWeight: sku?.unitWeight ?? null,
          storageLocation: { warehouseId: null },
          quantity: row.quantity,
        };
      })
      .filter((row) => row.controlType == null || row.controlType === 'BULK')
      .sort((a, b) => (a.skuName ?? '').localeCompare(b.skuName ?? ''));

    const serial = serialBase
      .map((row) => {
        const asset = assetsById.get(row.assetId);
        const sku = asset ? skusById.get(asset.skuId) : undefined;
        const assetImageFileObjectId = asset?.imageFileObjectId ?? null;
        const skuImageFileObjectId = sku?.imageFileObjectId ?? null;

        return {
          assetId: row.assetId,
          serialOrEngine: asset?.serialOrEngine ?? null,
          description: asset?.description ?? null,
          internalNumber: asset?.internalNumber ?? null,
          assetFamily: asset?.assetFamily ?? null,
          weight: asset?.weight ?? null,
          storageLocation: { warehouseId: null },
          assetImageFileObjectId,
          skuImageFileObjectId,
          imageFileObjectId: assetImageFileObjectId ?? skuImageFileObjectId ?? null,
          quantity: row.quantity,
        };
      })
      .sort((a, b) => (a.serialOrEngine ?? '').localeCompare(b.serialOrEngine ?? ''));

    if (serial.some((row) => row.quantity !== 1)) {
      console.warn('Inventory serial quantity != 1 detected', {
        customerWorksiteId,
        count: serial.filter((row) => row.quantity !== 1).length,
      });
    }

    const result = {
      customerWorksiteId,
      bulk,
      serial,
    };

    await this.cacheManager.set(cacheKey, result, ON_SITE_CACHE_TTL_SECONDS);

    return result;
  }

  async getLedger(query: GetInventoryLedgerDto) {
    const take = Math.min(query.take ?? LEDGER_DEFAULT_TAKE, LEDGER_MAX_TAKE);
    const where: Prisma.StockLedgerWhereInput = {};

    if (query.warehouseId) where.warehouseId = query.warehouseId;
    if (query.customerWorksiteId) where.customerWorksiteId = query.customerWorksiteId;
    if (query.movementType) where.movementType = query.movementType;
    if (query.skuId) where.skuId = query.skuId;
    if (query.assetId) where.assetId = query.assetId;

    if (query.from || query.to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (query.from) {
        const fromDate = new Date(query.from);
        if (Number.isNaN(fromDate.getTime())) {
          throw new BadRequestException('Invalid from date');
        }
        createdAt.gte = fromDate;
      }
      if (query.to) {
        const toDate = new Date(query.to);
        if (Number.isNaN(toDate.getTime())) {
          throw new BadRequestException('Invalid to date');
        }
        createdAt.lte = toDate;
      }
      where.createdAt = createdAt;
    }

    if (query.cursor) {
      const cursor = this.parseLedgerCursor(query.cursor);
      where.AND = [
        {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        },
      ];
    }

    const items = await this.prisma.stockLedger.findMany({
      where,
      take,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        sku: {
          select: { id: true, name: true, imageUrl: true, imageFileObjectId: true },
        },
        asset: {
          select: {
            id: true,
            serialOrEngine: true,
            description: true,
            sku: { select: { id: true, name: true } },
          },
        },
        warehouse: { select: { id: true, name: true } },
        customerWorksite: {
          select: {
            id: true,
            customer: { select: { id: true, name: true } },
            worksite: { select: { id: true, name: true } },
          },
        },
        creator: { select: { id: true, email: true } },
      },
    });

    const normalized = items.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
    }));

    const nextCursor =
      normalized.length === take
        ? this.makeLedgerCursor(normalized[normalized.length - 1])
        : null;

    return { items: normalized, nextCursor };
  }

  async getSummary(query: GetInventorySummaryDto) {
    const { warehouseId, month } = query;
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true },
    });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    const monthStart = this.parseMonthStart(month);

    const bulkInitialRows = await this.prisma.stockLedger.groupBy({
      by: ['skuId'],
      where: {
        warehouseId,
        customerWorksiteId: null,
        skuId: { not: null },
        createdAt: { lt: monthStart },
      },
      _sum: { quantity: true },
    });

    const serialInitialRows = await this.prisma.stockLedger.groupBy({
      by: ['assetId'],
      where: {
        warehouseId,
        customerWorksiteId: null,
        assetId: { not: null },
        createdAt: { lt: monthStart },
      },
      _sum: { quantity: true },
    });

    const bulkOnSiteRows = await this.prisma.stockLedger.groupBy({
      by: ['skuId'],
      where: {
        ownerWarehouseId: warehouseId,
        movementType: MovementType.ON_SITE,
        skuId: { not: null },
      },
      _sum: { quantity: true },
    });

    const bulkInRows = await this.prisma.stockLedger.groupBy({
      by: ['skuId'],
      where: {
        warehouseId,
        movementType: MovementType.IN,
        customerWorksiteId: { not: null },
        skuId: { not: null },
      },
      _sum: { quantity: true },
    });

    const serialOnSiteRows = await this.prisma.stockLedger.groupBy({
      by: ['assetId'],
      where: {
        ownerWarehouseId: warehouseId,
        movementType: MovementType.ON_SITE,
        assetId: { not: null },
      },
      _sum: { quantity: true },
    });

    const serialInRows = await this.prisma.stockLedger.groupBy({
      by: ['assetId'],
      where: {
        warehouseId,
        movementType: MovementType.IN,
        customerWorksiteId: { not: null },
        assetId: { not: null },
      },
      _sum: { quantity: true },
    });

    const bulkInitialBySku = new Map(
      bulkInitialRows.map((row) => [row.skuId as string, Number(row._sum.quantity ?? 0)]),
    );
    const serialInitialByAsset = new Map(
      serialInitialRows.map((row) => [row.assetId as string, Number(row._sum.quantity ?? 0)]),
    );

    const bulkOnSiteBySku = new Map(
      bulkOnSiteRows.map((row) => [row.skuId as string, Number(row._sum.quantity ?? 0)]),
    );
    const bulkReturnedBySku = new Map(
      bulkInRows.map((row) => [row.skuId as string, Number(row._sum.quantity ?? 0)]),
    );

    const serialOnSiteByAsset = new Map(
      serialOnSiteRows.map((row) => [row.assetId as string, Number(row._sum.quantity ?? 0)]),
    );
    const serialReturnedByAsset = new Map(
      serialInRows.map((row) => [row.assetId as string, Number(row._sum.quantity ?? 0)]),
    );

    const bulkSkuIds = [
      ...new Set([
        ...bulkInitialBySku.keys(),
        ...bulkOnSiteBySku.keys(),
        ...bulkReturnedBySku.keys(),
      ]),
    ];
    const serialAssetIds = [
      ...new Set([
        ...serialInitialByAsset.keys(),
        ...serialOnSiteByAsset.keys(),
        ...serialReturnedByAsset.keys(),
      ]),
    ];

    const skus = bulkSkuIds.length
      ? await this.prisma.sku.findMany({
          where: { id: { in: bulkSkuIds } },
          select: {
            id: true,
            name: true,
            imageUrl: true,
            imageFileObjectId: true,
            unitWeight: true,
          },
        })
      : [];
    const skusById = new Map(skus.map((sku) => [sku.id, sku]));

    const assets = serialAssetIds.length
      ? await this.prisma.asset.findMany({
          where: { id: { in: serialAssetIds } },
          select: {
            id: true,
            serialOrEngine: true,
            description: true,
            internalNumber: true,
            weight: true,
            assetFamily: { select: { code: true, name: true } },
          },
        })
      : [];
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

    const bulk = bulkSkuIds
      .map((skuId) => {
        const initialQuantity = bulkInitialBySku.get(skuId) ?? 0;
        const onSiteQuantity =
          (bulkOnSiteBySku.get(skuId) ?? 0) - (bulkReturnedBySku.get(skuId) ?? 0);
        const totalQuantity = initialQuantity + onSiteQuantity;
        const sku = skusById.get(skuId);

        return {
          skuId,
          skuName: sku?.name ?? null,
          imageUrl: sku?.imageUrl ?? null,
          imageFileObjectId: sku?.imageFileObjectId ?? null,
          unitWeight: sku?.unitWeight ?? null,
          initialQuantity,
          onSiteQuantity,
          totalQuantity,
        };
      })
      .filter((row) => row.initialQuantity !== 0 || row.onSiteQuantity !== 0);

    const serial = serialAssetIds
      .map((assetId) => {
        const initialQuantity = serialInitialByAsset.get(assetId) ?? 0;
        const onSiteQuantity =
          (serialOnSiteByAsset.get(assetId) ?? 0) -
          (serialReturnedByAsset.get(assetId) ?? 0);
        const totalQuantity = initialQuantity + onSiteQuantity;
        const asset = assetsById.get(assetId);

        return {
          assetId,
          serialOrEngine: asset?.serialOrEngine ?? null,
          description: asset?.description ?? null,
          internalNumber: asset?.internalNumber ?? null,
          assetFamily: asset?.assetFamily ?? null,
          weight: asset?.weight ?? null,
          initialQuantity,
          onSiteQuantity,
          totalQuantity,
        };
      })
      .filter((row) => row.initialQuantity !== 0 || row.onSiteQuantity !== 0);

    return {
      warehouseId,
      month,
      monthStart: monthStart.toISOString(),
      bulk,
      serial,
    };
  }

  private sanitizeOwnerName(value: string) {
    return value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private padInternalNumber(value: number) {
    return String(value).padStart(4, '0');
  }

  private parseMonthStart(month: string) {
    const [year, monthPart] = month.split('-').map((value) => Number(value));
    if (!year || !monthPart || monthPart < 1 || monthPart > 12) {
      throw new BadRequestException('Invalid month format');
    }
    const monthStart = new Date(Date.UTC(year, monthPart - 1, 1, 0, 0, 0, 0));
    if (Number.isNaN(monthStart.getTime())) {
      throw new BadRequestException('Invalid month format');
    }
    return monthStart;
  }

  private async assertOwnerWarehousesExist(ownerWarehouseIds: string[]) {
    if (!ownerWarehouseIds.length) {
      return;
    }
    const warehouses = await this.prisma.warehouse.findMany({
      where: { id: { in: ownerWarehouseIds } },
      select: { id: true },
    });
    const foundIds = new Set(warehouses.map((warehouse) => warehouse.id));
    const missing = ownerWarehouseIds.filter((id) => !foundIds.has(id));
    if (missing.length) {
      throw new BadRequestException(`Owner warehouse not found: ${missing.join(', ')}`);
    }
  }

  async createProviderReceipts(payload: CreateProviderReceiptDto, userId: string) {
    const supplierWarehouse = await this.prisma.warehouse.findUnique({
      where: { id: payload.supplierWarehouseId },
      select: { id: true, name: true, type: true },
    });

    if (!supplierWarehouse) {
      throw new NotFoundException('Supplier warehouse not found');
    }

    if (supplierWarehouse.type !== 'ALLY') {
      throw new BadRequestException('Supplier warehouse must be ALLY');
    }

    const custodyWarehouse = await this.prisma.warehouse.findUnique({
      where: { id: payload.custodyWarehouseId },
      select: { id: true },
    });

    if (!custodyWarehouse) {
      throw new NotFoundException('Custody warehouse not found');
    }

    const skuIds = [...new Set(payload.items.map((item) => item.skuId))];
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: skuIds } },
      select: { id: true, controlType: true, assetFamilyId: true },
    });
    const skuById = new Map(skus.map((sku) => [sku.id, sku]));

    for (const item of payload.items) {
      const sku = skuById.get(item.skuId);
      if (!sku) {
        throw new BadRequestException(`Sku ${item.skuId} not found`);
      }
      if (sku.controlType !== 'SERIAL') {
        throw new BadRequestException(`Sku ${item.skuId} is not SERIAL`);
      }
      if (!sku.assetFamilyId) {
        throw new BadRequestException(`Sku ${item.skuId} has no assetFamilyId`);
      }
    }

    const ownerCode = this.sanitizeOwnerName(supplierWarehouse.name);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const latest = await tx.asset.findFirst({
            where: { warehouseOwnerId: supplierWarehouse.id },
            orderBy: { internalNumber: 'desc' },
            select: { internalNumber: true },
          });
          let nextNumber = (latest?.internalNumber ?? 0) + 1;

          const createdAssets: Array<{ id: string }> = [];
          const createdLedger: Array<{ id: string }> = [];

          for (const item of payload.items) {
            const sku = skuById.get(item.skuId)!;
            const internalNumber = nextNumber++;
            const serialOrEngine = `${ownerCode}-${this.padInternalNumber(internalNumber)}`;

            const asset = await tx.asset.create({
              data: {
                skuId: item.skuId,
                assetFamilyId: sku.assetFamilyId!,
                internalNumber,
                serialOrEngine,
                brand: item.brand ?? null,
                model: item.model ?? null,
                description: item.description ?? null,
                warehouseOwnerId: supplierWarehouse.id,
                warehouseCurrentId: custodyWarehouse.id,
                active: true,
              },
            });

            const ledger = await tx.stockLedger.create({
              data: {
                movementType: MovementType.ADJUST,
                warehouseId: custodyWarehouse.id,
                customerWorksiteId: null,
                skuId: null,
                assetId: asset.id,
                quantity: 1,
                createdBy: userId,
              },
            });

            createdAssets.push(asset);
            createdLedger.push(ledger);
          }

          return {
            count: createdAssets.length,
            assetIds: createdAssets.map((entry) => entry.id),
            ledgerIds: createdLedger.map((entry) => entry.id),
          };
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < 3
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('Failed to allocate internal numbers for provider receipts.');
  }
}
