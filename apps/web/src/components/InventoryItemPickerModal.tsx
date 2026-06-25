'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Group, Modal, Stack, Table, Text, Title } from '@mantine/core';
import type { SerialAssetCardItem } from '@/components/SerialAssetCard';
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
  skuOptions?: Array<{ id: string; name: string; category?: string | null }>;
  itemsAddedNotice?: string | null;
  isDriverRole?: boolean;
  sourceMode?: 'warehouse' | 'on-site';
  emptyStateText?: string | null;
  onItemAddedNotice?: (message: string) => void;
};

function buildBulkItemKey(item: InventoryItemPickerBulkItem) {
  return `${item.skuId}::${item.ownerWarehouseId ?? 'none'}`;
}

type PickerRow =
  | {
      key: string;
      type: 'bulk';
      name: string;
      family: string;
      ownerWarehouseName: string;
      disabled: boolean;
      item: InventoryItemPickerBulkItem;
    }
  | {
      key: string;
      type: 'serial';
      name: string;
      family: string;
      ownerWarehouseName: string;
      disabled: boolean;
      item: InventoryItemPickerSerialItem;
    };

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
  skuOptions = [],
  itemsAddedNotice,
  isDriverRole = false,
  sourceMode = 'warehouse',
  emptyStateText,
  onItemAddedNotice,
}: InventoryItemPickerModalProps) {
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());

  const skuMetaById = useMemo(() => {
    const map = new Map<string, { name: string; category: string }>();
    skuOptions.forEach((sku) => {
      map.set(sku.id, {
        name: sku.name,
        category: sku.category?.trim() || 'Sin familia',
      });
    });
    return map;
  }, [skuOptions]);

  const groupedRows = useMemo(() => {
    const rows: PickerRow[] = [
      ...bulkItems.map((item) => {
        const skuMeta = skuMetaById.get(item.skuId);
        const key = `bulk:${buildBulkItemKey(item)}`;
        return {
          key,
          type: 'bulk' as const,
          name: item.skuName ?? skuMeta?.name ?? 'SKU',
          family: skuMeta?.category ?? 'Sin familia',
          ownerWarehouseName: item.ownerWarehouseName ?? 'Sin bodega dueña',
          disabled: selectedBulkKeys.has(buildBulkItemKey(item)) || item.quantity < 0,
          item,
        };
      }),
      ...serialItems.map((item) => {
        const skuMeta = item.skuId ? skuMetaById.get(item.skuId) : undefined;
        const key = `serial:${item.assetId}`;
        return {
          key,
          type: 'serial' as const,
          name: getSerialDisplayName(item),
          family: skuMeta?.category ?? 'Sin familia',
          ownerWarehouseName: item.ownerWarehouseName ?? 'Sin bodega dueña',
          disabled: selectedSerialIds.has(item.assetId),
          item,
        };
      }),
    ].sort((a, b) => a.family.localeCompare(b.family, 'es') || a.name.localeCompare(b.name, 'es'));

    return rows.reduce<Array<{ family: string; rows: PickerRow[] }>>((groups, row) => {
      const current = groups[groups.length - 1];
      if (current?.family === row.family) {
        current.rows.push(row);
      } else {
        groups.push({ family: row.family, rows: [row] });
      }
      return groups;
    }, []);
  }, [bulkItems, serialItems, selectedBulkKeys, selectedSerialIds, skuMetaById]);

  useEffect(() => {
    setSelectedRowKeys(new Set());
  }, [opened, bulkItems, serialItems]);

  const toggleRow = (row: PickerRow) => {
    if (row.disabled) return;
    setSelectedRowKeys((current) => {
      const next = new Set(current);
      if (next.has(row.key)) {
        next.delete(row.key);
      } else {
        next.add(row.key);
      }
      return next;
    });
  };

  const confirmSelection = () => {
    const selectedRows = groupedRows.flatMap((group) => group.rows).filter((row) => selectedRowKeys.has(row.key));
    let addedCount = 0;
    selectedRows.forEach((row) => {
      const added = row.type === 'bulk' ? onAddBulk(row.item) : onAddSerial(row.item);
      if (added) addedCount += 1;
    });
    if (addedCount > 0 && onItemAddedNotice) {
      onItemAddedNotice(
        `${addedCount} item${addedCount === 1 ? '' : 's'} agregado${addedCount === 1 ? '' : 's'} a la lista.`,
      );
    }
    setSelectedRowKeys(new Set());
    onClose();
  };

  const selectedCount = selectedRowKeys.size;
  const hasItems = groupedRows.some((group) => group.rows.length > 0);

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
          <Stack gap="sm">
            {hasItems ? (
              groupedRows.map((group) => (
                <Stack key={group.family} gap={4}>
                  <Title order={6}>{group.family}</Title>
                  <div style={{ overflowX: 'auto' }}>
                    <Table withTableBorder withColumnBorders verticalSpacing={4} horizontalSpacing="xs">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th style={{ width: 42 }}></Table.Th>
                          <Table.Th>Item</Table.Th>
                          <Table.Th style={{ width: 110 }}>Tipo</Table.Th>
                          {!isDriverRole || sourceMode === 'on-site' ? (
                            <Table.Th style={{ width: 170 }}>Bodega dueña</Table.Th>
                          ) : null}
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {group.rows.map((row) => (
                          <Table.Tr
                            key={row.key}
                            onClick={() => toggleRow(row)}
                            style={{ cursor: row.disabled ? 'default' : 'pointer' }}
                          >
                            <Table.Td>
                              <Checkbox
                                checked={selectedRowKeys.has(row.key)}
                                disabled={row.disabled}
                                onChange={() => toggleRow(row)}
                                onClick={(event) => event.stopPropagation()}
                                aria-label={`Seleccionar ${row.name}`}
                              />
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" fw={600}>
                                {row.name}
                              </Text>
                              {row.disabled ? (
                                <Text size="xs" c="dimmed">
                                  {row.type === 'bulk' && row.item.quantity < 0 ? 'Requiere ajuste' : 'Ya agregado'}
                                </Text>
                              ) : null}
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm">{row.type === 'bulk' ? 'Masivo' : 'Equipo'}</Text>
                            </Table.Td>
                            {!isDriverRole || sourceMode === 'on-site' ? (
                              <Table.Td>
                                <Text size="sm">{row.ownerWarehouseName}</Text>
                              </Table.Td>
                            ) : null}
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </div>
                </Stack>
              ))
            ) : (
              <Stack gap={4}>
                <Title order={5}>Items disponibles</Title>
                <Text size="sm" c="dimmed">
                  No hay items disponibles.
                </Text>
              </Stack>
            )}
          </Stack>
        )}

        <Group justify="flex-end" className="mobile-actions">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={confirmSelection} disabled={selectedCount === 0}>
            Confirmar seleccion{selectedCount ? ` (${selectedCount})` : ''}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
