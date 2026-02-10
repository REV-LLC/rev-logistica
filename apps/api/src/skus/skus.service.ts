import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SkuControlType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SKU_CATEGORIES, SKU_WEIGHT_UNITS } from './skus.constants';

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
        { category: { contains: params.search, mode: 'insensitive' } },
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
        category: true,
        imageUrl: true,
        assetFamilyId: true,
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
    }));
  }

  listCategories() {
    return SKU_CATEGORIES;
  }

  listUnits() {
    return SKU_WEIGHT_UNITS;
  }

  async createSku(payload: {
    name: string;
    category: string;
    imageUrl?: string;
    assetFamilyId: string;
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

    try {
      const created = await this.prisma.sku.create({
        data: {
          name: payload.name.trim(),
          category: payload.category.trim().toUpperCase(),
          imageUrl: payload.imageUrl ?? null,
          assetFamilyId: payload.assetFamilyId,
          unitWeight: payload.unitWeight ?? null,
          active: payload.active ?? true,
        },
        select: {
          id: true,
          name: true,
          category: true,
          imageUrl: true,
          assetFamilyId: true,
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

      return { ...created, controlType: created.assetFamily.controlType };
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
      category?: string;
      imageUrl?: string;
      assetFamilyId?: string;
      unitWeight?: number;
      active?: boolean;
    },
  ) {
    const sku = await this.prisma.sku.findUnique({
      where: { id: skuId },
      select: { id: true },
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

    try {
      const updated = await this.prisma.sku.update({
        where: { id: skuId },
        data: {
          name: payload.name?.trim(),
          category: payload.category?.trim().toUpperCase() ?? undefined,
          imageUrl: payload.imageUrl ?? undefined,
          assetFamilyId: payload.assetFamilyId ?? undefined,
          unitWeight: payload.unitWeight ?? undefined,
          active: payload.active,
        },
        select: {
          id: true,
          name: true,
          category: true,
          imageUrl: true,
          assetFamilyId: true,
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

      return { ...updated, controlType: updated.assetFamily.controlType };
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
}
