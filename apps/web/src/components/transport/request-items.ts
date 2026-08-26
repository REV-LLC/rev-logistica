export type RequestItemInput = {
  type: 'bulk' | 'serial' | 'free';
  skuId?: string;
  assetId?: string;
  name: string;
  requestedTag?: string;
  quantity?: number;
  ownerWarehouseId?: string | null;
  isDamaged?: boolean;
  damageDescription?: string;
  componentParentAssetId?: string;
};

export function buildRequestItems(items: RequestItemInput[]) {
  return items.map((item) => {
    const conditionNote =
      item.isDamaged && item.damageDescription?.trim()
        ? item.damageDescription.trim()
        : undefined;

    if (item.type === 'free') {
      return {
        requestedTag: item.requestedTag ?? item.name,
        quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
        ownerWarehouseId: item.ownerWarehouseId ?? undefined,
        conditionNote,
      };
    }

    if (item.type === 'bulk') {
      return {
        skuId: item.skuId,
        quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
        componentParentAssetId: item.componentParentAssetId,
        ownerWarehouseId: item.ownerWarehouseId ?? undefined,
        conditionNote,
      };
    }

    return {
      assetId: item.assetId,
      componentParentAssetId: item.componentParentAssetId,
      ownerWarehouseId: item.ownerWarehouseId ?? undefined,
      conditionNote,
    };
  });
}
