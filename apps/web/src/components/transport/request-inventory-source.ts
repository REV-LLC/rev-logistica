export type RequestInventorySourceMode = 'WAREHOUSE' | 'OWNER_WAREHOUSES';

export type RequestInventorySource = {
  type?: string;
  inventorySourceMode?: RequestInventorySourceMode | null;
  warehouse?: { id: string; name?: string } | null;
  notes?: string | null;
};

// Preserve historical documents. Logistics never overrides an explicit source.
export function getRequestInventorySourceMode(document: RequestInventorySource): RequestInventorySourceMode {
  if (document.inventorySourceMode) return document.inventorySourceMode;
  const entry = document.notes?.split('|').map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith('entrega:'));
  const delivery = entry?.split(':')[1]?.trim().toUpperCase();
  return delivery === 'ON_SITE' ? 'OWNER_WAREHOUSES' : 'WAREHOUSE';
}

export function getRequestSourceWarehouseId(
  document: RequestInventorySource,
  ownerWarehouseId?: string | null,
): string | null {
  // Returns retain their existing resolution flow; this contract controls dispatches.
  if (document.type === 'RETURN' || getRequestInventorySourceMode(document) === 'OWNER_WAREHOUSES') {
    return ownerWarehouseId?.trim() || null;
  }
  return document.warehouse?.id ?? null;
}

type OwnedInventoryItem = { ownerWarehouseId?: string | null };
type Inventory<Bulk, Serial> = { bulk: Bulk[]; serial: Serial[] };

// A physical warehouse can contain several owners. Fetch each location once and
// partition by ownership, never substitute the owner's warehouse for the source.
export async function loadRequestSourceInventories<Bulk extends OwnedInventoryItem, Serial extends OwnedInventoryItem>(
  document: RequestInventorySource,
  ownerIds: string[],
  fetchWarehouse: (warehouseId: string) => Promise<{ bulk?: Bulk[]; serial?: Serial[] }>,
): Promise<Record<string, Inventory<Bulk, Serial>>> {
  const owners = [...new Set(ownerIds.map((id) => id.trim()).filter(Boolean))];
  const sourceByOwner = owners.map((ownerId) => {
    const sourceId = getRequestSourceWarehouseId(document, ownerId);
    if (!sourceId) throw new Error('Selecciona la bodega de salida del documento antes de resolver los equipos.');
    return { ownerId, sourceId };
  });
  const warehouses = new Map(await Promise.all(
    [...new Set(sourceByOwner.map(({ sourceId }) => sourceId))].map(async (sourceId) =>
      [sourceId, await fetchWarehouse(sourceId)] as const),
  ));
  return Object.fromEntries(sourceByOwner.map(({ ownerId, sourceId }) => {
    const inventory = warehouses.get(sourceId)!;
    return [ownerId, {
      bulk: (inventory.bulk ?? []).filter((item) => item.ownerWarehouseId === ownerId),
      serial: (inventory.serial ?? []).filter((item) => item.ownerWarehouseId === ownerId),
    }];
  }));
}
