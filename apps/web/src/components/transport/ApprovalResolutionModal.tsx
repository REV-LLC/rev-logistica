'use client';

import { Button, Group, Modal, Paper, Select, Stack, Text } from '@mantine/core';
import type { InventoryItemPickerSerialItem } from '@/components/InventoryItemPickerModal';
import { getSerialDisplayName } from '@/lib/serial-assets';
import {
  getResolveSkuOptions,
  isResolvePendingItem,
  parseInternalNumberFromTag,
  type ApprovalResolutionItem,
  type ApprovalResolutionSku,
} from '@/components/transport/approval-resolution';

type ResolutionModalItem = ApprovalResolutionItem & {
  sku?: { id: string; name: string } | null;
};

type ApprovalResolutionModalProps = {
  opened: boolean;
  items: ResolutionModalItem[];
  skuOptions: ApprovalResolutionSku[];
  inventoriesByOwner: Record<
    string,
    {
      bulk: Array<{ skuId: string; quantity: number }>;
      serial: InventoryItemPickerSerialItem[];
    }
  >;
  warehouses: Array<{ id: string; name: string }>;
  skuByIndex: Record<number, string>;
  assetByIndex: Record<number, string>;
  resolving: boolean;
  onClose: () => void;
  onSkuChange: (index: number, skuId: string) => void;
  onAssetChange: (index: number, assetId: string) => void;
  onCreateSerial: (index: number) => void;
  onApprove: () => void;
};

export default function ApprovalResolutionModal({
  opened,
  items,
  skuOptions,
  inventoriesByOwner,
  warehouses,
  skuByIndex,
  assetByIndex,
  resolving,
  onClose,
  onSkuChange,
  onAssetChange,
  onCreateSerial,
  onApprove,
}: ApprovalResolutionModalProps) {
  const pendingItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isResolvePendingItem(item, skuOptions));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Resolver tags antes de aprobar"
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Masivo resuelve por SKU. Serializado resuelve por equipo especifico (interno #).
        </Text>
        {pendingItems.map(({ item, index }) => {
          const selectedSkuId = skuByIndex[index];
          const selectedSku = skuOptions.find((entry) => entry.id === selectedSkuId);
          const ownerWarehouseId = item.condition?.trim() ?? '';
          const serialInventory = inventoriesByOwner[ownerWarehouseId]?.serial ?? [];
          const expectedInternal = parseInternalNumberFromTag(item.requestedTag);
          const serialOptions = selectedSku?.controlType === 'SERIAL'
            ? serialInventory
                .filter((serial) => serial.skuId === selectedSku.id)
                .map((serial) => ({
                  value: serial.assetId,
                  label: getSerialDisplayName(serial),
                }))
            : [];
          const hasExpected =
            selectedSku?.controlType === 'SERIAL' && expectedInternal != null
              ? serialInventory.some(
                  (serial) =>
                    serial.skuId === selectedSku.id &&
                    serial.internalNumber === expectedInternal,
                )
              : false;

          return (
            <Paper key={`${item.requestedTag}-${index}`} withBorder p="sm" radius="md">
              <Stack gap={6}>
                <Text fw={600}>{item.requestedTag ?? item.sku?.name ?? `Item ${index + 1}`}</Text>
                <Text size="xs" c="dimmed">
                  Cantidad: {Number(item.quantity ?? 1) || 1}
                </Text>
                <Text size="xs" c="dimmed">
                  Bodega: {warehouses.find((warehouse) => warehouse.id === item.condition)?.name ?? '-'}
                </Text>
                <Select
                  label="Equipo"
                  placeholder="Buscar equipo de esta bodega"
                  searchable
                  data={getResolveSkuOptions(item.condition, inventoriesByOwner, skuOptions)}
                  value={selectedSkuId ?? null}
                  nothingFoundMessage="Esta bodega no tiene equipos disponibles"
                  onChange={(value) => onSkuChange(index, value ?? '')}
                />
                {selectedSku?.controlType === 'SERIAL' ? (
                  <Stack gap={6}>
                    <Select
                      label="Equipo serial"
                      placeholder="Seleccionar equipo"
                      searchable
                      data={serialOptions}
                      value={assetByIndex[index] ?? null}
                      nothingFoundMessage="No hay equipo para este SKU en esa bodega"
                      onChange={(value) => onAssetChange(index, value ?? '')}
                    />
                    {expectedInternal != null && !hasExpected ? (
                      <Text size="xs" c="orange.7">
                        El tag solicita #{expectedInternal}, pero no existe en esa bodega.
                      </Text>
                    ) : null}
                    {!serialOptions.length || (expectedInternal != null && !hasExpected) ? (
                      <Button size="xs" variant="light" onClick={() => onCreateSerial(index)}>
                        Crear equipo faltante
                      </Button>
                    ) : null}
                  </Stack>
                ) : null}
              </Stack>
            </Paper>
          );
        })}

        <Group justify="flex-end" className="mobile-actions">
          <Button variant="default" onClick={onClose} disabled={resolving}>
            Cancelar
          </Button>
          <Button onClick={onApprove} loading={resolving}>
            Resolver y aprobar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
