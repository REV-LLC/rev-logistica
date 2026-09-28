"use client";
import { useState, type Dispatch, type SetStateAction } from "react";
import InventoryItemPickerModal, {
  type InventoryItemPickerModalProps,
} from "../InventoryItemPickerModal";
import ReturnAccessoryPickerPanel from "./ReturnAccessoryPickerPanel";
import {
  addReturnAccessories,
  returnAccessoryAlreadySelected,
  type ReturnAccessoryOption,
} from "./return-accessory-selection";
import { useReturnAccessoryOptions } from "./use-return-accessory-options";
import type { SelectedItem } from "./request-types";

type Props = InventoryItemPickerModalProps & {
  returnWorksiteId?: string;
  selectedItems: SelectedItem[];
  setSelectedItems: Dispatch<SetStateAction<SelectedItem[]>>;
};

export default function RequestInventoryPickerModal({
  returnWorksiteId,
  selectedItems,
  setSelectedItems,
  ...picker
}: Props) {
  if (!returnWorksiteId) return <InventoryItemPickerModal {...picker} />;
  // A cancelled/closed picker discards only its temporary selection. Changing the worksite resets it too.
  return picker.opened ? (
    <ReturnPicker
      key={returnWorksiteId}
      {...picker}
      returnWorksiteId={returnWorksiteId}
      selectedItems={selectedItems}
      setSelectedItems={setSelectedItems}
    />
  ) : null;
}

function ReturnPicker({
  returnWorksiteId,
  selectedItems,
  setSelectedItems,
  ...picker
}: Props & { returnWorksiteId: string }) {
  const options = useReturnAccessoryOptions(returnWorksiteId);
  const [pending, setPending] = useState(
    new Map<string, ReturnAccessoryOption>(),
  );
  const selections = [...pending.values()].filter(
    (option) => !returnAccessoryAlreadySelected(selectedItems, option),
  );
  return (
    <InventoryItemPickerModal
      {...picker}
      title="Existencias en la obra"
      extraTab={{
        label: "Accesorios",
        selectedCount: selections.length,
        content: (
          <ReturnAccessoryPickerPanel
            options={options}
            selectedItems={selectedItems}
            pending={pending}
            onToggle={(option) =>
              setPending((current) => {
                const next = new Map(current);
                if (next.has(option.sourceBalanceId))
                  next.delete(option.sourceBalanceId);
                else next.set(option.sourceBalanceId, option);
                return next;
              })
            }
          />
        ),
        onConfirm: () => {
          if (!selections.length) return 0;
          setSelectedItems((current) =>
            addReturnAccessories(current, selections),
          );
          return selections.length;
        },
      }}
    />
  );
}
