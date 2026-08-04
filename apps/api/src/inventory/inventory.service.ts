import {
  BadRequestException,
  Inject,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import {
  ChargeType,
  DocumentType,
  MovementType,
  Prisma,
  Role,
  SkuControlType,
  WarehouseType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryAdjustDto } from './dto/create-inventory-adjust.dto';
import { CreateBulkStockDto } from './dto/create-bulk-stock.dto';
import { CreateProviderReceiptDto } from './dto/create-provider-receipt.dto';
import { CreateInventoryInDto } from './dto/create-inventory-in.dto';
import { CreateInventoryOnSiteDto } from './dto/create-inventory-on-site.dto';
import { CreateInventoryOutDto } from './dto/create-inventory-out.dto';
import { CreateSerializedAssetDto } from './dto/create-serialized-asset.dto';
import { CreateBulkAdjustmentDto } from './dto/create-bulk-adjustment.dto';
import { ArchiveBulkSkuDto } from './dto/archive-bulk-sku.dto';
import { DeleteBulkStockDto } from './dto/delete-bulk-stock.dto';
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

  private getWarehouseCacheKeys(warehouseId: string) {
    const baseKey = this.getWarehouseCacheKey(warehouseId);
    return [baseKey, `${baseKey}:default`, `${baseKey}:include-zero`];
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
      keys.push(...this.getWarehouseCacheKeys(params.warehouseId));
    }
    if (params.customerWorksiteId) {
      keys.push(this.getOnSiteCacheKey(params.customerWorksiteId));
    }
    await Promise.all(keys.map((key) => this.cacheManager.del(key)));
  }

  private async assertDocumentExists(
    documentId: string,
    prismaClient: Prisma.TransactionClient | PrismaService,
  ): Promise<DocumentType> {
    const document = await prismaClient.document.findUnique({
      where: { id: documentId },
      select: { id: true, type: true },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    return document.type;
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

  private formatOwnerWarehouseLabel(warehouse?: {
    name: string;
    ownerCompany?: { name: string } | null;
  }) {
    if (!warehouse) return null;
    const ownerName = warehouse.ownerCompany?.name?.trim();
    const warehouseName = warehouse.name?.trim();
    if (ownerName && warehouseName) return `${ownerName} | ${warehouseName}`;
    return warehouseName || ownerName || null;
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

  async createSerializedAsset(payload: CreateSerializedAssetDto, userId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const assetFamily = await this.resolveAssetFamily(payload.family, SkuControlType.SERIAL, tx);
        const assetSubfamily = await this.resolveAssetSubfamily(
          payload.subfamily,
          assetFamily.id,
          tx,
          payload.sku.id,
        );
        const sku = await this.resolveSku(
          payload.sku,
          assetFamily.id,
          tx,
          assetSubfamily.id,
        );

      const ownerWarehouse = await tx.warehouse.findUnique({
        where: { id: payload.ownerWarehouseId },
        select: { id: true, name: true, type: true },
      });
      if (!ownerWarehouse) {
        throw new NotFoundException('Owner warehouse not found');
      }

      const providerPrice = await this.upsertProviderPriceIfProvided(
        payload.providerPrice,
        ownerWarehouse,
        sku.id,
        tx,
      );

      const currentWarehouse = await tx.warehouse.findUnique({
        where: { id: payload.warehouseCurrentId },
        select: { id: true },
      });
      if (!currentWarehouse) {
        throw new NotFoundException('Current warehouse not found');
      }

      const serialOrEngine = payload.asset.serialOrEngine?.trim();

      const requestedInternalNumber =
        payload.asset.internalNumber != null ? Number(payload.asset.internalNumber) : null;

      let internalNumber: number;
      if (requestedInternalNumber != null) {
        if (!Number.isInteger(requestedInternalNumber) || requestedInternalNumber <= 0) {
          throw new BadRequestException('internalNumber must be a positive integer');
        }

        const existingAsset = await tx.asset.findFirst({
          where: {
            warehouseOwnerId: payload.ownerWarehouseId,
            sku: { assetSubfamilyId: assetSubfamily.id },
            internalNumber: requestedInternalNumber,
          },
          select: { id: true },
        });
        if (existingAsset) {
          throw new BadRequestException('Consecutivo interno ya existe, intenta nuevamente');
        }

        const counter = await tx.assetInternalCounter.findUnique({
          where: {
            ownerWarehouseId_assetSubfamilyId: {
              ownerWarehouseId: payload.ownerWarehouseId,
              assetSubfamilyId: assetSubfamily.id,
            },
          },
          select: { id: true, nextNumber: true },
        });

        if (!counter) {
          await tx.assetInternalCounter.create({
            data: {
              ownerWarehouseId: payload.ownerWarehouseId,
              assetSubfamilyId: assetSubfamily.id,
              nextNumber: requestedInternalNumber + 1,
            },
          });
        } else if (counter.nextNumber <= requestedInternalNumber) {
          await tx.assetInternalCounter.update({
            where: { id: counter.id },
            data: { nextNumber: requestedInternalNumber + 1 },
          });
        }

        internalNumber = requestedInternalNumber;
      } else {
        const counter = await tx.assetInternalCounter.upsert({
          where: {
            ownerWarehouseId_assetSubfamilyId: {
              ownerWarehouseId: payload.ownerWarehouseId,
              assetSubfamilyId: assetSubfamily.id,
            },
          },
          create: {
            ownerWarehouseId: payload.ownerWarehouseId,
            assetSubfamilyId: assetSubfamily.id,
            nextNumber: 2,
          },
          update: {
            nextNumber: { increment: 1 },
          },
          select: { nextNumber: true },
        });
        internalNumber = counter.nextNumber - 1;
      }

      const asset = await tx.asset.create({
        data: {
          skuId: sku.id,
          publicCode: this.buildAssetPublicCode(
            assetFamily.code,
            assetSubfamily.code,
            payload.ownerWarehouseId,
            internalNumber,
          ),
          internalNumber,
          serialOrEngine: serialOrEngine || null,
          registrationNumber: payload.asset.registrationNumber?.trim().toUpperCase() || null,
          description: payload.asset.description ?? null,
          brand: payload.asset.brand ?? null,
          model: payload.asset.model ?? null,
          year: payload.asset.year ?? null,
          fuel: payload.asset.fuel ?? null,
          imageFileObjectId: payload.asset.imageFileObjectId ?? null,
          hourMeter: payload.asset.hourMeter ?? 0,
          warehouseOwnerId: payload.ownerWarehouseId,
          warehouseCurrentId: payload.warehouseCurrentId,
          active: payload.asset.active ?? true,
        },
        select: {
          id: true,
          internalNumber: true,
          skuId: true,
          warehouseOwnerId: true,
          warehouseCurrentId: true,
        },
      });

      const ledger = await tx.stockLedger.create({
        data: {
          movementType: MovementType.ADJUST,
          warehouseId: payload.warehouseCurrentId,
          ownerWarehouseId: payload.ownerWarehouseId,
          customerWorksiteId: null,
          skuId: null,
          assetId: asset.id,
          quantity: 1,
          createdBy: userId,
        },
        select: { id: true, movementType: true, quantity: true },
      });

      if (payload.asset.hourMeter !== undefined) {
        await tx.assetHourReading.create({
          data: {
            assetId: asset.id,
            hours: payload.asset.hourMeter,
            note: 'LECTURA INICIAL',
            recordedByUserId: userId,
          },
        });
      }

      return { asset, ledger, providerPrice };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const targets = Array.isArray(error.meta?.target)
            ? error.meta.target.map((value) => String(value))
            : [String(error.meta?.target ?? '')];

          if (targets.some((target) => target.includes('serialOrEngine'))) {
            throw new BadRequestException('Serial o motor ya existe');
          }
          if (targets.some((target) => target.includes('publicCode'))) {
            throw new BadRequestException('Código público del equipo ya existe');
          }
          if (targets.some((target) => target.includes('internalNumber'))) {
            throw new BadRequestException('Consecutivo interno ya existe, intenta nuevamente');
          }
          throw new BadRequestException('No se pudo crear el equipo por un valor duplicado');
        }
        if (error.code === 'P2003') {
          throw new BadRequestException('Referencia inválida en los datos enviados');
        }
        if (error.code === 'P2025') {
          throw new BadRequestException('Uno de los registros relacionados no existe');
        }
      }
      if (error instanceof Prisma.PrismaClientValidationError) {
        throw new BadRequestException('Datos inválidos para crear el equipo');
      }
      if (error instanceof Error) {
        throw new InternalServerErrorException(error.message);
      }
      throw new InternalServerErrorException('Error creando equipo');
    }
  }

  async addBulkAdjustment(payload: CreateBulkAdjustmentDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const assetFamily = await this.resolveAssetFamily(payload.family, SkuControlType.BULK, tx);
      const sku = await this.resolveSku(payload.sku, assetFamily.id, tx);

      const ownerWarehouse = await tx.warehouse.findUnique({
        where: { id: payload.ownerWarehouseId },
        select: { id: true, name: true, type: true },
      });
      if (!ownerWarehouse) {
        throw new NotFoundException('Owner warehouse not found');
      }

      const providerPrice = await this.upsertProviderPriceIfProvided(
        payload.providerPrice,
        ownerWarehouse,
        sku.id,
        tx,
      );

      const warehouse = await tx.warehouse.findUnique({
        where: { id: payload.warehouseId },
        select: { id: true },
      });
      if (!warehouse) {
        throw new NotFoundException('Warehouse not found');
      }

      const ledger = await tx.stockLedger.create({
        data: {
          movementType: MovementType.ADJUST,
          warehouseId: payload.warehouseId,
          ownerWarehouseId: payload.ownerWarehouseId,
          customerWorksiteId: null,
          skuId: sku.id,
          assetId: null,
          quantity: payload.quantity,
          createdBy: userId,
        },
        select: { id: true, movementType: true, quantity: true },
      });

      return {
        sku: { id: sku.id, assetFamilyId: assetFamily.id },
        ledger,
        providerPrice,
      };
    });
  }

  async deleteBulkStock(payload: DeleteBulkStockDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, active: true, passwordHash: true, role: true },
      });
      if (!user || !user.active || user.role !== Role.OFFICE) {
        throw new UnauthorizedException('No autorizado');
      }

      const passwordMatches = await bcrypt.compare(payload.password, user.passwordHash);
      if (!passwordMatches) {
        throw new UnauthorizedException('Credenciales inválidas');
      }

      const sku = await tx.sku.findUnique({
        where: { id: payload.skuId },
        select: {
          id: true,
          assetFamilyId: true,
          assetFamily: { select: { controlType: true } },
        },
      });
      if (!sku) {
        throw new NotFoundException('SKU no encontrado');
      }
      if (sku.assetFamily.controlType !== SkuControlType.BULK) {
        throw new BadRequestException('El SKU debe ser de stock por cantidad');
      }

      const [ownerWarehouse, warehouse] = await Promise.all([
        tx.warehouse.findUnique({ where: { id: payload.ownerWarehouseId }, select: { id: true } }),
        tx.warehouse.findUnique({ where: { id: payload.warehouseId }, select: { id: true } }),
      ]);
      if (!ownerWarehouse) {
        throw new NotFoundException('Bodega dueña no encontrada');
      }
      if (!warehouse) {
        throw new NotFoundException('Bodega no encontrada');
      }

      const currentRows = await tx.stockLedger.groupBy({
        by: ['skuId'],
        where: {
          skuId: payload.skuId,
          ownerWarehouseId: payload.ownerWarehouseId,
          warehouseId: payload.warehouseId,
        },
        _sum: { quantity: true },
      });
      const available = Number(currentRows[0]?._sum.quantity ?? 0);
      if (available < payload.quantity) {
        throw new BadRequestException(`Stock insuficiente. Disponible: ${available}`);
      }

      const ledger = await tx.stockLedger.create({
        data: {
          movementType: MovementType.ADJUST,
          warehouseId: payload.warehouseId,
          ownerWarehouseId: payload.ownerWarehouseId,
          customerWorksiteId: null,
          skuId: payload.skuId,
          assetId: null,
          quantity: -payload.quantity,
          createdBy: userId,
        },
        select: { id: true, movementType: true, quantity: true },
      });

      await this.invalidateInventoryCache({
        warehouseId: payload.warehouseId,
      });

      return {
        sku: { id: sku.id, assetFamilyId: sku.assetFamilyId },
        ledger,
      };
    });
  }

  async archiveBulkSku(payload: ArchiveBulkSkuDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, active: true, passwordHash: true, role: true },
      });
      if (!user || !user.active || user.role !== Role.ADMIN) {
        throw new UnauthorizedException('No autorizado');
      }

      const passwordMatches = await bcrypt.compare(payload.password, user.passwordHash);
      if (!passwordMatches) {
        throw new UnauthorizedException('Credenciales inválidas');
      }

      const sku = await tx.sku.findUnique({
        where: { id: payload.skuId },
        select: {
          id: true,
          name: true,
          active: true,
          assetFamily: { select: { controlType: true } },
        },
      });
      if (!sku) {
        throw new NotFoundException('SKU no encontrado');
      }
      if (sku.assetFamily.controlType !== SkuControlType.BULK) {
        throw new BadRequestException('El SKU debe ser de stock por cantidad');
      }

      const stockRows = await tx.stockLedger.groupBy({
        by: ['warehouseId', 'ownerWarehouseId'],
        where: {
          skuId: payload.skuId,
          warehouseId: { not: null },
        },
        _sum: { quantity: true },
      });

      const adjustments = stockRows
        .map((row) => ({
          warehouseId: row.warehouseId,
          ownerWarehouseId: row.ownerWarehouseId,
          quantity: Number(row._sum.quantity ?? 0),
        }))
        .filter((row): row is { warehouseId: string; ownerWarehouseId: string; quantity: number } =>
          Boolean(row.warehouseId) && row.quantity !== 0,
        );

      if (adjustments.length) {
        await tx.stockLedger.createMany({
          data: adjustments.map((row) => ({
            movementType: MovementType.ADJUST,
            warehouseId: row.warehouseId,
            ownerWarehouseId: row.ownerWarehouseId,
            customerWorksiteId: null,
            skuId: payload.skuId,
            assetId: null,
            quantity: -row.quantity,
            createdBy: userId,
          })),
        });
      }

      const archivedSku = await tx.sku.update({
        where: { id: payload.skuId },
        data: { active: false },
        select: { id: true, name: true, active: true },
      });

      await Promise.all([
        ...new Set(adjustments.map((row) => row.warehouseId)),
      ].map((warehouseId) => this.invalidateInventoryCache({ warehouseId })));

      return {
        sku: archivedSku,
        adjustments: adjustments.map((row) => ({
          warehouseId: row.warehouseId,
          ownerWarehouseId: row.ownerWarehouseId,
          quantity: -row.quantity,
        })),
      };
    });
  }

  async addBulkStock(payload: CreateBulkStockDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const sku = await tx.sku.findUnique({
        where: { id: payload.skuId },
        select: {
          id: true,
          assetFamily: { select: { controlType: true } },
        },
      });

      if (!sku) {
        throw new NotFoundException('Sku not found');
      }

      if (sku.assetFamily.controlType !== 'BULK') {
        throw new BadRequestException('Sku must be BULK');
      }

      const warehouseOwner = await tx.warehouse.findUnique({
        where: { id: payload.ownerWarehouseId },
        select: { id: true },
      });
      if (!warehouseOwner) {
        throw new NotFoundException('Owner warehouse not found');
      }

      const warehouse = await tx.warehouse.findUnique({
        where: { id: payload.warehouseId },
        select: { id: true },
      });
      if (!warehouse) {
        throw new NotFoundException('Warehouse not found');
      }

      const ledger = await tx.stockLedger.create({
        data: {
          movementType: MovementType.ADJUST,
          warehouseId: payload.warehouseId,
          ownerWarehouseId: payload.ownerWarehouseId,
          customerWorksiteId: null,
          skuId: payload.skuId,
          assetId: null,
          quantity: payload.quantity,
          createdBy: userId,
        },
        select: { id: true },
      });

      return { ledgerId: ledger.id };
    });
  }

  async moveOut(payload: CreateInventoryOutDto, userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      let refDocumentType: DocumentType | null = null;
      if (payload.documentId) {
        refDocumentType = await this.assertDocumentExists(payload.documentId, tx);
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

      const ledgerOps = [
        ...bulkGroups.map((group) =>
          tx.stockLedger.create({
            data: {
              movementType: MovementType.OUT,
              warehouseId: payload.warehouseId,
              customerWorksiteId: payload.customerWorksiteId,
              refDocumentId: payload.documentId ?? null,
              refDocumentType,
              skuId: group.skuId,
              assetId: null,
              ownerWarehouseId: group.ownerWarehouseId,
              quantity: -group.quantity,
              createdBy: userId,
            },
          }),
        ),
        ...serialIds.map((assetId) => {
          const ownerWarehouseId = ownerWarehouseByAsset.get(assetId);
          if (!ownerWarehouseId) {
            throw new BadRequestException(`Asset ${assetId} owner warehouse not found`);
          }
          return tx.stockLedger.create({
            data: {
              movementType: MovementType.OUT,
              warehouseId: payload.warehouseId,
              customerWorksiteId: payload.customerWorksiteId,
              refDocumentId: payload.documentId ?? null,
              refDocumentType,
              skuId: null,
              assetId,
              ownerWarehouseId,
              quantity: -1,
              createdBy: userId,
            },
          });
        }),
      ];

      const assetUpdates = serialIds.map((assetId) =>
        tx.asset.update({
          where: { id: assetId },
          data: { warehouseCurrentId: null },
        }),
      );

      const created = await Promise.all(ledgerOps);
      if (assetUpdates.length) {
        await Promise.all(assetUpdates);
      }

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
    const ownerWarehouseIds = [
      ...new Set(payload.items.map((item) => item.ownerWarehouseId).filter(Boolean)),
    ];
    const created = await this.prisma.$transaction(async (tx) => {
      let refDocumentType: DocumentType | null = null;
      if (payload.documentId) {
        refDocumentType = await this.assertDocumentExists(payload.documentId, tx);
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
      await this.assertOwnerWarehousesExist(ownerWarehouseIds);
      const serialIds = [...serialAssetIds.values()];

      const bulkSkuIds = [...new Set(bulkGroups.map((group) => group.skuId))];
      if (bulkSkuIds.length) {
        const warehouseRows = await tx.stockLedger.groupBy({
          by: ['skuId', 'ownerWarehouseId', 'warehouseId'],
          where: {
            warehouseId: { in: ownerWarehouseIds },
            customerWorksiteId: null,
            skuId: { in: bulkSkuIds },
          },
          _sum: { quantity: true },
        });

        const onSiteRows = await tx.stockLedger.groupBy({
          by: ['skuId', 'ownerWarehouseId'],
          where: {
            ownerWarehouseId: { in: ownerWarehouseIds },
            movementType: MovementType.ON_SITE,
            skuId: { in: bulkSkuIds },
          },
          _sum: { quantity: true },
        });
        const returnedRows = await tx.stockLedger.groupBy({
          by: ['skuId', 'ownerWarehouseId'],
          where: {
            ownerWarehouseId: { in: ownerWarehouseIds },
            movementType: MovementType.IN,
            customerWorksiteId: { not: null },
            skuId: { in: bulkSkuIds },
          },
          _sum: { quantity: true },
        });

        const availableByGroup = new Map<string, number>();
        warehouseRows.forEach((row) => {
          if (!row.skuId || !row.ownerWarehouseId || !row.warehouseId) return;
          if (row.ownerWarehouseId !== row.warehouseId) return;
          const key = `${row.skuId}::${row.ownerWarehouseId}`;
          availableByGroup.set(key, Number(row._sum.quantity ?? 0));
        });
        onSiteRows.forEach((row) => {
          if (!row.skuId || !row.ownerWarehouseId) return;
          const key = `${row.skuId}::${row.ownerWarehouseId}`;
          const current = availableByGroup.get(key) ?? 0;
          availableByGroup.set(key, current - Number(row._sum.quantity ?? 0));
        });
        returnedRows.forEach((row) => {
          if (!row.skuId || !row.ownerWarehouseId) return;
          const key = `${row.skuId}::${row.ownerWarehouseId}`;
          const current = availableByGroup.get(key) ?? 0;
          availableByGroup.set(key, current + Number(row._sum.quantity ?? 0));
        });

        bulkGroups.forEach((group) => {
          const key = `${group.skuId}::${group.ownerWarehouseId}`;
          const available = availableByGroup.get(key) ?? 0;
          if (available < group.quantity) {
            throw new BadRequestException(
              `Insufficient stock for skuId ${group.skuId} ownerWarehouse ${group.ownerWarehouseId}`,
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

      if (serialIds.length) {
        const warehouseRows = await tx.stockLedger.groupBy({
          by: ['assetId', 'warehouseId'],
          where: {
            warehouseId: { in: ownerWarehouseIds },
            customerWorksiteId: null,
            assetId: { in: serialIds },
          },
          _sum: { quantity: true },
        });
        const onSiteRows = await tx.stockLedger.groupBy({
          by: ['assetId', 'ownerWarehouseId'],
          where: {
            ownerWarehouseId: { in: ownerWarehouseIds },
            movementType: MovementType.ON_SITE,
            assetId: { in: serialIds },
          },
          _sum: { quantity: true },
        });
        const returnedRows = await tx.stockLedger.groupBy({
          by: ['assetId'],
          where: {
            ownerWarehouseId: { in: ownerWarehouseIds },
            movementType: MovementType.IN,
            customerWorksiteId: { not: null },
            assetId: { in: serialIds },
          },
          _sum: { quantity: true },
        });

        const availableByAsset = new Map<string, number>();
        warehouseRows.forEach((row) => {
          if (!row.assetId || !row.warehouseId) return;
          const expectedOwnerWarehouseId = ownerWarehouseByAsset.get(row.assetId);
          if (!expectedOwnerWarehouseId || row.warehouseId !== expectedOwnerWarehouseId) return;
          availableByAsset.set(row.assetId, Number(row._sum.quantity ?? 0));
        });
        onSiteRows.forEach((row) => {
          if (!row.assetId) return;
          const current = availableByAsset.get(row.assetId) ?? 0;
          availableByAsset.set(row.assetId, current - Number(row._sum.quantity ?? 0));
        });
        returnedRows.forEach((row) => {
          if (!row.assetId) return;
          const current = availableByAsset.get(row.assetId) ?? 0;
          availableByAsset.set(row.assetId, current + Number(row._sum.quantity ?? 0));
        });

        serialIds.forEach((assetId) => {
          const available = availableByAsset.get(assetId) ?? 0;
          if (available <= 0) {
            throw new BadRequestException(`Asset ${assetId} is not available in owner warehouse`);
          }
        });
      }

      const ledgerOps = [
        ...bulkGroups.map((group) =>
          tx.stockLedger.create({
            data: {
              movementType: MovementType.ON_SITE,
              warehouseId: null,
              ownerWarehouseId: group.ownerWarehouseId,
              customerWorksiteId: payload.customerWorksiteId,
              refDocumentId: payload.documentId ?? null,
              refDocumentType,
              skuId: group.skuId,
              assetId: null,
              quantity: group.quantity,
              createdBy: userId,
            },
          }),
        ),
        ...serialIds.map((assetId) => {
          const ownerWarehouseId = ownerWarehouseByAsset.get(assetId);
          if (!ownerWarehouseId) {
            throw new BadRequestException(`Asset ${assetId} owner warehouse not found`);
          }
          return tx.stockLedger.create({
            data: {
              movementType: MovementType.ON_SITE,
              warehouseId: null,
              ownerWarehouseId,
              customerWorksiteId: payload.customerWorksiteId,
              refDocumentId: payload.documentId ?? null,
              refDocumentType,
              skuId: null,
              assetId,
              quantity: 1,
              createdBy: userId,
            },
          });
        }),
      ];

      const assetUpdates = serialIds.map((assetId) =>
        tx.asset.update({
          where: { id: assetId },
          data: { warehouseCurrentId: null },
        }),
      );

      const createdLedger = await Promise.all(ledgerOps);
      if (assetUpdates.length) {
        await Promise.all(assetUpdates);
      }

      return createdLedger;
    });

    await this.invalidateInventoryCache({
      customerWorksiteId: payload.customerWorksiteId,
    });
    await Promise.all(
      ownerWarehouseIds.map((ownerWarehouseId) =>
        this.invalidateInventoryCache({ warehouseId: ownerWarehouseId }),
      ),
    );

    return {
      count: created.length,
      ids: created.map((entry) => entry.id),
    };
  }

  async moveIn(payload: CreateInventoryInDto, userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      let refDocumentType: DocumentType | null = null;
      if (payload.documentId) {
        refDocumentType = await this.assertDocumentExists(payload.documentId, tx);
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

      const ledgerOps = [
        ...bulkGroups.map((group) =>
          tx.stockLedger.create({
            data: {
              movementType: MovementType.IN,
              warehouseId: payload.warehouseId,
              customerWorksiteId: payload.customerWorksiteId,
              refDocumentId: payload.documentId ?? null,
              refDocumentType,
              skuId: group.skuId,
              assetId: null,
              ownerWarehouseId: group.ownerWarehouseId,
              quantity: group.quantity,
              createdBy: userId,
            },
          }),
        ),
        ...serialIds.map((assetId) => {
          const ownerWarehouseId = ownerWarehouseByAsset.get(assetId);
          if (!ownerWarehouseId) {
            throw new BadRequestException(`Asset ${assetId} owner warehouse not found`);
          }
          return tx.stockLedger.create({
            data: {
              movementType: MovementType.IN,
              warehouseId: payload.warehouseId,
              customerWorksiteId: payload.customerWorksiteId,
              refDocumentId: payload.documentId ?? null,
              refDocumentType,
              skuId: null,
              assetId,
              ownerWarehouseId,
              quantity: 1,
              createdBy: userId,
            },
          });
        }),
      ];

      const assetUpdates = serialIds.map((assetId) =>
        tx.asset.update({
          where: { id: assetId },
          data: { warehouseCurrentId: payload.warehouseId },
        }),
      );

      const created = await Promise.all(ledgerOps);
      if (assetUpdates.length) {
        await Promise.all(assetUpdates);
      }

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

  async getWarehouseInventory(warehouseId: string, includeZero = false) {
    const cacheKey = `${this.getWarehouseCacheKey(warehouseId)}:${includeZero ? 'include-zero' : 'default'}`;
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
      by: ['skuId', 'ownerWarehouseId'],
      where: {
        warehouseId,
        skuId: { not: null },
      },
      _sum: { quantity: true },
    });
    const bulkOnSiteRows = await this.prisma.stockLedger.groupBy({
      by: ['skuId', 'ownerWarehouseId'],
      where: {
        ownerWarehouseId: warehouseId,
        movementType: MovementType.ON_SITE,
        skuId: { not: null },
      },
      _sum: { quantity: true },
    });
    const bulkWorksiteRows = await this.prisma.stockLedger.groupBy({
      by: ['skuId', 'ownerWarehouseId', 'customerWorksiteId', 'movementType'],
      where: {
        ownerWarehouseId: warehouseId,
        customerWorksiteId: { not: null },
        movementType: { in: [MovementType.ON_SITE, MovementType.IN] },
        skuId: { not: null },
      },
      _sum: { quantity: true },
    });

    const serialRows = await this.prisma.stockLedger.groupBy({
      by: ['assetId'],
      where: {
        warehouseId,
        assetId: { not: null },
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

    const bulkBySkuAndOwner = new Map<string, { skuId: string; ownerWarehouseId: string; quantity: number }>();
    bulkRows.forEach((row) => {
      const rawSkuId = row.skuId as string;
      const skuId = rawSkuId.toLowerCase();
      const ownerWarehouseId = (row.ownerWarehouseId ?? warehouseId).toLowerCase();
      const quantity = Number(row._sum.quantity ?? 0);
      const key = `${skuId}::${ownerWarehouseId}`;
      const existing = bulkBySkuAndOwner.get(key);
      if (existing) {
        existing.quantity += quantity;
        return;
      }
      bulkBySkuAndOwner.set(key, { skuId, ownerWarehouseId, quantity });
    });
    bulkOnSiteRows.forEach((row) => {
      const rawSkuId = row.skuId as string;
      const skuId = rawSkuId.toLowerCase();
      const ownerWarehouseId = (row.ownerWarehouseId ?? warehouseId).toLowerCase();
      const quantity = Number(row._sum.quantity ?? 0);
      const key = `${skuId}::${ownerWarehouseId}`;
      const existing = bulkBySkuAndOwner.get(key);
      if (existing) {
        existing.quantity -= quantity;
        return;
      }
      bulkBySkuAndOwner.set(key, { skuId, ownerWarehouseId, quantity: -quantity });
    });
    const bulkBase = Array.from(bulkBySkuAndOwner.values());

    const worksiteQuantityBySkuAndOwner = new Map<string, Map<string, number>>();
    bulkWorksiteRows.forEach((row) => {
      if (!row.skuId || !row.customerWorksiteId) return;
      const skuId = row.skuId.toLowerCase();
      const ownerWarehouseId = (row.ownerWarehouseId ?? warehouseId).toLowerCase();
      const key = `${skuId}::${ownerWarehouseId}`;
      const locations = worksiteQuantityBySkuAndOwner.get(key) ?? new Map<string, number>();
      const signedQuantity = Number(row._sum.quantity ?? 0)
        * (row.movementType === MovementType.ON_SITE ? 1 : -1);
      locations.set(
        row.customerWorksiteId,
        (locations.get(row.customerWorksiteId) ?? 0) + signedQuantity,
      );
      worksiteQuantityBySkuAndOwner.set(key, locations);
    });

    const customerWorksiteIds = [
      ...new Set(
        bulkWorksiteRows
          .map((row) => row.customerWorksiteId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const customerWorksites = customerWorksiteIds.length
      ? await this.prisma.customerWorksite.findMany({
          where: { id: { in: customerWorksiteIds } },
          select: {
            id: true,
            alias: true,
            customer: { select: { id: true, name: true } },
            worksite: { select: { id: true, name: true } },
          },
        })
      : [];
    const customerWorksiteById = new Map(
      customerWorksites.map((customerWorksite) => [customerWorksite.id, customerWorksite]),
    );
    const worksiteLocationsBySkuAndOwner = new Map<
      string,
      Array<{
        customerWorksiteId: string;
        worksiteId: string | null;
        worksiteName: string;
        customerId: string | null;
        customerName: string | null;
        quantity: number;
      }>
    >();
    worksiteQuantityBySkuAndOwner.forEach((locations, key) => {
      const normalizedLocations = [...locations.entries()]
        .filter(([, quantity]) => quantity > 0)
        .map(([customerWorksiteId, quantity]) => {
          const customerWorksite = customerWorksiteById.get(customerWorksiteId);
          return {
            customerWorksiteId,
            worksiteId: customerWorksite?.worksite.id ?? null,
            worksiteName:
              customerWorksite?.alias?.trim()
              || customerWorksite?.worksite.name
              || 'Obra sin nombre',
            customerId: customerWorksite?.customer.id ?? null,
            customerName: customerWorksite?.customer.name ?? null,
            quantity,
          };
        })
        .sort((a, b) => a.worksiteName.localeCompare(b.worksiteName, 'es'));
      worksiteLocationsBySkuAndOwner.set(key, normalizedLocations);
    });

    const serialByAsset = new Map<string, number>();
    serialRows.forEach((row) => {
      const rawAssetId = row.assetId as string;
      const assetId = rawAssetId.toLowerCase();
      const quantity = Number(row._sum.quantity ?? 0);
      serialByAsset.set(assetId, (serialByAsset.get(assetId) ?? 0) + quantity);
    });
    serialOnSiteRows.forEach((row) => {
      const rawAssetId = row.assetId as string;
      const assetId = rawAssetId.toLowerCase();
      const quantity = Number(row._sum.quantity ?? 0);
      serialByAsset.set(assetId, (serialByAsset.get(assetId) ?? 0) - quantity);
    });
    const serialBase = Array.from(serialByAsset.entries()).map(([assetId, quantity]) => ({
      assetId,
      quantity,
    }));

    const assetIds = [...new Set(serialBase.map((row) => row.assetId))];
    const serialStatusByAssetId = new Map<string, MovementType>();
    if (assetIds.length > 0) {
      const serialLedgerRows = await this.prisma.stockLedger.findMany({
        where: { assetId: { in: assetIds } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { assetId: true, movementType: true },
      });
      serialLedgerRows.forEach((row) => {
        if (!row.assetId) return;
        const key = row.assetId.toLowerCase();
        if (!serialStatusByAssetId.has(key)) {
          serialStatusByAssetId.set(key, row.movementType);
        }
      });
    }

    const assets = assetIds.length
      ? await this.prisma.asset.findMany({
          where: { id: { in: assetIds } },
          select: {
            id: true,
            serialOrEngine: true,
            description: true,
            brand: true,
            model: true,
            skuId: true,
            warehouseOwnerId: true,
            imageFileObjectId: true,
            imageFileObject: { select: { storageKey: true } },
            internalNumber: true,
            weight: true,
          },
        })
      : [];
    const assetsById = new Map(assets.map((asset) => [asset.id.toLowerCase(), asset]));

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
            assetFamily: { select: { id: true, code: true, name: true } },
            price: true,
            subrentalPrice: true,
            replacementValue: true,
            chargeType: true,
            minimumChargeHours: true,
            size: true,
            areaM2: true,
            unitWeight: true,
            active: true,
            createdAt: true,
          },
        })
      : [];
    const skusById = new Map(skus.map((sku) => [sku.id.toLowerCase(), sku]));
    const ownerWarehouseIds = [...new Set(bulkBase.map((row) => row.ownerWarehouseId))];
    const ownerWarehouses = ownerWarehouseIds.length
      ? await this.prisma.warehouse.findMany({
          where: { id: { in: ownerWarehouseIds } },
          select: {
            id: true,
            name: true,
            ownerCompany: { select: { name: true } },
          },
        })
      : [];
    const ownerWarehouseNames = new Map(
      ownerWarehouses.map((warehouse) => [
        warehouse.id.toLowerCase(),
        this.formatOwnerWarehouseLabel(warehouse),
      ]),
    );

    const bulk = bulkBase
      .filter((row) => skusById.get(row.skuId)?.active !== false)
      .map((row) => {
        const sku = skusById.get(row.skuId);
        const worksiteLocations =
          worksiteLocationsBySkuAndOwner.get(`${row.skuId}::${row.ownerWarehouseId}`) ?? [];

        return {
          skuId: row.skuId,
          ownerWarehouseId: row.ownerWarehouseId,
          ownerWarehouseName: ownerWarehouseNames.get(row.ownerWarehouseId) ?? null,
          id: sku?.id ?? row.skuId,
          skuName: sku?.name ?? null,
          name: sku?.name ?? null,
          category: sku?.assetFamily?.name ?? null,
          imageUrl: sku?.imageUrl ?? null,
          imageFileObjectId: sku?.imageFileObjectId ?? null,
          assetFamilyId: sku?.assetFamily?.id ?? null,
          price: sku?.price ?? null,
          subrentalPrice: sku?.subrentalPrice ?? null,
          replacementValue: sku?.replacementValue ?? null,
          chargeType: sku?.chargeType ?? null,
          minimumChargeHours: sku?.minimumChargeHours ?? null,
          size: sku?.size ?? null,
          areaM2: sku?.areaM2 ?? null,
          unitWeight: sku?.unitWeight ?? null,
          active: sku?.active ?? null,
          createdAt: sku?.createdAt ?? null,
          storageLocation: { warehouseId },
          quantity: Math.max(0, row.quantity),
          worksiteQuantity: worksiteLocations.reduce(
            (total, location) => total + location.quantity,
            0,
          ),
          worksiteLocations,
        };
      })
      .sort((a, b) => (a.skuName ?? '').localeCompare(b.skuName ?? ''));

    const serial = serialBase
      .map((row) => {
        const asset = assetsById.get(row.assetId);
        const sku = asset ? skusById.get(asset.skuId) : undefined;
        const assetImageFileObjectId = asset?.imageFileObjectId ?? null;
        const skuImageFileObjectId = sku?.imageFileObjectId ?? null;
        const assetImageUrl = asset?.imageFileObject?.storageKey ?? null;

        return {
          assetId: row.assetId,
          skuId: asset?.skuId ?? null,
          ownerWarehouseId: asset?.warehouseOwnerId ?? null,
          ownerWarehouseName: asset?.warehouseOwnerId
            ? ownerWarehouseNames.get(asset.warehouseOwnerId.toLowerCase()) ?? null
            : null,
          serialOrEngine: asset?.serialOrEngine ?? null,
          description: asset?.description ?? null,
          skuName: sku?.name ?? null,
          chargeType: sku?.chargeType ?? null,
          minimumChargeHours: sku?.minimumChargeHours ?? null,
          size: sku?.size ?? null,
          imageUrl: assetImageUrl ?? sku?.imageUrl ?? null,
          brand: asset?.brand ?? null,
          model: asset?.model ?? null,
          status: this.mapSerialStatus(serialStatusByAssetId.get(row.assetId), row.quantity),
          internalNumber: asset?.internalNumber ?? null,
          assetFamily: sku?.assetFamily ?? null,
          weight: asset?.weight ?? null,
          storageLocation: { warehouseId },
          assetImageFileObjectId,
          skuImageFileObjectId,
          imageFileObjectId: assetImageFileObjectId ?? skuImageFileObjectId ?? null,
          quantity: row.quantity,
        };
      })
      .sort((a, b) => this.compareSerialInventoryRows(a, b));

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
      by: ['skuId', 'ownerWarehouseId'],
      where: {
        customerWorksiteId,
        warehouseId: null,
        skuId: { not: null },
      },
      _sum: { quantity: true },
    });
    const bulkInRows = await this.prisma.stockLedger.groupBy({
      by: ['skuId', 'ownerWarehouseId'],
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

    const bulkOnSiteByGroup = new Map<string, number>();
    bulkOnSiteRows.forEach((row) => {
      const skuId = row.skuId as string;
      const ownerWarehouseId = row.ownerWarehouseId as string;
      const key = `${skuId}::${ownerWarehouseId}`;
      bulkOnSiteByGroup.set(key, Number(row._sum.quantity ?? 0));
    });
    const bulkInByGroup = new Map<string, number>();
    bulkInRows.forEach((row) => {
      const skuId = row.skuId as string;
      const ownerWarehouseId = row.ownerWarehouseId as string;
      const key = `${skuId}::${ownerWarehouseId}`;
      bulkInByGroup.set(key, Number(row._sum.quantity ?? 0));
    });
    const bulkNet = [...new Set([...bulkOnSiteByGroup.keys(), ...bulkInByGroup.keys()])].map(
      (key) => {
        const [skuId, ownerWarehouseId] = key.split('::');
        return {
          skuId,
          ownerWarehouseId,
          quantity: (bulkOnSiteByGroup.get(key) ?? 0) - (bulkInByGroup.get(key) ?? 0),
        };
      },
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
    const serialStatusByAssetId = new Map<string, MovementType>();
    if (assetIds.length > 0) {
      const serialLedgerRows = await this.prisma.stockLedger.findMany({
        where: { assetId: { in: assetIds } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { assetId: true, movementType: true },
      });
      serialLedgerRows.forEach((row) => {
        if (!row.assetId) return;
        if (!serialStatusByAssetId.has(row.assetId)) {
          serialStatusByAssetId.set(row.assetId, row.movementType);
        }
      });
    }

    const assets = assetIds.length
      ? await this.prisma.asset.findMany({
          where: { id: { in: assetIds } },
          select: {
            id: true,
            serialOrEngine: true,
            description: true,
            brand: true,
            model: true,
            skuId: true,
            warehouseOwnerId: true,
            imageFileObjectId: true,
            imageFileObject: { select: { storageKey: true } },
            internalNumber: true,
            weight: true,
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
            price: true,
            subrentalPrice: true,
            replacementValue: true,
            chargeType: true,
            minimumChargeHours: true,
            size: true,
            areaM2: true,
            unitWeight: true,
            assetFamily: { select: { code: true, name: true, controlType: true } },
          },
        })
      : [];
    const skusById = new Map(skus.map((sku) => [sku.id, sku]));
    const ownerWarehouseIds = [...new Set(bulkBase.map((row) => row.ownerWarehouseId))];
    const ownerWarehouses = ownerWarehouseIds.length
      ? await this.prisma.warehouse.findMany({
          where: { id: { in: ownerWarehouseIds } },
          select: {
            id: true,
            name: true,
            ownerCompany: { select: { name: true } },
          },
        })
      : [];
    const ownerWarehouseNames = new Map(
      ownerWarehouses.map((warehouse) => [
        warehouse.id.toLowerCase(),
        this.formatOwnerWarehouseLabel(warehouse),
      ]),
    );

    const bulk = bulkBase
      .map((row) => {
        const sku = skusById.get(row.skuId);

        return {
          skuId: row.skuId,
          ownerWarehouseId: row.ownerWarehouseId,
          ownerWarehouseName: ownerWarehouseNames.get(row.ownerWarehouseId.toLowerCase()) ?? null,
          skuName: sku?.name ?? null,
          category: sku?.assetFamily?.name ?? null,
          controlType: sku?.assetFamily?.controlType ?? null,
          imageUrl: sku?.imageUrl ?? null,
          imageFileObjectId: sku?.imageFileObjectId ?? null,
          price: sku?.price ?? null,
          subrentalPrice: sku?.subrentalPrice ?? null,
          replacementValue: sku?.replacementValue ?? null,
          chargeType: sku?.chargeType ?? null,
          minimumChargeHours: sku?.minimumChargeHours ?? null,
          size: sku?.size ?? null,
          areaM2: sku?.areaM2 ?? null,
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
        const assetImageUrl = asset?.imageFileObject?.storageKey ?? null;

        return {
          assetId: row.assetId,
          skuId: asset?.skuId ?? null,
          ownerWarehouseId: asset?.warehouseOwnerId ?? null,
          ownerWarehouseName: asset?.warehouseOwnerId
            ? ownerWarehouseNames.get(asset.warehouseOwnerId.toLowerCase()) ?? null
            : null,
          serialOrEngine: asset?.serialOrEngine ?? null,
          description: asset?.description ?? null,
          skuName: sku?.name ?? null,
          chargeType: sku?.chargeType ?? null,
          minimumChargeHours: sku?.minimumChargeHours ?? null,
          size: sku?.size ?? null,
          imageUrl: assetImageUrl ?? sku?.imageUrl ?? null,
          brand: asset?.brand ?? null,
          model: asset?.model ?? null,
          status: this.mapSerialStatus(serialStatusByAssetId.get(row.assetId), row.quantity),
          internalNumber: asset?.internalNumber ?? null,
          assetFamily: sku?.assetFamily ? { code: sku.assetFamily.code, name: sku.assetFamily.name } : null,
          weight: asset?.weight ?? null,
          storageLocation: { warehouseId: null },
          assetImageFileObjectId,
          skuImageFileObjectId,
          imageFileObjectId: assetImageFileObjectId ?? skuImageFileObjectId ?? null,
          quantity: row.quantity,
        };
      })
      .sort((a, b) => this.compareSerialInventoryRows(a, b));

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
        document: { select: { id: true, consecutive: true, type: true } },
        creator: {
          select: {
            id: true,
            email: true,
            employee: { select: { name: true, lastName: true } },
          },
        },
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
            price: true,
            subrentalPrice: true,
            replacementValue: true,
            chargeType: true,
            minimumChargeHours: true,
            size: true,
            areaM2: true,
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
            sku: { select: { assetFamily: { select: { code: true, name: true } } } },
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
          price: sku?.price ?? null,
          subrentalPrice: sku?.subrentalPrice ?? null,
          replacementValue: sku?.replacementValue ?? null,
          chargeType: sku?.chargeType ?? null,
          minimumChargeHours: sku?.minimumChargeHours ?? null,
          size: sku?.size ?? null,
          areaM2: sku?.areaM2 ?? null,
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
          assetFamily: asset?.sku?.assetFamily ?? null,
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

  private buildAssetPublicCode(
    assetFamilyCode: string,
    assetSubfamilyCode: string,
    ownerWarehouseId: string,
    internalNumber: number,
  ) {
    return `${assetFamilyCode}-${assetSubfamilyCode}-${ownerWarehouseId.slice(0, 4).toUpperCase()}-${this.padInternalNumber(internalNumber)}`;
  }

  private buildAssetFamilyCode(value: string) {
    return value
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private async resolveAssetSubfamily(
    input: { id?: string; code?: string; name?: string } | undefined,
    assetFamilyId: string,
    tx: Prisma.TransactionClient,
    skuId?: string,
  ) {
    if (!input && skuId) {
      const sku = await tx.sku.findUnique({
        where: { id: skuId },
        select: {
          assetFamilyId: true,
          assetSubfamily: {
            select: { id: true, code: true, active: true },
          },
        },
      });
      if (sku?.assetFamilyId === assetFamilyId && sku.assetSubfamily) {
        if (!sku.assetSubfamily.active) {
          throw new BadRequestException('Asset subfamily is archived');
        }
        return sku.assetSubfamily;
      }
    }

    if (input?.id) {
      const existing = await tx.assetSubfamily.findUnique({
        where: { id: input.id },
        select: { id: true, assetFamilyId: true, code: true, active: true },
      });
      if (!existing || existing.assetFamilyId !== assetFamilyId) {
        throw new BadRequestException('Asset subfamily does not belong to the asset family');
      }
      if (!existing.active) {
        throw new BadRequestException('Asset subfamily is archived');
      }
      return existing;
    }

    const name = input?.name?.trim().toUpperCase() || 'ESTÁNDAR';
    const code = this.buildAssetFamilyCode(input?.code ?? name);
    const existing = await tx.assetSubfamily.findUnique({
      where: { assetFamilyId_code: { assetFamilyId, code } },
      select: { id: true, assetFamilyId: true, code: true, active: true },
    });
    if (existing) {
      if (!existing.active) {
        throw new BadRequestException('Asset subfamily is archived');
      }
      return existing;
    }

    return tx.assetSubfamily.create({
      data: { assetFamilyId, code, name },
      select: { id: true, assetFamilyId: true, code: true, active: true },
    });
  }

  private async upsertProviderPriceIfProvided(
    price: number | undefined,
    ownerWarehouse: { id: string; name: string; type: WarehouseType },
    skuId: string,
    tx: Prisma.TransactionClient,
  ) {
    if (price === undefined) return null;
    if (ownerWarehouse.type !== WarehouseType.ALLY) {
      throw new BadRequestException('El costo proveedor solo aplica a bodegas proveedoras');
    }

    const row = await tx.providerSkuPrice.upsert({
      where: {
        providerWarehouseId_skuId: {
          providerWarehouseId: ownerWarehouse.id,
          skuId,
        },
      },
      create: { providerWarehouseId: ownerWarehouse.id, skuId, price },
      update: { price },
      select: { id: true, providerWarehouseId: true, skuId: true, price: true },
    });
    return { ...row, price: Number(row.price) };
  }

  private async resolveAssetFamily(
    input: { id?: string; code?: string; name?: string },
    controlType: SkuControlType,
    tx: Prisma.TransactionClient,
  ) {
    if (input.id) {
      const existing = await tx.assetFamily.findUnique({
        where: { id: input.id },
        select: { id: true, code: true, controlType: true },
      });
      if (!existing) {
        throw new NotFoundException('Asset family not found');
      }
      if (existing.controlType !== controlType) {
        throw new BadRequestException('Asset family controlType mismatch');
      }
      return existing;
    }

    const name = input.name?.trim();
    const code = input.code ? this.buildAssetFamilyCode(input.code) : name ? this.buildAssetFamilyCode(name) : '';

    if (!name && !code) {
      throw new BadRequestException('Asset family name or code is required');
    }

    if (code) {
      const existingByCode = await tx.assetFamily.findUnique({
        where: { code },
        select: { id: true, code: true, controlType: true },
      });
      if (existingByCode) {
        if (existingByCode.controlType !== controlType) {
          throw new BadRequestException('Asset family controlType mismatch');
        }
        return existingByCode;
      }
    }

    if (name) {
      const existingByName = await tx.assetFamily.findFirst({
        where: { name },
        select: { id: true, code: true, controlType: true },
      });
      if (existingByName) {
        if (existingByName.controlType !== controlType) {
          throw new BadRequestException('Asset family controlType mismatch');
        }
        return existingByName;
      }
    }

    try {
      const created = await tx.assetFamily.create({
        data: {
          code: code || this.buildAssetFamilyCode(name ?? ''),
          name: name ?? code!,
          controlType,
        },
        select: { id: true, code: true, controlType: true },
      });
      return created;
    } catch (error) {
      // If a concurrent request creates the same family, resolve it instead of surfacing 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        if (code) {
          const concurrentByCode = await tx.assetFamily.findUnique({
            where: { code },
            select: { id: true, code: true, controlType: true },
          });
          if (concurrentByCode) {
            if (concurrentByCode.controlType !== controlType) {
              throw new BadRequestException('Asset family controlType mismatch');
            }
            return concurrentByCode;
          }
        }

        if (name) {
          const concurrentByName = await tx.assetFamily.findFirst({
            where: { name },
            select: { id: true, code: true, controlType: true },
          });
          if (concurrentByName) {
            if (concurrentByName.controlType !== controlType) {
              throw new BadRequestException('Asset family controlType mismatch');
            }
            return concurrentByName;
          }
        }

        throw new BadRequestException('Asset family code already exists');
      }
      throw error;
    }
  }

  private async resolveSku(
    input: {
      id?: string;
      name?: string;
      unitWeight?: number;
      price?: number;
      subrentalPrice?: number;
      replacementValue?: number;
      chargeType?: ChargeType;
      minimumChargeHours?: number;
      size?: string;
      lengthMeters?: number;
      closedLengthMeters?: number;
      extendedLengthMeters?: number;
      areaM2?: number;
    },
    assetFamilyId: string,
    tx: Prisma.TransactionClient,
    assetSubfamilyId?: string | null,
  ) {
    if (input.id) {
      const existing = await tx.sku.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          assetFamilyId: true,
          assetSubfamilyId: true,
          active: true,
          chargeType: true,
        },
      });
      if (!existing) {
        throw new NotFoundException('Sku not found');
      }
      if (existing.assetFamilyId !== assetFamilyId) {
        throw new BadRequestException('Sku does not belong to the asset family');
      }
      if (assetSubfamilyId && existing.assetSubfamilyId !== assetSubfamilyId) {
        throw new BadRequestException('Sku does not belong to the asset subfamily');
      }
      if (!existing.active) {
        throw new BadRequestException('Sku is archived');
      }
      const chargeConfig =
        input.chargeType !== undefined
          ? this.resolveChargeConfig(input.chargeType, input.minimumChargeHours)
          : null;
      return tx.sku.update({
        where: { id: existing.id },
        data: {
          price: input.price ?? undefined,
          subrentalPrice: input.subrentalPrice ?? undefined,
          replacementValue: input.replacementValue ?? undefined,
          chargeType: chargeConfig?.chargeType,
          minimumChargeHours: chargeConfig?.minimumChargeHours,
          size: this.resolveSkuSize(input.size) ?? undefined,
          lengthMeters: input.lengthMeters ?? undefined,
          closedLengthMeters: input.closedLengthMeters ?? undefined,
          extendedLengthMeters: input.extendedLengthMeters ?? undefined,
          areaM2: input.areaM2 ?? undefined,
          unitWeight: input.unitWeight ?? undefined,
        },
        select: { id: true },
      });
    }

    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('Sku name is required');
    }

    const chargeConfig = this.resolveChargeConfig(input.chargeType, input.minimumChargeHours);

    return tx.sku.upsert({
      where: {
        assetFamilyId_name: {
          assetFamilyId,
          name,
        },
      },
      create: {
        name,
        assetFamilyId,
        assetSubfamilyId: assetSubfamilyId ?? null,
        price: input.price ?? null,
        subrentalPrice: input.subrentalPrice ?? null,
        replacementValue: input.replacementValue ?? null,
        chargeType: chargeConfig.chargeType,
        minimumChargeHours: chargeConfig.minimumChargeHours,
        size: this.resolveSkuSize(input.size),
        lengthMeters: input.lengthMeters ?? null,
        closedLengthMeters: input.closedLengthMeters ?? null,
        extendedLengthMeters: input.extendedLengthMeters ?? null,
        areaM2: input.areaM2 ?? null,
        unitWeight: input.unitWeight ?? null,
        active: true,
      },
      update: {
        assetSubfamilyId: assetSubfamilyId ?? undefined,
        price: input.price ?? undefined,
        subrentalPrice: input.subrentalPrice ?? undefined,
        replacementValue: input.replacementValue ?? undefined,
        chargeType: chargeConfig.chargeType,
        minimumChargeHours: chargeConfig.minimumChargeHours,
        size: this.resolveSkuSize(input.size) ?? undefined,
        lengthMeters: input.lengthMeters ?? undefined,
        closedLengthMeters: input.closedLengthMeters ?? undefined,
        extendedLengthMeters: input.extendedLengthMeters ?? undefined,
        areaM2: input.areaM2 ?? undefined,
        unitWeight: input.unitWeight ?? undefined,
        active: true,
      },
      select: { id: true },
    });
  }

  private resolveChargeConfig(chargeType?: ChargeType, minimumChargeHours?: number) {
    const resolvedChargeType = chargeType ?? ChargeType.DAY;
    if (resolvedChargeType === ChargeType.HOUR) {
      if (minimumChargeHours == null || minimumChargeHours <= 0) {
        throw new BadRequestException('minimumChargeHours is required when chargeType is HOUR');
      }
      return {
        chargeType: resolvedChargeType,
        minimumChargeHours,
      };
    }
    return {
      chargeType: resolvedChargeType,
      minimumChargeHours: null,
    };
  }

  private resolveSkuSize(size?: string) {
    const normalized = size?.trim().toUpperCase();
    if (!normalized) return null;

    const validSizes = new Set([
      'EXTRA PEQUEÑO',
      'PEQUEÑO',
      'MEDIANO',
      'GRANDE',
      'EXTRA GRANDE',
    ]);
    if (!validSizes.has(normalized)) {
      throw new BadRequestException('Tamaño de SKU invalido');
    }
    return normalized;
  }

  private compareSerialInventoryRows(
    a: { internalNumber?: number | null; serialOrEngine?: string | null },
    b: { internalNumber?: number | null; serialOrEngine?: string | null },
  ) {
    const aNumber = a.internalNumber;
    const bNumber = b.internalNumber;
    if (aNumber != null && bNumber != null && aNumber !== bNumber) {
      return aNumber - bNumber;
    }
    if (aNumber != null && bNumber == null) return -1;
    if (aNumber == null && bNumber != null) return 1;
    return (a.serialOrEngine ?? '').localeCompare(b.serialOrEngine ?? '', 'es', {
      numeric: true,
      sensitivity: 'base',
    });
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

  private mapSerialStatus(movementType: MovementType | undefined, quantity: number) {
    if (movementType === MovementType.TRANSIT) {
      return 'TRANSIT';
    }
    if (movementType === MovementType.OUT || movementType === MovementType.ON_SITE) {
      return 'OUT';
    }
    if (movementType === MovementType.IN || movementType === MovementType.ADJUST) {
      return 'IN';
    }
    return quantity > 0 ? 'IN' : 'OUT';
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
      select: {
        id: true,
        assetFamilyId: true,
        assetSubfamilyId: true,
        assetFamily: { select: { controlType: true, code: true } },
        assetSubfamily: { select: { code: true, active: true } },
      },
    });
    const skuById = new Map(skus.map((sku) => [sku.id, sku]));

    for (const item of payload.items) {
      const sku = skuById.get(item.skuId);
      if (!sku) {
        throw new BadRequestException(`Sku ${item.skuId} not found`);
      }
      if (sku.assetFamily.controlType !== 'SERIAL') {
        throw new BadRequestException(`Sku ${item.skuId} is not SERIAL`);
      }
      if (!sku.assetSubfamilyId || !sku.assetSubfamily) {
        throw new BadRequestException(`Sku ${item.skuId} has no asset subfamily`);
      }
      if (!sku.assetSubfamily.active) {
        throw new BadRequestException(`Sku ${item.skuId} has an archived asset subfamily`);
      }
    }

    const ownerCode = this.sanitizeOwnerName(supplierWarehouse.name);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const createdAssets: Array<{ id: string }> = [];
          const createdLedger: Array<{ id: string }> = [];

          for (const item of payload.items) {
            const sku = skuById.get(item.skuId)!;
            const counter = await tx.assetInternalCounter.upsert({
              where: {
                ownerWarehouseId_assetSubfamilyId: {
                  ownerWarehouseId: supplierWarehouse.id,
                  assetSubfamilyId: sku.assetSubfamilyId!,
                },
              },
              create: {
                ownerWarehouseId: supplierWarehouse.id,
                assetSubfamilyId: sku.assetSubfamilyId!,
                nextNumber: 2,
              },
              update: {
                nextNumber: { increment: 1 },
              },
              select: { nextNumber: true },
            });
            const internalNumber = counter.nextNumber - 1;
            const serialOrEngine = `${ownerCode}-${this.padInternalNumber(internalNumber)}`;

            const asset = await tx.asset.create({
              data: {
                skuId: item.skuId,
                publicCode: this.buildAssetPublicCode(
                  sku.assetFamily.code,
                  sku.assetSubfamily!.code,
                  supplierWarehouse.id,
                  internalNumber,
                ),
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
                ownerWarehouseId: supplierWarehouse.id,
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
