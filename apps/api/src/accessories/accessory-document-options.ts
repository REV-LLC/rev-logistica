import { Prisma } from '@prisma/client';
import { AccessoryDocumentOptionsDto } from './dto/accessory-document-options.dto';

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
  const compatibility: Prisma.AccessoryWhereInput = parent
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
      ? await db.$queryRaw<
          Array<{ id: string }>
        >`SELECT b.id FROM "AccessoryBalance" b JOIN "Accessory" a ON a.id = b."accessoryId" WHERE b."warehouseId" = a."ownerWarehouseId" AND b.quantity > 0 AND a."familyId" = ${parent!.sku.assetFamilyId}`
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
  return {
    items: rows.slice(0, 50).map((row) => ({
      accessoryId: row.accessoryId,
      sourceBalanceId: row.id,
      name: row.accessory.name,
      code: row.accessory.internalCode,
      kind: row.accessory.kind,
      quantity: row.quantity,
      ownerWarehouseId: row.accessory.ownerWarehouseId,
      ownerName: row.accessory.ownerWarehouse.name,
      parentAssetId: query.type === 'RETURN' ? row.assetId : parent!.id,
      parentName: `${(row.asset ?? parent)?.sku.name} · ${(row.asset ?? parent)?.publicCode}`,
      sourceLabel:
        row.warehouse?.name ??
        (row.customerWorksiteId
          ? 'Pendiente en esta obra'
          : 'Asignado al equipo en bodega'),
    })),
    hasMore: rows.length > 50,
  };
}
