import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, Role } from '@prisma/client';
import { FilesService, UploadedBusinessFile } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMobilityGuideDto } from './dto/create-mobility-guide.dto';

const GUIDE_RETENTION_MONTHS = 3;

function atMiddayUtc(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
}

export function addCalendarMonths(value: Date, months: number) {
  const result = new Date(value);
  const targetMonth = result.getUTCMonth() + months;
  result.setUTCDate(1);
  result.setUTCMonth(targetMonth);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(value.getUTCDate(), lastDay));
  return result;
}

@Injectable()
export class MobilityGuidesService {
  private readonly logger = new Logger(MobilityGuidesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async listRegisteredAssets(search?: string) {
    const normalizedSearch = search?.trim();
    const assets = await this.prisma.asset.findMany({
      where: {
        active: true,
        registrationNumber: { not: null },
        ...(normalizedSearch
          ? {
              OR: [
                {
                  registrationNumber: {
                    contains: normalizedSearch,
                    mode: 'insensitive',
                  },
                },
                {
                  serialOrEngine: {
                    contains: normalizedSearch,
                    mode: 'insensitive',
                  },
                },
                {
                  description: {
                    contains: normalizedSearch,
                    mode: 'insensitive',
                  },
                },
                { brand: { contains: normalizedSearch, mode: 'insensitive' } },
                { model: { contains: normalizedSearch, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ internalNumber: 'asc' }],
      select: {
        id: true,
        serialOrEngine: true,
        registrationNumber: true,
        description: true,
        brand: true,
        model: true,
        internalNumber: true,
        warehouseOwnerId: true,
        imageFileObjectId: true,
        imageFileObject: { select: { storageKey: true } },
        sku: {
          select: {
            name: true,
            imageUrl: true,
            chargeType: true,
            minimumChargeHours: true,
          },
        },
        warehouseOwner: { select: { name: true } },
        mobilityGuides: {
          orderBy: [{ issuedAt: 'desc' }],
          take: 1,
          select: { id: true, expiresAt: true },
        },
        _count: { select: { mobilityGuides: true } },
      },
    });

    return assets.map((asset) => ({
      assetId: asset.id,
      serialOrEngine: asset.serialOrEngine,
      registrationNumber: asset.registrationNumber,
      description: asset.description,
      brand: asset.brand,
      model: asset.model,
      internalNumber: asset.internalNumber,
      ownerWarehouseId: asset.warehouseOwnerId,
      ownerWarehouseName: asset.warehouseOwner.name,
      imageFileObjectId: asset.imageFileObjectId,
      imageUrl: asset.imageFileObject?.storageKey ?? asset.sku.imageUrl,
      skuName: asset.sku.name,
      chargeType: asset.sku.chargeType,
      minimumChargeHours: asset.sku.minimumChargeHours,
      guideCount: asset._count.mobilityGuides,
      latestGuide: asset.mobilityGuides[0] ?? null,
    }));
  }

  async listByAsset(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, registrationNumber: true },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    if (!asset.registrationNumber) {
      throw new BadRequestException('El activo no tiene numero de registro');
    }
    return this.prisma.mobilityGuide.findMany({
      where: { assetId },
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        issuedAt: true,
        expiresAt: true,
        createdAt: true,
        fileObject: {
          select: {
            id: true,
            mimeType: true,
            sizeBytes: true,
            originalName: true,
          },
        },
      },
    });
  }

  async create(
    payload: CreateMobilityGuideDto,
    file: UploadedBusinessFile | undefined,
    user: { id: string; role: Role },
  ) {
    if (!file) throw new BadRequestException('Debe adjuntar la guia en PDF');
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('La guia debe ser un archivo PDF');
    }
    const issuedAt = atMiddayUtc(payload.issuedAt);
    const expiresAt = atMiddayUtc(payload.expiresAt);
    if (Number.isNaN(issuedAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException('Las fechas no son validas');
    }
    if (expiresAt <= issuedAt) {
      throw new BadRequestException(
        'La expiracion debe ser posterior a la expedicion',
      );
    }
    if (expiresAt > addCalendarMonths(issuedAt, 1)) {
      throw new BadRequestException('La vigencia no puede superar un mes');
    }

    const asset = await this.prisma.asset.findUnique({
      where: { id: payload.assetId },
      select: { id: true, registrationNumber: true },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    if (!asset.registrationNumber) {
      throw new BadRequestException('El activo debe tener numero de registro');
    }

    const upload = await this.files.uploadEntityFiles(
      'ASSET',
      asset.id,
      [file],
      {
        category: 'GUIA_MOVILIDAD',
        displayName: payload.name.trim(),
        expiresAt: payload.expiresAt,
      },
      user,
    );
    const uploadedFile = upload.files[0];
    try {
      return await this.prisma.mobilityGuide.create({
        data: {
          assetId: asset.id,
          fileObjectId: uploadedFile.id,
          name: payload.name.trim(),
          issuedAt,
          expiresAt,
          createdByUserId: user.id,
        },
      });
    } catch (error) {
      await this.files.deleteFile(uploadedFile.id, user).catch(() => undefined);
      throw error;
    }
  }

  async remove(guideId: string, user: { id: string; role: Role }) {
    const guide = await this.prisma.mobilityGuide.findUnique({
      where: { id: guideId },
      select: { fileObjectId: true },
    });
    if (!guide) throw new NotFoundException('Guia de movilidad no encontrada');
    return this.files.deleteFile(guide.fileObjectId, user);
  }

  @Cron('0 0 3 * * *', { timeZone: 'America/Bogota', waitForCompletion: true })
  async purgeExpiredRetention() {
    const cutoff = addCalendarMonths(new Date(), -GUIDE_RETENTION_MONTHS);
    const guides = await this.prisma.mobilityGuide.findMany({
      where: { issuedAt: { lt: cutoff } },
      select: { id: true, fileObjectId: true },
      take: 100,
    });
    for (const guide of guides) {
      try {
        await this.files.deleteFileForRetention(guide.fileObjectId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`No se pudo depurar la guia ${guide.id}: ${message}`);
      }
    }
    if (guides.length > 0) this.logger.log(`Guias depuradas: ${guides.length}`);
  }
}
