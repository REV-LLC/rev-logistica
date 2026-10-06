import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import {
  AssetKind,
  MovementType,
  Prisma,
  SkuControlType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveLatestSerializedMovements } from '../inventory/serialized-ledger-location';
import { serializedBalanceConsistency } from '../inventory/serialized-balance-consistency';
import {
  getCanonicalJackReference,
  isCanonicalJackSubfamily,
  isJackIdentity,
} from '../inventory/jack-catalog';

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

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

  private buildAssetSubfamilyCode(value: string) {
    return value
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  async listAssets(params: { serial?: string; search?: string; take?: number; skip?: number }) {
    const where: Prisma.AssetWhereInput = { deletedAt: null };

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
        deletedAt: true,
        deletionReason: true,
        isDamaged: true,
        damageNote: true,
        deletedByUserId: true,
        kind: true,
        motorPowerHp: true,
        motorConfiguration: true,
        assignedMotorId: true,
        assignedMotor: {
          select: {
            id: true,
            internalNumber: true,
            publicCode: true,
            description: true,
            serialOrEngine: true,
            brand: true,
            model: true,
            fuel: true,
            isDamaged: true,
            damageNote: true,
            sku: { select: { name: true } },
          },
        },
        assignedToMixer: { select: { id: true } },
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
            assetSubfamily: { select: { id: true, code: true, name: true } },
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
            assetSubfamily: item.sku.assetSubfamily,
          }
        : item.sku,
    }));
  }

  async listAssetFamilies(params?: { controlType?: SkuControlType }) {
    const families = await this.prisma.assetFamily.findMany({
      where: params?.controlType ? { controlType: params.controlType } : undefined,
      select: {
        id: true,
        code: true,
        name: true,
        controlType: true,
        bulkKitsEnabled: true,
        bulkKitPrefix: true,
        bulkKitSettingsVersion: true,
        subfamilies: {
          where: { active: true },
          select: {
            id: true,
            code: true,
            name: true,
            active: true,
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    const naturalNameOrder = new Intl.Collator('es', {
      numeric: true,
      sensitivity: 'base',
    });
    return families.map((family) => ({
      ...family,
      subfamilies: [...family.subfamilies].sort((left, right) =>
        naturalNameOrder.compare(left.name, right.name),
      ),
    }));
  }

  async createAssetSubfamily(
    assetFamilyId: string,
    payload: { name: string; code?: string },
  ) {
    const assetFamily = await this.prisma.assetFamily.findUnique({
      where: { id: assetFamilyId },
      select: { id: true, code: true, controlType: true },
    });
    if (!assetFamily) {
      throw new NotFoundException('Asset family not found');
    }
    let name = payload.name.trim().toUpperCase();
    let code = this.buildAssetSubfamilyCode(payload.code ?? name);
    if (!name || !code) {
      throw new BadRequestException('Asset subfamily name is required');
    }
    if (
      assetFamily.code === 'ENCOFRADO' &&
      (isJackIdentity(name) ||
        isJackIdentity(code) ||
        getCanonicalJackReference(name) ||
        getCanonicalJackReference(code))
    ) {
      if (!isCanonicalJackSubfamily(code) && !isCanonicalJackSubfamily(name)) {
        throw new BadRequestException(
          'La subfamilia válida es GATO. Extra corto, corto, mediano, largo y extra largo son referencias.',
        );
      }
      name = 'GATO';
      code = 'GATO';
    }

    try {
      return await this.prisma.assetSubfamily.create({
        data: { assetFamilyId, name, code },
        select: {
          id: true,
          assetFamilyId: true,
          code: true,
          name: true,
          active: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Asset subfamily already exists');
      }
      throw error;
    }
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
        deletedAt: true,
        deletionReason: true,
        isDamaged: true,
        damageNote: true,
        deletedByUserId: true,
        conditionEvents: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, isDamaged: true, note: true, createdAt: true,
            changedBy: { select: { email: true, employee: { select: { name: true, lastName: true } } } },
          },
        },
        deletedBy: {
          select: {
            id: true,
            email: true,
            employee: { select: { name: true, lastName: true } },
          },
        },
        kind: true,
        motorPowerHp: true,
        motorConfiguration: true,
        assignedMotorId: true,
        assignedMotor: {
          select: {
            id: true,
            internalNumber: true,
            publicCode: true,
            description: true,
            serialOrEngine: true,
            brand: true,
            model: true,
            fuel: true,
            isDamaged: true,
            damageNote: true,
            sku: { select: { name: true } },
          },
        },
        assignedToMixer: { select: { id: true } },
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
            assetSubfamily: { select: { id: true, code: true, name: true } },
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
            assetSubfamily: item.sku.assetSubfamily,
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
        assetSubfamilyId: true,
        assetSubfamily: { select: { code: true, active: true } },
      },
    });

    if (!sku) {
      throw new NotFoundException('Sku not found');
    }

    if (sku.assetFamily.controlType !== 'SERIAL') {
      throw new BadRequestException('Sku must be SERIAL');
    }

    if (!sku.assetSubfamilyId || !sku.assetSubfamily) {
      throw new BadRequestException('Serial SKU has no asset subfamily');
    }
    if (!sku.assetSubfamily.active) {
      throw new BadRequestException('Asset subfamily is archived');
    }
    const assetSubfamilyId = sku.assetSubfamilyId;
    const assetSubfamilyCode = sku.assetSubfamily.code;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const warehouseOwner = await tx.warehouse.findUnique({
          where: { id: payload.warehouseOwnerId },
          select: { id: true, name: true, type: true },
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
            ownerWarehouseId_assetSubfamilyId: {
              ownerWarehouseId: payload.warehouseOwnerId,
              assetSubfamilyId,
            },
          },
          create: {
            ownerWarehouseId: payload.warehouseOwnerId,
            assetSubfamilyId,
            nextNumber: 2,
          },
          update: {
            nextNumber: { increment: 1 },
          },
          select: { nextNumber: true },
        });

        const internalNumber = counter.nextNumber - 1;
        const serialOrEngine = payload.serialOrEngine?.trim() || null;

        const createdAsset = await tx.asset.create({
          data: {
            skuId: payload.skuId,
            publicCode: this.buildAssetPublicCode(
              sku.assetFamily.code,
              assetSubfamilyCode,
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
            isOpeningBalance: true,
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
      select: { id: true, kind: true },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.kind === 'MOTOR' && ['brand', 'model', 'fuel', 'description'].some(key => Object.prototype.hasOwnProperty.call(payload, key)))
      throw new BadRequestException('Edita los datos del motor desde su modal para conservar descripción, compatibilidad e historial.');

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
        if (payload.active === false) {
          await this.assertNoAssignedAccessories(tx, assetId);
        }
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
                previousHours: current.hourMeter,
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

  async updateAssetCondition(
    assetId: string,
    payload: { isDamaged: boolean; note: string; expectedParentAssetId?: string },
    userId: string,
  ) {
    const note = payload.note?.trim();
    if (typeof payload.isDamaged !== 'boolean' || !note || note.length > 2000) {
      throw new BadRequestException('Describe la avería o la reparación (máximo 2000 caracteres).');
    }
    const cacheKeys = await this.prisma.$transaction(async (tx) => {
      if (payload.expectedParentAssetId) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended('equipment-configuration', 0))::text`;
        const parent = await tx.asset.findUnique({
          where: { id: payload.expectedParentAssetId },
          select: { assignedMotorId: true, deletedAt: true },
        });
        if (!parent || parent.deletedAt || parent.assignedMotorId !== assetId) {
          throw new BadRequestException('El motor asignado cambió. Actualiza el equipo antes de registrar la avería o reparación.');
        }
      }
      const asset = await tx.asset.findUnique({
        where: { id: assetId },
        select: { id: true, isDamaged: true, deletedAt: true, warehouseCurrentId: true, warehouseOwnerId: true },
      });
      if (!asset) throw new NotFoundException('Equipo no encontrado');
      if (asset.deletedAt) throw new BadRequestException('No se puede cambiar el estado de un equipo eliminado.');
      if (asset.isDamaged === payload.isDamaged) {
        throw new BadRequestException(payload.isDamaged ? 'El equipo ya está averiado.' : 'El equipo ya está operativo.');
      }
      await tx.asset.update({
        where: { id: assetId },
        data: { isDamaged: payload.isDamaged, damageNote: payload.isDamaged ? note : null },
      });
      await tx.assetConditionEvent.create({
        data: { assetId, isDamaged: payload.isDamaged, note, changedByUserId: userId },
      });
      const worksites = await tx.stockLedger.findMany({
        where: { assetId, customerWorksiteId: { not: null } },
        distinct: ['customerWorksiteId'],
        select: { customerWorksiteId: true },
      });
      const warehouseKeys = [asset.warehouseCurrentId, asset.warehouseOwnerId]
        .filter((id): id is string => Boolean(id))
        .flatMap((id) => [`inventory:warehouse:${id}`, `inventory:warehouse:${id}:default`, `inventory:warehouse:${id}:include-zero`]);
      return [...warehouseKeys, ...worksites.map((row) => `inventory:on-site:${row.customerWorksiteId}`)];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await Promise.all([...new Set(cacheKeys)].map((key) => this.cacheManager.del(key)));
    return this.getAssetById(assetId);
  }

  private async assertNoAssignedAccessories(tx: Prisma.TransactionClient, assetId: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('equipment-configuration', 0))::text`;
    const [motorState] = await tx.$queryRaw<Array<{ assignedMotorId: string | null; isAssignedMotor: boolean }>>`SELECT a."assignedMotorId",
      EXISTS (SELECT 1 FROM "Asset" parent WHERE parent."assignedMotorId" = a.id) AS "isAssignedMotor"
      FROM "Asset" a WHERE a.id = ${assetId} FOR UPDATE`;
    if (motorState?.assignedMotorId || motorState?.isAssignedMotor)
      throw new BadRequestException('Desasigna el motor desde el botón Motor de la ficha antes de desactivar o dar de baja el equipo. Así queda registrado el historial.');
    const assigned = await tx.accessoryBalance.count({ where: { assetId, quantity: { gt: 0 } } });
    if (assigned) throw new BadRequestException('Devuelve o traslada los accesorios asignados antes de desactivar o eliminar el equipo.');
  }

  async deleteAsset(assetId: string, reason: string, userId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        active: true,
        deletedAt: true,
        warehouseCurrentId: true,
        assignedMotorId: true,
        assignedToMixer: { select: { id: true } },
      },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.deletedAt) {
      throw new BadRequestException('El equipo ya fue eliminado');
    }
    if (!asset.warehouseCurrentId) {
      throw new BadRequestException(
        'El equipo debe estar devuelto a una bodega antes de eliminarlo',
      );
    }

    const normalizedReason = reason.trim();
    const result = await this.prisma.$transaction(async (tx) => {
      await this.assertNoAssignedAccessories(tx, assetId);
      const maintenanceItems = await tx.maintenanceItem.findMany({
        where: { plan: { assetId } },
        select: { id: true },
      });
      await tx.maintenancePlan.updateMany({
        where: { assetId, active: true },
        data: { active: false },
      });
      if (maintenanceItems.length) {
        await tx.notificationTopic.updateMany({
          where: {
            entityType: 'MAINTENANCE_ITEM',
            entityId: { in: maintenanceItems.map((item) => item.id) },
          },
          data: { active: false },
        });
      }
      return tx.asset.update({
        where: { id: assetId },
        data: {
          active: false,
          deletedAt: new Date(),
          deletedByUserId: userId,
          deletionReason: normalizedReason,
          warehouseCurrentId: null,
        },
        select: {
          id: true,
          active: true,
          deletedAt: true,
          deletedByUserId: true,
          deletionReason: true,
        },
      });
    });
    if (asset.warehouseCurrentId) {
      const baseKey = `inventory:warehouse:${asset.warehouseCurrentId}`;
      await Promise.all([
        this.cacheManager.del(baseKey),
        this.cacheManager.del(`${baseKey}:default`),
        this.cacheManager.del(`${baseKey}:include-zero`),
      ]);
    }
    return result;
  }

  async getAssetLocation(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, warehouseOwnerId: true, warehouseOwner: { select: { type: true } } },
    });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    const ledgerRows = await this.prisma.stockLedger.findMany({
      where: { assetId },
      orderBy: [{ isOpeningBalance: 'asc' }, { effectiveAt: 'desc' }, { appendOrder: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        appendOrder: true,
        assetId: true,
        ownerWarehouseId: true,
        warehouseId: true,
        customerWorksiteId: true,
        refDocumentId: true,
        refDocumentType: true,
        quantity: true,
        isOpeningBalance: true,
        movementType: true,
        warehouse: { select: { id: true, name: true } },
        customerWorksite: {
          select: {
            id: true,
            customer: { select: { id: true, name: true } },
            worksite: { select: { id: true, name: true } },
          },
        },
        effectiveAt: true,
        createdAt: true,
      },
    });
    const lastLedger = resolveLatestSerializedMovements(ledgerRows).get(asset.id)?.locationMovement;
    const balance = asset.warehouseOwner?.type === 'OWN'
      // The card reports the physical location, not stock only at its owner's warehouse.
      ? serializedBalanceConsistency(ledgerRows, lastLedger?.warehouseId ?? asset.warehouseOwnerId, lastLedger)
      : undefined;
    if (balance && !balance.isConsistent) {
      return {
        assetId,
        locationType: balance.issue === 'NO_MOVEMENTS' ? 'UNKNOWN' : 'INCONSISTENT',
        warehouse: null, customerWorksite: null, balance,
      };
    }

    if (!lastLedger) {
      return {
        assetId,
        locationType: 'UNKNOWN',
        warehouse: null,
        customerWorksite: null,
      };
    }

    if (
      (lastLedger.movementType === MovementType.OUT
        || lastLedger.movementType === MovementType.ON_SITE)
      && lastLedger.customerWorksite
    ) {
      return {
        assetId,
        locationType: 'CUSTOMER_WORKSITE',
        ...(balance ? { balance } : {}),
        warehouse: null,
        customerWorksite: lastLedger.customerWorksite,
      };
    }

    if (
      (lastLedger.movementType === MovementType.IN
        || lastLedger.movementType === MovementType.ADJUST)
      && Number(lastLedger.quantity) > 0
      && lastLedger.warehouse
    ) {
      return {
        assetId,
        locationType: 'WAREHOUSE',
        ...(balance ? { balance } : {}),
        warehouse: lastLedger.warehouse,
        customerWorksite: null,
      };
    }

    return {
      assetId,
      locationType: lastLedger.movementType === MovementType.TRANSIT ? 'IN_TRANSIT' : 'UNKNOWN',
      warehouse: null,
      customerWorksite: null,
    };
  }
}
