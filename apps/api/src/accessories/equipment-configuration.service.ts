import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { AccessoriesService } from './accessories.service';
import { EquipmentConfigurationDto } from './dto/equipment-configuration.dto';
import {
  assertAcyclicConfiguration,
  validateConfigurationDraft,
} from './equipment-configuration-rules';
import { isCompatible } from './accessory-rules';
import { motorInclude, motorSnapshot } from './equipment-motor';
import { documentReturnOrigins } from '../documents/document-return-origins';

export type ConfigurationOwner =
  | { assetId: string; accessoryId?: never }
  | { accessoryId: string; assetId?: never };
const ownerKey = (owner: {
  assetId?: string | null;
  accessoryId?: string | null;
}) =>
  owner.assetId ? `asset:${owner.assetId}` : `accessory:${owner.accessoryId}`;
const include = {
  entries: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      family: { select: { id: true, name: true, controlType: true } },
      asset: {
        select: {
          id: true,
          publicCode: true,
          description: true,
          kind: true,
          sku: { select: { name: true } },
        },
      },
      accessory: {
        select: {
          id: true,
          name: true,
          internalCode: true,
          kind: true,
          purpose: true,
          exclusiveAssetId: true,
        },
      },
    },
  },
} satisfies Prisma.EquipmentConfigurationInclude;

