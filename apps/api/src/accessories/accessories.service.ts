import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { accessoryDocumentOptions } from './accessory-document-options';
import { AccessoryDocumentOptionsDto } from './dto/accessory-document-options.dto';
import {
  AccessoryDetailsDto,
  CreateAccessoryDto,
  MoveAccessoryDto,
  UpdateAccessoryDto,
} from './dto/accessory.dto';
import {
  Compatibility,
  isCompatible,
  Location,
  locationKey,
  validateMovement,
  validateScope,
} from './accessory-rules';

const equipmentSelect = {
  id: true,
  publicCode: true,
  description: true,
  warehouseOwnerId: true,
  warehouseCurrentId: true,
  sku: { select: { assetFamilyId: true, assetSubfamilyId: true, name: true } },
} satisfies Prisma.AssetSelect;
const detailInclude = {
  family: { select: { id: true, name: true } },
  ownerWarehouse: { select: { id: true, name: true } },
  subfamilies: { include: { subfamily: { select: { name: true } } } },
  assets: { include: { asset: { select: equipmentSelect } } },
  balances: {
    where: { quantity: { gt: 0 } },
    include: {
      warehouse: { select: { id: true, name: true } },
      asset: { select: equipmentSelect },
      customerWorksite: {
        select: {
          worksite: { select: { name: true } },
          customer: { select: { name: true } },
        },
      },
      transitDocument: { select: { id: true, consecutive: true } },
    },
  },
} satisfies Prisma.AccessoryInclude;

function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

@Injectable()
export class AccessoriesService {
  constructor(private readonly prisma: PrismaService) {}

  documentOptions(query: AccessoryDocumentOptionsDto) {
    return accessoryDocumentOptions(this.prisma, query);
  }

  async equipment(familyId: string) {
    return this.prisma.asset.findMany({
      where: {
        active: true,
        deletedAt: null,
        sku: { assetFamilyId: familyId },
      },
      select: equipmentSelect,
      orderBy: { publicCode: 'asc' },
    });
  }

