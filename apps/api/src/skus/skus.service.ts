import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SkuControlType, SkuUnit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SkusService {
  constructor(private readonly prisma: PrismaService) {}

  async listSkus(params: { search?: string; controlType?: SkuControlType }) {
    const where: Prisma.SkuWhereInput = {};

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { category: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.controlType) {
      where.controlType = params.controlType;
    }

    return this.prisma.sku.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        category: true,
        unit: true,
        controlType: true,
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
          },
        },
      },
    });
  }

  async createSku(payload: {
    name: string;
    category?: string;
    unit: SkuUnit;
    controlType: SkuControlType;
    imageUrl?: string;
    assetFamilyId?: string;
    unitWeight?: number;
    active?: boolean;
  }) {
    try {
      return await this.prisma.sku.create({
        data: {
          name: payload.name.trim(),
          category: payload.category ?? null,
          unit: payload.unit,
          controlType: payload.controlType,
          imageUrl: payload.imageUrl ?? null,
          assetFamilyId: payload.assetFamilyId ?? null,
          unitWeight: payload.unitWeight ?? null,
          active: payload.active ?? true,
        },
      });
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
      unit?: SkuUnit;
      controlType?: SkuControlType;
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

    try {
      return await this.prisma.sku.update({
        where: { id: skuId },
        data: {
          name: payload.name?.trim(),
          category: payload.category ?? undefined,
          unit: payload.unit,
          controlType: payload.controlType,
          imageUrl: payload.imageUrl ?? undefined,
          assetFamilyId: payload.assetFamilyId ?? undefined,
          unitWeight: payload.unitWeight ?? undefined,
          active: payload.active,
        },
      });
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
