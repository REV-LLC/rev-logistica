import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChargeType, Prisma, SkuControlType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SKU_WEIGHT_UNITS } from './skus.constants';

@Injectable()
export class SkusService {
  constructor(private readonly prisma: PrismaService) {}

  async listSkus(params: {
    search?: string;
    controlType?: SkuControlType;
    assetFamilyId?: string;
  }) {
    const where: Prisma.SkuWhereInput = {};

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { assetFamily: { is: { name: { contains: params.search, mode: 'insensitive' } } } },
      ];
    }

    if (params.controlType) {
      where.assetFamily = { is: { controlType: params.controlType } };
    }

    if (params.assetFamilyId) {
      where.assetFamilyId = params.assetFamilyId;
    }

    const items = await this.prisma.sku.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        assetFamilyId: true,
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
        assetFamily: {
          select: {
            id: true,
            code: true,
            name: true,
            controlType: true,
          },
        },
      },
    });

    return items.map((item) => ({
      ...item,
      controlType: item.assetFamily.controlType,
      category: item.assetFamily.name,
    }));
  }

  listUnits() {
    return SKU_WEIGHT_UNITS;
  }

  async createSku(payload: {
    name: string;
    imageUrl?: string;
    assetFamilyId: string;
    price?: number;
    subrentalPrice?: number;
    replacementValue?: number;
    chargeType?: ChargeType;
    minimumChargeHours?: number;
    size?: string;
    areaM2?: number;
    unitWeight?: number;
    active?: boolean;
  }) {
    const assetFamily = await this.prisma.assetFamily.findUnique({
      where: { id: payload.assetFamilyId },
      select: { id: true, controlType: true, code: true, name: true },
    });
    if (!assetFamily) {
      throw new BadRequestException('Asset family not found');
    }

    const chargeConfig = this.resolveCreateChargeConfig(payload.chargeType, payload.minimumChargeHours);

    try {
      const created = await this.prisma.sku.create({
        data: {
          name: payload.name.trim(),
          imageUrl: payload.imageUrl ?? null,
          assetFamilyId: payload.assetFamilyId,
          price: payload.price ?? null,
          subrentalPrice: payload.subrentalPrice ?? null,
          replacementValue: payload.replacementValue ?? null,
          chargeType: chargeConfig.chargeType,
          minimumChargeHours: chargeConfig.minimumChargeHours,
          size: this.resolveSkuSize(payload.size),
          areaM2: payload.areaM2 ?? null,
          unitWeight: payload.unitWeight ?? null,
          active: payload.active ?? true,
        },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          assetFamilyId: true,
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
          assetFamily: {
            select: {
              id: true,
              code: true,
              name: true,
              controlType: true,
            },
          },
        },
      });

      return { ...created, controlType: created.assetFamily.controlType, category: created.assetFamily.name };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Sku name already exists');
      }
      throw error;
    }
  }

  async updateSku(
    skuId: string,
    payload: {
      name?: string;
      imageUrl?: string;
      assetFamilyId?: string;
      price?: number;
      subrentalPrice?: number;
      replacementValue?: number;
      chargeType?: ChargeType;
      minimumChargeHours?: number;
      size?: string;
      areaM2?: number;
      unitWeight?: number;
      active?: boolean;
    },
  ) {
    const sku = await this.prisma.sku.findUnique({
      where: { id: skuId },
      select: { id: true, chargeType: true, minimumChargeHours: true },
    });

    if (!sku) {
      throw new NotFoundException('Sku not found');
    }

    if (payload.assetFamilyId) {
      const assetFamily = await this.prisma.assetFamily.findUnique({
        where: { id: payload.assetFamilyId },
        select: { id: true },
      });
      if (!assetFamily) {
        throw new BadRequestException('Asset family not found');
      }
    }

    const chargeConfig = this.resolveUpdateChargeConfig(
      payload.chargeType,
      payload.minimumChargeHours,
      sku.chargeType,
      sku.minimumChargeHours == null ? null : Number(sku.minimumChargeHours),
    );

    try {
      const updated = await this.prisma.sku.update({
        where: { id: skuId },
        data: {
          name: payload.name?.trim(),
          imageUrl: payload.imageUrl ?? undefined,
          assetFamilyId: payload.assetFamilyId ?? undefined,
          price: payload.price ?? undefined,
          subrentalPrice: payload.subrentalPrice ?? undefined,
          replacementValue: payload.replacementValue ?? undefined,
          chargeType: chargeConfig.chargeType,
          minimumChargeHours: chargeConfig.minimumChargeHours,
          size: payload.size === undefined ? undefined : this.resolveSkuSize(payload.size),
          areaM2: payload.areaM2 ?? undefined,
          unitWeight: payload.unitWeight ?? undefined,
          active: payload.active,
        },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          assetFamilyId: true,
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
          assetFamily: {
            select: {
              id: true,
              code: true,
              name: true,
              controlType: true,
            },
          },
        },
      });

      return { ...updated, controlType: updated.assetFamily.controlType, category: updated.assetFamily.name };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Sku name already exists');
      }
      throw error;
    }
  }

  async deleteSku(skuId: string) {
    const sku = await this.prisma.sku.findUnique({
      where: { id: skuId },
      select: { id: true },
    });

    if (!sku) {
      throw new NotFoundException('Sku not found');
    }

    const [assetsCount, ledgerCount, documentItemsCount] = await Promise.all([
      this.prisma.asset.count({ where: { skuId } }),
      this.prisma.stockLedger.count({ where: { skuId } }),
      this.prisma.documentItem.count({ where: { skuId } }),
    ]);

    if (assetsCount || ledgerCount || documentItemsCount) {
      throw new BadRequestException(
        'Cannot delete sku with existing assets or ledger/documents',
      );
    }

    return this.prisma.sku.delete({ where: { id: skuId } });
  }

  private resolveCreateChargeConfig(chargeType?: ChargeType, minimumChargeHours?: number) {
    const resolvedChargeType = chargeType ?? ChargeType.DAY;
    if (resolvedChargeType === ChargeType.HOUR) {
      if (minimumChargeHours == null || minimumChargeHours <= 0) {
        throw new BadRequestException('minimumChargeHours is required when chargeType is HOUR');
      }
      return { chargeType: resolvedChargeType, minimumChargeHours };
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

  private resolveUpdateChargeConfig(
    chargeType: ChargeType | undefined,
    minimumChargeHours: number | undefined,
    currentChargeType: ChargeType,
    currentMinimumChargeHours: number | null,
  ) {
    if (chargeType == null && minimumChargeHours == null) {
      return {
        chargeType: undefined,
        minimumChargeHours: undefined,
      };
    }

    const resolvedChargeType = chargeType ?? currentChargeType;
    const resolvedMinimum =
      minimumChargeHours !== undefined ? minimumChargeHours : currentMinimumChargeHours;

    if (resolvedChargeType === ChargeType.HOUR) {
      if (resolvedMinimum == null || resolvedMinimum <= 0) {
        throw new BadRequestException('minimumChargeHours is required when chargeType is HOUR');
      }
      return { chargeType: resolvedChargeType, minimumChargeHours: resolvedMinimum };
    }

    return { chargeType: resolvedChargeType, minimumChargeHours: null };
  }
}
