import { api } from '@/lib/api';
import { getSerialDisplayName } from '@/lib/serial-assets';
import type { EquipmentConfiguration } from '../equipment-configuration/types';
import { entryName } from '../equipment-configuration/types';
import { buildBulkKey, createSelectionId } from './request-formatting';
import type { InventoryBulk, InventorySerial, SelectedItem } from './request-types';
import { inventoryWithReturnOrigins, type ReturnDocumentOrigin } from './return-document-origins';

export type ConfigurationContext = { docType: 'REMISSION' | 'RETURN'; customerWorksiteId: string; includeImplements?: boolean;
  onDeliveryFuelSelectable?: (enabled: boolean) => void };
export type DocumentPartOption = {
  key: string;
  name: string;
  role: 'COMPONENT' | 'ACCESSORY';
  defaultIncluded: boolean;
  required: boolean;
  quantity: number;
  item?: SelectedItem;
  unavailable?: string;
  locked?: boolean;
  /** Recommendation topology is separate from the physical document parent. */
  templateFamilyId?: string;
  templateFamilyName?: string;
  templateParentFamilyId?: string | null;
  itemFamilyId?: string;
};
type AccessoryOption = {
  accessoryId: string; sourceBalanceId: string; name: string; code: string | null;
  kind: 'INDIVIDUAL' | 'RETURNABLE' | 'CONSUMABLE'; quantity: number;
  purpose?: 'COMPONENT' | 'ACCESSORY'; physicalQuantity?: number;
  ownerWarehouseId: string; parentAssetId: string; sourceLabel: string;
  sourceDocumentItemId?: string; parentSourceDocumentItemId?: string;
};

export function sameDocumentPart(item: SelectedItem, option: SelectedItem) {
  const sameParent = item.parentCompositionNodeId || option.parentCompositionNodeId
    ? item.parentCompositionNodeId === option.parentCompositionNodeId
    : item.parentLegacyOriginId || option.parentLegacyOriginId
      ? item.parentLegacyOriginId === option.parentLegacyOriginId
    : item.parentSourceDocumentItemId || option.parentSourceDocumentItemId
      ? item.parentSourceDocumentItemId === option.parentSourceDocumentItemId
      : item.componentParentAssetId === option.componentParentAssetId;
  return sameParent && item.sourceDocumentItemId === option.sourceDocumentItemId &&
    (option.assetId ? item.assetId === option.assetId : option.type === 'bulk'
      ? item.type === 'bulk' && item.bulkKey === option.bulkKey
      : item.type === 'accessory' && item.accessorySourceBalanceId === option.accessorySourceBalanceId);
}

export function availableForDocument(option: SelectedItem, items: SelectedItem[]) {
  if (option.assetId) return items.some(item => item.assetId === option.assetId) ? 0 : 1;
  const matching = items.filter(item => option.type === 'bulk' ? item.type === 'bulk' && item.bulkKey === option.bulkKey
    : item.type === 'accessory' && item.accessorySourceBalanceId === option.accessorySourceBalanceId)
  const used = matching.filter(item => item.sourceDocumentItemId === option.sourceDocumentItemId)
    .reduce((sum, item) => sum + (item.quantity ?? 1), 0);
  const physicalUsed = matching.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
  return Math.max(0, Math.min((option.availableQuantity ?? 0) - used,
    (option.physicalAvailableQuantity ?? option.availableQuantity ?? 0) - physicalUsed));
}

export type DocumentTemplateRouteStatus = {
  status: 'COMPLETE' | 'PARTIAL' | 'UNVERIFIED';
  complete: boolean;
  present: number;
  total: number;
  missingFamilyNames: string[];
  unknownItemCount: number;
};

