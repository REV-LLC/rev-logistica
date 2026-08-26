import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import {
  AssetKind,
  AssetMotorConfiguration,
  MovementType,
  Prisma,
  SkuControlType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
        deletedByUserId: true,
        kind: true,
        motorConfiguration: true,
        assignedMotorId: true,
        assignedMotor: {
          select: {
            id: true,
            internalNumber: true,
            serialOrEngine: true,
            brand: true,
            model: true,
            fuel: true,
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
    return this.prisma.assetFamily.findMany({
      where: params?.controlType ? { controlType: params.controlType } : undefined,
      select: {
        id: true,
        code: true,
        name: true,
        controlType: true,
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
  }

  private componentRuleSelect() {
    return {
      id: true,
      parentAssetFamilyId: true,
      componentAssetFamilyId: true,
      required: true,
      minimumQuantity: true,
      maximumQuantity: true,
      sortOrder: true,
      active: true,
      parentAssetFamily: {
        select: { id: true, code: true, name: true, controlType: true },
      },
      componentAssetFamily: {
        select: { id: true, code: true, name: true, controlType: true },
      },
    } as const;
  }

  listAssetFamilyComponents() {
    return this.prisma.assetFamilyComponent.findMany({
      select: this.componentRuleSelect(),
      orderBy: [
        { parentAssetFamily: { name: 'asc' } },
        { sortOrder: 'asc' },
        { componentAssetFamily: { name: 'asc' } },
      ],
    });
  }

  private validateComponentQuantities(payload: {
    required?: boolean;
    minimumQuantity?: number;
    maximumQuantity?: number | null;
  }) {
    const minimum = payload.minimumQuantity ?? (payload.required ? 1 : 0);
    if (payload.maximumQuantity != null && payload.maximumQuantity < minimum) {
      throw new BadRequestException(
        'maximumQuantity must be greater than or equal to minimumQuantity',
      );
    }
    return minimum;
  }

  async createAssetFamilyComponent(
    parentAssetFamilyId: string,
    payload: {
      componentAssetFamilyId: string;
      required?: boolean;
      minimumQuantity?: number;
      maximumQuantity?: number | null;
      sortOrder?: number;
      active?: boolean;
    },
  ) {
    if (parentAssetFamilyId === payload.componentAssetFamilyId) {
      throw new BadRequestException('A family cannot be its own component');
    }
    const familyCount = await this.prisma.assetFamily.count({
      where: { id: { in: [parentAssetFamilyId, payload.componentAssetFamilyId] } },
    });
    if (familyCount !== 2) {
      throw new NotFoundException('Parent or component asset family not found');
    }
    const minimumQuantity = this.validateComponentQuantities(payload);
    try {
      return await this.prisma.assetFamilyComponent.create({
        data: { ...payload, parentAssetFamilyId, minimumQuantity },
        select: this.componentRuleSelect(),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('This component relationship already exists');
      }
      throw error;
    }
  }

  async updateAssetFamilyComponent(
    componentRuleId: string,
    payload: {
      componentAssetFamilyId: string;
      required?: boolean;
      minimumQuantity?: number;
      maximumQuantity?: number | null;
      sortOrder?: number;
      active?: boolean;
    },
  ) {
    const existing = await this.prisma.assetFamilyComponent.findUnique({
      where: { id: componentRuleId },
    });
    if (!existing) throw new NotFoundException('Component relationship not found');
    if (existing.parentAssetFamilyId === payload.componentAssetFamilyId) {
      throw new BadRequestException('A family cannot be its own component');
    }
    const minimumQuantity = this.validateComponentQuantities({
      ...payload,
      minimumQuantity: payload.minimumQuantity ?? existing.minimumQuantity,
      maximumQuantity:
        payload.maximumQuantity === undefined
          ? existing.maximumQuantity
          : payload.maximumQuantity,
    });
    return this.prisma.assetFamilyComponent.update({
      where: { id: componentRuleId },
      data: { ...payload, minimumQuantity },
      select: this.componentRuleSelect(),
    });
  }

  async deleteAssetFamilyComponent(componentRuleId: string) {
    const result = await this.prisma.assetFamilyComponent.deleteMany({
      where: { id: componentRuleId },
    });
    if (!result.count) throw new NotFoundException('Component relationship not found');
    return { deleted: true };
  }

  async getAssetComponentOptions(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        sku: {
          select: {
            assetFamilyId: true,
            assetFamily: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    const components = await this.prisma.assetFamilyComponent.findMany({
      where: { parentAssetFamilyId: asset.sku.assetFamilyId, active: true },
      select: this.componentRuleSelect(),
      orderBy: [{ sortOrder: 'asc' }, { componentAssetFamily: { name: 'asc' } }],
    });
    return {
      assetId: asset.id,
      assetFamily: asset.sku.assetFamily,
      components: components.map((rule) => ({
        id: rule.id,
        family: rule.componentAssetFamily,
        required: rule.required,
        minimumQuantity: rule.minimumQuantity,
        maximumQuantity: rule.maximumQuantity,
        sortOrder: rule.sortOrder,
      })),
    };
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
        deletedByUserId: true,
        deletedBy: {
          select: {
            id: true,
            email: true,
            employee: { select: { name: true, lastName: true } },
          },
        },
        kind: true,
        motorConfiguration: true,
        assignedMotorId: true,
        assignedMotor: {
          select: {
            id: true,
            internalNumber: true,
            serialOrEngine: true,
            brand: true,
            model: true,
            fuel: true,
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

  async assignMotor(assetId: string, motorId: string) {
    if (assetId === motorId) {
      throw new BadRequestException('Un equipo no puede ser su propio motor');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const [mixer, motor] = await Promise.all([
        tx.asset.findUnique({
          where: { id: assetId },
          select: {
            id: true,
            kind: true,
            motorConfiguration: true,
            warehouseCurrentId: true,
          },
        }),
        tx.asset.findUnique({
          where: { id: motorId },
          select: {
            id: true,
            kind: true,
            active: true,
            warehouseCurrentId: true,
            assignedToMixer: { select: { id: true } },
          },
        }),
      ]);

      if (!mixer) throw new NotFoundException('Mezcladora no encontrada');
      if (mixer.kind === AssetKind.MOTOR) {
        throw new BadRequestException('Un motor no puede tener otro motor asociado');
      }
      if (mixer.motorConfiguration !== AssetMotorConfiguration.INTERCHANGEABLE) {
        throw new BadRequestException('Este equipo no usa motor intercambiable');
      }
      if (!motor || motor.kind !== AssetKind.MOTOR || !motor.active) {
        throw new BadRequestException('El motor seleccionado no está disponible');
      }
      if (!mixer.warehouseCurrentId || motor.warehouseCurrentId !== mixer.warehouseCurrentId) {
        throw new BadRequestException('La mezcladora y el motor deben estar en la misma bodega');
      }
      if (motor.assignedToMixer && motor.assignedToMixer.id !== mixer.id) {
        throw new BadRequestException('El motor ya está asignado a otra mezcladora');
      }

      return tx.asset.update({
        where: { id: mixer.id },
        data: { assignedMotorId: motor.id },
        select: {
          id: true,
          assignedMotorId: true,
          warehouseCurrentId: true,
          assignedMotor: {
            select: {
              id: true,
              internalNumber: true,
              serialOrEngine: true,
              brand: true,
              model: true,
              fuel: true,
              sku: { select: { name: true } },
            },
          },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.warehouseCurrentId) {
      const baseKey = `inventory:warehouse:${result.warehouseCurrentId}`;
      await Promise.all([
        this.cacheManager.del(baseKey),
        this.cacheManager.del(`${baseKey}:default`),
        this.cacheManager.del(`${baseKey}:include-zero`),
      ]);
    }
    return result;
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
      if (asset.assignedMotorId) {
        await tx.asset.update({ where: { id: asset.id }, data: { assignedMotorId: null } });
      }
      if (asset.assignedToMixer) {
        await tx.asset.update({
          where: { id: asset.assignedToMixer.id },
          data: { assignedMotorId: null },
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
