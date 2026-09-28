import { api } from '@/lib/api';
import { getSerialDisplayName } from '@/lib/serial-assets';
import type { EquipmentConfiguration } from '../equipment-configuration/types';
import { entryName } from '../equipment-configuration/types';
import { buildBulkKey, createSelectionId } from './request-formatting';
import type { InventoryBulk, InventorySerial, SelectedItem } from './request-types';

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
  ownerWarehouseId: string; parentAssetId: string; sourceLabel: string;
};

export function sameDocumentPart(item: SelectedItem, option: SelectedItem) {
  return item.componentParentAssetId === option.componentParentAssetId &&
    (option.assetId ? item.assetId === option.assetId : option.type === 'bulk'
      ? item.type === 'bulk' && item.bulkKey === option.bulkKey
      : item.type === 'accessory' && item.accessorySourceBalanceId === option.accessorySourceBalanceId);
}

export function availableForDocument(option: SelectedItem, items: SelectedItem[]) {
  if (option.assetId) return items.some(item => item.assetId === option.assetId) ? 0 : 1;
  const used = items.filter(item => option.type === 'bulk' ? item.type === 'bulk' && item.bulkKey === option.bulkKey
    : item.type === 'accessory' && item.accessorySourceBalanceId === option.accessorySourceBalanceId)
    .reduce((sum, item) => sum + (item.quantity ?? 1), 0);
  return Math.max(0, (option.availableQuantity ?? 0) - used);
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
  if (!parent.assetId || !context.customerWorksiteId) return [];
  const loaded = context.docType === 'REMISSION'
    ? await api<EquipmentConfiguration>(`/equipment-configurations/assets/${parent.assetId}`, { signal })
    : { entries: [], motor: undefined };
  const config = context.motorOnly ? { ...loaded, entries: [] } : loaded;
  const motor = config.motor?.configuration === 'INTERCHANGEABLE' ? config.motor : undefined;
  if (context.docType === 'REMISSION' && !config.entries.length && !motor) return [];
  const params = new URLSearchParams({ type: context.docType, customerWorksiteId: context.customerWorksiteId,
    assetId: parent.assetId, deliveryMode: 'WAREHOUSE' });
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
  const [accessories, stock, returnParts] = await Promise.all([
    config.entries.some(entry => entry.accessoryId) || context.docType === 'RETURN' ? getAccessories() : Promise.resolve([]),
    context.docType === 'RETURN'
      ? api<{ serial: InventorySerial[]; bulk: InventoryBulk[] }>(`/inventory/on-site/${context.customerWorksiteId}/request-options`, { signal })
      : (motor?.assignedMotorId || config.entries.some(entry => entry.assetId || entry.familyId)) && parent.sourceWarehouseId
        ? api<{ serial: InventorySerial[]; bulk: InventoryBulk[] }>(`/inventory/warehouse/${parent.sourceWarehouseId}`, { signal })
        : Promise.resolve({ serial: [], bulk: [] }),
    context.docType === 'RETURN' ? api<Array<{ assetId: string | null; skuId: string | null }>>(
      `/equipment-configurations/assets/${parent.assetId}/return-parts?customerWorksiteId=${encodeURIComponent(context.customerWorksiteId)}`, { signal }) : Promise.resolve([]),
  ]);
  const accessoryItem = (option: AccessoryOption): SelectedItem => ({
    selectionId: '', type: 'accessory', accessoryId: option.accessoryId,
    accessorySourceBalanceId: option.sourceBalanceId, accessoryKind: option.kind,
    componentParentAssetId: parent.assetId, name: `${option.name}${option.code ? ` · ${option.code}` : ''}`,
    quantity: 1, availableQuantity: option.quantity, ownerWarehouseId: option.ownerWarehouseId,
    sourceWarehouseId: context.docType === 'REMISSION' ? parent.sourceWarehouseId : undefined,
  });
  const serialItem = (asset: InventorySerial): SelectedItem => ({ selectionId: '', type: 'serial', assetId: asset.assetId,
    name: getSerialDisplayName(asset), serial: asset.serialOrEngine, ownerWarehouseId: asset.ownerWarehouseId,
    sourceWarehouseId: context.docType === 'REMISSION' ? parent.sourceWarehouseId : undefined, componentParentAssetId: parent.assetId });
  const bulkItem = (bulk: InventoryBulk): SelectedItem => ({ selectionId: '', type: 'bulk', skuId: bulk.skuId,
    bulkKey: buildBulkKey({ ...bulk, sourceWarehouseId: context.docType === 'REMISSION' ? parent.sourceWarehouseId : undefined }),
    name: bulk.skuName ?? 'Pieza', ownerWarehouseId: bulk.ownerWarehouseId, availableQuantity: bulk.quantity,
    sourceWarehouseId: context.docType === 'REMISSION' ? parent.sourceWarehouseId : undefined, componentParentAssetId: parent.assetId });
  if (context.docType === 'RETURN') return [...accessories.map((option): DocumentPartOption => ({
    key: option.sourceBalanceId, name: option.name, role: 'ACCESSORY', defaultIncluded: false, required: false,
    quantity: option.kind === 'INDIVIDUAL' ? 1 : option.quantity, item: accessoryItem(option),
  })), ...stock.serial.filter(asset => asset.quantity > 0 && returnParts.some(part => part.assetId === asset.assetId)).map((asset): DocumentPartOption => ({
    key: asset.assetId, name: getSerialDisplayName(asset), role: 'COMPONENT', defaultIncluded: false, required: false, quantity: 1, item: serialItem(asset),
  })), ...(stock.bulk ?? []).filter(bulk => bulk.quantity > 0 && returnParts.some(part => !part.assetId && part.skuId === bulk.skuId)).map((bulk): DocumentPartOption => ({
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
