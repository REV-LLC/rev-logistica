type DirectDocumentSelection = {
  type: 'bulk' | 'serial';
  name: string;
  skuId?: string;
  assetId?: string;
  quantity?: number;
  ownerWarehouseId?: string | null;
};

// Validate every selection before the atomic document request. The owner remains
// attached to each item; physical source and transport belong to the document.
export function buildDirectDocumentItems(selectedItems: DirectDocumentSelection[]) {
  return selectedItems.map((item) => {
    if (!item.ownerWarehouseId) {
      throw new Error(`Selecciona el propietario de ${item.name}.`);
    }
    if ((item.type === 'bulk' && !item.skuId) || (item.type === 'serial' && !item.assetId)) {
      throw new Error(`Selecciona la referencia o el equipo de ${item.name}.`);
    }
    if (item.type === 'bulk' && item.quantity !== undefined
      && (!Number.isFinite(item.quantity) || item.quantity <= 0)) {
      throw new Error(`Ingresa una cantidad válida mayor que cero para ${item.name}.`);
    }
    return item.type === 'bulk'
      ? {
          skuId: item.skuId,
          quantity: item.quantity ?? 1,
          ownerWarehouseId: item.ownerWarehouseId,
        }
      : {
          assetId: item.assetId,
          ownerWarehouseId: item.ownerWarehouseId,
        };
  });
}
