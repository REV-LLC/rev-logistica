'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Checkbox, Group, Modal, NumberInput, Paper, Select, Stack, Text } from '@mantine/core';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import type { InventoryItemPickerBulkItem, InventoryItemPickerSerialItem } from './InventoryItemPickerModal';
import { getSerialDisplayName } from '@/lib/serial-assets';

export type AssetComponentOption = {
  id: string;
  family: { id: string; code: string; name: string; controlType: 'BULK' | 'SERIAL' };
  required: boolean;
  minimumQuantity: number;
  maximumQuantity: number | null;
  exclusiveGroup?: string | null;
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
  canCreate?: boolean;
  excludedAssetIds?: Set<string | undefined>;
  onAssetCreated?: (asset: InventoryItemPickerSerialItem) => void;
  onClose: () => void;
  onConfirm: (selections: AssetComponentSelection[]) => void;
};

const bulkSelectionKey = (item: InventoryItemPickerBulkItem) =>
  `${item.skuId}:${item.ownerWarehouseId ?? 'pending'}`;

const CreateSerializedAssetForm = dynamic(() => import('./serialized-assets/CreateSerializedAssetForm'));

export default function AssetComponentsSelectionModal({
  opened,
  parentName,
  options,
  bulkItems,
  serialItems,
  ownerWarehouseId,
  restrictOwnerWarehouse = true,
  canCreate = false,
  excludedAssetIds,
  onAssetCreated,
  onClose,
  onConfirm,
}: Props) {
  const [bulkQuantities, setBulkQuantities] = useState<Record<string, number>>({});
  const [serialIds, setSerialIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<AssetComponentOption | null>(null);
  const [createdAssetId, setCreatedAssetId] = useState<string | null>(null);
  const [createdOption, setCreatedOption] = useState<AssetComponentOption | null>(null);
  const [createdItems, setCreatedItems] = useState<InventoryItemPickerSerialItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setBulkQuantities({});
    setSerialIds(new Set());
    setError(null);
    setCreating(null);
    setCreatedAssetId(null);
    setCreatedItems([]);
  }, [opened]);

  const availableByFamily = useMemo(() => {
    const bulk = new Map<string, InventoryItemPickerBulkItem[]>();
    const serial = new Map<string, InventoryItemPickerSerialItem[]>();
    options.forEach((option) => {
      bulk.set(option.family.id, bulkItems.filter((item) =>
        item.assetFamilyId === option.family.id
        && (!restrictOwnerWarehouse || item.ownerWarehouseId === ownerWarehouseId),
      ));
      const uniqueItems = [...new Map([...serialItems, ...createdItems].map((item) => [item.assetId, item])).values()];
      serial.set(option.family.id, uniqueItems.filter((item) =>
        item.assetFamily?.id === option.family.id
        && !excludedAssetIds?.has(item.assetId)
        && (!restrictOwnerWarehouse || item.ownerWarehouseId === ownerWarehouseId),
      ));
    });
    return { bulk, serial };
  }, [bulkItems, options, ownerWarehouseId, restrictOwnerWarehouse, serialItems, createdItems, excludedAssetIds]);

  const groups = [...new Set(options.map((option) => option.exclusiveGroup).filter((group): group is string => Boolean(group)))];
  const selectSerial = (option: AssetComponentOption, assetId: string | null) => {
    setSerialIds((current) => {
      const next = new Set(current);
      const alternatives = option.exclusiveGroup
        ? options.filter((entry) => entry.exclusiveGroup === option.exclusiveGroup)
        : option.maximumQuantity === 1 ? [option] : [];
      alternatives.forEach((entry) => {
        (availableByFamily.serial.get(entry.family.id) ?? []).forEach((item) => next.delete(item.assetId));
      });
      if (assetId) next.add(assetId);
      return next;
    });
    setError(null);
  };

  const refreshCreatedAsset = async (assetId: string, option: AssetComponentOption) => {
    setCreatedAssetId(assetId);
    setCreatedOption(option);
    setCreatingBusy(false);
    setCreating(null);
    setRefreshing(true);
    try {
      const inventory = await api<{ serial: InventoryItemPickerSerialItem[] }>(`/inventory/warehouse/${ownerWarehouseId}`);
      const item = inventory.serial.find((entry) => entry.assetId === assetId && entry.assetFamily?.id === option.family.id);
      if (!item) throw new Error('El accesorio se creó, pero aún no aparece disponible en esta bodega. Actualiza para seleccionarlo; no lo crees otra vez.');
      setCreatedItems((current) => [...current.filter((entry) => entry.assetId !== assetId), item]);
      onAssetCreated?.(item);
      selectSerial(option, assetId);
      setCreatedAssetId(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'El accesorio se creó. No se pudo actualizar el inventario.');
    } finally {
      setRefreshing(false);
    }
  };

  const confirm = () => {
    const selections: AssetComponentSelection[] = [];
    const groupCounts = new Map<string, number>();
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
      if (option.exclusiveGroup) {
        const total = (groupCounts.get(option.exclusiveGroup) ?? 0) + selectedQuantity;
        if (total > 1) {
          setError(`Selecciona solo un implemento para ${option.exclusiveGroup}.`);
          return;
        }
        groupCounts.set(option.exclusiveGroup, total);
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
    <>
    <Modal opened={opened} onClose={onClose} title={`Componentes de ${parentName}`} centered size="lg">
      <Stack>
        <Text size="sm" c="dimmed">Selecciona los componentes que acompañan a este equipo. {restrictOwnerWarehouse ? 'Disponibilidad de la bodega de origen.' : 'Disponibilidad del saldo en obra; no del inventario de bodega.'} Puedes continuar sin accesorios opcionales.</Text>
        {error ? <Alert color="red">{error}</Alert> : null}
        {createdAssetId ? <Alert color="yellow">
          El accesorio ya está registrado. Actualiza el inventario para seleccionarlo; no lo registres otra vez.
          <Button mt="xs" variant="light" loading={refreshing} onClick={() => createdOption && void refreshCreatedAsset(createdAssetId, createdOption)}>Actualizar inventario</Button>
        </Alert> : null}
        {groups.map((group) => {
          const alternatives = options.filter((option) => option.exclusiveGroup === group);
          const items = alternatives.flatMap((option) => availableByFamily.serial.get(option.family.id) ?? []);
          return <Paper key={group} withBorder p="md" radius="md">
            <Stack gap="sm">
              <Text fw={800}>{group} · ¿Qué implemento lleva?</Text>
              <Text size="sm" c="dimmed">Elige uno entre las familias compatibles, o ninguno. No es una asignación permanente.</Text>
              <Select
                label={group}
                comboboxProps={{ withinPortal: false }}
                placeholder="Sin implemento"
                searchable clearable
                clearButtonProps={{ 'aria-label': `Quitar selección de ${group}` }}
                nothingFoundMessage="No hay implementos disponibles en este origen"
                data={alternatives.map((option) => ({
                  group: option.family.name,
                  items: (availableByFamily.serial.get(option.family.id) ?? []).map((item) => ({ value: item.assetId, label: getSerialDisplayName(item) })),
                }))}
                value={items.find((item) => serialIds.has(item.assetId))?.assetId ?? null}
                onChange={(value) => selectSerial(alternatives[0], value)}
              />
              {canCreate && restrictOwnerWarehouse && ownerWarehouseId && !createdAssetId ? <Group>
                {alternatives.map((option) => <Button key={option.id} variant="light" size="xs" h="auto" py="xs" maw="100%" styles={{ label: { whiteSpace: 'normal' } }} onClick={() => setCreating(option)}>Crear {option.family.name.toLowerCase()}</Button>)}
              </Group> : null}
            </Stack>
          </Paper>;
        })}
        {options.filter((option) => !option.exclusiveGroup).map((option) => {
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
                {canCreate && restrictOwnerWarehouse && ownerWarehouseId && option.family.controlType === 'SERIAL' && !createdAssetId ? (
                  <Button variant="light" size="xs" onClick={() => setCreating(option)}>Crear accesorio en esta bodega</Button>
                ) : null}
              </Stack>
            </Paper>
          );
        })}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirm} loading={refreshing} disabled={Boolean(createdAssetId)}>Agregar al documento</Button>
        </Group>
      </Stack>
    </Modal>
    <Modal opened={Boolean(creating)} onClose={() => { if (!creatingBusy) setCreating(null); }} closeOnClickOutside={false} closeOnEscape={!creatingBusy} withCloseButton={!creatingBusy} title={`Crear ${creating?.family.name ?? 'accesorio'}`} size="xl" centered>
      {creating && ownerWarehouseId ? <CreateSerializedAssetForm
        key={creating.id}
        initialFamilyId={creating.family.id}
        initialWarehouseId={ownerWarehouseId}
        onSavingChange={setCreatingBusy}
        onCreated={(assetId) => void refreshCreatedAsset(assetId, creating)}
      /> : null}
    </Modal>
    </>
  );
}
