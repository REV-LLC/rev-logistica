import { buildBulkKey, createSelectionId } from './request-formatting';
import type { InventoryBulk, SelectedItem, SkuOption, Warehouse } from './request-types';

export function getItemOwnerLabel(warehouse?: Warehouse | null) {
  return warehouse?.type === 'OWN' ? 'Renta Equipos del Valle' : warehouse?.name ?? 'Pendiente de identificar';
}

export function buildProviderCatalog(skus: SkuOption[], owner: Warehouse, sourceWarehouseId = owner.id): InventoryBulk[] {
  return skus.map(sku => ({
    skuId: sku.id,
    skuName: sku.name,
    assetFamilyId: sku.assetFamilyId,
    ownerWarehouseId: owner.id,
    ownerWarehouseName: getItemOwnerLabel(owner),
    sourceWarehouseId,
    // Catalog rows are selectable references, not provider stock balances.
    quantity: 1,
  }));
}

export function addProviderCatalogItem(items: SelectedItem[], reference: InventoryBulk): SelectedItem[] {
  const bulkKey = buildBulkKey(reference);
  if (items.some(item => item.bulkKey === bulkKey || (
    item.type === 'free' && item.ownerWarehouseId === reference.ownerWarehouseId &&
    item.sourceWarehouseId === reference.sourceWarehouseId &&
    item.requestedTag === reference.skuName
  ))) return items;
  const name = reference.skuName ?? reference.skuId;
  return [...items, {
    selectionId: createSelectionId(),
    type: 'free',
    bulkKey,
    name,
    requestedTag: name,
    quantity: 1,
    ownerWarehouseId: reference.ownerWarehouseId,
    sourceWarehouseId: reference.sourceWarehouseId,
  }];
}
