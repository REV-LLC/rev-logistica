import { createSelectionId } from "./request-formatting";
import type { SelectedItem } from "./request-types";
import type { AccessoryKind } from "../accessories/types";

export type ReturnAccessoryOption = {
  accessoryId: string;
  sourceBalanceId: string;
  name: string;
  code: string | null;
  kind: AccessoryKind;
  quantity: number;
  ownerWarehouseId: string;
  ownerName: string;
  parentAssetId: string;
  parentName: string;
  sourceLabel: string;
};

export const returnAccessoryAlreadySelected = (
  items: SelectedItem[],
  option: ReturnAccessoryOption,
) =>
  items.some(
    (item) =>
      item.type === "accessory" &&
      item.accessorySourceBalanceId === option.sourceBalanceId,
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
      componentParentAssetId: option.parentAssetId,
      name: `${option.name}${option.code ? ` · ${option.code}` : ""} · Accesorio de ${option.parentName}`,
      quantity: 1,
      availableQuantity: option.quantity,
      ownerWarehouseId: option.ownerWarehouseId,
    });
  }
  return next;
}
