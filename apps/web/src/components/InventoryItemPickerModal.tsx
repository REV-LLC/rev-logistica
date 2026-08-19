'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconCheck, IconChevronLeft, IconPackage, IconSearch } from '@tabler/icons-react';
import type { SerialAssetCardItem } from '@/components/SerialAssetCard';
import { getSerialDisplayName } from '@/lib/serial-assets';

export type InventoryItemPickerBulkItem = {
  skuId: string;
  skuName: string | null;
  ownerWarehouseId: string | null;
  ownerWarehouseName?: string | null;
  quantity: number;
  assetFamilyId?: string | null;
};

export type InventoryItemPickerSerialItem = SerialAssetCardItem & {
  quantity: number;
  skuId?: string | null;
  ownerWarehouseId: string | null;
  assetFamily?: { id?: string; code: string; name: string } | null;
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
  showOwnerWarehouse?: boolean;
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
  showOwnerWarehouse = true,
  emptyStateText,
  onItemAddedNotice,
}: InventoryItemPickerModalProps) {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

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
    setSearchQuery('');
    setMobileSearchOpen(false);
  }, [opened, bulkItems, serialItems]);

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('es');
    if (!query) return groupedRows;

    return groupedRows
      .map((group) => ({
        ...group,
        rows: group.rows.filter((row) =>
          [
            row.name,
            row.family,
            row.type === 'bulk' ? 'masivo' : 'equipo',
            ...(showOwnerWarehouse ? [row.ownerWarehouseName] : []),
          ].some((value) => value.toLocaleLowerCase('es').includes(query)),
        ),
      }))
      .filter((group) => group.rows.length > 0);
  }, [groupedRows, searchQuery, showOwnerWarehouse]);

  const visibleSelectableRows = useMemo(
    () => filteredGroups.flatMap((group) => group.rows).filter((row) => !row.disabled),
    [filteredGroups],
  );

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

  const toggleAllVisible = () => {
    setSelectedRowKeys((current) => {
      const next = new Set(current);
      const allVisibleSelected =
        visibleSelectableRows.length > 0 && visibleSelectableRows.every((row) => next.has(row.key));

      visibleSelectableRows.forEach((row) => {
        if (allVisibleSelected) {
          next.delete(row.key);
        } else {
          next.add(row.key);
        }
      });
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
  const availableCount = groupedRows.flatMap((group) => group.rows).filter((row) => !row.disabled).length;
  const ownerWarehouseNames = useMemo(
    () => Array.from(new Set(groupedRows.flatMap((group) => group.rows.map((row) => row.ownerWarehouseName)))),
    [groupedRows],
  );
  const singleOwnerWarehouseName =
    showOwnerWarehouse && ownerWarehouseNames.length === 1 ? ownerWarehouseNames[0] : null;
  const visibleSelectedCount = visibleSelectableRows.filter((row) => selectedRowKeys.has(row.key)).length;
  const allVisibleSelected =
    visibleSelectableRows.length > 0 && visibleSelectedCount === visibleSelectableRows.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;
  const showTableColumns = !isMobile;

  if (isMobile) {
    return (
      <Modal
        opened={opened}
        onClose={onClose}
        fullScreen
        withCloseButton={false}
        padding={0}
        radius={0}
        classNames={{
          content: 'inventory-picker-mobile-modal',
          body: 'inventory-picker-mobile-modal-body',
        }}
      >
        <div className="inventory-picker-mobile-shell" tabIndex={-1} data-autofocus>
          <header className="inventory-picker-mobile-header">
            <ActionIcon
              variant="transparent"
              color="dark"
              size="xl"
              onClick={onClose}
              aria-label="Volver"
            >
              <IconChevronLeft size={34} stroke={2.6} aria-hidden="true" />
            </ActionIcon>

            <Text component="h2" className="inventory-picker-mobile-title">
              {title}
            </Text>

            <ActionIcon
              variant="transparent"
              color="dark"
              size="xl"
              onClick={() => {
                setMobileSearchOpen((current) => !current);
                if (mobileSearchOpen) setSearchQuery('');
              }}
              aria-label={mobileSearchOpen ? 'Cerrar búsqueda' : 'Buscar items'}
            >
              <IconSearch size={30} stroke={2.4} aria-hidden="true" />
            </ActionIcon>
          </header>

          {mobileSearchOpen ? (
            <div className="inventory-picker-mobile-search">
              <TextInput
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                placeholder="Buscar por nombre, familia o tipo"
                aria-label="Buscar items"
                className="inventory-picker-mobile-search-input"
              />
            </div>
          ) : null}

          <ScrollArea className="inventory-picker-mobile-list" type="auto" offsetScrollbars>
            {hasItems && filteredGroups.length ? (
              <div>
                {filteredGroups.map((group) => (
                  <section key={group.family} className="inventory-picker-mobile-family">
                    <div className="inventory-picker-mobile-family-heading">
                      <Text component="h3">{group.family}</Text>
                      <Text component="span">{group.rows.length}</Text>
                    </div>

                    {group.rows.map((row) => {
                      const isSelected = selectedRowKeys.has(row.key);
                      const quantity = row.type === 'bulk' ? row.item.quantity : 1;
                      return (
                        <UnstyledButton
                          key={row.key}
                          type="button"
                          className={[
                            'inventory-picker-mobile-row',
                            isSelected ? 'is-selected' : '',
                            row.disabled ? 'is-disabled' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => toggleRow(row)}
                          disabled={row.disabled}
                          role="checkbox"
                          aria-checked={isSelected}
                          aria-label={`${row.name}, ${row.type === 'bulk' ? 'Masivo' : 'Equipo'}, ${quantity} ${
                            quantity === 1 ? 'disponible' : 'disponibles'
                          }`}
                        >
                          <span className="inventory-picker-mobile-check" aria-hidden="true">
                            {isSelected ? <IconCheck size={18} stroke={3} /> : null}
                          </span>
                          <span className="inventory-picker-mobile-row-copy">
                            <Text component="span" className="inventory-picker-mobile-row-name">
                              {row.name}
                            </Text>
                            <Text component="span" className="inventory-picker-mobile-row-meta">
                              {row.type === 'bulk' ? 'Masivo' : 'Equipo'} · {quantity}{' '}
                              {quantity === 1 ? 'disponible' : 'disponibles'}
                            </Text>
                            {row.disabled ? (
                              <Text component="span" className="inventory-picker-mobile-row-status">
                                {row.type === 'bulk' && row.item.quantity < 0
                                  ? 'Requiere ajuste'
                                  : 'Ya agregado'}
                              </Text>
                            ) : null}
                          </span>
                        </UnstyledButton>
                      );
                    })}
                  </section>
                ))}
              </div>
            ) : (
              <div className="inventory-picker-mobile-empty">
                <Text fw={700}>
                  {hasItems ? 'No encontramos coincidencias' : 'No hay items disponibles'}
                </Text>
                <Text size="sm" c="dimmed" mt={4}>
                  {hasItems
                    ? 'Prueba con otro nombre o familia.'
                    : 'Revisa el origen e intenta cargar el inventario nuevamente.'}
                </Text>
              </div>
            )}
          </ScrollArea>

          <footer className="inventory-picker-mobile-footer">
            <Text className="inventory-picker-mobile-selection-count" aria-live="polite">
              {selectedCount} {selectedCount === 1 ? 'item seleccionado' : 'items seleccionados'}
            </Text>
            <Button
              onClick={confirmSelection}
              disabled={selectedCount === 0}
              className="inventory-picker-mobile-confirm"
            >
              Agregar
            </Button>
          </footer>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      centered={!isMobile}
      fullScreen={isMobile}
      radius={isMobile ? 0 : 'lg'}
      size="min(1120px, 96vw)"
      classNames={{
        content: 'inventory-picker-modal',
        header: 'inventory-picker-modal-header',
        body: 'inventory-picker-modal-body',
      }}
    >
      <Stack gap={isMobile ? 'xs' : 'md'} className="inventory-picker">
        <div className="inventory-picker-intro">
          <Text className="ui-text-body">
            Busca y selecciona los items que quieres agregar al documento.
          </Text>
          {!showOwnerWarehouse ? (
            <Text size="xs" c="dimmed" mt={4}>
              La selección muestra únicamente la información necesaria para el despacho.
            </Text>
          ) : null}
        </div>

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
          <Stack gap={isMobile ? 'xs' : 'md'} className="inventory-picker-content">
            {hasItems ? (
              <>
                <Paper
                  withBorder
                  radius="lg"
                  p={isMobile ? 'xs' : 'md'}
                  className="inventory-picker-toolbar"
                >
                  <Stack gap={isMobile ? 'xs' : 'sm'}>
                    <TextInput
                      size={isMobile ? 'sm' : 'md'}
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.currentTarget.value)}
                      placeholder="Buscar items"
                      leftSection={<IconSearch size={17} aria-hidden="true" />}
                      aria-label="Buscar items"
                    />
                    <Group
                      justify="space-between"
                      align="center"
                      gap={isMobile ? 'xs' : 'sm'}
                      wrap="wrap"
                    >
                      <Group gap="xs" className="inventory-picker-desktop-summary">
                        <Badge variant="light" color="teal" size={isMobile ? 'sm' : 'lg'}>
                          {availableCount} disponible{availableCount === 1 ? '' : 's'}
                        </Badge>
                        <Badge
                          variant={selectedCount ? 'filled' : 'light'}
                          color={selectedCount ? 'blue' : 'gray'}
                          size={isMobile ? 'sm' : 'lg'}
                        >
                          {selectedCount} seleccionado{selectedCount === 1 ? '' : 's'}
                        </Badge>
                      </Group>
                      <Text size="sm" c="dimmed" className="inventory-picker-mobile-summary">
                        <strong>{availableCount}</strong> disponible{availableCount === 1 ? '' : 's'}
                        {' · '}
                        <strong>{selectedCount}</strong> seleccionado{selectedCount === 1 ? '' : 's'}
                      </Text>
                      <Checkbox
                        size="sm"
                        checked={allVisibleSelected}
                        indeterminate={someVisibleSelected}
                        disabled={visibleSelectableRows.length === 0}
                        onChange={toggleAllVisible}
                        label="Seleccionar visibles"
                      />
                    </Group>
                    {singleOwnerWarehouseName ? (
                      <Text size="xs" c="dimmed" className="inventory-picker-mobile-owner-summary">
                        Bodega: {singleOwnerWarehouseName}
                      </Text>
                    ) : null}
                  </Stack>
                </Paper>

                <ScrollArea
                  offsetScrollbars
                  type="auto"
                  className="inventory-picker-scroll"
                >
                  <Stack
                    gap={isMobile ? 0 : 'sm'}
                    pr={isMobile ? 0 : 'xs'}
                    className="inventory-picker-families"
                  >
                    {filteredGroups.length ? (
                      filteredGroups.map((group) => (
                        <Paper
                          key={group.family}
                          withBorder
                          radius="lg"
                          p={0}
                          className="inventory-picker-family"
                        >
                          <Group
                            justify="space-between"
                            px={isMobile ? 'xs' : 'md'}
                            py={isMobile ? 6 : 'sm'}
                            wrap="nowrap"
                            className="inventory-picker-family-header"
                          >
                            <Group gap="xs" wrap="nowrap">
                              <IconPackage
                                size={17}
                                aria-hidden="true"
                                className="inventory-picker-family-icon"
                              />
                              <Text fw={700} className="ui-text-label">
                                {group.family}
                              </Text>
                            </Group>
                            <Badge
                              variant="light"
                              color="gray"
                              className="inventory-picker-family-count"
                            >
                              {group.rows.length}
                            </Badge>
                          </Group>
                          <div className="inventory-picker-table-scroll">
                            <Table
                              verticalSpacing={isMobile ? 'xs' : 'sm'}
                              horizontalSpacing={isMobile ? 'xs' : 'md'}
                            >
                              <Table.Thead>
                                <Table.Tr>
                                  <Table.Th style={{ width: 46 }} aria-label="Selección"></Table.Th>
                                  <Table.Th>Item</Table.Th>
                                  {showTableColumns ? (
                                    <>
                                      <Table.Th style={{ width: 116 }}>Tipo</Table.Th>
                                      <Table.Th style={{ width: 100, textAlign: 'center' }}>
                                        Disponible
                                      </Table.Th>
                                      {showOwnerWarehouse ? (
                                        <Table.Th style={{ width: 220 }}>Bodega dueña</Table.Th>
                                      ) : null}
                                    </>
                                  ) : null}
                                </Table.Tr>
                              </Table.Thead>
                              <Table.Tbody>
                                {group.rows.map((row) => {
                                  const isSelected = selectedRowKeys.has(row.key);
                                  return (
                                    <Table.Tr
                                      key={row.key}
                                      onClick={() => toggleRow(row)}
                                      className={[
                                        'inventory-picker-row',
                                        isSelected ? 'is-selected' : '',
                                        row.disabled ? 'is-disabled' : '',
                                      ]
                                        .filter(Boolean)
                                        .join(' ')}
                                    >
                                      <Table.Td>
                                        <Checkbox
                                          size="sm"
                                          checked={isSelected}
                                          disabled={row.disabled}
                                          onChange={() => toggleRow(row)}
                                          onClick={(event) => event.stopPropagation()}
                                          aria-label={`Seleccionar ${row.name}`}
                                        />
                                      </Table.Td>
                                      <Table.Td>
                                        <Text size="sm" fw={650} c="dark.8">
                                          {row.name}
                                        </Text>
                                        <Text
                                          size="xs"
                                          c="dimmed"
                                          className="inventory-picker-mobile-meta"
                                        >
                                          {row.type === 'bulk' ? 'Masivo' : 'Equipo'}
                                          {' · '}
                                          {row.type === 'bulk' ? row.item.quantity : 1} disponible
                                          {(row.type === 'bulk' ? row.item.quantity : 1) === 1 ? '' : 's'}
                                        </Text>
                                        {showOwnerWarehouse && !singleOwnerWarehouseName ? (
                                          <Text
                                            size="xs"
                                            c="dimmed"
                                            className="inventory-picker-mobile-owner"
                                          >
                                            {row.ownerWarehouseName}
                                          </Text>
                                        ) : null}
                                        {row.disabled ? (
                                          <Text size="xs" c="dimmed">
                                            {row.type === 'bulk' && row.item.quantity < 0
                                              ? 'Requiere ajuste'
                                              : 'Ya agregado'}
                                          </Text>
                                        ) : null}
                                      </Table.Td>
                                      {showTableColumns ? (
                                        <>
                                          <Table.Td>
                                            <Badge
                                              variant="light"
                                              color={row.type === 'bulk' ? 'blue' : 'violet'}
                                              radius="sm"
                                            >
                                              {row.type === 'bulk' ? 'Masivo' : 'Equipo'}
                                            </Badge>
                                          </Table.Td>
                                          <Table.Td style={{ textAlign: 'center' }}>
                                            <Text size="sm" fw={700}>
                                              {row.type === 'bulk' ? row.item.quantity : 1}
                                            </Text>
                                          </Table.Td>
                                          {showOwnerWarehouse ? (
                                            <Table.Td>
                                              <Text size="sm" c="dimmed">
                                                {row.ownerWarehouseName}
                                              </Text>
                                            </Table.Td>
                                          ) : null}
                                        </>
                                      ) : null}
                                    </Table.Tr>
                                  );
                                })}
                              </Table.Tbody>
                            </Table>
                          </div>
                        </Paper>
                      ))
                    ) : (
                      <Paper withBorder radius="lg" p="xl" className="inventory-picker-empty">
                        <IconSearch size={28} aria-hidden="true" />
                        <Text fw={700} mt="sm">
                          No encontramos coincidencias
                        </Text>
                        <Text size="sm" c="dimmed" mt={4}>
                          Prueba con otro nombre, familia, tipo o bodega.
                        </Text>
                      </Paper>
                    )}
                  </Stack>
                </ScrollArea>
              </>
            ) : (
              <Paper withBorder radius="lg" p="xl" className="inventory-picker-empty">
                <IconPackage size={30} aria-hidden="true" />
                <Text fw={700} mt="sm">No hay items disponibles</Text>
                <Text size="sm" c="dimmed" mt={4}>
                  Revisa el origen seleccionado o intenta cargar el inventario nuevamente.
                </Text>
              </Paper>
            )}
          </Stack>
        )}

        <Group justify="space-between" className="inventory-picker-actions">
          <Text size="sm" c="dimmed">
            {selectedCount
              ? `${selectedCount} item${selectedCount === 1 ? '' : 's'} listo${selectedCount === 1 ? '' : 's'} para agregar`
              : 'Selecciona al menos un item para continuar'}
          </Text>
          <Group
            gap={isMobile ? 'xs' : 'sm'}
            grow={isMobile}
            wrap={isMobile ? 'wrap' : 'nowrap'}
            className="mobile-actions"
          >
            <Button size={isMobile ? 'sm' : 'md'} variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              size={isMobile ? 'sm' : 'md'}
              onClick={confirmSelection}
              disabled={selectedCount === 0}
            >
              <span className="inventory-picker-desktop-action-label">
                Agregar al documento{selectedCount ? ` (${selectedCount})` : ''}
              </span>
              <span className="inventory-picker-mobile-action-label">
                Agregar{selectedCount ? ` (${selectedCount})` : ''}
              </span>
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
