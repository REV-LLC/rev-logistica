import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MovementType, Prisma, SkuControlType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

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

  private buildAssetPublicCode(assetFamilyCode: string, ownerWarehouseId: string, internalNumber: number) {
    return `${assetFamilyCode}-${ownerWarehouseId.slice(0, 4).toUpperCase()}-${this.padInternalNumber(internalNumber)}`;
  }

  async listAssets(params: { serial?: string; search?: string; take?: number; skip?: number }) {
    const where: Prisma.AssetWhereInput = {};

    if (params.serial) {
      where.serialOrEngine = params.serial;
    }

    if (params.search) {
      where.OR = [
        { serialOrEngine: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.serial && params.search) {
      throw new BadRequestException('Use serial or search, not both');
    }

    const items = await this.prisma.asset.findMany({
      where,
      orderBy: { serialOrEngine: 'asc' },
      take: params.take,
      skip: params.skip,
      select: {
        id: true,
        publicCode: true,
        serialOrEngine: true,
        registrationNumber: true,
        description: true,
        brand: true,
        model: true,
        year: true,
        fuel: true,
        skuId: true,
        internalNumber: true,
        warehouseOwnerId: true,
        warehouseCurrentId: true,
        weight: true,
        hourMeter: true,
        imageFileObjectId: true,
        imageFileObject: { select: { storageKey: true } },
        active: true,
        createdAt: true,
        sku: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            price: true,
            subrentalPrice: true,
            replacementValue: true,
            chargeType: true,
            minimumChargeHours: true,
            size: true,
            areaM2: true,
            unitWeight: true,
            assetFamily: { select: { id: true, code: true, name: true, controlType: true } },
          },
        },
        warehouseOwner: {
          select: {
            id: true,
            name: true,
          },
        },
        warehouseCurrent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return items.map((item) => ({
      ...item,
      hourMeter: Number(item.hourMeter),
      currentHourMeter: Number(item.hourMeter),
      imageUrl: item.imageFileObject?.storageKey ?? null,
      sku: item.sku
        ? {
            id: item.sku.id,
            name: item.sku.name,
            imageUrl: item.sku.imageUrl,
            price: item.sku.price,
            subrentalPrice: item.sku.subrentalPrice,
            replacementValue: item.sku.replacementValue,
            chargeType: item.sku.chargeType,
            minimumChargeHours: item.sku.minimumChargeHours,
            size: item.sku.size,
            areaM2: item.sku.areaM2,
            unitWeight: item.sku.unitWeight,
            controlType: item.sku.assetFamily?.controlType ?? null,
          }
        : item.sku,
    }));
  }

  async listAssetFamilies(params?: { controlType?: SkuControlType }) {
    return this.prisma.assetFamily.findMany({
      where: params?.controlType ? { controlType: params.controlType } : undefined,
      select: {
        id: true,
        code: true,
        name: true,
        controlType: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getAssetById(assetId: string) {
    const item = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        publicCode: true,
        serialOrEngine: true,
        registrationNumber: true,
        description: true,
        brand: true,
        model: true,
        year: true,
        fuel: true,
        skuId: true,
        internalNumber: true,
        warehouseOwnerId: true,
        warehouseCurrentId: true,
        weight: true,
        hourMeter: true,
        imageFileObjectId: true,
        imageFileObject: { select: { storageKey: true } },
        active: true,
        createdAt: true,
        sku: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            price: true,
            subrentalPrice: true,
            replacementValue: true,
            chargeType: true,
            minimumChargeHours: true,
            size: true,
            areaM2: true,
            unitWeight: true,
            assetFamily: { select: { id: true, code: true, name: true, controlType: true } },
          },
        },
        warehouseOwner: {
          select: {
            id: true,
            name: true,
          },
        },
        warehouseCurrent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Asset not found');
    }

    return {
      ...item,
      hourMeter: Number(item.hourMeter),
      currentHourMeter: Number(item.hourMeter),
      imageUrl: item.imageFileObject?.storageKey ?? null,
      assetFamily: item.sku?.assetFamily
        ? {
            id: item.sku.assetFamily.id,
            code: item.sku.assetFamily.code,
            name: item.sku.assetFamily.name,
            controlType: item.sku.assetFamily.controlType,
          }
        : null,
      sku: item.sku
        ? {
            id: item.sku.id,
            name: item.sku.name,
            imageUrl: item.sku.imageUrl,
            price: item.sku.price,
            subrentalPrice: item.sku.subrentalPrice,
            replacementValue: item.sku.replacementValue,
            chargeType: item.sku.chargeType,
            minimumChargeHours: item.sku.minimumChargeHours,
            size: item.sku.size,
            areaM2: item.sku.areaM2,
            unitWeight: item.sku.unitWeight,
            controlType: item.sku.assetFamily?.controlType ?? null,
          }
        : item.sku,
    };
  }

  async createAsset(payload: {
    skuId: string;
    warehouseOwnerId: string;
    warehouseCurrentId?: string;
    serialOrEngine?: string;
    registrationNumber?: string;
    description?: string;
    brand?: string;
    model?: string;
    year?: number;
    fuel?: string;
    weight?: number;
    active?: boolean;
    hourMeter?: number;
  }, userId: string) {
    const sku = await this.prisma.sku.findUnique({
      where: { id: payload.skuId },
      select: {
        id: true,
        assetFamilyId: true,
        assetFamily: { select: { code: true, controlType: true } },
      },
    });

    if (!sku) {
      throw new NotFoundException('Sku not found');
    }

    if (sku.assetFamily.controlType !== 'SERIAL') {
      throw new BadRequestException('Sku must be SERIAL');
    }

    if (!sku.assetFamilyId) {
      throw new BadRequestException('Sku has no asset family');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const warehouseOwner = await tx.warehouse.findUnique({
          where: { id: payload.warehouseOwnerId },
          select: { id: true, name: true },
        });

        if (!warehouseOwner) {
          throw new NotFoundException('Owner warehouse not found');
        }

        const warehouseCurrentId = payload.warehouseCurrentId ?? payload.warehouseOwnerId;

        if (warehouseCurrentId !== payload.warehouseOwnerId) {
          const currentWarehouse = await tx.warehouse.findUnique({
            where: { id: warehouseCurrentId },
            select: { id: true },
          });
          if (!currentWarehouse) {
            throw new NotFoundException('Current warehouse not found');
          }
        }

        const counter = await tx.assetInternalCounter.upsert({
          where: {
            ownerWarehouseId_assetFamilyId: {
              ownerWarehouseId: payload.warehouseOwnerId,
              assetFamilyId: sku.assetFamilyId,
            },
          },
          create: {
            ownerWarehouseId: payload.warehouseOwnerId,
            assetFamilyId: sku.assetFamilyId,
            nextNumber: 2,
          },
          update: {
            nextNumber: { increment: 1 },
          },
          select: { nextNumber: true },
        });

        const internalNumber = counter.nextNumber - 1;
        const serialOrEngine =
          payload.serialOrEngine?.trim() ||
          `${this.sanitizeOwnerName(warehouseOwner.name)}-${this.padInternalNumber(internalNumber)}`;

        const createdAsset = await tx.asset.create({
          data: {
            skuId: payload.skuId,
            publicCode: this.buildAssetPublicCode(
              sku.assetFamily.code,
              payload.warehouseOwnerId,
              internalNumber,
            ),
            internalNumber,
            serialOrEngine,
            registrationNumber: payload.registrationNumber?.trim().toUpperCase() || null,
            description: payload.description ?? null,
            brand: payload.brand ?? null,
            model: payload.model ?? null,
            year: payload.year ?? null,
            fuel: payload.fuel ?? null,
            warehouseOwnerId: payload.warehouseOwnerId,
            warehouseCurrentId,
            weight: payload.weight ?? null,
            hourMeter: payload.hourMeter ?? 0,
            active: payload.active ?? true,
          },
        });

        await tx.stockLedger.create({
          data: {
            movementType: MovementType.ADJUST,
            warehouseId: warehouseCurrentId,
            customerWorksiteId: null,
            skuId: null,
            assetId: createdAsset.id,
            ownerWarehouseId: payload.warehouseOwnerId,
            quantity: 1,
            createdBy: userId,
          },
        });

        if (payload.hourMeter !== undefined) {
          await tx.assetHourReading.create({
            data: {
              assetId: createdAsset.id,
              hours: payload.hourMeter,
              note: 'LECTURA INICIAL',
              recordedByUserId: userId,
            },
          });
        }

        return createdAsset;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Asset serial already exists');
      }
      throw error;
    }
  }

  async updateAsset(
    assetId: string,
    payload: {
      description?: string | null;
      registrationNumber?: string | null;
      brand?: string | null;
      model?: string | null;
      year?: number | null;
      fuel?: string | null;
      warehouseCurrentId?: string | null;
      weight?: number | null;
      imageFileObjectId?: string | null;
      active?: boolean;
      hourMeter?: number;
    },
    userId: string,
  ) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (payload.warehouseCurrentId != null) {
      const warehouse = await this.prisma.warehouse.findUnique({
        where: { id: payload.warehouseCurrentId },
        select: { id: true },
      });
      if (!warehouse) {
        throw new NotFoundException('Current warehouse not found');
      }
    }

    if (payload.imageFileObjectId != null) {
      const imageFile = await this.prisma.fileObject.findFirst({
        where: {
          id: payload.imageFileObjectId,
          entityType: 'ASSET',
          entityId: assetId,
          mimeType: { startsWith: 'image/' },
        },
        select: { id: true },
      });
      if (!imageFile) {
        throw new BadRequestException('Asset image file not found');
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        if (payload.hourMeter !== undefined) {
          const current = await tx.asset.findUniqueOrThrow({
            where: { id: assetId },
            select: { hourMeter: true },
          });
          if (payload.hourMeter < Number(current.hourMeter)) {
            throw new BadRequestException(
              `El horómetro no puede disminuir de ${current.hourMeter.toString()} horas`,
            );
          }
          if (payload.hourMeter > Number(current.hourMeter)) {
            await tx.assetHourReading.create({
              data: {
                assetId,
                hours: payload.hourMeter,
                note: 'ACTUALIZACIÓN DESDE FICHA DEL ACTIVO',
                recordedByUserId: userId,
              },
            });
          }
        }

        await tx.asset.update({
          where: { id: assetId },
          data: {
            description: Object.prototype.hasOwnProperty.call(payload, 'description')
              ? payload.description
              : undefined,
            registrationNumber: Object.prototype.hasOwnProperty.call(payload, 'registrationNumber')
              ? payload.registrationNumber?.trim().toUpperCase() || null
              : undefined,
            brand: Object.prototype.hasOwnProperty.call(payload, 'brand') ? payload.brand : undefined,
            model: Object.prototype.hasOwnProperty.call(payload, 'model') ? payload.model : undefined,
            year: Object.prototype.hasOwnProperty.call(payload, 'year') ? payload.year : undefined,
            fuel: Object.prototype.hasOwnProperty.call(payload, 'fuel') ? payload.fuel : undefined,
            warehouseCurrentId: Object.prototype.hasOwnProperty.call(payload, 'warehouseCurrentId')
              ? payload.warehouseCurrentId
              : undefined,
            weight: Object.prototype.hasOwnProperty.call(payload, 'weight') ? payload.weight : undefined,
            imageFileObjectId: Object.prototype.hasOwnProperty.call(payload, 'imageFileObjectId')
              ? payload.imageFileObjectId
              : undefined,
            hourMeter: payload.hourMeter,
            active: payload.active,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('El numero de registro ya esta asignado a otro activo');
      }
      throw error;
    }

    return this.getAssetById(assetId);
  }

  async deleteAsset(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        documentItems: { select: { id: true }, take: 1 },
        taskAssets: { select: { id: true }, take: 1 },
      },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.documentItems.length > 0) {
      throw new BadRequestException('No se puede eliminar un activo usado en documentos');
    }

    if (asset.taskAssets.length > 0) {
      throw new BadRequestException('No se puede eliminar un activo asociado a tareas');
    }

    return this.prisma.$transaction(async (tx) => {
      const maintenanceItems = await tx.maintenanceItem.findMany({
        where: { plan: { assetId } }, select: { id: true },
      });
      await tx.notificationTopic.deleteMany({
        where: { entityType: 'MAINTENANCE_ITEM', entityId: { in: maintenanceItems.map((item) => item.id) } },
      });
      await tx.stockLedger.deleteMany({ where: { assetId } });
      return tx.asset.delete({ where: { id: assetId } });
    });
  }

  async getAssetLocation(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, warehouseCurrentId: true },
    });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.warehouseCurrentId) {
      const warehouse = await this.prisma.warehouse.findUnique({
        where: { id: asset.warehouseCurrentId },
        select: { id: true, name: true },
      });
      return {
        assetId,
        locationType: 'WAREHOUSE',
        warehouse,
        customerWorksite: null,
      };
    }

    const lastLedger = await this.prisma.stockLedger.findFirst({
      where: { assetId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        movementType: true,
        warehouse: { select: { id: true, name: true } },
        customerWorksite: {
          select: {
            id: true,
            customer: { select: { id: true, name: true } },
            worksite: { select: { id: true, name: true } },
          },
        },
        createdAt: true,
      },
    });

    if (!lastLedger) {
      return {
        assetId,
        locationType: 'UNKNOWN',
        warehouse: null,
        customerWorksite: null,
      };
    }

    if (lastLedger.customerWorksite) {
      return {
        assetId,
        locationType: 'CUSTOMER_WORKSITE',
        warehouse: null,
        customerWorksite: lastLedger.customerWorksite,
      };
    }

    if (lastLedger.warehouse) {
      return {
        assetId,
        locationType: 'WAREHOUSE',
        warehouse: lastLedger.warehouse,
        customerWorksite: null,
      };
    }

    return {
      assetId,
      locationType: 'IN_TRANSIT',
      warehouse: null,
      customerWorksite: null,
    };
  }
}
