import { MovementType } from '@prisma/client';

export const WORKSITE_BALANCE_MOVEMENT_TYPES = [
  MovementType.OUT,
  MovementType.ON_SITE,
  MovementType.IN,
  MovementType.TRANSIT,
] as const;

/**
 * Converts a ledger quantity into its contribution to inventory at a worksite.
 *
 * OUT is stored as a negative warehouse movement, but it represents a positive
 * arrival at the worksite attached to that row. ON_SITE is already positive.
 * IN and TRANSIT represent units leaving the worksite and are subtracted.
 */
export function getWorksiteQuantityDelta(
  movementType: MovementType,
  quantity: number,
) {
  switch (movementType) {
    case MovementType.OUT:
      return -quantity;
    case MovementType.ON_SITE:
      return quantity;
    case MovementType.IN:
    case MovementType.TRANSIT:
      return -quantity;
    default:
      return 0;
  }
}
