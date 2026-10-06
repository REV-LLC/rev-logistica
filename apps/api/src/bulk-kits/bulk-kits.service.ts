import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SkuControlType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BulkKitSettingsDto, SaveBulkKitDto } from './bulk-kits.dto';
import { normalizeBulkKit, saveBulkKitSettings } from './bulk-kits.validation';
const includeKit = {
  entries: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      sku: {
        select: {
          id: true,
          name: true,
          active: true,
          assetFamily: { select: { name: true, controlType: true } },
        },
      },
    },
  },
};
@Injectable()
export class BulkKitsService {
  constructor(private readonly prisma: PrismaService) {}
  list() {
    return this.prisma.assetFamily.findMany({
      where: { controlType: SkuControlType.BULK, bulkKitsEnabled: true },
      select: {
        id: true,
        name: true,
        bulkKitPrefix: true,
        bulkKitSettingsVersion: true,
        bulkKits: {
          where: {
            active: true,
            entries: {
              every: {
                sku: {
                  active: true,
                  assetFamily: { controlType: SkuControlType.BULK },
                },
              },
            },
          },
          orderBy: { reference: 'asc' },
          include: includeKit,
        },
      },
      orderBy: { name: 'asc' },
    });
  }
  async family(id: string) {
    const family = await this.prisma.assetFamily.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        controlType: true,
        bulkKitsEnabled: true,
        bulkKitPrefix: true,
        bulkKitSettingsVersion: true,
        bulkKits: { orderBy: { reference: 'asc' }, include: includeKit },
      },
    });
    if (!family) throw new NotFoundException('Familia no encontrada.');
    if (family.controlType !== SkuControlType.BULK)
      throw new BadRequestException('La familia debe ser BULK.');
    return family;
  }
  async settings(id: string, dto: BulkKitSettingsDto) {
    await this.prisma.$transaction((tx) => saveBulkKitSettings(tx, id, dto));
    return this.family(id);
  }
  async save(familyId: string, dto: SaveBulkKitDto, kitId?: string) {
    const reference = normalizeBulkKit(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "AssetFamily" WHERE "id" = ${familyId} FOR UPDATE`,
        );
        const family = await tx.assetFamily.findUnique({
          where: { id: familyId },
        });
        if (!family || family.controlType !== SkuControlType.BULK)
          throw new NotFoundException('Familia BULK no encontrada.');
        if (!family.bulkKitsEnabled)
          throw new BadRequestException(
            'Habilita los conjuntos para esta familia.',
          );
        const skus = await tx.sku.findMany({
          where: {
            id: { in: dto.entries.map((e) => e.skuId) },
            active: true,
            assetFamily: { controlType: SkuControlType.BULK },
          },
          select: { id: true },
        });
        if (skus.length !== dto.entries.length)
          throw new BadRequestException(
            'Selecciona referencias BULK activas del inventario.',
          );
        const entries = dto.entries.map((entry, sortOrder) => ({
          ...entry,
          sortOrder,
        }));
        if (!kitId) {
          if (dto.version !== 0)
            throw new BadRequestException('Versión inicial inválida.');
          return tx.bulkKit.create({
            data: {
              assetFamilyId: familyId,
              reference,
              active: dto.active,
              entries: { create: entries },
            },
            include: includeKit,
          });
        }
        const updated = await tx.bulkKit.updateMany({
          where: { id: kitId, assetFamilyId: familyId, version: dto.version },
          data: { reference, active: dto.active, version: { increment: 1 } },
        });
        if (!updated.count)
          throw new ConflictException(
            'El conjunto cambió. Recarga antes de guardar.',
          );
        await tx.bulkKitEntry.deleteMany({ where: { bulkKitId: kitId } });
        await tx.bulkKitEntry.createMany({
          data: entries.map((entry) => ({ ...entry, bulkKitId: kitId })),
        });
        return tx.bulkKit.findUniqueOrThrow({
          where: { id: kitId },
          include: includeKit,
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Ya existe un conjunto con esa referencia.',
        );
      throw error;
    }
  }
}
