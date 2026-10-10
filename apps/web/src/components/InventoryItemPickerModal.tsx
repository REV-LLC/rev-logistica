'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  Tabs,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconCheck, IconChevronLeft, IconPackage, IconSearch } from '@tabler/icons-react';
import type { SerialAssetCardItem } from '@/components/SerialAssetCard';
import { getSerialDisplayName } from '@/lib/serial-assets';
import { getSelectablePickerRows, isPickerQuantityAvailable, isPickerSerialAvailable, togglePickerRows } from '@/components/transport/inventory-picker-availability';

export type InventoryDocumentOrigin = {
  sourceDocumentItemId?: string;
  parentSourceDocumentItemId?: string;
  parentLegacyOriginId?: string;
  componentParentAssetId?: string;
  returnSourceLabel?: string;
  deliveryFuel?: 'ELECTRICO' | 'GASOLINA';
};
export type InventoryItemPickerBulkItem = InventoryDocumentOrigin & {
  isImplement?: boolean;
  isConsumable?: boolean;
  sourceWarehouseId?: string | null;
  skuId: string;
  skuName: string | null;
  ownerWarehouseId: string | null;
  ownerWarehouseName?: string | null;
  quantity: number;
  assetFamilyId?: string | null;
};

export type InventoryItemPickerSerialItem = SerialAssetCardItem & InventoryDocumentOrigin & {
  isImplement?: boolean;
  quantity: number;
  skuId?: string | null;
  ownerWarehouseId: string | null;
  assetFamily?: { id?: string; code: string; name: string } | null;
};

export type InventoryItemPickerModalProps = {
  opened: boolean;
  catalogOnly?: boolean;
  allowDamaged?: boolean;
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
  extraTab?: {
    label: string;
    content: ReactNode;
    selectedCount: number;
    canConfirm?: boolean;
    exclusive?: boolean;
    onConfirm: () => number;
  };
};

