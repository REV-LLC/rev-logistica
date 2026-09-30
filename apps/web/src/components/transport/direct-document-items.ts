import { documentCompositionPayload } from './request-items';
type DirectDocumentSelection = Parameters<typeof documentCompositionPayload>[0] & {
  type: 'bulk' | 'serial' | 'accessory' | 'free';
  name: string;
  skuId?: string;
  assetId?: string;
  quantity?: number;
  ownerWarehouseId?: string | null;
  accessoryId?: string;
  accessorySourceBalanceId?: string;
  componentParentAssetId?: string;
  sourceWarehouseId?: string | null;
};

// Validate every selection before the atomic document request. The owner remains
// attached to each item; physical source and transport belong to the document.
export function buildDirectDocumentItems(selectedItems: DirectDocumentSelection[]) {
  return selectedItems.map((item) => {
    if (item.type === 'free') throw new Error('Resuelve las referencias manuales antes de ejecutar el movimiento directo.');
    if (!item.ownerWarehouseId) {
      throw new Error(`Selecciona el propietario de ${item.name}.`);
    }
    if ((item.type === 'bulk' && !item.skuId) || (item.type === 'serial' && !item.assetId)) {
      throw new Error(`Selecciona la referencia o el equipo de ${item.name}.`);
    }
    if ((item.type === 'bulk' || item.type === 'accessory') && item.quantity !== undefined
      && (!Number.isFinite(item.quantity) || item.quantity <= 0)) {
      throw new Error(`Ingresa una cantidad válida mayor que cero para ${item.name}.`);
    }
    const composition = { ...documentCompositionPayload(item),
      ...(item.componentParentAssetId ? { componentParentAssetId: item.componentParentAssetId } : {}),
      ...(item.sourceWarehouseId ? { sourceWarehouseId: item.sourceWarehouseId } : {}),
    };
    if (item.type === 'accessory') {
      if (!item.accessoryId || !item.accessorySourceBalanceId) throw new Error(`Selecciona el accesorio y su origen: ${item.name}.`);
      return { ...composition, accessoryId: item.accessoryId, accessorySourceBalanceId: item.accessorySourceBalanceId,
        quantity: item.quantity ?? 1, ownerWarehouseId: item.ownerWarehouseId };
    }
    return item.type === 'bulk'
      ? {
          ...composition,
          skuId: item.skuId,
          quantity: item.quantity ?? 1,
          ownerWarehouseId: item.ownerWarehouseId,
        }
      : {
          ...composition,
          assetId: item.assetId,
          ownerWarehouseId: item.ownerWarehouseId,
        };
  });
}
