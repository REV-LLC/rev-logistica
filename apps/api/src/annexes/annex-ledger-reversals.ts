import { Prisma } from '@prisma/client';

export const reversalFields = {
  id: true,
  refDocumentId: true,
  reversedByDocumentId: true,
  customerWorksiteId: true,
  ownerWarehouseId: true,
  warehouseId: true,
  skuId: true,
  assetId: true,
  movementType: true,
  quantity: true,
  document: { select: { type: true, status: true } },
} satisfies Prisma.StockLedgerSelect;

type Movement = Prisma.StockLedgerGetPayload<{ select: typeof reversalFields }>;
type Pair = { original: Movement[]; adjustment: Movement[] };

// A confirmed correction preserves both the superseded posting and its inverse
// in the ledger. Neither represents a rental. Keep every unproven pair for review.
export function effectiveAnnexRows<T extends Movement>(
  rows: T[],
  relatedOutsidePeriod: Movement[],
) {
  const groups = new Map<string, Pair>();
  for (const row of [...rows, ...relatedOutsidePeriod]) {
    const original = !!row.reversedByDocumentId;
    const adjustment =
      !original &&
      row.document?.type === 'ADJUSTMENT' &&
      row.document.status === 'CONFIRMED' &&
      !!row.refDocumentId;
    if (!original && !adjustment) continue;
    const incoming =
      (row.movementType === 'IN' || row.movementType === 'TRANSIT') &&
      row.quantity.gt(0);
    const outgoing = row.movementType === 'OUT' && row.quantity.lt(0);
    if (!incoming && !outgoing) continue;
    const key = JSON.stringify([
      row.reversedByDocumentId ?? row.refDocumentId,
      row.customerWorksiteId,
      row.ownerWarehouseId,
      row.warehouseId,
      row.skuId,
      row.assetId,
      original ? incoming : outgoing,
    ]);
    const group = groups.get(key) ?? { original: [], adjustment: [] };
    (original ? group.original : group.adjustment).push(row);
    groups.set(key, group);
  }
  const canceled = new Set<string>();
  for (const { original, adjustment } of groups.values()) {
    if (!original.length || !adjustment.length) continue;
    const pair = [...original, ...adjustment];
    if (
      pair
        .reduce((sum, row) => sum.plus(row.quantity), new Prisma.Decimal(0))
        .isZero()
    )
      pair.forEach((row) => canceled.add(row.id));
  }
  return rows.filter((row) => !canceled.has(row.id));
}
