import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { reviewedDocumentaryIdentities } from '../accessories/implement-documentary-identity';

/** Documentary lots, not stock. Pickers must intersect them with current physical availability. */
export async function documentReturnOrigins(db: Prisma.TransactionClient, customerWorksiteId: string, excludeDocumentId?: string) {
  const rows = await db.documentItem.findMany({
    where: { ...(excludeDocumentId ? { documentId: { not: excludeDocumentId } } : {}),
      OR: [{ compositionNodeId: { not: null } }, { accessory: { implementBridge: { isNot: null } } }],
      document: { type: 'REMISSION', status: 'CONFIRMED', customerWorksiteId } },
    include: {
      accessory: { select: { implementBridge: { select: { assetId: true, skuId: true, effectiveAt: true, evidenceSnapshot: true } } } },
      document: { select: { consecutive: true, docDate: true } },
      compositionParent: { select: { id: true, accessoryId: true, assetId: true, accessoryName: true, accessoryCode: true } },
      parentSourceDocumentItem: { select: { id: true, accessoryId: true, assetId: true, accessoryName: true, accessoryCode: true } },
      derivedDocumentItems: { where: { ...(excludeDocumentId ? { documentId: { not: excludeDocumentId } } : {}), document: { status: 'CONFIRMED', type: 'RETURN' } }, select: { quantity: true } },
    },
    orderBy: [{ document: { docDate: 'asc' } }, { id: 'asc' }], take: 5001,
  });
  if (rows.length > 5000) throw new BadRequestException('Demasiadas líneas para consultar esta obra. Solicita un filtro de fechas a Office.');
  const at = new Date();
  return (await reviewedDocumentaryIdentities(db, rows, at)).flatMap(row => {
    const bridge = row.accessory?.implementBridge;
    const evidence = bridge?.evidenceSnapshot as { before?: { reviewedWarehouse?: unknown }; documentarySource?: { id?: string } } | undefined;
    // Only close the exact reviewed lot, after the current-custody cutover.
    // Other historical deliveries and future cutovers remain returnable.
    if (bridge && bridge.effectiveAt <= at && evidence?.before?.reviewedWarehouse && evidence.documentarySource?.id === row.id) return [];
    const quantity = Number(row.quantity ?? 1) - row.derivedDocumentItems.reduce((sum, item) => sum + Number(item.quantity ?? 1), 0);
    if (quantity <= 0) return [];
    const parent = row.compositionParent ?? row.parentSourceDocumentItem;
    return [{
      sourceDocumentItemId: row.id, parentSourceDocumentItemId: parent?.id ?? null,
      parentLegacyOriginId: row.parentLegacyOriginId,
      assetId: row.assetId, skuId: row.skuId, accessoryId: row.accessoryId,
      deliveryFuel: row.deliveryFuel,
      componentParentAssetId: row.componentParentAssetId, parentAccessoryId: parent?.accessoryId ?? null,
      parentAccessoryName: parent?.accessoryName ? `${parent.accessoryName}${parent.accessoryCode ? ` · ${parent.accessoryCode}` : ''}` : null,
      ownerWarehouseId: row.condition, quantity, consecutive: row.document.consecutive, docDate: row.document.docDate,
    }];
  });
}
