import { api } from '@/lib/api';
import { getSerialDisplayName } from '@/lib/serial-assets';
import type { EquipmentConfiguration } from '../equipment-configuration/types';
import { entryName } from '../equipment-configuration/types';
import { buildBulkKey, createSelectionId } from './request-formatting';
import type { InventoryBulk, InventorySerial, SelectedItem } from './request-types';
import { inventoryWithReturnOrigins, type ReturnDocumentOrigin } from './return-document-origins';

export type ConfigurationContext = { docType: 'REMISSION' | 'RETURN'; customerWorksiteId: string; motorOnly?: boolean };
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
    : { entries: [], motor: undefined };
  const config = context.motorOnly ? { ...loaded, entries: [] } : loaded;
  const motor = config.motor?.configuration === 'INTERCHANGEABLE' ? config.motor : undefined;
  if (context.docType === 'REMISSION' && !config.entries.length && !motor) return [];
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
      : (motor?.assignedMotorId || config.entries.some(entry => entry.assetId || entry.familyId)) && parent.sourceWarehouseId
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
  const accessoryItem = (option: AccessoryOption): SelectedItem => ({
    selectionId: '', type: 'accessory', accessoryId: option.accessoryId,
    accessorySourceBalanceId: option.sourceBalanceId, accessoryKind: option.kind,
    accessoryPurpose: option.purpose, physicalAvailableQuantity: option.physicalQuantity,
    componentParentAssetId: anchorAssetId, parentCompositionNodeId: parent.selectionId,
    sourceDocumentItemId: option.sourceDocumentItemId,
    name: `${option.name}${option.code ? ` · ${option.code}` : ''}`,
    quantity: 1, availableQuantity: option.quantity, ownerWarehouseId: option.ownerWarehouseId,
    sourceWarehouseId: context.docType === 'REMISSION' ? parent.sourceWarehouseId : undefined,
  });
  const serialItem = (asset: InventorySerial): SelectedItem => ({ selectionId: '', type: 'serial', assetId: asset.assetId,
    sourceDocumentItemId: asset.sourceDocumentItemId,
    name: getSerialDisplayName(asset), serial: asset.serialOrEngine, ownerWarehouseId: asset.ownerWarehouseId,
    sourceWarehouseId: context.docType === 'REMISSION' ? parent.sourceWarehouseId : undefined,
    parentCompositionNodeId: parent.selectionId, componentParentAssetId: anchorAssetId });
  const bulkItem = (bulk: InventoryBulk): SelectedItem => ({ selectionId: '', type: 'bulk', skuId: bulk.skuId,
    sourceDocumentItemId: bulk.sourceDocumentItemId,
    bulkKey: buildBulkKey({ ...bulk, sourceWarehouseId: context.docType === 'REMISSION' ? parent.sourceWarehouseId : undefined }),
    name: bulk.skuName ?? 'Pieza', ownerWarehouseId: bulk.ownerWarehouseId, availableQuantity: bulk.quantity,
    sourceWarehouseId: context.docType === 'REMISSION' ? parent.sourceWarehouseId : undefined,
    parentCompositionNodeId: parent.selectionId, componentParentAssetId: anchorAssetId });
  if (context.docType === 'RETURN') return [...accessories.map((option): DocumentPartOption => ({
    key: `${option.sourceBalanceId}:${option.sourceDocumentItemId ?? 'legacy'}`, name: option.name, role: 'ACCESSORY', defaultIncluded: false, required: false,
    quantity: option.kind === 'INDIVIDUAL' ? 1 : option.quantity, item: accessoryItem(option),
  })), ...stock.serial.filter(asset => asset.quantity > 0 && returnParts.some(part => part.assetId === asset.assetId)).map((asset): DocumentPartOption => ({
    key: asset.assetId, name: getSerialDisplayName(asset), role: 'COMPONENT', defaultIncluded: false, required: false, quantity: 1, item: serialItem(asset),
  })), ...(stock.bulk ?? []).filter(bulk => bulk.quantity > 0 && returnParts.some(part => !part.assetId && part.skuId === bulk.skuId &&
    (!parent.sourceDocumentItemId || ('sourceDocumentItemId' in part && part.sourceDocumentItemId === bulk.sourceDocumentItemId)))).map((bulk): DocumentPartOption => ({
    key: buildBulkKey(bulk), name: bulk.skuName ?? 'Pieza', role: 'ACCESSORY', defaultIncluded: false, required: false, quantity: 1, item: bulkItem(bulk),
  }))];
  const motorAsset = motor?.assignedMotorId ? stock.serial.find(asset => asset.assetId === motor.assignedMotorId && asset.quantity > 0) : undefined;
  const motorOption: DocumentPartOption[] = motor ? [{ key: 'assigned-motor',
    name: motor.assignedMotor ? `${motor.assignedMotor.description || motor.assignedMotor.sku.name} #${motor.assignedMotor.internalNumber}` : 'Sin motor asignado',
    role: 'COMPONENT', defaultIncluded: true, required: true, quantity: 1, locked: true,
    item: motorAsset && !motorAsset.isDamaged ? serialItem(motorAsset) : undefined,
    unavailable: motorAsset?.isDamaged ? 'El motor asignado está averiado. Registra su reparación o cambia el motor en inventario antes de la remisión.' : motorAsset ? undefined : motor.assignedMotorId
      ? 'El motor asignado no está disponible en este origen. Revisa inventario antes de continuar.'
      : 'Office debe asignar un motor al equipo en inventario; no se elige en este documento.',
  }] : [];
  return [...motorOption, ...config.entries.flatMap((entry): DocumentPartOption[] => {
    if (entry.familyId) {
      const candidates = [
        ...stock.serial.filter(asset => asset.assetFamily?.id === entry.familyId && asset.quantity > 0 && asset.assetId !== parent.assetId).map(serialItem),
        ...(stock.bulk ?? []).filter(bulk => bulk.assetFamilyId === entry.familyId && bulk.quantity > 0).map(bulkItem),
      ];
      return candidates.length ? candidates.map(item => ({ key: `${entry.id}:${item.assetId ?? item.bulkKey}`, name: item.name,
        role: entry.role, defaultIncluded: false, required: entry.required, quantity: item.assetId ? 1 : entry.quantity, item }))
        : [{ key: entry.id, name: entryName(entry), role: entry.role, defaultIncluded: false, required: entry.required, quantity: entry.quantity,
          unavailable: 'No hay unidades de esta familia disponibles en este origen.' }];
    }
    let item: SelectedItem | undefined;
    if (entry.accessoryId) {
      // Prefer a balance that can supply the default quantity; never invent stock.
      const candidates = accessories.filter(option => option.accessoryId === entry.accessoryId);
      const option = candidates.find(option => option.quantity >= entry.quantity) ?? candidates[0];
      if (option) item = accessoryItem(option);
    } else {
      const asset = stock.serial.find(asset => asset.assetId === entry.assetId && asset.quantity > 0);
      if (asset) item = serialItem(asset);
    }
    return [{ key: entry.id, name: entryName(entry), role: entry.role, defaultIncluded: entry.defaultIncluded,
      required: entry.required, quantity: entry.quantity, item,
      unavailable: item ? undefined : 'No disponible en el origen de este equipo.' }];
  })];
}
