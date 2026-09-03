export type SerializedBalanceRow = {
  assetId: string | null;
  _sum: { quantity: unknown };
};

/**
 * Canonical serialized availability for a physical warehouse.
 * Warehouse-linked movements form the physical balance; ON_SITE seed/moves
 * reserve the same asset away from its owner warehouse.
 */
export function buildSerializedWarehouseAvailability(
  warehouseRows: SerializedBalanceRow[],
  onSiteRows: SerializedBalanceRow[],
) {
  const availability = new Map<string, number>();

  warehouseRows.forEach((row) => {
    if (!row.assetId) return;
    availability.set(
      row.assetId,
      (availability.get(row.assetId) ?? 0) + Number(row._sum.quantity ?? 0),
    );
  });
  onSiteRows.forEach((row) => {
    if (!row.assetId) return;
    availability.set(
      row.assetId,
      (availability.get(row.assetId) ?? 0) - Number(row._sum.quantity ?? 0),
    );
  });

  return availability;
}

export function isSerializedAvailable(quantity: number | undefined) {
  return quantity === 1;
}
