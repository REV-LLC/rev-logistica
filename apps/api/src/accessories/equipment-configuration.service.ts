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
  implementRecommendationRules,
  validateConfigurationDraft,
} from './equipment-configuration-rules';
import { isCompatible } from './accessory-rules';
import { documentReturnOrigins } from '../documents/document-return-origins';
import { assetDisplayName } from './asset-display';

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
      sku: { select: { id: true, name: true, imageUrl: true, isConsumable: true } },
      family: { select: { id: true, name: true, controlType: true } },
      asset: {
        select: {
          id: true,
          publicCode: true,
          description: true,
          internalNumber: true,
          warehouseOwner: { select: { name: true } },
          kind: true,
          isImplement: true,
          imageFileObject: { select: { storageKey: true } },
          sku: { select: { name: true, imageUrl: true } },
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

  async assetCandidates(search = '', page = 0, implementsOnly = false) {
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
        ...(implementsOnly ? { isImplement: true } : {}),
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
      select: { id: true, publicCode: true, description: true, internalNumber: true, isImplement: true,
        imageFileObject: { select: { storageKey: true } },
        warehouseOwner: { select: { name: true } }, sku: { select: { name: true, imageUrl: true } } },
      orderBy: { id: 'asc' },
      skip: page * 50,
      take: 51,
    });
    return { items: items.slice(0, 50).map(item => ({ ...item, imageUrl: item.imageFileObject?.storageKey ?? item.sku.imageUrl })), hasMore: items.length > 50 };
  }

  private async parent(
    tx: Prisma.TransactionClient,
    owner: ConfigurationOwner,
  ) {
    if (owner.assetId) {
      const asset = await tx.asset.findFirst({
        where: { id: owner.assetId, active: true, deletedAt: null },
        include: {
          sku: { include: { assetFamily: { select: { deliveryFuelSelectable: true } } } },
          warehouseOwner: { select: { name: true } },
        },
      });
      if (!asset) throw new NotFoundException('Equipo activo no encontrado.');
      return {
        asset,
        accessory: null,
        name: assetDisplayName(asset),
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
        implementBridge: { select: { assetId: true } },
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
    if (accessory.implementBridge)
      throw new BadRequestException('Este implemento ya fue convertido a equipo. Abre su ficha de inventario para configurarlo.');
    return {
      asset: null,
      accessory,
      name: accessory.name,
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
      entries: (config?.entries ?? []).map(entry => ({ ...entry, ...implementRecommendationRules(entry),
        ...(entry.asset ? { asset: { ...entry.asset, imageUrl: entry.asset.imageFileObject?.storageKey ?? entry.asset.sku.imageUrl } } : {}),
      })),
      deliveryFuelSelectable: !parent.asset?.isImplement && (parent.asset?.sku.assetFamily?.deliveryFuelSelectable ?? false),
      parent: {
        name: parent.name,
        familyId: parent.familyId,
        ownerWarehouseId: parent.ownerWarehouseId,
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
    dto = { ...dto, entries: dto.entries.map(row => ({ ...row, ...implementRecommendationRules(row) })) };
    validateConfigurationDraft(dto);
    // Identity promotion locks Accessory rows first as well. Do not let a
    // concurrent configuration retain an old identity after its cutover.
    const legacyIds = [...new Set([
      ...(owner.accessoryId ? [owner.accessoryId] : []),
      ...dto.entries.flatMap(row => row.accessoryId ? [row.accessoryId] : []),
    ])].sort();
    for (const id of legacyIds)
      await tx.$queryRaw`SELECT id FROM "Accessory" WHERE id = ${id} FOR SHARE`;
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

    // Older clients do not know this optional field. Preserve an existing route
    // only when both the row and its family identity are unchanged; explicit
    // null is how a current client reconnects a family to the principal asset.
    const previousEntries = new Map(existing?.entries.map(row => [row.id, row]) ?? []);
    dto = { ...dto, entries: dto.entries.map(row => {
      const previous = previousEntries.get(row.id);
      return row.templateParentFamilyId === undefined && row.familyId &&
        previous?.familyId === row.familyId
        ? { ...row, templateParentFamilyId: previous.templateParentFamilyId }
        : row;
    }) };
    validateConfigurationDraft(dto);


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
          throw new BadRequestException('Los motores antiguos no forman parte de las nuevas configuraciones de entrega.');
      } else if (row.skuId) {
        const child = await tx.sku.findFirst({ where: { id: row.skuId, active: true, isImplement: true,
          assetFamily: { controlType: 'BULK' } }, select: { id: true } });
        if (!child) throw new BadRequestException('Selecciona un implemento registrado por cantidad.');
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
            'El motor antiguo conserva su historial; no se vincula como implemento. Elige eléctrica o gasolina en la entrega.',
          );
      } else if (accessoryId) {
        if (accessoryId === owner.accessoryId)
          throw new BadRequestException(
            'El accesorio no puede agregarse a sí mismo.',
          );
        const child = await tx.accessory.findFirst({
          where: { id: accessoryId, active: true },
          include: { assets: true, subfamilies: true, compatibleParents: true,
            implementBridge: { select: { assetId: true } } },
        });
        if (!child)
          throw new BadRequestException(
            'El implemento no existe o está inactivo.',
          );
        if (child.implementBridge)
          throw new BadRequestException('Este implemento ya fue convertido a equipo. Agrégalo desde las unidades de inventario.');
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
        ...implementRecommendationRules(row),
        assetId: row.assetId ?? null,
        skuId: row.skuId ?? null,
        accessoryId: accessoryId ?? null,
        familyId: row.familyId ?? null,
        templateParentFamilyId: row.templateParentFamilyId ?? null,
        quantity: row.quantity,
        defaultIncluded: row.defaultIncluded,
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
          skuId,
          recommendation,
          accessoryId,
          familyId,
          templateParentFamilyId,
          maximumQuantity,
          quantity,
          defaultIncluded,
          required,
        }) => ({
          id,
          role,
          assetId,
          skuId,
          recommendation,
          accessoryId,
          familyId,
          templateParentFamilyId,
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
    return saved;
  }
}
