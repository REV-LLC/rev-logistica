export type RequestItemInput = {
  selectionId?: string;
  compositionNodeId?: string | null;
  parentCompositionNodeId?: string;
  sourceDocumentItemId?: string;
  parentSourceDocumentItemId?: string;
  parentLegacyOriginId?: string;
  sourceWarehouseId?: string | null;
  type: 'bulk' | 'serial' | 'free' | 'accessory';
  accessoryId?: string;
  accessorySourceBalanceId?: string;
  skuId?: string;
  assetId?: string;
  name: string;
  requestedTag?: string;
  deliveryFuel?: 'ELECTRICO' | 'GASOLINA';
  quantity?: number;
  ownerWarehouseId?: string | null;
  isDamaged?: boolean;
  damageDescription?: string;
  componentParentAssetId?: string;
};

export function documentCompositionPayload(item: {
  selectionId?: string; compositionNodeId?: string | null; parentCompositionNodeId?: string | null;
  sourceDocumentItemId?: string | null; parentSourceDocumentItemId?: string | null;
  parentLegacyOriginId?: string | null;
  deliveryFuel?: 'ELECTRICO' | 'GASOLINA' | null;
}) {
  const node = item.compositionNodeId ?? item.selectionId;
  return {
    ...(item.deliveryFuel ? { deliveryFuel: item.deliveryFuel } : {}),
    ...(node ? { compositionNodeId: node } : {}),
    ...(item.parentCompositionNodeId ? { parentCompositionNodeId: item.parentCompositionNodeId } : {}),
    ...(item.sourceDocumentItemId ? { sourceDocumentItemId: item.sourceDocumentItemId } : {}),
    ...(item.parentSourceDocumentItemId ? { parentSourceDocumentItemId: item.parentSourceDocumentItemId } : {}),
    ...(item.parentLegacyOriginId ? { parentLegacyOriginId: item.parentLegacyOriginId } : {}),
  };
}

export function restoreDocumentComposition(item: Parameters<typeof documentCompositionPayload>[0] & { id: string }) {
  return {
    ...(item.deliveryFuel ? { deliveryFuel: item.deliveryFuel, deliveryFuelSelectable: true } : {}),
    selectionId: item.compositionNodeId ?? item.id,
    ...(item.parentCompositionNodeId ? { parentCompositionNodeId: item.parentCompositionNodeId } : {}),
    ...(item.sourceDocumentItemId ? { sourceDocumentItemId: item.sourceDocumentItemId } : {}),
    ...(item.parentSourceDocumentItemId ? { parentSourceDocumentItemId: item.parentSourceDocumentItemId } : {}),
    ...(item.parentLegacyOriginId ? { parentLegacyOriginId: item.parentLegacyOriginId } : {}),
  };
}

export function buildRequestItems(items: RequestItemInput[]) {
  return items.map((item) => {
    const composition = documentCompositionPayload(item);
    const conditionNote =
      item.isDamaged && item.damageDescription?.trim()
        ? item.damageDescription.trim()
        : undefined;

    if (item.type === 'accessory') {
      return {
        ...composition,
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
        ...composition,
        ...(item.sourceWarehouseId ? { sourceWarehouseId: item.sourceWarehouseId } : {}),
        requestedTag: item.requestedTag ?? item.name,
        quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
        ownerWarehouseId: item.ownerWarehouseId ?? undefined,
        conditionNote,
      };
    }

    if (item.type === 'bulk') {
      return {
        ...composition,
        ...(item.sourceWarehouseId ? { sourceWarehouseId: item.sourceWarehouseId } : {}),
        skuId: item.skuId,
        quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
        componentParentAssetId: item.componentParentAssetId,
        ownerWarehouseId: item.ownerWarehouseId ?? undefined,
        conditionNote,
      };
    }

    return {
      ...composition,
      ...(item.sourceWarehouseId ? { sourceWarehouseId: item.sourceWarehouseId } : {}),
      assetId: item.assetId,
      componentParentAssetId: item.componentParentAssetId,
      ownerWarehouseId: item.ownerWarehouseId ?? undefined,
      conditionNote,
    };
  });
}