function buildBulkItemKey(item: InventoryItemPickerBulkItem) {
  return `${item.skuId}::${item.ownerWarehouseId ?? 'none'}${item.sourceWarehouseId ? `::${item.sourceWarehouseId}` : ''}${item.sourceDocumentItemId ? `::origin:${item.sourceDocumentItemId}` : ''}`;
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
  catalogOnly = false,
  allowDamaged = false,
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
  extraTab,
}: InventoryItemPickerModalProps) {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>('inventory');

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
          name: `${item.skuName ?? skuMeta?.name ?? 'SKU'}${item.returnSourceLabel ? ` · ${item.returnSourceLabel}` : ''}`,
          family: skuMeta?.category ?? 'Sin familia',
          ownerWarehouseName: item.ownerWarehouseName ?? 'Sin bodega dueña',
          disabled: selectedBulkKeys.has(buildBulkItemKey(item)) || !isPickerQuantityAvailable('bulk', item.quantity),
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
          disabled: selectedSerialIds.has(item.assetId) || !isPickerSerialAvailable(item, allowDamaged),
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
  }, [bulkItems, serialItems, selectedBulkKeys, selectedSerialIds, skuMetaById, allowDamaged]);

  useEffect(() => {
    setSelectedRowKeys(new Set());
    setSearchQuery('');
    setMobileSearchOpen(false);
  }, [opened, bulkItems, serialItems]);

  useEffect(() => {
    setActiveTab('inventory');
  }, [opened]);

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
    () => getSelectablePickerRows(filteredGroups.flatMap((group) => group.rows)),
    [filteredGroups],
  );
  const selectableRows = useMemo(
    () => getSelectablePickerRows(groupedRows.flatMap((group) => group.rows)),
    [groupedRows],
  );
  const selectedRows = selectableRows.filter((row) => selectedRowKeys.has(row.key));

  const toggleRow = (row: PickerRow) => {
    setSelectedRowKeys((current) => togglePickerRows(current, [row]));
  };

  const toggleAllVisible = () => {
    setSelectedRowKeys((current) => togglePickerRows(current, visibleSelectableRows));
  };

  const confirmSelection = () => {
    if (extraTab?.canConfirm === false) return;
    let addedCount = 0;
    (extraTab?.exclusive ? [] : selectedRows).forEach((row) => {
      const added = row.type === 'bulk' ? onAddBulk(row.item) : onAddSerial(row.item);
      if (added) addedCount += 1;
    });
    addedCount += extraTab?.onConfirm() ?? 0;
    if (addedCount > 0 && onItemAddedNotice) {
      onItemAddedNotice(
        `${addedCount} item${addedCount === 1 ? '' : 's'} agregado${addedCount === 1 ? '' : 's'} a la lista.`,
      );
    }
    setSelectedRowKeys(new Set());
    onClose();
  };

  const selectedCount = (extraTab?.exclusive ? 0 : selectedRows.length) + (extraTab?.selectedCount ?? 0);
  const hasItems = groupedRows.some((group) => group.rows.length > 0);
  const availableCount = selectableRows.length;
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
  const navigation = extraTab ? (
    <Tabs.List grow>
      <Tabs.Tab value="inventory">Equipos y materiales</Tabs.Tab>
      <Tabs.Tab value="extra">{extraTab.label}</Tabs.Tab>
    </Tabs.List>
  ) : null;
  const withTabs = (content: ReactNode) => extraTab ? (
    <Tabs value={activeTab} onChange={setActiveTab}
      style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, width: '100%', height: isMobile ? '100%' : undefined }}>
      {content}
    </Tabs>
  ) : content;
  const inventoryPanel = (content: ReactNode) => extraTab ? (
    <Tabs.Panel value="inventory" className="inventory-picker-content">{content}</Tabs.Panel>
  ) : content;

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
        {withTabs(<div className="inventory-picker-mobile-shell" tabIndex={-1} data-autofocus>
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
              style={activeTab === 'extra' ? { visibility: 'hidden' } : undefined}
              onClick={() => {
                setMobileSearchOpen((current) => !current);
                if (mobileSearchOpen) setSearchQuery('');
              }}
              aria-label={mobileSearchOpen ? 'Cerrar búsqueda' : 'Buscar items'}
            >
              <IconSearch size={30} stroke={2.4} aria-hidden="true" />
            </ActionIcon>
          </header>

          {navigation}

          {mobileSearchOpen && activeTab === 'inventory' ? (
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
            {extraTab && activeTab === 'extra' ? (
              <Tabs.Panel value="extra" p="md">{extraTab.content}</Tabs.Panel>
            ) : inventoryPanel(hasItems && filteredGroups.length ? (
              <div>
                {filteredGroups.map((group) => (
                  <section key={group.family} className="inventory-picker-mobile-family">
                    <div className="inventory-picker-mobile-family-heading">
                      <Text component="h3">{group.family}</Text>
                      <Text component="span">{group.rows.length}</Text>
                    </div>

                    {group.rows.map((row) => {
                      const isSelected = !row.disabled && selectedRowKeys.has(row.key);
                      const quantity = row.item.quantity;
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
                          aria-label={catalogOnly ? row.name : `${row.name}, ${row.type === 'bulk' ? 'Masivo' : 'Equipo'}, ${quantity} ${
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
                              {catalogOnly ? 'Referencia' : row.type === 'serial' && row.item.isDamaged ? 'Equipo averiado' : `${row.type === 'bulk' ? 'Masivo' : 'Equipo'} · ${quantity} ${quantity === 1 ? 'disponible' : 'disponibles'}`}
                            </Text>
                            {row.type === 'serial' && row.item.isDamaged && row.item.damageNote ? (
                              <Text component="span" size="xs" c="orange.8">
                                Último daño: {row.item.damageNote}
                              </Text>
                            ) : null}
                            {row.disabled ? (
                              <Text component="span" className="inventory-picker-mobile-row-status">
                                {row.type === 'serial' && row.item.isDamaged && !allowDamaged
                                  ? 'Averiado · No disponible'
                                  : !isPickerQuantityAvailable(row.type, row.item.quantity)
                                  ? 'No disponible'
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
            ))}
          </ScrollArea>

          <footer className="inventory-picker-mobile-footer">
            <Text className="inventory-picker-mobile-selection-count" aria-live="polite">
              {selectedCount} {selectedCount === 1 ? 'item seleccionado' : 'items seleccionados'}
            </Text>
            <Button
              onClick={confirmSelection}
              disabled={selectedCount === 0 || extraTab?.canConfirm === false}
              className="inventory-picker-mobile-confirm"
            >
              Agregar
            </Button>
          </footer>
        </div>)}
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
      {withTabs(<Stack gap={isMobile ? 'xs' : 'md'} className="inventory-picker">
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

        {navigation}

        {itemsAddedNotice ? (
          <Alert color="green" variant="light">
            {itemsAddedNotice}
          </Alert>
        ) : null}

        {extraTab && activeTab === 'extra' ? (
          <ScrollArea className="inventory-picker-scroll" type="auto" offsetScrollbars>
            <Tabs.Panel value="extra" pr="xs">{extraTab.content}</Tabs.Panel>
          </ScrollArea>
        ) : inventoryPanel(emptyStateText ? (
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
                          {availableCount} {catalogOnly ? `referencia${availableCount === 1 ? '' : 's'}` : `disponible${availableCount === 1 ? '' : 's'}`}
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
                        <strong>{availableCount}</strong> {catalogOnly ? `referencia${availableCount === 1 ? '' : 's'}` : `disponible${availableCount === 1 ? '' : 's'}`}
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
                                      {!catalogOnly ? <Table.Th style={{ width: 116 }}>Tipo</Table.Th> : null}
                                      {!catalogOnly ? <Table.Th style={{ width: 100, textAlign: 'center' }}>
                                        Disponible
                                      </Table.Th> : null}
                                      {showOwnerWarehouse ? (
                                        <Table.Th style={{ width: 220 }}>Bodega dueña</Table.Th>
                                      ) : null}
                                    </>
                                  ) : null}
                                </Table.Tr>
                              </Table.Thead>
                              <Table.Tbody>
                                {group.rows.map((row) => {
                                  const isSelected = !row.disabled && selectedRowKeys.has(row.key);
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
                                          {catalogOnly ? 'Referencia' : `${row.type === 'bulk' ? 'Masivo' : 'Equipo'} · ${row.item.quantity} disponible${row.item.quantity === 1 ? '' : 's'}`}
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
                                        {row.type === 'serial' ? (
                                          <Text size="xs" c={row.item.isDamaged ? 'orange.8' : 'teal.8'}>
                                            {row.item.isDamaged ? `Averiado${row.item.damageNote ? `: ${row.item.damageNote}` : ''}` : 'Operativo'}
                                          </Text>
                                        ) : null}
                                        {row.disabled ? (
                                          <Text size="xs" c="dimmed">
                                            {row.type === 'serial' && row.item.isDamaged && !allowDamaged
                                              ? 'Averiado · No disponible'
                                              : !isPickerQuantityAvailable(row.type, row.item.quantity)
                                              ? 'No disponible'
                                              : 'Ya agregado'}
                                          </Text>
                                        ) : null}
                                      </Table.Td>
                                      {showTableColumns ? (
                                        <>
                                          {!catalogOnly ? <Table.Td>
                                            <Badge
                                              variant="light"
                                              color={row.type === 'bulk' ? 'blue' : 'violet'}
                                              radius="sm"
                                            >
                                              {row.type === 'bulk' ? 'Masivo' : 'Equipo'}
                                            </Badge>
                                          </Table.Td> : null}
                                          {!catalogOnly ? <Table.Td style={{ textAlign: 'center' }}>
                                            <Text size="sm" fw={700}>
                                              {row.item.quantity}
                                            </Text>
                                          </Table.Td> : null}
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
        ))}

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
              disabled={selectedCount === 0 || extraTab?.canConfirm === false}
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
      </Stack>)}
    </Modal>
  );
}