/** Read-only family coverage. A route never creates custody links or requires quantities. */
export function documentTemplateRouteStatus(
  parent: SelectedItem,
  options: DocumentPartOption[],
  selectedItems: SelectedItem[],
): DocumentTemplateRouteStatus | null {
  const families = new Map<string, string>();
  for (const option of options) {
    if (option.templateFamilyId) families.set(option.templateFamilyId, option.templateFamilyName ?? option.name);
  }
  if (!families.size) return null;

  const byId = new Map(selectedItems.map(item => [item.selectionId, item]));
  const byAsset = new Map<string, SelectedItem[]>();
  const bySource = new Map<string, SelectedItem[]>();
  for (const item of selectedItems) {
    if (item.assetId) byAsset.set(item.assetId, [...(byAsset.get(item.assetId) ?? []), item]);
    if (item.sourceDocumentItemId) bySource.set(item.sourceDocumentItemId, [...(bySource.get(item.sourceDocumentItemId) ?? []), item]);
  }
  const unique = (matches: SelectedItem[] | undefined) => matches?.length === 1 ? matches[0] : undefined;
  const documentParent = (item: SelectedItem) => {
    // Explicit line ancestry always takes priority; a missing line must not fall back to another equipment.
    if (item.parentCompositionNodeId) return byId.get(item.parentCompositionNodeId);
    if (item.parentSourceDocumentItemId) return unique(bySource.get(item.parentSourceDocumentItemId));
    if (item.parentLegacyOriginId) return undefined;
    return item.componentParentAssetId ? unique(byAsset.get(item.componentParentAssetId)) : undefined;
  };
  const belongsToEquipment = (item: SelectedItem) => {
    if (item.selectionId === parent.selectionId || !byId.has(parent.selectionId)) return false;
    const seen = new Set([item.selectionId]);
    let ancestor = documentParent(item);
    while (ancestor && !seen.has(ancestor.selectionId)) {
      if (ancestor.selectionId === parent.selectionId) return true;
      seen.add(ancestor.selectionId);
      ancestor = documentParent(ancestor);
    }
    return false;
  };
  const present = new Set<string>();
  const identity = (item: SelectedItem) => item.assetId ? `asset:${item.assetId}`
    : item.type === 'bulk' && item.skuId ? `sku:${item.skuId}`
      : item.type === 'accessory' && item.accessoryId ? `accessory:${item.accessoryId}` : undefined;
  const knownFamilies = new Map<string, Set<string>>();
  for (const option of options) {
    const key = option.item && identity(option.item);
    const familyId = option.itemFamilyId ?? option.templateFamilyId;
    if (key && familyId) {
      const ids = knownFamilies.get(key) ?? new Set<string>();
      ids.add(familyId);
      knownFamilies.set(key, ids);
    }
  }
  let unknownItemCount = 0;
  for (const item of selectedItems) {
    const quantity = item.quantity ?? 1;
    if (!Number.isFinite(quantity) || quantity <= 0 || !belongsToEquipment(item)) continue;
    const key = identity(item);
    const ids = key && knownFamilies.get(key);
    if (!ids) unknownItemCount++;
    else for (const familyId of ids) if (families.has(familyId)) present.add(familyId);
  }
  const missingFamilyNames = [...families].filter(([id]) => !present.has(id)).map(([, name]) => name);
  const complete = missingFamilyNames.length === 0;
  return { status: complete ? 'COMPLETE' : unknownItemCount ? 'UNVERIFIED' : 'PARTIAL',
    complete, present: present.size, total: families.size, missingFamilyNames, unknownItemCount };
}

/** Idempotent and non-destructive: never resets edited quantities or resurrects defaults on render. */
export function addDocumentParts(items: SelectedItem[], parent: SelectedItem, options: DocumentPartOption[]) {
  if (!items.some(item => item.selectionId === parent.selectionId)) return items;
  const next = [...items];
  for (const option of options) {
    if (!option.item || next.some(item => sameDocumentPart(item, option.item!))) continue;
    if (availableForDocument(option.item, next) < option.quantity) continue;
    next.push({ ...option.item, selectionId: createSelectionId(), quantity: option.quantity });
  }
  return next;
}