@Injectable()
export class EquipmentConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessories: AccessoriesService,
    @Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache,
  ) {}

  async motorHistory(assetId: string) {
    return this.prisma.equipmentConfigurationRevision.findMany({
      where: { configuration: { assetId }, after: { path: ['motor'], not: Prisma.AnyNull } },
      orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, before: true, after: true, createdAt: true, createdBy: true },
    });
  }

  returnOrigins(customerWorksiteId: string) {
    return documentReturnOrigins(this.prisma, customerWorksiteId);
  }

  async returnParts(assetId: string, customerWorksiteId: string) {
    // Historical identities only; the inventory picker intersects these with actual worksite stock.
    return this.prisma.documentItem.findMany({
      where: { componentParentAssetId: assetId, accessoryId: null, document: {
        type: 'REMISSION', status: 'CONFIRMED', customerWorksiteId,
      } },
      distinct: ['assetId', 'skuId'], select: { assetId: true, skuId: true },
    });
  }

  async assetCandidates(search = '', page = 0) {
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
        kind: { not: 'MOTOR' },
        ...(search.trim()
          ? {
              OR: [
                { publicCode: contains },
                { description: contains },
                { serialOrEngine: contains },
                { sku: { name: contains } },
              ],
            }
          : {}),
      },
      select: { id: true, publicCode: true, sku: { select: { name: true } } },
      orderBy: { id: 'asc' },
      skip: page * 50,
      take: 51,
    });
    return { items: items.slice(0, 50), hasMore: items.length > 50 };
  }

  private async parent(
    tx: Prisma.TransactionClient,
    owner: ConfigurationOwner,
  ) {
    if (owner.assetId) {
      const asset = await tx.asset.findFirst({
        where: { id: owner.assetId, active: true, deletedAt: null },
        include: {
          sku: true,
          ...motorInclude,
        },
      });
      if (!asset) throw new NotFoundException('Equipo activo no encontrado.');
      return {
        asset,
        accessory: null,
        name: `${asset.sku.name} · ${asset.publicCode}`,
        familyId: asset.sku.assetFamilyId,
        ownerWarehouseId: asset.warehouseOwnerId,
        warehouseId: asset.warehouseCurrentId,
      };
    }
    const accessory = await tx.accessory.findFirst({
      where: {
        id: owner.accessoryId,
        active: true,
        kind: 'INDIVIDUAL',
        purpose: 'ACCESSORY',
      },
      include: {
        balances: {
          where: { quantity: { gt: 0 }, warehouseId: { not: null } },
          select: { warehouseId: true },
          take: 1,
        },
      },
    });
    if (!accessory)
      throw new NotFoundException(
        'Solo un accesorio individualizado activo puede tener su propia configuración.',
      );
    return {
      asset: null,
      accessory,
      name: `${accessory.name} · ${accessory.internalCode}`,
      familyId: accessory.familyId,
      ownerWarehouseId: accessory.ownerWarehouseId,
      warehouseId: accessory.balances[0]?.warehouseId ?? null,
    };
  }

  async get(owner: ConfigurationOwner) {
    const [parent, config] = await Promise.all([
      this.parent(this.prisma, owner),
      this.prisma.equipmentConfiguration.findUnique({ where: owner, include }),
    ]);
    return {
      version: config?.version ?? 0,
      notes: config?.notes ?? null,
      entries: config?.entries ?? [],
      ...(parent.asset ? { motor: motorSnapshot(parent.asset) } : {}),
      parent: {
        name: parent.name,
        familyId: parent.familyId,
        warehouseId: parent.warehouseId,
      },
    };
  }

  async save(
    owner: ConfigurationOwner,
    dto: EquipmentConfigurationDto,
    userId: string,
  ) {
    try {
      const saved = await this.prisma.$transaction(
        (tx) => this.saveInTransaction(tx, owner, dto, userId),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 20000,
        },
      );
      if (owner.assetId && this.cache) {
        const asset = await this.prisma.asset.findUnique({ where: { id: owner.assetId }, select: { warehouseCurrentId: true } });
        if (asset?.warehouseCurrentId) {
          const key = `inventory:warehouse:${asset.warehouseCurrentId}`;
          await Promise.all([key, `${key}:default`, `${key}:include-zero`].map(key => this.cache!.del(key))).catch(() => undefined);
        }
      }
      return saved;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2034', 'P2002'].includes(error.code)
      )
        throw new ConflictException(
          'La configuración cambió durante el guardado. Recarga y vuelve a intentarlo.',
        );
      throw error;
    }
  }

  async saveInTransaction(
    tx: Prisma.TransactionClient,
    owner: ConfigurationOwner,
    dto: EquipmentConfigurationDto,
    userId: string,
  ) {
    validateConfigurationDraft(dto);
    // Prevent two simultaneous edits from introducing a cycle or conflicting classifications.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('equipment-configuration', 0))::text`;
    const parent = await this.parent(tx, owner);
    const existing = await tx.equipmentConfiguration.findUnique({
      where: owner,
      include,
    });
    if ((existing?.version ?? 0) !== dto.version)
      throw new ConflictException(
        'Otra persona cambió esta configuración. Recarga antes de guardar.',
      );

    const savedAsset = parent.asset;

    const data: Prisma.EquipmentConfigurationEntryCreateManyInput[] = [];
    for (const [sortOrder, row] of dto.entries.entries()) {
      let accessoryId = row.accessoryId;
      if (row.newPart) {
        if (!parent.warehouseId)
          throw new BadRequestException(
            'Para crear existencias nuevas aquí, el equipo debe estar en una bodega. En otros casos crea el accesorio desde Inventario y vincúlalo.',
          );
        if (
          row.newPart.exclusive &&
          (!parent.asset ||
            (row.newPart.compatibility &&
              row.newPart.compatibility !== 'PARENT'))
        )
          throw new BadRequestException(
            'Un componente exclusivo pertenece a una unidad concreta, no a toda la familia.',
          );
        if (
          row.newPart.compatibility === 'SUBFAMILY' &&
          !parent.asset?.sku.assetSubfamilyId
        )
          throw new BadRequestException(
            'Este equipo no tiene una subfamilia para esa compatibilidad.',
          );
        const scope = parent.accessory
          ? 'ACCESSORIES'
          : row.newPart.compatibility === 'FAMILY'
            ? 'FAMILY'
            : row.newPart.compatibility === 'SUBFAMILY'
              ? 'SUBFAMILIES'
              : 'ASSETS';
        const part = await this.accessories.createInTransaction(
          tx,
          {
            requestId: row.id,
            name: row.newPart.name,
            kind: row.newPart.kind,
            purpose: row.role,
            exclusiveAssetId: row.newPart.exclusive
              ? parent.asset!.id
              : undefined,
            familyId: parent.familyId,
            scope,
            subfamilyIds:
              scope === 'SUBFAMILIES'
                ? [parent.asset!.sku.assetSubfamilyId!]
                : [],
            assetIds: scope === 'ASSETS' ? [parent.asset!.id] : [],
            parentAccessoryIds:
              scope === 'ACCESSORIES' ? [parent.accessory!.id] : [],
            ownerWarehouseId: parent.ownerWarehouseId,
            warehouseId: parent.warehouseId,
            quantity: row.newPart.initialQuantity,
          },
          userId,
        );
        accessoryId = part.id;
      }
      if (row.familyId) {
        const family = await tx.assetFamily.findUnique({ where: { id: row.familyId }, select: { id: true, code: true,
          skus: { where: { assets: { some: { kind: 'MOTOR' } } }, select: { id: true }, take: 1 } } });
        if (!family || row.familyId === parent.familyId || owner.accessoryId)
          throw new BadRequestException('La familia compatible debe existir y ser distinta a la familia del equipo principal.');
        if (family.skus.length || ['MOTORES', 'MOTOR_PARA_MEZCLADORA'].includes(family.code))
          throw new BadRequestException('El motor se asigna al equipo desde el botón Motor de la ficha, no como una familia elegible en documentos.');
      } else if (row.assetId) {
        if (row.assetId === owner.assetId)
          throw new BadRequestException(
            'El equipo no puede agregarse a sí mismo.',
          );
        const child = await tx.asset.findFirst({
          where: { id: row.assetId, active: true, deletedAt: null },
          select: { id: true, kind: true },
        });
        if (!child)
          throw new BadRequestException(
            'El equipo vinculado no existe o está inactivo.',
          );
        if (child.kind === 'MOTOR')
          throw new BadRequestException(
            'Asigna el motor desde el botón Motor de la ficha; no como una pieza opcional.',
          );
        const conflicting = await tx.equipmentConfigurationEntry.count({
          where: {
            assetId: child.id,
            role: { not: row.role },
            ...(existing ? { configurationId: { not: existing.id } } : {}),
          },
        });
        if (conflicting)
          throw new BadRequestException(
            'Este equipo ya tiene otra clasificación en una configuración. Revisa sus vínculos antes de reclasificarlo.',
          );
      } else if (accessoryId) {
        if (accessoryId === owner.accessoryId)
          throw new BadRequestException(
            'El accesorio no puede agregarse a sí mismo.',
          );
        const child = await tx.accessory.findFirst({
          where: { id: accessoryId, active: true },
          include: { assets: true, subfamilies: true, compatibleParents: true },
        });
        if (!child || child.purpose !== row.role)
          throw new BadRequestException(
            'La clasificación del elemento no coincide: componente y accesorio no son intercambiables.',
          );
        if (child.kind === 'INDIVIDUAL' && row.quantity !== 1)
          throw new BadRequestException(
            'Un elemento individualizado se configura como una unidad.',
          );
        const compatible = parent.asset
          ? isCompatible(
              {
                ...child,
                assetIds: child.assets.map((a) => a.assetId),
                subfamilyIds: child.subfamilies.map((s) => s.subfamilyId),
              },
              parent.asset,
            )
          : child.scope === 'ACCESSORIES' &&
            child.compatibleParents.some(
              (p) => p.parentAccessoryId === owner.accessoryId,
            );
        if (!compatible)
          throw new BadRequestException(
            'El elemento no es compatible con este equipo o accesorio. Configura primero su compatibilidad.',
          );
      }
      data.push({
        id: row.id,
        configurationId: '',
        role: row.role,
        assetId: row.assetId ?? null,
        accessoryId: accessoryId ?? null,
        familyId: row.familyId ?? null,
        maximumQuantity: row.maximumQuantity ?? null,
        quantity: row.quantity,
        defaultIncluded: row.defaultIncluded,
        required: row.required,
        sortOrder,
      });
    }

    // Only walk reachable configurations; no full-inventory query or recursive N+1 fetch.
    const root = ownerKey(owner);
    const concrete = data.filter(row => row.assetId || row.accessoryId);
    const edges: Array<[string, string]> = concrete.map((row) => [
      root,
      ownerKey(row),
    ]);
    let frontier = concrete.map((row) => ({
      assetId: row.assetId,
      accessoryId: row.accessoryId,
    }));
    const visited = new Set<string>([root]);
    for (let depth = 0; frontier.length; depth++) {
      if (depth > 16)
        throw new BadRequestException(
          'La configuración admite hasta 16 niveles.',
        );
      const next = frontier.filter((node) => !visited.has(ownerKey(node)));
      if (!next.length) break;
      next.forEach((node) => visited.add(ownerKey(node)));
      const configs = await tx.equipmentConfiguration.findMany({
        where: {
          OR: next.map((node) =>
            node.assetId
              ? { assetId: node.assetId }
              : { accessoryId: node.accessoryId! },
          ),
        },
        include: { entries: true },
      });
      frontier = [];
      for (const config of configs)
        for (const entry of config.entries) {
          if (entry.familyId) continue;
          edges.push([ownerKey(config), ownerKey(entry)]);
          frontier.push(entry);
        }
    }
    assertAcyclicConfiguration(root, edges);
    const config =
      existing ?? (await tx.equipmentConfiguration.create({ data: owner }));
    await tx.equipmentConfigurationEntry.deleteMany({
      where: { configurationId: config.id },
    });
    if (data.length)
      await tx.equipmentConfigurationEntry.createMany({
        data: data.map((row) => ({ ...row, configurationId: config.id })),
      });
    const saved = await tx.equipmentConfiguration.update({
      where: { id: config.id },
      data: { version: { increment: 1 }, ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}) },
      include,
    });
    const snapshot = (rows: typeof saved.entries) =>
      rows.map(
        ({
          id,
          role,
          assetId,
          accessoryId,
          familyId,
          maximumQuantity,
          quantity,
          defaultIncluded,
          required,
        }) => ({
          id,
          role,
          assetId,
          accessoryId,
          familyId,
          maximumQuantity,
          quantity,
          defaultIncluded,
          required,
        }),
      );
    await tx.equipmentConfigurationRevision.create({
      data: {
        configurationId: config.id,
        before: { entries: snapshot(existing?.entries ?? []), notes: existing?.notes ?? null },
        after: { entries: snapshot(saved.entries), notes: saved.notes },
        createdBy: userId,
      },
    });
    return { ...saved, ...(savedAsset ? { motor: motorSnapshot(savedAsset) } : {}) };
  }
}
