import type { Prisma } from '@prisma/client';

type Source = { id: string; assetId: string | null; accessoryId: string | null; skuId: string | null };

/** Read-time alias for an explicitly reviewed delivery. Never updates the old
 * DocumentItem or aliases unrelated deliveries of the same accessory. */
export async function reviewedDocumentaryIdentities<T extends Source>(
  tx: Prisma.TransactionClient, sources: T[], at: Date,
): Promise<T[]> {
  const ids = [...new Set(sources.flatMap(row => row.accessoryId ? [row.accessoryId] : []))];
  if (!ids.length) return sources;
  const bridges = await tx.implementIdentityBridge.findMany({ where: {
    accessoryId: { in: ids }, effectiveAt: { lte: at },
  }, include: { openingLedger: true } });
  return sources.map(source => {
    const bridge = bridges.find(row => row.accessoryId === source.accessoryId);
    const evidence = bridge?.evidenceSnapshot as any;
    if (evidence?.before?.reviewedWarehouse) return source; // Already confirmed outside the old worksite; never offer a second return.
    if (!bridge || bridge.effectiveAt > at || evidence?.schemaVersion !== 1 || evidence?.documentarySource?.id !== source.id ||
      evidence.before?.source?.id !== source.accessoryId || evidence.asset?.id !== bridge.assetId ||
      bridge.openingLedger.assetId !== bridge.assetId || !bridge.openingLedger.isOpeningBalance ||
      bridge.openingLedger.effectiveAt.getTime() !== bridge.effectiveAt.getTime()) return source;
    return { ...source, assetId: bridge.assetId, accessoryId: null, skuId: null };
  });
}
