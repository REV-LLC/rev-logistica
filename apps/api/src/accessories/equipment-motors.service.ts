import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssignEquipmentMotorDto,
  EditMotorDto,
  MotorDetailsDto,
} from './dto/equipment-motors.dto';
import {
  createEquipmentMotor,
  motorInclude,
  motorSnapshot,
} from './equipment-motor';

const identity = {
  id: true,
  publicCode: true,
  description: true,
  internalNumber: true,
  imageFileObject: { select: { storageKey: true } },
  sku: { select: { name: true, imageUrl: true, imageFileObject: { select: { storageKey: true } } } },
  warehouseOwner: { select: { name: true } },
} satisfies Prisma.AssetSelect;
const details = {
  ...identity,
  brand: true,
  model: true,
  motorPowerHp: true,
  motorVersion: true,
  fuel: true,
  warehouseCurrentId: true,
  assignedToMixer: { select: identity },
  motorCompatibility: {
    select: {
      equipment: { select: { ...identity, active: true, deletedAt: true } },
    },
  },
} satisfies Prisma.AssetSelect;
type Parent = Prisma.AssetGetPayload<{ include: typeof motorInclude }>;

@Injectable()
export class EquipmentMotorsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache,
  ) {}

  async candidates(search = '', page = 0, equipment = false) {
    if (
      search.length > 160 ||
      !Number.isSafeInteger(page) ||
      page < 0 ||
      page > 10000
    )
      throw new BadRequestException('Búsqueda o página inválida.');
    const contains = { contains: search.trim(), mode: 'insensitive' as const };
    const items = await this.prisma.asset.findMany({
      where: {
        active: true,
        deletedAt: null,
        ...(equipment
          ? {
              kind: { not: 'MOTOR' as const },
              motorConfiguration: 'INTERCHANGEABLE' as const,
            }
          : { kind: 'MOTOR' as const, isDamaged: false }),
        ...(search.trim()
          ? {
              OR: [
                { publicCode: contains },
                { description: contains },
                { sku: { name: contains } },
              ],
            }
          : {}),
      },
      select: details,
      orderBy: { publicCode: 'asc' },
      skip: page * 50,
      take: 51,
    });
    return { items: items.slice(0, 50), hasMore: items.length > 50 };
  }

  async get(id: string) {
    const motor = await this.prisma.asset.findFirst({
      where: { id, kind: 'MOTOR', deletedAt: null },
      select: details,
    });
    if (!motor) throw new NotFoundException('Motor no encontrado.');
    return motor;
  }

  private async lock(tx: Prisma.TransactionClient) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('equipment-configuration', 0))::text`;
  }

  private async validateDetails(
    tx: Prisma.TransactionClient,
    dto: MotorDetailsDto,
    assignedEquipmentId?: string,
  ) {
    if (
      !dto.brand.trim() ||
      !dto.model.trim() ||
      !Number.isFinite(dto.powerHp) ||
      dto.powerHp <= 0 ||
      dto.powerHp > 999999.99
    )
      throw new BadRequestException(
        'Completa marca, potencia HP y modelo del motor.',
      );
    if (!['ELECTRICO', 'GASOLINA'].includes(dto.fuel))
      throw new BadRequestException('Tipo de motor inválido.');
    const ids = [...new Set(dto.compatibleEquipmentIds)];
    if (
      !ids.length ||
      (assignedEquipmentId && !ids.includes(assignedEquipmentId))
    )
      throw new BadRequestException(
        'La compatibilidad debe incluir el equipo al que está asignado el motor.',
      );
    const count = await tx.asset.count({
      where: {
        id: { in: ids },
        active: true,
        deletedAt: null,
        kind: { not: 'MOTOR' },
        motorConfiguration: 'INTERCHANGEABLE',
      },
    });
    if (count !== ids.length)
      throw new BadRequestException(
        'Selecciona equipos activos que admitan motor intercambiable.',
      );
    return ids;
  }

  private async record(
    tx: Prisma.TransactionClient,
    before: Parent,
    after: Parent,
    userId: string,
    operationId: string,
  ) {
    const config = await tx.equipmentConfiguration.upsert({
      where: { assetId: before.id },
      create: { assetId: before.id, version: 1 },
      update: { version: { increment: 1 } },
    });
    await tx.equipmentConfigurationRevision.create({
      data: {
        configurationId: config.id,
        createdBy: userId,
        before: { motor: motorSnapshot(before), operationId },
        after: { motor: motorSnapshot(after), operationId },
      },
    });
  }

  private async clearCache(warehouseIds: Array<string | null>) {
    if (!this.cache) return;
    await Promise.all(
      [...new Set(warehouseIds.filter(Boolean))].flatMap((id) => {
        const key = `inventory:warehouse:${id}`;
        return [key, `${key}:default`, `${key}:include-zero`].map((key) =>
          this.cache!.del(key),
        );
      }),
    ).catch(() => undefined);
  }

  async assign(
    equipmentId: string,
    dto: AssignEquipmentMotorDto,
    userId: string,
  ) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx);
        const parent = await tx.asset.findFirst({
          where: { id: equipmentId, active: true, deletedAt: null },
          include: motorInclude,
        });
        if (
          !parent ||
          parent.kind === 'MOTOR' ||
          parent.motorConfiguration !== 'INTERCHANGEABLE'
        )
          throw new BadRequestException(
            'Este equipo no tiene habilitado el cambio de motor.',
          );
        const config = await tx.equipmentConfiguration.findUnique({
          where: { assetId: equipmentId },
        });
        if ((config?.version ?? 0) !== dto.version)
          throw new ConflictException(
            'El equipo cambió. Cierra y vuelve a abrir el modal antes de guardar.',
          );
        if (dto.motorId && dto.newMotor)
          throw new BadRequestException(
            'Elige un motor existente o crea uno nuevo.',
          );
        let motorId = dto.motorId ?? null;
        if (dto.newMotor) {
          const ids = await this.validateDetails(tx, dto.newMotor, parent.id);
          motorId = await createEquipmentMotor(
            tx,
            parent,
            dto.newMotor,
            userId,
          );
          await tx.assetMotorCompatibility.createMany({
            data: ids.map((equipmentAssetId) => ({
              motorAssetId: motorId!,
              equipmentAssetId,
            })),
          });
        }
        const operationId = randomUUID();
        const warehouseIds = [parent.warehouseCurrentId];
        if (motorId) {
          const motor = await tx.asset.findUnique({
            where: { id: motorId },
            include: {
              assignedToMixer: { include: motorInclude },
              motorCompatibility: true,
            },
          });
          if (
            !motor ||
            motor.kind !== 'MOTOR' ||
            !motor.active ||
            motor.deletedAt ||
            motor.isDamaged
          )
            throw new BadRequestException(
              'Selecciona un motor activo y operativo.',
            );
          if (
            !dto.newMotor &&
            (motor.assignedToMixer?.id ?? null) !== dto.expectedSourceId
          )
            throw new ConflictException(
              'La asignación del motor cambió. Recarga la lista antes de confirmar.',
            );
          if (
            !motor.motorCompatibility.some(
              (c) => c.equipmentAssetId === parent.id,
            )
          )
            throw new BadRequestException(
              'El motor no es compatible con este equipo. Edita su compatibilidad antes de asignarlo.',
            );
          if (
            motorId !== parent.assignedMotorId &&
            (!parent.warehouseCurrentId ||
              motor.warehouseCurrentId !== parent.warehouseCurrentId)
          )
            throw new BadRequestException(
              'El equipo y el motor deben estar en la misma bodega para cambiarlos. La asignación no registra un traslado físico.',
            );
          const source = motor.assignedToMixer;
          if (source && source.id !== parent.id) {
            const detached = await tx.asset.update({
              where: { id: source.id },
              data: { assignedMotorId: null },
              include: motorInclude,
            });
            await this.record(tx, source, detached, userId, operationId);
            warehouseIds.push(source.warehouseCurrentId);
          }
        }
        if (parent.assignedMotorId !== motorId) {
          const saved = await tx.asset.update({
            where: { id: parent.id },
            data: { assignedMotorId: motorId },
            include: motorInclude,
          });
          await this.record(tx, parent, saved, userId, operationId);
        }
        return { warehouseIds, equipmentId, motorId };
      },
      { timeout: 20000 },
    );
    await this.clearCache(result.warehouseIds);
    return { equipmentId: result.equipmentId, assignedMotorId: result.motorId };
  }

  async edit(motorId: string, dto: EditMotorDto, userId: string) {
    const saved = await this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx);
        const before = await tx.asset.findFirst({
          where: { id: motorId, kind: 'MOTOR', active: true, deletedAt: null },
          select: details,
        });
        if (!before) throw new NotFoundException('Motor no encontrado.');
        if (before.motorVersion !== dto.version)
          throw new ConflictException(
            'El motor cambió. Recarga antes de editar.',
          );
        const ids = await this.validateDetails(
          tx,
          dto,
          before.assignedToMixer?.id,
        );
        await tx.assetMotorCompatibility.deleteMany({
          where: { motorAssetId: motorId },
        });
        await tx.assetMotorCompatibility.createMany({
          data: ids.map((equipmentAssetId) => ({
            motorAssetId: motorId,
            equipmentAssetId,
          })),
        });
        const after = await tx.asset.update({
          where: { id: motorId },
          data: {
            brand: dto.brand.trim(),
            model: dto.model.trim(),
            fuel: dto.fuel,
            motorPowerHp: dto.powerHp,
            description: `${dto.brand.trim()} ${dto.powerHp} HP ${dto.model.trim()}`,
            motorVersion: { increment: 1 },
          },
          select: details,
        });
        // Immutable unit identity/SKU and past documents are retained; edits affect this unit only.
        const config = await tx.equipmentConfiguration.upsert({
          where: { assetId: motorId },
          create: { assetId: motorId, version: 1 },
          update: { version: { increment: 1 } },
        });
        await tx.equipmentConfigurationRevision.create({
          data: {
            configurationId: config.id,
            createdBy: userId,
            before: JSON.parse(JSON.stringify({ motorDetails: before })),
            after: JSON.parse(JSON.stringify({ motorDetails: after })),
          },
        });
        return after;
      },
      { timeout: 20000 },
    );
    await this.clearCache([saved.warehouseCurrentId]);
    return saved;
  }
}
