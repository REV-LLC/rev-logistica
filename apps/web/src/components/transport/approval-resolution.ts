export type ApprovalResolutionItem = {
  skuId?: string | null;
  assetId?: string | null;
  componentParentAssetId?: string | null;
  quantity?: string | number | null;
  condition?: string | null;
  conditionNote?: string | null;
  requestedTag?: string | null;
};

export type ApprovalResolutionSku = {
  id: string;
  name: string;
  controlType: 'BULK' | 'SERIAL';
};

export type ApprovalResolutionInventory = Record<
  string,
  {
    bulk: Array<{ skuId: string; quantity: number }>;
    serial: Array<{
      skuId?: string | null;
      assetId: string;
      internalNumber?: string | number | null;
    }>;
  }
>;

export function normalizeTagBase(value?: string | null) {
  return (value ?? '')
    .replace(/#\s*\d+\s*$/i, '')
    .trim()
    .toUpperCase();
}

export function parseInternalNumberFromTag(value?: string | null) {
  const match = (value ?? '').match(/#\s*(\d+)\s*$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function isResolvePendingItem(
  item: ApprovalResolutionItem,
  skuOptions: ApprovalResolutionSku[],
) {
  const hasTag = Boolean(item.requestedTag?.trim());
  if (!item.skuId && !item.assetId) return hasTag;
  if (item.skuId && !item.assetId) {
    return skuOptions.find((sku) => sku.id === item.skuId)?.controlType === 'SERIAL';
  }
  return false;
}

export function getResolveSkuOptions(
  ownerWarehouseId: string | null | undefined,
  inventoriesByOwner: ApprovalResolutionInventory,
  skuOptions: ApprovalResolutionSku[],
) {
  if (!ownerWarehouseId) return [];
  const inventory = inventoriesByOwner[ownerWarehouseId];
  if (!inventory) return [];
  const availableSkuIds = new Set<string>();
  inventory.bulk.forEach((item) => {
    if (item.quantity > 0) availableSkuIds.add(item.skuId);
  });
  inventory.serial.forEach((item) => {
    if (item.skuId) availableSkuIds.add(item.skuId);
  });
  return skuOptions
    .filter((sku) => availableSkuIds.has(sku.id))
    .map((sku) => ({ value: sku.id, label: sku.name }));
}

export function buildInitialResolveState(
  items: ApprovalResolutionItem[],
  inventoriesByOwner: ApprovalResolutionInventory,
  skuOptions: ApprovalResolutionSku[],
) {
  const skuByNormalizedName = new Map<string, ApprovalResolutionSku>();
  skuOptions.forEach((sku) => skuByNormalizedName.set(sku.name.trim().toUpperCase(), sku));
  const initialSkuMap: Record<number, string> = {};
  const initialAssetMap: Record<number, string> = {};

  items.forEach((item, index) => {
    if (item.assetId) return;
    const normalizedTag = normalizeTagBase(item.requestedTag);
    const matchedSku = item.skuId
      ? skuOptions.find((sku) => sku.id === item.skuId) ?? null
      : (normalizedTag ? skuByNormalizedName.get(normalizedTag) ?? null : null);
    if (!matchedSku) return;

    const ownerWarehouseId = item.condition?.trim();
    if (!ownerWarehouseId) return;
    const inventory = inventoriesByOwner[ownerWarehouseId];
    const skuIsAvailable = Boolean(
      inventory?.bulk.some((bulk) => bulk.skuId === matchedSku.id && bulk.quantity > 0) ||
        inventory?.serial.some((serial) => serial.skuId === matchedSku.id),
    );
    if (!skuIsAvailable) return;

    initialSkuMap[index] = matchedSku.id;
    if (matchedSku.controlType !== 'SERIAL') return;
    const internalFromTag = parseInternalNumberFromTag(item.requestedTag);
    if (internalFromTag == null) return;
    const exactAsset = inventory.serial.find(
      (serial) =>
        serial.skuId === matchedSku.id && serial.internalNumber === internalFromTag,
    );
    if (exactAsset) initialAssetMap[index] = exactAsset.assetId;
  });

  return { initialSkuMap, initialAssetMap };
}

export function validateApprovalResolution(
  items: ApprovalResolutionItem[],
  resolveSkuByIndex: Record<number, string>,
  resolveAssetByIndex: Record<number, string>,
  skuOptions: ApprovalResolutionSku[],
) {
  const unresolved = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isResolvePendingItem(item, skuOptions));
  if (unresolved.some(({ index }) => !resolveSkuByIndex[index])) {
    return 'Resuelve todos los tags pendientes antes de aprobar.';
  }
  if (
    unresolved.some(({ index }) => {
      const sku = skuOptions.find((entry) => entry.id === resolveSkuByIndex[index]);
      return sku?.controlType === 'SERIAL' && !resolveAssetByIndex[index];
    })
  ) {
    return 'Falta seleccionar o crear equipo para uno o mas tags seriales.';
  }
  return null;
}

export function buildResolvedItemsPayload(
  items: ApprovalResolutionItem[],
  resolveSkuByIndex: Record<number, string>,
  resolveAssetByIndex: Record<number, string>,
  skuOptions: ApprovalResolutionSku[],
) {
  return items.map((item, index) => {
    const ownerWarehouseId = item.condition ?? undefined;
    const shared = {
      componentParentAssetId: item.componentParentAssetId ?? undefined,
      ownerWarehouseId,
      conditionNote: item.conditionNote ?? undefined,
    };
    if (item.assetId) return { assetId: item.assetId, ...shared };

    const effectiveSkuId = item.skuId ?? resolveSkuByIndex[index];
    const sku = skuOptions.find((entry) => entry.id === effectiveSkuId);
    if (sku?.controlType === 'SERIAL') {
      return {
        assetId: resolveAssetByIndex[index],
        ...shared,
        requestedTag: item.requestedTag ?? undefined,
      };
    }
    return {
      skuId: effectiveSkuId,
      ...shared,
      quantity: Number(item.quantity ?? 1) || 1,
      requestedTag: item.requestedTag ?? undefined,
    };
  });
}
