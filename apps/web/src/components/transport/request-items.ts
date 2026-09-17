export type RequestItemInput = {
  sourceWarehouseId?: string | null;
  type: 'bulk' | 'serial' | 'free' | 'accessory';
  accessoryId?: string;
  accessorySourceBalanceId?: string;
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

    if (item.type === 'accessory') {
      return {
        ...(item.sourceWarehouseId ? { sourceWarehouseId: item.sourceWarehouseId } : {}),
        accessoryId: item.accessoryId,
        accessorySourceBalanceId: item.accessorySourceBalanceId,
        componentParentAssetId: item.componentParentAssetId,
        quantity: item.quantity,
        ownerWarehouseId: item.ownerWarehouseId ?? undefined,
        conditionNote,
      };
    }

    if (item.type === 'free') {
      return {
        ...(item.sourceWarehouseId ? { sourceWarehouseId: item.sourceWarehouseId } : {}),
        requestedTag: item.requestedTag ?? item.name,
        quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
        ownerWarehouseId: item.ownerWarehouseId ?? undefined,
        conditionNote,
      };
    }

    if (item.type === 'bulk') {
      return {
        ...(item.sourceWarehouseId ? { sourceWarehouseId: item.sourceWarehouseId } : {}),
        skuId: item.skuId,
        quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
        componentParentAssetId: item.componentParentAssetId,
        ownerWarehouseId: item.ownerWarehouseId ?? undefined,
        conditionNote,
      };
    }

    return {
      ...(item.sourceWarehouseId ? { sourceWarehouseId: item.sourceWarehouseId } : {}),
      assetId: item.assetId,
      componentParentAssetId: item.componentParentAssetId,
      ownerWarehouseId: item.ownerWarehouseId ?? undefined,
      conditionNote,
    };
  });
}
