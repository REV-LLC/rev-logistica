import { InventorySourceMode } from '@prisma/client';

export function resolveDocumentItemSourceWarehouseId(
  document: { inventorySourceMode?: InventorySourceMode | null; notes?: string | null; warehouseId?: string | null },
  item: { sourceWarehouseId?: string | null; condition?: string | null },
): string | null {
  return item.sourceWarehouseId?.trim() ||
    (resolveDocumentInventorySourceMode(document) === InventorySourceMode.WAREHOUSE
      ? document.warehouseId ?? null : item.condition?.trim() || null);
}

/** Delivery arrangements are only a compatibility fallback for legacy requests. */
export function resolveDocumentInventorySourceMode(document: {
  inventorySourceMode?: InventorySourceMode | null;
  notes?: string | null;
}): InventorySourceMode {
  if (document.inventorySourceMode) return document.inventorySourceMode;

  const entry = document.notes
    ?.split('|')
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith('entrega:'));
  const mode = entry?.split(':')[1]?.trim().toUpperCase();
  return mode === 'ON_SITE'
    ? InventorySourceMode.OWNER_WAREHOUSES
    : InventorySourceMode.WAREHOUSE;
}
