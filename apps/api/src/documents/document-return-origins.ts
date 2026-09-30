import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Documentary lots, not stock. Pickers must intersect them with current physical availability. */
export async function documentReturnOrigins(db: Prisma.TransactionClient, customerWorksiteId: string, excludeDocumentId?: string) {
  const rows = await db.documentItem.findMany({
    where: { compositionNodeId: { not: null }, document: { type: 'REMISSION', status: 'CONFIRMED', customerWorksiteId } },
    include: {
      document: { select: { consecutive: true, docDate: true } },
      compositionParent: { select: { id: true, accessoryId: true, assetId: true } },
      parentSourceDocumentItem: { select: { id: true, accessoryId: true, assetId: true } },
      derivedDocumentItems: { where: { ...(excludeDocumentId ? { documentId: { not: excludeDocumentId } } : {}), document: { status: 'CONFIRMED', type: 'RETURN' } }, select: { quantity: true } },
    },
    orderBy: [{ document: { docDate: 'asc' } }, { id: 'asc' }], take: 5001,
  });
  if (rows.length > 5000) throw new BadRequestException('Demasiadas líneas para consultar esta obra. Solicita un filtro de fechas a Office.');
  return rows.flatMap(row => {
    const quantity = Number(row.quantity ?? 1) - row.derivedDocumentItems.reduce((sum, item) => sum + Number(item.quantity ?? 1), 0);
    if (quantity <= 0) return [];
    const parent = row.compositionParent ?? row.parentSourceDocumentItem;
    return [{
      sourceDocumentItemId: row.id, parentSourceDocumentItemId: parent?.id ?? null,
      assetId: row.assetId, skuId: row.skuId, accessoryId: row.accessoryId,
      componentParentAssetId: row.componentParentAssetId, parentAccessoryId: parent?.accessoryId ?? null,
      ownerWarehouseId: row.condition, quantity, consecutive: row.document.consecutive, docDate: row.document.docDate,
    }];
  });
}
