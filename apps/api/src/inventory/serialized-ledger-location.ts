export type SerializedLedgerMovement = {
  id: string;
  assetId: string | null;
  ownerWarehouseId: string;
  warehouseId: string | null;
  customerWorksiteId: string | null;
  movementType: string;
  quantity: unknown;
  refDocumentId: string | null;
  refDocumentType: string | null;
  isOpeningBalance: boolean;
  effectiveAt: Date;
  createdAt: Date;
};

export type ResolvedSerializedMovement<T extends SerializedLedgerMovement> = {
  /** Keep the actual latest row for chronological/backdating validation. */
  latest: T;
  /** Null means the latest provider transfer has no unambiguous destination. */
  locationMovement: T | null;
};

function documentAssetKey(row: SerializedLedgerMovement): string | null {
  return row.assetId && row.refDocumentId
    ? JSON.stringify([row.assetId, row.refDocumentId])
    : null;
}

function providerTransferKey(row: SerializedLedgerMovement): string | null {
  if (
    !row.assetId
    || !row.refDocumentId
    || (row.refDocumentType !== 'PROVIDER_PICKUP'
      && row.refDocumentType !== 'PROVIDER_RECEIPT')
  ) {
    return null;
  }
  return JSON.stringify([
    row.assetId,
    row.ownerWarehouseId,
    row.refDocumentId,
    row.refDocumentType,
  ]);
}

/**
 * Resolve physical location from complete serialized histories. Catalogue
 * registration is an undated baseline, so real movements always take priority.
 * A provider transfer is one OUT/IN event, not two competing UUIDs. Only resolve
 * its destination when both rows describe the same complete, balanced event.
 * Document/asset/owner/type identify the event: legacy sequential inserts can
 * have different effective and creation times. Their IN must not precede OUT;
 * never invent a timestamp tolerance or rewrite either row's chronology.
 * A provider receipt from transit legitimately has just one IN at the owner's
 * warehouse; custody returns instead require an OUT/IN pair. Callers must supply
 * complete histories so a mismatched counterpart cannot look like a transit
 * receipt. Incomplete or ambiguous warehouse transfers fail closed.
 */
export function resolveLatestSerializedMovements<T extends SerializedLedgerMovement>(
  rows: readonly T[],
): Map<string, ResolvedSerializedMovement<T>> {
  const sorted = [...rows].sort((a, b) =>
    Number(a.isOpeningBalance) - Number(b.isOpeningBalance)
    || b.effectiveAt.getTime() - a.effectiveAt.getTime()
    || b.createdAt.getTime() - a.createdAt.getTime()
    || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  const providerEvents = new Map<string, T[]>();
  const documentAssets = new Map<string, T[]>();
  for (const row of sorted) {
    const documentKey = documentAssetKey(row);
    if (documentKey !== null) {
      const documentRows = documentAssets.get(documentKey) ?? [];
      documentRows.push(row);
      documentAssets.set(documentKey, documentRows);
    }
    const key = providerTransferKey(row);
    if (key === null) continue;
    const event = providerEvents.get(key) ?? [];
    event.push(row);
    providerEvents.set(key, event);
  }

  const resolved = new Map<string, ResolvedSerializedMovement<T>>();
  for (const latest of sorted) {
    if (!latest.assetId || resolved.has(latest.assetId)) continue;
    const key = providerTransferKey(latest);
    if (key === null) {
      resolved.set(latest.assetId, { latest, locationMovement: latest });
      continue;
    }

    const event = providerEvents.get(key)!;
    const documentRows = documentAssets.get(documentAssetKey(latest)!)!;
    const transitReceipt = latest.refDocumentType === 'PROVIDER_RECEIPT'
      && documentRows.length === 1
      && latest.movementType === 'IN'
      && Number(latest.quantity) === 1
      && !latest.isOpeningBalance
      && latest.customerWorksiteId === null
      && Boolean(latest.warehouseId)
      && latest.warehouseId === latest.ownerWarehouseId;
    if (transitReceipt) {
      resolved.set(latest.assetId, { latest, locationMovement: latest });
      continue;
    }

    const source = event.find((row) => row.movementType === 'OUT');
    const destination = event.find((row) => row.movementType === 'IN');
    const complete = event.length === 2
      && documentRows.length === 2
      && source !== undefined
      && destination !== undefined
      && source.id !== destination.id
      && !source.isOpeningBalance
      && !destination.isOpeningBalance
      && source.customerWorksiteId === null
      && destination.customerWorksiteId === null
      && Boolean(source.warehouseId)
      && Boolean(destination.warehouseId)
      && source.warehouseId !== destination.warehouseId
      && Number(source.quantity) === -1
      && Number(destination.quantity) === 1
      && destination.effectiveAt.getTime() >= source.effectiveAt.getTime()
      && destination.createdAt.getTime() >= source.createdAt.getTime();
    resolved.set(latest.assetId, {
      latest,
      locationMovement: complete ? destination : null,
    });
  }
  return resolved;
}
