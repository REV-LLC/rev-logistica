import { Prisma } from '@prisma/client';

/**
 * A ledger row belongs to the physical balance of a warehouse whenever it has
 * that warehouseId. customerWorksiteId is movement traceability (origin or
 * destination worksite), not a second physical-location filter.
 *
 * Keep warehouse availability checks and warehouse inventory projections on
 * this predicate so returns and dispatches are never silently omitted.
 */
export function physicalWarehouseLedgerWhere(
  warehouseId: string,
): Prisma.StockLedgerWhereInput {
  return { warehouseId };
}
