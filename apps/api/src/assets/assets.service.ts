import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

    return this.prisma.asset.findMany({
      where,
      orderBy: { serialOrEngine: 'asc' },
      take: params.take,
      skip: params.skip,
      select: {
        id: true,
        serialOrEngine: true,
        description: true,
        brand: true,
        model: true,
        skuId: true,
        assetFamilyId: true,
        internalNumber: true,
        warehouseOwnerId: true,
        warehouseCurrentId: true,
        weight: true,
        active: true,
        createdAt: true,
        assetFamily: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        sku: {
          select: {
            id: true,
            name: true,
            controlType: true,
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
  }

  async listAssetFamilies() {
    return this.prisma.assetFamily.findMany({
      select: {
        id: true,
        code: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async createAsset(payload: {
    skuId: string;
    warehouseOwnerId: string;
    warehouseCurrentId?: string;
    serialOrEngine?: string;
    description?: string;
    brand?: string;
    model?: string;
    active?: boolean;
  }) {
    const sku = await this.prisma.sku.findUnique({
      where: { id: payload.skuId },
      select: {
        id: true,
        controlType: true,
        assetFamilyId: true,
      },
    });

    if (!sku) {
      throw new NotFoundException('Sku not found');
    }

    if (sku.controlType !== 'SERIAL') {
      throw new BadRequestException('Sku must be SERIAL');
    }

    if (!sku.assetFamilyId) {
      throw new BadRequestException('Sku has no asset family');
    }

    const warehouseOwner = await this.prisma.warehouse.findUnique({
      where: { id: payload.warehouseOwnerId },
      select: { id: true, name: true },
    });

    if (!warehouseOwner) {
      throw new NotFoundException('Owner warehouse not found');
    }

    const warehouseCurrentId = payload.warehouseCurrentId ?? payload.warehouseOwnerId;

    if (warehouseCurrentId !== payload.warehouseOwnerId) {
      const currentWarehouse = await this.prisma.warehouse.findUnique({
        where: { id: warehouseCurrentId },
        select: { id: true },
      });
      if (!currentWarehouse) {
        throw new NotFoundException('Current warehouse not found');
      }
    }

    const latest = await this.prisma.asset.findFirst({
      where: { warehouseOwnerId: payload.warehouseOwnerId },
      orderBy: { internalNumber: 'desc' },
      select: { internalNumber: true },
    });
    const internalNumber = (latest?.internalNumber ?? 0) + 1;
    const serialOrEngine =
      payload.serialOrEngine?.trim() ||
      `${this.sanitizeOwnerName(warehouseOwner.name)}-${this.padInternalNumber(internalNumber)}`;

    try {
      return await this.prisma.asset.create({
        data: {
          skuId: payload.skuId,
          assetFamilyId: sku.assetFamilyId,
          internalNumber,
          serialOrEngine,
          description: payload.description ?? null,
          brand: payload.brand ?? null,
          model: payload.model ?? null,
          warehouseOwnerId: payload.warehouseOwnerId,
          warehouseCurrentId,
          active: payload.active ?? true,
        },
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
      description?: string;
      brand?: string;
      model?: string;
      warehouseCurrentId?: string;
      active?: boolean;
    },
  ) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (payload.warehouseCurrentId) {
      const warehouse = await this.prisma.warehouse.findUnique({
        where: { id: payload.warehouseCurrentId },
        select: { id: true },
      });
      if (!warehouse) {
        throw new NotFoundException('Current warehouse not found');
      }
    }

    return this.prisma.asset.update({
      where: { id: assetId },
      data: {
        description: payload.description ?? undefined,
        brand: payload.brand ?? undefined,
        model: payload.model ?? undefined,
        warehouseCurrentId: payload.warehouseCurrentId ?? undefined,
        active: payload.active,
      },
    });
  }

  async deleteAsset(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    return this.prisma.asset.delete({ where: { id: assetId } });
  }
}
