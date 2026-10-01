import { createSelectionId } from "./request-formatting";
import type { SelectedItem } from "./request-types";
import type { AccessoryKind } from "../accessories/types";

export type ReturnAccessoryOption = {
  accessoryId: string;
  sourceBalanceId: string;
  name: string;
  code: string | null;
  kind: AccessoryKind;
  purpose?: 'COMPONENT' | 'ACCESSORY';
  physicalQuantity?: number;
  quantity: number;
  ownerWarehouseId: string;
  ownerName: string;
  parentAssetId: string;
  parentName: string;
  sourceLabel: string;
  sourceDocumentItemId?: string;
  parentSourceDocumentItemId?: string;
  parentLegacyOriginId?: string;
};

export const returnAccessoryKey = (option: ReturnAccessoryOption) =>
  `${option.sourceBalanceId}${option.sourceDocumentItemId ? `:${option.sourceDocumentItemId}` : ''}`;

export const returnAccessoryAlreadySelected = (
  items: SelectedItem[],
  option: ReturnAccessoryOption,
) =>
  items.some(
    (item) =>
      item.type === "accessory" &&
      item.accessorySourceBalanceId === option.sourceBalanceId && item.sourceDocumentItemId === option.sourceDocumentItemId,
  );

export function addReturnAccessories(
  items: SelectedItem[],
  options: ReturnAccessoryOption[],
): SelectedItem[] {
  const next = [...items];
  for (const option of options) {
    if (option.quantity < 1 || returnAccessoryAlreadySelected(next, option))
      continue;
    next.push({
      selectionId: createSelectionId(),
      type: "accessory",
      accessoryId: option.accessoryId,
      accessorySourceBalanceId: option.sourceBalanceId,
      accessoryKind: option.kind,
      accessoryPurpose: option.purpose,
      physicalAvailableQuantity: option.physicalQuantity,
      componentParentAssetId: option.parentAssetId,
      sourceDocumentItemId: option.sourceDocumentItemId,
      parentSourceDocumentItemId: option.parentSourceDocumentItemId,
      parentLegacyOriginId: option.parentLegacyOriginId,
      name: `${option.name} · ${option.parentName}`,
      quantity: 1,
      availableQuantity: option.quantity,
      ownerWarehouseId: option.ownerWarehouseId,
    });
  }
  return next;
}
