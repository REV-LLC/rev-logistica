import { Prisma } from '@prisma/client';
import { AccessoryDocumentOptionsDto } from './dto/accessory-document-options.dto';
import { documentReturnOrigins } from '../documents/document-return-origins';
import { assetDisplayName } from './asset-display';

export async function accessoryDocumentOptions(
  db: Prisma.TransactionClient,
  query: AccessoryDocumentOptionsDto,
) {
  const parent = query.assetId
    ? await db.asset.findUnique({
        where: { id: query.assetId },
        include: { sku: true },
      })
    : null;
  if (
    query.type === 'REMISSION' &&
    (!parent || !parent.active || parent.deletedAt)
  )
    return { items: [], hasMore: false };
  const compatibility: Prisma.AccessoryWhereInput = query.parentAccessoryId ? {
    scope: 'ACCESSORIES', compatibleParents: { some: { parentAccessoryId: query.parentAccessoryId } },
  } : parent
    ? {
        familyId: parent.sku.assetFamilyId,
        OR: [
          { scope: 'FAMILY' },
          { scope: 'ASSETS', assets: { some: { assetId: parent.id } } },
          ...(parent.sku.assetSubfamilyId
            ? [
                {
                  scope: 'SUBFAMILIES' as const,
                  subfamilies: {
                    some: { subfamilyId: parent.sku.assetSubfamilyId },
                  },
                },
              ]
            : []),
        ],
      }
    : {};
  // ON_SITE stock must actually be at its owner's warehouse, not any warehouse.
  const ownerStock =
    query.type === 'REMISSION' && query.deliveryMode === 'ON_SITE'
      ? query.parentAccessoryId ? await db.$queryRaw<Array<{ id: string }>>`
        SELECT b.id FROM "AccessoryBalance" b JOIN "Accessory" a ON a.id = b."accessoryId"
        JOIN "AccessoryParent" p ON p."accessoryId" = a.id
        WHERE b."warehouseId" = a."ownerWarehouseId" AND b.quantity > 0 AND p."parentAccessoryId" = ${query.parentAccessoryId}
        AND NOT EXISTS (SELECT 1 FROM "ImplementIdentityBridge" bridge WHERE bridge."accessoryId" = a.id)`
      : await db.$queryRaw<
          Array<{ id: string }>
        >`SELECT b.id FROM "AccessoryBalance" b JOIN "Accessory" a ON a.id = b."accessoryId" WHERE b."warehouseId" = a."ownerWarehouseId" AND b.quantity > 0 AND a."familyId" = ${parent!.sku.assetFamilyId}
          AND NOT EXISTS (SELECT 1 FROM "ImplementIdentityBridge" bridge WHERE bridge."accessoryId" = a.id)`
      : [];
  const rows = await db.accessoryBalance.findMany({
    where: {
      quantity: { gt: 0 },
      transitDocumentId: null,
      ...(query.type === 'RETURN'
        ? {
            customerWorksiteId: query.customerWorksiteId,
            ...(query.assetId ? { assetId: query.assetId } : {}),
          }
        : {
            customerWorksiteId: null,
            OR: [
              ...(query.warehouseId && query.deliveryMode !== 'ON_SITE'
                ? [{ warehouseId: query.warehouseId }]
                : []),
              ...(query.deliveryMode === 'ON_SITE'
                ? [{ id: { in: ownerStock.map((balance) => balance.id) } }]
                : []),
              ...(parent!.warehouseCurrentId ===
              (query.deliveryMode === 'ON_SITE'
                ? parent!.warehouseOwnerId
                : query.warehouseId)
                ? [{ assetId: parent!.id }]
                : []),
            ],
          }),
      accessory: {
        active: true,
        implementBridge: null,
        ...(query.configuredOnly === 'true'
          ? { configurationEntries: { some: { configuration: query.parentAccessoryId ? { accessoryId: query.parentAccessoryId } : { assetId: query.assetId ?? '00000000-0000-0000-0000-000000000000' } } } }
          : {}),
        AND: [
          ...(query.type === 'REMISSION' ? [compatibility] : []),
          ...(query.search?.trim()
            ? [
                {
                  OR: [
                    {
                      name: {
                        contains: query.search.trim(),
                        mode: 'insensitive' as const,
                      },
                    },
                    {
                      internalCode: {
                        contains: query.search.trim(),
                        mode: 'insensitive' as const,
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
    },
    include: {
      accessory: { include: { ownerWarehouse: true } },
      warehouse: true,
      asset: { include: { sku: true } },
    },
    orderBy: [{ accessory: { name: 'asc' } }, { id: 'asc' }],
    take: 51,
    skip: query.page * 50,
  });
  const origins = await documentReturnOrigins(db, query.customerWorksiteId);
  const parentOrigin = origins.filter(origin => query.parentAccessoryId ? origin.accessoryId === query.parentAccessoryId && origin.componentParentAssetId === query.assetId : origin.assetId === query.assetId);
  const accessoryParent = query.parentAccessoryId ? await db.accessory.findUnique({
    where: { id: query.parentAccessoryId }, select: { name: true, internalCode: true },
  }) : null;
  return {
    items: rows.slice(0, 50).flatMap((row) => {
      const base = {
      accessoryId: row.accessoryId,
      sourceBalanceId: row.id,
      name: row.accessory.name,
      code: row.accessory.internalCode,
      kind: row.accessory.kind,
      purpose: row.accessory.purpose,
      quantity: row.quantity,
      physicalQuantity: row.quantity,
      ownerWarehouseId: row.accessory.ownerWarehouseId,
      ownerName: row.accessory.ownerWarehouse.name,
      parentAssetId: query.type === 'RETURN' ? row.assetId : parent!.id,
      parentAccessoryId: query.parentAccessoryId ?? null,
      parentName: accessoryParent ? accessoryParent.name : assetDisplayName(row.asset ?? parent),
      sourceLabel:
        row.warehouse?.name ??
        (row.customerWorksiteId
          ? 'Pendiente en esta obra'
          : 'Asignado al equipo en bodega'),
      };
      if (query.type === 'REMISSION') return [{ ...base,
        parentSourceDocumentItemId: parentOrigin.length === 1 ? parentOrigin[0].sourceDocumentItemId : null,
      }];
      const lots = origins.filter(origin => origin.accessoryId === row.accessoryId && origin.componentParentAssetId === row.assetId &&
        (!query.parentAccessoryId || origin.parentAccessoryId === query.parentAccessoryId));
      if (lots.length) return [...lots.map(origin => ({ ...base,
        quantity: Math.min(row.quantity, origin.quantity), sourceDocumentItemId: origin.sourceDocumentItemId,
        parentSourceDocumentItemId: origin.parentSourceDocumentItemId, parentAccessoryId: origin.parentAccessoryId,
        parentLegacyOriginId: origin.parentLegacyOriginId,
        parentName: origin.parentAccessoryName ?? base.parentName,
        sourceLabel: `${base.sourceLabel} · ${origin.consecutive ?? 'Remisión'}`,
      })), ...(!query.parentAccessoryId && row.quantity > lots.reduce((sum, lot) => sum + lot.quantity, 0)
        ? [{ ...base, quantity: row.quantity - lots.reduce((sum, lot) => sum + lot.quantity, 0), sourceLabel: `${base.sourceLabel} · Saldo anterior` }] : [])];
      // Historical custody remains available without fabricating a source line.
      return query.parentAccessoryId ? [] : [base];
    }),
    hasMore: rows.length > 50,
  };
}