export async function loadDocumentConfiguration(
  parent: SelectedItem,
  context: ConfigurationContext,
  signal?: AbortSignal,
): Promise<DocumentPartOption[]> {
  if ((!parent.assetId && !(parent.accessoryId && parent.accessoryKind === 'INDIVIDUAL')) || !context.customerWorksiteId) return [];
  const anchorAssetId = parent.assetId ?? parent.componentParentAssetId;
  if (!anchorAssetId) throw new Error('El accesorio no tiene un equipo de referencia. Vuelve a cargar el documento.');
  const ownerRoute = parent.assetId ? `assets/${parent.assetId}` : `accessories/${parent.accessoryId}`;
  const loaded = context.docType === 'REMISSION'
    ? await api<EquipmentConfiguration>(`/equipment-configurations/${ownerRoute}`, { signal })
    : { entries: [], deliveryFuelSelectable: false };
  context.onDeliveryFuelSelectable?.(loaded.deliveryFuelSelectable ?? false);
  const config = context.includeImplements === false ? { ...loaded, entries: [] } : loaded;
  if (context.docType === 'REMISSION' && !config.entries.length) return [];
  const params = new URLSearchParams({ type: context.docType, customerWorksiteId: context.customerWorksiteId,
    assetId: anchorAssetId, deliveryMode: 'WAREHOUSE' });
  if (parent.accessoryId) params.set('parentAccessoryId', parent.accessoryId);
  if (context.docType === 'REMISSION') {
    params.set('configuredOnly', 'true');
    if (parent.sourceWarehouseId) params.set('warehouseId', parent.sourceWarehouseId);
  }
  const getAccessories = async () => {
    const all: AccessoryOption[] = [];
    for (let page = 0; ; page++) {
      params.set('page', String(page));
      const result = await api<{ items: AccessoryOption[]; hasMore: boolean }>(`/accessories/document-options?${params}`, { signal });
      all.push(...result.items);
      if (!result.hasMore) return all;
      if (page >= 19) throw new Error('Demasiadas piezas para cargar esta configuración. Consulta los accesorios por separado.');
    }
  };
  const [allAccessories, rawStock, legacyReturnParts, origins] = await Promise.all([
    config.entries.some(entry => entry.accessoryId) || context.docType === 'RETURN' ? getAccessories() : Promise.resolve([]),
    context.docType === 'RETURN'
      ? api<{ serial: InventorySerial[]; bulk: InventoryBulk[] }>(`/inventory/on-site/${context.customerWorksiteId}/request-options`, { signal })
      : config.entries.some(entry => entry.assetId || entry.skuId || entry.familyId) && parent.sourceWarehouseId
        ? api<{ serial: InventorySerial[]; bulk: InventoryBulk[] }>(`/inventory/warehouse/${parent.sourceWarehouseId}`, { signal })
        : Promise.resolve({ serial: [], bulk: [] }),
    context.docType === 'RETURN' && parent.assetId ? api<Array<{ assetId: string | null; skuId: string | null }>>(
      `/equipment-configurations/assets/${parent.assetId}/return-parts?customerWorksiteId=${encodeURIComponent(context.customerWorksiteId)}`, { signal }) : Promise.resolve([]),
    context.docType === 'RETURN' && parent.sourceDocumentItemId ? api<ReturnDocumentOrigin[]>(
      `/equipment-configurations/return-origins?customerWorksiteId=${encodeURIComponent(context.customerWorksiteId)}`, { signal }) : Promise.resolve([]),
  ]);
  const stock = inventoryWithReturnOrigins(rawStock, origins);
  const accessories = context.docType === 'RETURN' && parent.sourceDocumentItemId
    ? allAccessories.filter(option => option.parentSourceDocumentItemId === parent.sourceDocumentItemId) : allAccessories;
  const returnParts = parent.sourceDocumentItemId ? origins.filter(origin => origin.parentSourceDocumentItemId === parent.sourceDocumentItemId) : legacyReturnParts;
  // Returns keep the shipment parent, whether selected from the worksite tabs or
  // this configurator. A new composition parent would make the same lot appear unselected.
  const parentLink = context.docType === 'RETURN'
    ? { parentSourceDocumentItemId: parent.sourceDocumentItemId }
    : { parentCompositionNodeId: parent.selectionId };
  const accessoryItem = (option: AccessoryOption): SelectedItem => ({
    selectionId: '', type: 'accessory', accessoryId: option.accessoryId,
    accessorySourceBalanceId: option.sourceBalanceId, accessoryKind: option.kind,
    accessoryPurpose: option.purpose, physicalAvailableQuantity: option.physicalQuantity,
    componentParentAssetId: anchorAssetId, ...parentLink,
    sourceDocumentItemId: option.sourceDocumentItemId,
    name: option.name,
    quantity: 1, availableQuantity: option.quantity, ownerWarehouseId: option.ownerWarehouseId,
    sourceWarehouseId: context.docType === 'REMISSION' ? parent.sourceWarehouseId : undefined,
  });
  const serialItem = (asset: InventorySerial): SelectedItem => ({ selectionId: '', type: 'serial', assetId: asset.assetId,
    sourceDocumentItemId: asset.sourceDocumentItemId,
    name: getSerialDisplayName(asset), serial: asset.serialOrEngine, ownerWarehouseId: asset.ownerWarehouseId,
    sourceWarehouseId: context.docType === 'REMISSION' ? parent.sourceWarehouseId : undefined,
    ...parentLink, componentParentAssetId: anchorAssetId });
  const bulkItem = (bulk: InventoryBulk): SelectedItem => ({ selectionId: '', type: 'bulk', skuId: bulk.skuId,
    sourceDocumentItemId: bulk.sourceDocumentItemId,
    bulkKey: buildBulkKey({ ...bulk, sourceWarehouseId: context.docType === 'REMISSION' ? parent.sourceWarehouseId : undefined }),
    name: bulk.skuName ?? 'Pieza', ownerWarehouseId: bulk.ownerWarehouseId, availableQuantity: bulk.quantity,
    sourceWarehouseId: context.docType === 'REMISSION' ? parent.sourceWarehouseId : undefined,
    ...parentLink, componentParentAssetId: anchorAssetId });
  if (context.docType === 'RETURN') return [...accessories.map((option): DocumentPartOption => ({
    key: `${option.sourceBalanceId}:${option.sourceDocumentItemId ?? 'legacy'}`, name: option.name, role: 'ACCESSORY', defaultIncluded: false, required: false,
    quantity: option.kind === 'INDIVIDUAL' ? 1 : option.quantity, item: accessoryItem(option),
  })), ...stock.serial.filter(asset => asset.quantity > 0 && returnParts.some(part => part.assetId === asset.assetId)).map((asset): DocumentPartOption => ({
    key: asset.assetId, name: getSerialDisplayName(asset), role: 'COMPONENT', defaultIncluded: false, required: false, quantity: 1, item: serialItem(asset),
  })), ...(stock.bulk ?? []).filter(bulk => bulk.quantity > 0 && returnParts.some(part => !part.assetId && part.skuId === bulk.skuId &&
    (!parent.sourceDocumentItemId || ('sourceDocumentItemId' in part && part.sourceDocumentItemId === bulk.sourceDocumentItemId)))).map((bulk): DocumentPartOption => ({
    key: buildBulkKey(bulk), name: bulk.skuName ?? 'Pieza', role: 'ACCESSORY', defaultIncluded: false, required: false, quantity: 1, item: bulkItem(bulk),
  }))];
  return config.entries.flatMap((entry): DocumentPartOption[] => {
    if (entry.familyId) {
      const template = { templateFamilyId: entry.familyId, templateFamilyName: entryName(entry), itemFamilyId: entry.familyId,
        templateParentFamilyId: entry.templateParentFamilyId ?? null };
      const candidates = [
        ...stock.serial.filter(asset => asset.assetFamily?.id === entry.familyId && asset.quantity > 0 && asset.assetId !== parent.assetId).map(serialItem),
        ...(stock.bulk ?? []).filter(bulk => bulk.assetFamilyId === entry.familyId && bulk.quantity > 0).map(bulkItem),
      ];
      return candidates.length ? candidates.map(item => ({ key: `${entry.id}:${item.assetId ?? item.bulkKey}`, name: item.name,
        ...template, role: entry.role, defaultIncluded: false, required: entry.recommendation ? false : entry.required, quantity: item.assetId || entry.recommendation ? 1 : entry.quantity, item }))
        : [{ key: entry.id, name: entryName(entry), role: entry.role, defaultIncluded: false, required: entry.recommendation ? false : entry.required, quantity: entry.recommendation ? 1 : entry.quantity,
          ...template, unavailable: 'No hay unidades de esta familia disponibles en este origen.' }];
    }
    let item: SelectedItem | undefined;
    let itemFamilyId: string | undefined;
    if (entry.accessoryId) {
      // Prefer a balance that can supply the default quantity; never invent stock.
      const candidates = accessories.filter(option => option.accessoryId === entry.accessoryId);
      const option = candidates.find(option => option.quantity >= entry.quantity) ?? candidates[0];
      if (option) item = accessoryItem(option);
    } else if (entry.skuId) {
      const bulk = stock.bulk.find(bulk => bulk.skuId === entry.skuId && bulk.quantity > 0);
      if (bulk) { item = bulkItem(bulk); itemFamilyId = bulk.assetFamilyId ?? undefined; }
    } else {
      const asset = stock.serial.find(asset => asset.assetId === entry.assetId && asset.quantity > 0);
      if (asset) { item = serialItem(asset); itemFamilyId = asset.assetFamily?.id; }
    }
    return [{ key: entry.id, name: entryName(entry), role: entry.role, defaultIncluded: entry.defaultIncluded,
      required: entry.recommendation ? false : entry.required, quantity: entry.quantity, item, itemFamilyId,
      unavailable: item ? undefined : 'No disponible en el origen de este equipo.' }];
  });
}
