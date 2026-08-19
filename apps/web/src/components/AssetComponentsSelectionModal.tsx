'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Checkbox, Group, Modal, NumberInput, Paper, Stack, Text } from '@mantine/core';
import type { InventoryItemPickerBulkItem, InventoryItemPickerSerialItem } from './InventoryItemPickerModal';
import { getSerialDisplayName } from '@/lib/serial-assets';

export type AssetComponentOption = {
  id: string;
  family: { id: string; code: string; name: string; controlType: 'BULK' | 'SERIAL' };
  required: boolean;
  minimumQuantity: number;
  maximumQuantity: number | null;
  sortOrder: number;
};

export type AssetComponentSelection =
  | { type: 'bulk'; item: InventoryItemPickerBulkItem; quantity: number }
  | { type: 'serial'; item: InventoryItemPickerSerialItem };

type Props = {
  opened: boolean;
  parentName: string;
  options: AssetComponentOption[];
  bulkItems: InventoryItemPickerBulkItem[];
  serialItems: InventoryItemPickerSerialItem[];
  ownerWarehouseId: string | null;
  restrictOwnerWarehouse?: boolean;
  onClose: () => void;
  onConfirm: (selections: AssetComponentSelection[]) => void;
};

const bulkSelectionKey = (item: InventoryItemPickerBulkItem) =>
  `${item.skuId}:${item.ownerWarehouseId ?? 'pending'}`;

export default function AssetComponentsSelectionModal({
  opened,
  parentName,
  options,
  bulkItems,
  serialItems,
  ownerWarehouseId,
  restrictOwnerWarehouse = true,
  onClose,
  onConfirm,
}: Props) {
  const [bulkQuantities, setBulkQuantities] = useState<Record<string, number>>({});
  const [serialIds, setSerialIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setBulkQuantities({});
    setSerialIds(new Set());
    setError(null);
  }, [opened]);

  const availableByFamily = useMemo(() => {
    const bulk = new Map<string, InventoryItemPickerBulkItem[]>();
    const serial = new Map<string, InventoryItemPickerSerialItem[]>();
    options.forEach((option) => {
      bulk.set(option.family.id, bulkItems.filter((item) =>
        item.assetFamilyId === option.family.id
        && (!restrictOwnerWarehouse || item.ownerWarehouseId === ownerWarehouseId),
      ));
      serial.set(option.family.id, serialItems.filter((item) =>
        item.assetFamily?.id === option.family.id
        && (!restrictOwnerWarehouse || item.ownerWarehouseId === ownerWarehouseId),
      ));
    });
    return { bulk, serial };
  }, [bulkItems, options, ownerWarehouseId, restrictOwnerWarehouse, serialItems]);

  const confirm = () => {
    const selections: AssetComponentSelection[] = [];
    for (const option of options) {
      let selectedQuantity = 0;
      if (option.family.controlType === 'BULK') {
        for (const item of availableByFamily.bulk.get(option.family.id) ?? []) {
          const quantity = bulkQuantities[bulkSelectionKey(item)] ?? 0;
          if (quantity > 0) selections.push({ type: 'bulk', item, quantity });
          selectedQuantity += quantity;
        }
      } else {
        for (const item of availableByFamily.serial.get(option.family.id) ?? []) {
          if (serialIds.has(item.assetId)) {
            selections.push({ type: 'serial', item });
            selectedQuantity += 1;
          }
        }
      }
      if (selectedQuantity < option.minimumQuantity) {
        setError(`${option.family.name} requiere mínimo ${option.minimumQuantity}.`);
        return;
      }
      if (option.maximumQuantity != null && selectedQuantity > option.maximumQuantity) {
        setError(`${option.family.name} permite máximo ${option.maximumQuantity}.`);
        return;
      }
    }
    onConfirm(selections);
  };

  return (
    <Modal opened={opened} onClose={onClose} title={`Componentes de ${parentName}`} centered size="lg">
      <Stack>
        <Text size="sm" c="dimmed">Agrega únicamente los componentes que saldrán con este equipo. Puedes continuar sin accesorios opcionales.</Text>
        {error ? <Alert color="red">{error}</Alert> : null}
        {options.map((option) => {
          const bulk = availableByFamily.bulk.get(option.family.id) ?? [];
          const serial = availableByFamily.serial.get(option.family.id) ?? [];
          return (
            <Paper key={option.id} withBorder radius="md" p="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={800}>{option.family.name}</Text>
                  <Group gap="xs">
                    <Badge variant="light">{option.family.controlType}</Badge>
                    <Badge color={option.required ? 'orange' : 'gray'} variant="light">{option.required ? 'Obligatorio' : 'Opcional'}</Badge>
                  </Group>
                </Group>
                {option.family.controlType === 'BULK' ? bulk.map((item) => (
                  <Group key={`${item.skuId}:${item.ownerWarehouseId}`} justify="space-between" wrap="nowrap">
                    <div><Text size="sm" fw={600}>{item.skuName}</Text><Text size="xs" c="dimmed">Disponibles: {item.quantity}</Text></div>
                    <NumberInput
                      aria-label={`Cantidad de ${item.skuName}`}
                      w={110}
                      min={0}
                      max={Math.min(item.quantity, option.maximumQuantity ?? item.quantity)}
                      value={bulkQuantities[bulkSelectionKey(item)] ?? 0}
                      onChange={(value) => setBulkQuantities((current) => ({
                        ...current,
                        [bulkSelectionKey(item)]: Number(value) || 0,
                      }))}
                    />
                  </Group>
                )) : serial.map((item) => (
                  <Checkbox
                    key={item.assetId}
                    checked={serialIds.has(item.assetId)}
                    label={getSerialDisplayName(item)}
                    onChange={(event) => setSerialIds((current) => {
                      const next = new Set(current);
                      if (event.currentTarget.checked) next.add(item.assetId); else next.delete(item.assetId);
                      return next;
                    })}
                  />
                ))}
                {!(bulk.length || serial.length) ? <Text size="sm" c="dimmed">No hay existencias disponibles en esta bodega.</Text> : null}
              </Stack>
            </Paper>
          );
        })}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirm}>Agregar al documento</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
