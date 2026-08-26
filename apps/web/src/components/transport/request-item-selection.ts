import type {
  InventoryItemPickerBulkItem,
  InventoryItemPickerSerialItem,
} from '@/components/InventoryItemPickerModal';
import type { RequestSelectedItem } from '@/components/transport/RequestItemsStep';

type InventoryBulk = InventoryItemPickerBulkItem;
type InventorySerial = InventoryItemPickerSerialItem;

const bulkKey = (skuId: string, ownerWarehouseId: string | null) =>
  `${skuId}::${ownerWarehouseId ?? 'none'}`;

export const addBulkSelection = ({
  items,
  inventoryItem,
  sourceMode,
  createSelectionId,
}: {
  items: RequestSelectedItem[];
  inventoryItem: InventoryBulk;
  sourceMode: 'warehouse' | 'on-site';
  createSelectionId: () => string;
}) => {
  const key = bulkKey(inventoryItem.skuId, inventoryItem.ownerWarehouseId);
  if (items.some((item) => item.type === 'bulk' && item.bulkKey === key)) return items;
  return [
    ...items,
    {
      selectionId: createSelectionId(),
      type: 'bulk' as const,
      bulkKey: key,
      skuId: inventoryItem.skuId,
      name: inventoryItem.skuName ?? inventoryItem.skuId,
      quantity: sourceMode === 'on-site' ? inventoryItem.quantity : 1,
      availableQuantity: inventoryItem.quantity,
      ownerWarehouseId: inventoryItem.ownerWarehouseId,
    },
  ];
};

export const addSerialSelection = ({
  items,
  inventoryItem,
  displayName,
  associatedMixerId,
  createSelectionId,
}: {
  items: RequestSelectedItem[];
  inventoryItem: InventorySerial;
  displayName: string;
  associatedMixerId?: string;
  createSelectionId: () => string;
}) => {
  if (items.some((item) => item.type === 'serial' && item.assetId === inventoryItem.assetId)) {
    return items;
  }
  return [
    ...items,
    {
      selectionId: createSelectionId(),
      type: 'serial' as const,
      assetId: inventoryItem.assetId,
      name: displayName,
      serial: inventoryItem.serialOrEngine,
      ownerWarehouseId: inventoryItem.ownerWarehouseId,
      associatedMixerId,
    },
  ];
};

export const addFreeSelection = ({
  items,
  requestedReference,
  ownerWarehouseId,
  createSelectionId,
}: {
  items: RequestSelectedItem[];
  requestedReference: string;
  ownerWarehouseId: string;
  createSelectionId: () => string;
}) => {
  const exists = items.some(
    (item) =>
      item.ownerWarehouseId === ownerWarehouseId &&
      (item.requestedTag ?? item.name).toUpperCase() === requestedReference,
  );
  if (exists) return items;
  return [
    ...items,
    {
      selectionId: createSelectionId(),
      type: 'free' as const,
      name: requestedReference,
      requestedTag: requestedReference,
      quantity: 1,
      ownerWarehouseId,
    },
  ];
};

export const resolveFreeSelection = ({
  items,
  index,
  skuId,
  skuName,
}: {
  items: RequestSelectedItem[];
  index: number;
  skuId: string;
  skuName: string;
}) =>
  items.map((item, itemIndex) =>
    itemIndex === index
      ? {
          selectionId: item.selectionId,
          type: 'bulk' as const,
          bulkKey: bulkKey(skuId, item.ownerWarehouseId ?? null),
          skuId,
          name: skuName,
          quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
          ownerWarehouseId: item.ownerWarehouseId,
          isDamaged: item.isDamaged,
          damageDescription: item.damageDescription,
        }
      : item,
  );

export const updateSelection = (
  items: RequestSelectedItem[],
  index: number,
  updates: Partial<RequestSelectedItem>,
) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...updates } : item));

export const updateSelectionOwner = (
  items: RequestSelectedItem[],
  index: number,
  ownerWarehouseId: string | null,
) =>
  items.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    return {
      ...item,
      ownerWarehouseId,
      ...(item.type === 'bulk' && item.skuId
        ? { bulkKey: bulkKey(item.skuId, ownerWarehouseId) }
        : {}),
    };
  });

export const splitSelection = (
  items: RequestSelectedItem[],
  index: number,
  createSelectionId: () => string,
) => {
  const item = items[index];
  const quantity = Number(item?.quantity ?? 1);
  if (!item || item.type === 'serial' || !Number.isFinite(quantity) || quantity <= 1) {
    return items;
  }
  const next = [...items];
  next.splice(
    index,
    1,
    { ...item, quantity: 1 },
    {
      ...item,
      selectionId: createSelectionId(),
      quantity: quantity - 1,
      ownerWarehouseId: null,
    },
  );
  return next;
};

export const removeSelection = (items: RequestSelectedItem[], selectionId: string) => {
  const removed = items.find((item) => item.selectionId === selectionId);
  if (!removed) return items;

  if (removed.assetId && items.some((item) => item.componentParentAssetId === removed.assetId)) {
    return items.filter(
      (item) => item.selectionId !== selectionId && item.componentParentAssetId !== removed.assetId,
    );
  }

  const mixerAssetId =
    removed.associatedMixerId ??
    (removed.assetId && items.some((item) => item.associatedMixerId === removed.assetId)
      ? removed.assetId
      : null);
  if (!mixerAssetId) return items.filter((item) => item.selectionId !== selectionId);

  return items.filter(
    (item) =>
      item.selectionId !== selectionId &&
      item.assetId !== mixerAssetId &&
      item.associatedMixerId !== mixerAssetId,
  );
};
