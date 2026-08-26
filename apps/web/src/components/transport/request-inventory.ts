import type {
  InventoryItemPickerBulkItem,
  InventoryItemPickerSerialItem,
} from '@/components/InventoryItemPickerModal';
import type { RequestSelectedItem } from '@/components/transport/RequestItemsStep';

type InventoryBulk = InventoryItemPickerBulkItem;
type InventorySerial = InventoryItemPickerSerialItem;

const buildInventoryBulkKey = (item: { skuId: string; ownerWarehouseId: string | null }) =>
  `${item.skuId}::${item.ownerWarehouseId ?? 'none'}`;

export const getSelectedInventoryKeys = (selectedItems: RequestSelectedItem[]) => ({
  bulkKeys: new Set(
    selectedItems
      .filter((item) => item.type === 'bulk' && item.bulkKey)
      .map((item) => item.bulkKey as string),
  ),
  serialIds: new Set(
    selectedItems
      .filter((item) => item.type === 'serial' && item.assetId)
      .map((item) => item.assetId as string),
  ),
});

export const getAvailableRequestInventory = ({
  bulkItems,
  serialItems,
  selectedBulkKeys,
  selectedSerialIds,
  documentType,
}: {
  bulkItems: InventoryBulk[];
  serialItems: InventorySerial[];
  selectedBulkKeys: Set<string>;
  selectedSerialIds: Set<string>;
  documentType: 'REMISSION' | 'RETURN';
}) => ({
  bulk: bulkItems.filter((item) => !selectedBulkKeys.has(buildInventoryBulkKey(item))),
  serial: serialItems.filter(
    (item) =>
      !selectedSerialIds.has(item.assetId) &&
      (documentType === 'RETURN' || item.kind !== 'MOTOR'),
  ),
});

export const getAvailableMixerMotors = ({
  serialItems,
  selectedSerialIds,
  mixerAssetId,
}: {
  serialItems: InventorySerial[];
  selectedSerialIds: Set<string>;
  mixerAssetId: string | null;
}) => {
  if (!mixerAssetId) return [];
  return serialItems.filter(
    (item) =>
      item.kind === 'MOTOR' &&
      item.quantity > 0 &&
      (!item.assignedMixerId || item.assignedMixerId === mixerAssetId) &&
      !selectedSerialIds.has(item.assetId),
  );
};
