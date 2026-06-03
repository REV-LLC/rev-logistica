'use client';

import { Alert, Badge, Button, Divider, Group, Modal, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import SerialAssetCard, { type SerialAssetCardItem } from '@/components/SerialAssetCard';
import { getSerialDisplayName } from '@/lib/serial-assets';

export type InventoryItemPickerBulkItem = {
  skuId: string;
  skuName: string | null;
  ownerWarehouseId: string | null;
  ownerWarehouseName?: string | null;
  quantity: number;
};

export type InventoryItemPickerSerialItem = SerialAssetCardItem & {
  quantity: number;
  skuId?: string | null;
  ownerWarehouseId: string | null;
};

type InventoryItemPickerModalProps = {
  opened: boolean;
  onClose: () => void;
  title?: string;
  bulkItems: InventoryItemPickerBulkItem[];
  serialItems: InventoryItemPickerSerialItem[];
  selectedBulkKeys: Set<string | undefined>;
  selectedSerialIds: Set<string | undefined>;
  onAddBulk: (item: InventoryItemPickerBulkItem) => boolean | void;
  onAddSerial: (item: InventoryItemPickerSerialItem) => boolean | void;
  itemsAddedNotice?: string | null;
  isDriverRole?: boolean;
  sourceMode?: 'warehouse' | 'on-site';
  emptyStateText?: string | null;
  onItemAddedNotice?: (message: string) => void;
};

function buildBulkItemKey(item: InventoryItemPickerBulkItem) {
  return `${item.skuId}::${item.ownerWarehouseId ?? 'none'}`;
}

export default function InventoryItemPickerModal({
  opened,
  onClose,
  title = 'Seleccionar items',
  bulkItems,
  serialItems,
  selectedBulkKeys,
  selectedSerialIds,
  onAddBulk,
  onAddSerial,
  itemsAddedNotice,
  isDriverRole = false,
  sourceMode = 'warehouse',
  emptyStateText,
  onItemAddedNotice,
}: InventoryItemPickerModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered size="90%">
      <Stack gap="md">
        {itemsAddedNotice ? (
          <Alert color="green" variant="light">
            {itemsAddedNotice}
          </Alert>
        ) : null}

        {emptyStateText ? (
          <Text size="sm" c="dimmed">
            {emptyStateText}
          </Text>
        ) : (
          <Stack gap="md">
            <Stack gap="xs">
              <Title order={5}>Stock masivo</Title>
              {bulkItems.length ? (
                bulkItems.map((item) => {
                  const bulkKey = buildBulkItemKey(item);
                  const alreadySelected = selectedBulkKeys.has(bulkKey);
                  const hasNegativeStock = item.quantity < 0;
                  const disabled = alreadySelected || hasNegativeStock;
                  return (
                    <Paper
                      key={bulkKey}
                      withBorder
                      p="sm"
                      radius="md"
                      style={{
                        cursor: disabled ? 'default' : 'pointer',
                        borderColor: hasNegativeStock ? 'var(--mantine-color-red-4)' : undefined,
                      }}
                      onClick={() => {
                        if (disabled) return;
                        const added = onAddBulk(item);
                        if (added && onItemAddedNotice) {
                          onItemAddedNotice(`${item.skuName ?? 'Item'} agregado a la lista.`);
                        }
                      }}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <div>
                          <Text fw={600}>{item.skuName ?? 'SKU'}</Text>
                          {!isDriverRole || sourceMode === 'on-site' ? (
                            <Text size="sm" c="dimmed">
                              {item.ownerWarehouseName ?? 'Sin bodega dueña'}
                            </Text>
                          ) : null}
                        </div>
                        {alreadySelected ? (
                          <Badge color="green" variant="light">
                            Agregado
                          </Badge>
                        ) : hasNegativeStock ? (
                          <Badge
                            color="red"
                            variant="filled"
                            leftSection={<IconAlertTriangle size={12} stroke={2.5} />}
                          >
                            Requiere ajuste
                          </Badge>
                        ) : (
                          <Badge variant="light">
                            {isDriverRole && sourceMode === 'warehouse' ? 'Agregar' : item.quantity}
                          </Badge>
                        )}
                      </Group>
                    </Paper>
                  );
                })
              ) : (
                <Text size="sm" c="dimmed">
                  No hay stock masivo disponible.
                </Text>
              )}
            </Stack>

            <Divider />

            <Stack gap="xs">
              <Title order={5}>Equipos seriales</Title>
              {serialItems.length ? (
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
                  {serialItems.map((item) => {
                    const alreadySelected = selectedSerialIds.has(item.assetId);
                    return (
                      <SerialAssetCard
                        key={item.assetId}
                        item={item}
                        actionLabel={alreadySelected ? 'Agregado' : 'Agregar'}
                        onAction={
                          alreadySelected
                            ? undefined
                            : () => {
                                const added = onAddSerial(item);
                                if (added && onItemAddedNotice) {
                                  onItemAddedNotice(`${getSerialDisplayName(item)} agregado a la lista.`);
                                }
                              }
                        }
                      />
                    );
                  })}
                </SimpleGrid>
              ) : (
                <Text size="sm" c="dimmed">
                  No hay equipos seriales disponibles.
                </Text>
              )}
            </Stack>
          </Stack>
        )}

        <Group justify="flex-end" className="mobile-actions">
          <Button variant="default" onClick={onClose}>
            Cerrar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
