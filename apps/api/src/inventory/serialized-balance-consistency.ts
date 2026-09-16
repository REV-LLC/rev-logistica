import { MovementType } from '@prisma/client';
import { type SerializedLedgerMovement } from './serialized-ledger-location';
import { getWorksiteQuantityDelta } from './worksite-ledger-balance';

/** Validate a complete, single-asset history against its chronological location.
 * Keep the same signed balance rules as warehouse/worksite inventory. A latest
 * movement alone cannot establish availability (notably for backdated returns).
 */
export function serializedBalanceConsistency(
  rows: readonly SerializedLedgerMovement[],
  ownerWarehouseId: string,
  latest: SerializedLedgerMovement | null | undefined,
) {
  const warehouses = new Map<string, number>();
  const worksites = new Map<string, number>();
  const add = (map: Map<string, number>, id: string, quantity: number) =>
    map.set(id, (map.get(id) ?? 0) + quantity);
  for (const row of rows) {
    const quantity = Number(row.quantity);
    if (row.warehouseId) add(warehouses, row.warehouseId, quantity);
    if (row.movementType === MovementType.ON_SITE && row.ownerWarehouseId) {
      add(warehouses, row.ownerWarehouseId, -quantity);
    }
    if (row.customerWorksiteId) {
      add(worksites, row.customerWorksiteId,
        getWorksiteQuantityDelta(row.movementType as MovementType, quantity));
    }
  }
  const positions = [
    ...[...warehouses].map(([id, quantity]) => ({ type: 'WAREHOUSE', id, quantity })),
    ...[...worksites].map(([id, quantity]) => ({ type: 'WORKSITE', id, quantity })),
  ].filter((position) => position.quantity !== 0);
  const position = positions.length === 1 && positions[0].quantity === 1 ? positions[0] : null;
  const latestType = latest && Number(latest.quantity) > 0
    && (latest.movementType === MovementType.IN || latest.movementType === MovementType.ADJUST)
    && latest.warehouseId ? 'WAREHOUSE'
    : latest?.customerWorksiteId
      && (latest.movementType === MovementType.ON_SITE || latest.movementType === MovementType.OUT)
      ? 'WORKSITE' : null;
  const isConsistent = Boolean(position && latestType === position.type
    && position.id === (latestType === 'WAREHOUSE' ? latest?.warehouseId : latest?.customerWorksiteId));
  return {
    warehouseQuantity: warehouses.get(ownerWarehouseId) ?? 0,
    worksiteQuantity: [...worksites.values()].reduce((sum, quantity) => sum + quantity, 0),
    isConsistent,
    issue: isConsistent ? null : !rows.length ? 'NO_MOVEMENTS' as const
      : !position ? 'INVALID_BALANCE' as const : 'LOCATION_MISMATCH' as const,
  };
}
