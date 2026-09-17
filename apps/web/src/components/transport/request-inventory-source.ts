export type RequestInventorySourceMode = 'WAREHOUSE' | 'OWNER_WAREHOUSES';

export type RequestInventorySource = {
  type?: string;
  inventorySourceMode?: RequestInventorySourceMode | null;
  warehouse?: { id: string; name?: string } | null;
  notes?: string | null;
  items?: Array<{ condition?: string | null; sourceWarehouseId?: string | null }>;
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
  sourceWarehouseId?: string | null,
): string | null {
  if (document.type !== 'RETURN' && sourceWarehouseId) return sourceWarehouseId;
  // Returns retain their existing resolution flow; this contract controls dispatches.
  if (document.type === 'RETURN' || getRequestInventorySourceMode(document) === 'OWNER_WAREHOUSES') {
    return ownerWarehouseId?.trim() || null;
  }
  return document.warehouse?.id ?? null;
}

export function getRequestItemInventoryKey(document: RequestInventorySource,
  item: { condition?: string | null; sourceWarehouseId?: string | null }) {
  const owner = item.condition?.trim() ?? '';
  return document.type !== 'RETURN' && item.sourceWarehouseId ? `${owner}::${item.sourceWarehouseId}` : owner;
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
  const lines = document.type !== 'RETURN' && document.items?.length
    ? document.items.filter(item => owners.includes(item.condition?.trim() ?? ''))
    : owners.map(condition => ({ condition, sourceWarehouseId: undefined }));
  const sourceByOwner = lines.map((item) => {
    const ownerId = item.condition?.trim() ?? '';
    const sourceId = getRequestSourceWarehouseId(document, ownerId, item.sourceWarehouseId);
    if (!sourceId) throw new Error('Selecciona la bodega de salida del documento antes de resolver los equipos.');
    return { ownerId, sourceId, key: getRequestItemInventoryKey(document, item) };
  });
  const warehouses = new Map(await Promise.all(
    [...new Set(sourceByOwner.map(({ sourceId }) => sourceId))].map(async (sourceId) =>
      [sourceId, await fetchWarehouse(sourceId)] as const),
  ));
  return Object.fromEntries(sourceByOwner.map(({ ownerId, sourceId, key }) => {
    const inventory = warehouses.get(sourceId)!;
    return [key, {
      bulk: (inventory.bulk ?? []).filter((item) => item.ownerWarehouseId === ownerId),
      serial: (inventory.serial ?? []).filter((item) => item.ownerWarehouseId === ownerId),
    }];
  }));
}
