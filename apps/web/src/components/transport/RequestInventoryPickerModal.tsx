"use client";
import { useState, type Dispatch, type SetStateAction } from "react";
import { Checkbox, Paper, Stack, Text } from '@mantine/core';
import { getSerialDisplayName } from '@/lib/serial-assets';
import { buildBulkKey } from './request-formatting';
import InventoryItemPickerModal, {
  type InventoryItemPickerModalProps,
} from "../InventoryItemPickerModal";
import dynamic from 'next/dynamic';
const RemissionKitPicker = dynamic(() => import('./RemissionKitPicker'));
import ReturnAccessoryPickerPanel from "./ReturnAccessoryPickerPanel";
import {
  addReturnAccessories,
  returnAccessoryAlreadySelected,
  returnAccessoryKey,
  type ReturnAccessoryOption,
} from "./return-accessory-selection";
import { useReturnAccessoryOptions } from "./use-return-accessory-options";
import type { SelectedItem } from "./request-types";

type Props = InventoryItemPickerModalProps & {
  allowBulkKits?: boolean;
  returnWorksiteId?: string;
  selectedItems: SelectedItem[];
  setSelectedItems: Dispatch<SetStateAction<SelectedItem[]>>;
};

export default function RequestInventoryPickerModal({
  allowBulkKits,
  returnWorksiteId,
  selectedItems,
  setSelectedItems,
  ...picker
}: Props) {
  if (!returnWorksiteId) return allowBulkKits && picker.opened
    ? <RemissionKitPicker {...picker} selectedItems={selectedItems} setSelectedItems={setSelectedItems} />
    : <InventoryItemPickerModal {...picker} />;
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
  const [nativePending, setNativePending] = useState(new Set<string>());
  const nativeRows = [
    ...picker.serialItems.filter(item => item.isImplement).map(item => ({
      key: `serial:${item.assetId}`, name: getSerialDisplayName(item), quantity: item.quantity,
      added: picker.selectedSerialIds.has(item.assetId), add: () => picker.onAddSerial(item),
    })),
    ...picker.bulkItems.filter(item => item.isImplement).map(item => ({
      key: `bulk:${buildBulkKey(item)}`, name: item.skuName ?? 'Implemento', quantity: item.quantity,
      added: picker.selectedBulkKeys.has(buildBulkKey(item)), add: () => picker.onAddBulk(item),
    })),
  ];
  const nativeSelections = nativeRows.filter(row => nativePending.has(row.key) && !row.added && row.quantity > 0);
  const selections = [...pending.values()].filter(
    (option) => !returnAccessoryAlreadySelected(selectedItems, option),
  );
  return (
    <InventoryItemPickerModal
      {...picker}
      serialItems={picker.serialItems.filter(item => !item.isImplement)}
      bulkItems={picker.bulkItems.filter(item => !item.isImplement)}
      title="Existencias en la obra"
      extraTab={{
        label: "Implementos",
        selectedCount: selections.length + nativeSelections.length,
        content: (
          <Stack>
            {nativeRows.map(row => <Paper key={row.key} withBorder p="sm" radius="md">
              <Checkbox label={<div><Text fw={600}>{row.name}</Text><Text size="xs" c="dimmed">Pendiente: {row.quantity}</Text></div>}
                checked={row.added || nativePending.has(row.key)} disabled={row.added || row.quantity <= 0}
                onChange={() => setNativePending(current => { const next = new Set(current); if (next.has(row.key)) next.delete(row.key); else next.add(row.key); return next; })} />
            </Paper>)}
            {options.items.length || options.loading || options.error ? <ReturnAccessoryPickerPanel
            options={options}
            selectedItems={selectedItems}
            pending={pending}
            onToggle={(option) =>
              setPending((current) => {
                const next = new Map(current);
                const key = returnAccessoryKey(option);
                if (next.has(key)) next.delete(key);
                else next.set(key, option);
                return next;
              })
            }
            /> : !nativeRows.length ? <Text c="dimmed" size="sm">No hay implementos pendientes en esta obra.</Text> : null}
          </Stack>
        ),
        onConfirm: () => {
          let added = 0;
          for (const row of nativeSelections) if (row.add() !== false) added++;
          if (selections.length) setSelectedItems((current) => addReturnAccessories(current, selections));
          return added + selections.length;
        },
      }}
    />
  );
}