  async equipmentById(id: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, deletedAt: null },
      select: equipmentSelect,
    });
    if (!asset) throw new NotFoundException('Equipo no encontrado.');
    return asset;
  }

  async list(assetId?: string, search?: string, page = 0, familyId?: string) {
    if (
      search !== undefined &&
      (typeof search !== 'string' || search.length > 160)
    )
      throw new BadRequestException(
        'La búsqueda debe ser un texto de máximo 160 caracteres.',
      );
    const where: Prisma.AccessoryWhereInput = { familyId };
    if (search?.trim())
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { internalCode: { contains: search.trim(), mode: 'insensitive' } },
      ];
    if (assetId) {
      const asset = await this.equipmentById(assetId);
      where.AND = [
        {
          OR: [
            { familyId: asset.sku.assetFamilyId, scope: 'FAMILY' },
            ...(asset.sku.assetSubfamilyId
              ? [
                  {
                    familyId: asset.sku.assetFamilyId,
                    scope: 'SUBFAMILIES' as const,
                    subfamilies: {
                      some: { subfamilyId: asset.sku.assetSubfamilyId },
                    },
                  },
                ]
              : []),
            {
              familyId: asset.sku.assetFamilyId,
              scope: 'ASSETS',
              assets: { some: { assetId } },
            },
            { balances: { some: { assetId, quantity: { gt: 0 } } } },
          ],
        },
      ];
    }
    const items = await this.prisma.accessory.findMany({
      where,
      include: detailInclude,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 51,
      skip: page * 50,
    });
    return { items: items.slice(0, 50), hasMore: items.length > 50 };
  }

  async get(id: string) {
    const item = await this.prisma.accessory.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!item) throw new NotFoundException('Accesorio no encontrado.');
    return item;
  }

  async history(id: string, page = 0) {
    await this.get(id);
    const [movements, revisions] = await Promise.all([
      this.prisma.accessoryMovement.findMany({
        where: { accessoryId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 51,
        skip: page * 50,
      }),
      this.prisma.accessoryRevision.findMany({
        where: { accessoryId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 51,
        skip: page * 50,
      }),
    ]);
    return {
      movements: movements.slice(0, 50),
      revisions: revisions.slice(0, 50),
      hasMore: movements.length > 50 || revisions.length > 50,
    };
  }

  private async validateDetails(
    tx: Prisma.TransactionClient,
    dto: AccessoryDetailsDto,
  ) {
    if (!dto.name.trim())
      throw new BadRequestException('El nombre del accesorio es obligatorio.');
    if (dto.kind === 'INDIVIDUAL' && !dto.internalCode?.trim())
      throw new BadRequestException(
        'El accesorio individualizado necesita un código propio.',
      );
    if (dto.kind !== 'INDIVIDUAL' && dto.internalCode?.trim())
      throw new BadRequestException(
        'Los accesorios por cantidad se registran sin código individual.',
      );
    validateScope(dto);
    const family = await tx.assetFamily.findUnique({
      where: { id: dto.familyId },
    });
    if (!family || family.controlType !== 'SERIAL')
      throw new BadRequestException(
        'Selecciona una familia de equipos serializados.',
      );
    if (dto.scope === 'SUBFAMILIES') {
      const count = await tx.assetSubfamily.count({
        where: {
          id: { in: dto.subfamilyIds },
          assetFamilyId: dto.familyId,
          active: true,
        },
      });
      if (count !== dto.subfamilyIds.length)
        throw new BadRequestException(
          'Las subfamilias deben estar activas y pertenecer a la familia elegida.',
        );
    }
    if (dto.scope === 'ASSETS') {
      const count = await tx.asset.count({
        where: {
          id: { in: dto.assetIds },
          sku: { assetFamilyId: dto.familyId },
          active: true,
          deletedAt: null,
        },
      });
      if (count !== dto.assetIds.length)
        throw new BadRequestException(
          'Los equipos deben estar activos y pertenecer a la familia elegida.',
        );
    }
  }

  private details(dto: {
    name: string;
    description?: string | null;
    kind: AccessoryDetailsDto['kind'];
    internalCode?: string | null;
    familyId: string;
    scope: AccessoryDetailsDto['scope'];
  }) {
    return {
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      kind: dto.kind,
      internalCode:
        dto.kind === 'INDIVIDUAL'
          ? dto.internalCode!.trim().toUpperCase()
          : null,
      familyId: dto.familyId,
      scope: dto.scope,
    };
  }

  private async warehouse(tx: Prisma.TransactionClient, id: string) {
    const warehouse = await tx.warehouse.findFirst({
      where: { id, active: true },
      select: { id: true, name: true },
    });
    if (!warehouse)
      throw new BadRequestException('La bodega no existe o está inactiva.');
    return warehouse;
  }

  private async locked<T>(
    id: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.withErrors(() =>
      this.prisma.$transaction(async (tx) => {
        // All stock and compatibility writes share this lock; competing deliveries cannot oversell.
        const rows = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM "Accessory" WHERE id = ${id} FOR UPDATE`;
        if (!rows.length)
          throw new NotFoundException('Accesorio no encontrado.');
        return fn(tx);
      }),
    );
  }

  private async withErrors<T>(
    fn: () => Promise<T>,
    retryGeneratedCode = false,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          // Retry the entire rolled-back transaction, only for generated-code collisions.
          if (
            retryGeneratedCode &&
            attempt < 4 &&
            Array.isArray(error.meta?.target) &&
            error.meta.target.includes('internalCode')
          )
            continue;
          throw new ConflictException(
            'El código o la operación ya existe. Actualiza antes de intentarlo nuevamente.',
          );
        }
        throw error;
      }
    }
  }

  async create(dto: CreateAccessoryDto, userId: string) {
    const hash = fingerprint({ ...dto, userId });
    const generateCode = dto.kind === 'INDIVIDUAL' && !dto.internalCode?.trim();
    return this.withErrors(
      () =>
        this.prisma.$transaction(async (tx) => {
          // Serialize retries even before the accessory exists.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${dto.requestId}, 0))::text`;
          const prior = await tx.accessory.findUnique({
            where: { creationRequestId: dto.requestId },
            include: detailInclude,
          });
          if (prior) {
            if (prior.creationFingerprint !== hash)
              throw new ConflictException(
                'La operación ya fue usada con otros datos.',
              );
            return prior;
          }
          const details = {
            ...dto,
            internalCode: generateCode
              ? `ACC-${randomBytes(6).toString('hex').toUpperCase()}`
              : dto.internalCode,
          };
          await this.validateDetails(tx, details);
          if (
            !Number.isSafeInteger(dto.quantity) ||
            dto.quantity < 1 ||
            dto.quantity > 1000000
          )
            throw new BadRequestException(
              'La cantidad inicial debe ser un número entero positivo.',
            );
          if (dto.kind === 'INDIVIDUAL' && dto.quantity !== 1)
            throw new BadRequestException(
              'Registra cada accesorio individualizado por separado.',
            );
          const warehouse = await this.warehouse(tx, dto.warehouseId);
          await this.warehouse(tx, dto.ownerWarehouseId);
          return tx.accessory.create({
            data: {
              ...this.details(details),
              ownerWarehouseId: dto.ownerWarehouseId,
              createdBy: userId,
              creationRequestId: dto.requestId,
              creationFingerprint: hash,
              subfamilies: {
                create: dto.subfamilyIds.map((subfamilyId) => ({
                  subfamilyId,
                })),
              },
              assets: { create: dto.assetIds.map((assetId) => ({ assetId })) },
              balances: {
                create: {
                  locationKey: locationKey({ warehouseId: dto.warehouseId }),
                  warehouseId: dto.warehouseId,
                  quantity: dto.quantity,
                },
              },
              movements: {
                create: {
                  requestId: dto.requestId,
                  fingerprint: hash,
                  type: 'RECEIVE',
                  quantity: dto.quantity,
                  to: { warehouseId: warehouse.id, label: warehouse.name },
                  note: 'EXISTENCIA INICIAL',
                  createdBy: userId,
                },
              },
            },
            include: detailInclude,
          });
        }),
      generateCode,
    );
  }

  async update(id: string, dto: UpdateAccessoryDto, userId: string) {
    return this.locked(id, async (tx) => {
      const item = await tx.accessory.findUniqueOrThrow({
        where: { id },
        include: detailInclude,
      });
      if (item.version !== dto.version)
        throw new ConflictException(
          'Otra persona modificó el accesorio. Recarga antes de guardar.',
        );
      if (item.kind !== dto.kind)
        throw new BadRequestException(
          'No puedes cambiar el tipo de un accesorio con historial. Registra uno nuevo.',
        );
      const details = {
        ...dto,
        internalCode:
          dto.kind === 'INDIVIDUAL'
            ? dto.internalCode?.trim() || item.internalCode!
            : dto.internalCode,
      };
      await this.validateDetails(tx, details);
      const assigned = item.balances.filter((balance) => balance.asset);
      if (!dto.active && item.balances.length)
        throw new BadRequestException(
          'Antes de archivar debes devolver y dar de baja o consumir las existencias.',
        );
      if (assigned.some((balance) => !isCompatible(dto, balance.asset!)))
        throw new BadRequestException(
          'Primero devuelve o traslada los accesorios asignados a equipos que dejarían de ser compatibles.',
        );
      await tx.accessorySubfamily.deleteMany({ where: { accessoryId: id } });
      await tx.accessoryAsset.deleteMany({ where: { accessoryId: id } });
      const updated = await tx.accessory.update({
        where: { id },
        data: {
          ...this.details(details),
          active: dto.active,
          version: { increment: 1 },
          subfamilies: {
            create: dto.subfamilyIds.map((subfamilyId) => ({ subfamilyId })),
          },
          assets: { create: dto.assetIds.map((assetId) => ({ assetId })) },
        },
        include: detailInclude,
      });
      const snapshot = (value: typeof item) => ({
        ...this.details(value),
        active: value.active,
        familyName: value.family.name,
        subfamilyIds: value.subfamilies.map((s) => s.subfamilyId),
        assetIds: value.assets.map((a) => a.assetId),
        compatibilityNames:
          value.scope === 'FAMILY'
            ? [value.family.name]
            : value.scope === 'SUBFAMILIES'
              ? value.subfamilies.map((s) => s.subfamily.name)
              : value.assets.map(
                  (a) => `${a.asset.sku.name} · ${a.asset.publicCode}`,
                ),
      });
      await tx.accessoryRevision.create({
        data: {
          accessoryId: id,
          before: snapshot(item),
          after: snapshot(updated),
          createdBy: userId,
        },
      });
      return updated;
    });
  }

  private async resolveLocation(
    tx: Prisma.TransactionClient,
    location: Location,
    rule: Compatibility,
    destination: boolean,
  ) {
    if (location.warehouseId) {
      const warehouse = await this.warehouse(tx, location.warehouseId);
      return { warehouseId: warehouse.id, label: warehouse.name };
    }
    const asset = await tx.asset.findUnique({
      where: { id: location.assetId! },
      select: { ...equipmentSelect, active: true, deletedAt: true },
    });
    if (!asset) throw new BadRequestException('Equipo no encontrado.');
    if (
      destination &&
      (!asset.active || asset.deletedAt || !isCompatible(rule, asset))
    )
      throw new BadRequestException(
        'El equipo de destino no está activo o no es compatible con este accesorio.',
      );
    return {
      assetId: asset.id,
      ...(location.customerWorksiteId
        ? { customerWorksiteId: location.customerWorksiteId }
        : {}),
      ...(location.transitDocumentId
        ? { transitDocumentId: location.transitDocumentId }
        : {}),
      label: `${asset.sku.name} · ${asset.publicCode}${location.transitDocumentId ? ' · En tránsito a proveedor' : ''}${location.customerWorksiteId ? ` · Obra ${(await tx.customerWorksite.findUniqueOrThrow({ where: { id: location.customerWorksiteId }, include: { worksite: true } })).worksite.name}` : ''}`,
    };
  }

  async move(id: string, dto: MoveAccessoryDto, userId: string) {
    if (
      dto.type === 'TRANSIT' ||
      dto.type === 'PROVIDER_RECEIVE' ||
      dto.from?.transitDocumentId ||
      dto.to?.transitDocumentId
    )
      throw new BadRequestException(
        'El tránsito y la recepción de proveedor requieren un documento.',
      );
    if (
      dto.to?.customerWorksiteId ||
      (dto.from?.customerWorksiteId &&
        !['CONSUME', 'RETIRE'].includes(dto.type))
    ) {
      throw new BadRequestException(
        'Las entregas y devoluciones de obra se registran mediante remisión o devolución documental.',
      );
    }
    return this.locked(id, (tx) => this.moveInTransaction(tx, id, dto, userId));
  }

  /** Internal API: caller owns the transaction and locks accessories before equipment. */
  async moveInTransaction(
    tx: Prisma.TransactionClient,
    id: string,
    dto: MoveAccessoryDto,
    userId: string,
    documentId?: string,
  ) {
    const hash = fingerprint({ id, ...dto, userId });
    const prior = await tx.accessoryMovement.findUnique({
      where: { requestId: dto.requestId },
    });
    if (prior) {
      if (prior.fingerprint !== hash)
        throw new ConflictException(
          'La operación ya fue usada con otros datos.',
        );
      return prior;
    }
    const item = await tx.accessory.findUniqueOrThrow({
      where: { id },
      include: { subfamilies: true, assets: true },
    });
    if (!item.active)
      throw new BadRequestException('El accesorio está archivado.');
    if (!dto.note.trim())
      throw new BadRequestException('Indica el motivo del movimiento.');
    const validationType =
      documentId && dto.type === 'TRANSIT'
        ? 'TRANSFER'
        : documentId && dto.type === 'PROVIDER_RECEIVE'
          ? dto.from?.warehouseId
            ? 'TRANSFER'
            : 'RETURN'
          : dto.type;
    validateMovement(item.kind, validationType, dto.quantity, dto.from, dto.to);
    // Stable ordering avoids deadlocks when two accessories swap equipment concurrently.
    const equipmentIds = [
      ...new Set(
        [dto.from?.assetId, dto.to?.assetId].filter(
          (value): value is string => !!value,
        ),
      ),
    ].sort();
    for (const assetId of equipmentIds) {
      await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${assetId} FOR UPDATE`;
    }
    if (!documentId && dto.to?.assetId) {
      const target = await tx.asset.findUniqueOrThrow({
        where: { id: dto.to.assetId },
        select: { warehouseCurrentId: true },
      });
      const originWarehouse =
        dto.from?.warehouseId ??
        (dto.from?.assetId
          ? (
              await tx.asset.findUniqueOrThrow({
                where: { id: dto.from.assetId },
                select: { warehouseCurrentId: true },
              })
            ).warehouseCurrentId
          : null);
      if (
        !target.warehouseCurrentId ||
        target.warehouseCurrentId !== originWarehouse
      )
        throw new BadRequestException(
          'La asignación manual requiere equipos en la misma bodega. Para entregar en obra utiliza una remisión.',
        );
    }
    const rule = {
      ...item,
      subfamilyIds: item.subfamilies.map((s) => s.subfamilyId),
      assetIds: item.assets.map((a) => a.assetId),
    };
    const from = dto.from
      ? await this.resolveLocation(tx, dto.from, rule, false)
      : undefined;
    const to = dto.to
      ? await this.resolveLocation(tx, dto.to, rule, true)
      : undefined;
    if (dto.from) {
      const result = await tx.accessoryBalance.updateMany({
        where: {
          accessoryId: id,
          locationKey: locationKey(dto.from),
          quantity: { gte: dto.quantity },
        },
        data: { quantity: { decrement: dto.quantity } },
      });
      if (result.count !== 1)
        throw new BadRequestException(
          'No hay existencias suficientes en el origen. Actualiza la card.',
        );
    }
    if (dto.to)
      await tx.accessoryBalance.upsert({
        where: {
          accessoryId_locationKey: {
            accessoryId: id,
            locationKey: locationKey(dto.to),
          },
        },
        create: {
          accessoryId: id,
          locationKey: locationKey(dto.to),
          ...dto.to,
          quantity: dto.quantity,
        },
        update: { quantity: { increment: dto.quantity } },
      });
    return tx.accessoryMovement.create({
      data: {
        accessoryId: id,
        documentId,
        requestId: dto.requestId,
        fingerprint: hash,
        type: dto.type,
        quantity: dto.quantity,
        from,
        to,
        note: dto.note.trim(),
        createdBy: userId,
      },
    });
  }
}
