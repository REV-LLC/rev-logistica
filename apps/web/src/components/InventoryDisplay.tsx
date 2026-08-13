'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
  IconMapPin,
} from '@tabler/icons-react';
import SerialAssetCard from '@/components/SerialAssetCard';
import EntityDataTable from '@/components/tables/EntityDataTable';
import type { DataTableColumn } from '@/components/tables/table.types';
import { ownerColorById } from '@/lib/owner-color';

type BulkItem = {
  skuId: string;
  ownerWarehouseId?: string | null;
  ownerWarehouseName?: string | null;
  id?: string | null;
  skuName: string | null;
  name?: string | null;
  category?: string | null;
  imageUrl: string | null;
  imageFileObjectId: string | null;
  assetFamilyId?: string | null;
  unitWeight?: number | string | null;
  chargeType?: 'DAY' | 'HOUR' | string | null;
  minimumChargeHours?: number | string | null;
  active?: boolean | null;
  createdAt?: string | Date | null;
  quantity: number;
  worksiteQuantity?: number;
  worksiteLocations?: Array<{
    customerWorksiteId: string;
    worksiteId: string | null;
    worksiteName: string;
    customerId: string | null;
    customerName: string | null;
    quantity: number;
  }>;
};

type GroupedBulkItem = {
  skuId: string;
  assetFamilyId: string | null;
  name: string;
  category: string;
  chargeType: string | null;
  minimumChargeHours: number | string | null;
  owners: Array<{
    ownerWarehouseId: string;
    ownerWarehouseName: string;
    quantity: number;
  }>;
  visibleOwners: Array<{
    ownerWarehouseId: string;
    ownerWarehouseName: string;
    quantity: number;
  }>;
  hiddenOwnersCount: number;
};

type BulkDisplayRow = BulkItem | GroupedBulkItem;

function getBulkDisplayName(item: BulkDisplayRow) {
  return item.name ?? ('skuName' in item ? item.skuName : null) ?? '-';
}

type SerialItem = {
  assetId: string;
  ownerWarehouseId?: string | null;
  serialOrEngine: string | null;
  description: string | null;
  skuName?: string | null;
  ownerWarehouseName?: string | null;
  imageUrl?: string | null;
  brand?: string | null;
  model?: string | null;
  chargeType?: 'DAY' | 'HOUR' | string | null;
  minimumChargeHours?: number | string | null;
  status?: 'IN' | 'OUT' | 'TRANSIT' | string | null;
  internalNumber?: string | number | null;
  assetFamily?: {
    id?: string | null;
    code?: string | null;
    name?: string | null;
  } | null;
  imageFileObjectId: string | null;
  quantity: number;
};

export default function InventoryDisplay({
  bulk,
  serial,
  onAdjust,
  onAddStock,
  onDeleteSerialAsset,
  deletingSerialAssetId,
  viewFilter = 'ALL',
  bulkOwnerStackMode = false,
  isWorksiteView = false,
  serialSectionTitle = 'EQUIPOS UNICOS',
  compactSerialCards = false,
  showWorksiteQuantities = false,
}: {
  bulk: BulkItem[];
  serial: SerialItem[];
  onAdjust?: () => void;
  onAddStock?: () => void;
  onDeleteSerialAsset?: (item: SerialItem) => void;
  deletingSerialAssetId?: string | null;
  viewFilter?: 'ALL' | 'BULK' | 'SERIAL';
  bulkOwnerStackMode?: boolean;
  isWorksiteView?: boolean;
  serialSectionTitle?: string;
  compactSerialCards?: boolean;
  showWorksiteQuantities?: boolean;
}) {
  const [expandedBulkRows, setExpandedBulkRows] = useState<Set<string>>(() => new Set());

  const formatCharge = (chargeType?: string | null, minimumChargeHours?: number | string | null) => {
    const normalized = chargeType?.toUpperCase();
    if (normalized === 'HOUR') {
      const minimum =
        typeof minimumChargeHours === 'number'
          ? minimumChargeHours
          : typeof minimumChargeHours === 'string'
            ? Number(minimumChargeHours)
            : null;
      if (minimum != null && Number.isFinite(minimum) && minimum > 0) {
        return `Hora (min ${minimum}h)`;
      }
      return 'Hora';
    }
    if (normalized === 'DAY') {
      return 'Dia';
    }
    return '-';
  };

  const showBulkSection = (viewFilter === 'ALL' || viewFilter === 'BULK') && bulk.length > 0;
  const showSerialSection = (viewFilter === 'ALL' || viewFilter === 'SERIAL') && serial.length > 0;
  const isNegativeQuantity = (quantity: number) => quantity < 0;
  const quantityBadge = (quantity: number, color = 'gray') => (
    <Badge
      color={isNegativeQuantity(quantity) ? 'red' : color}
      variant="filled"
      leftSection={
        isNegativeQuantity(quantity) ? <IconAlertTriangle size={12} stroke={2.5} /> : undefined
      }
    >
      {quantity}
    </Badge>
  );
  const compareSerialItems = (a: SerialItem, b: SerialItem) => {
    const aNumber = a.internalNumber == null ? null : Number(a.internalNumber);
    const bNumber = b.internalNumber == null ? null : Number(b.internalNumber);
    const hasANumber = aNumber != null && Number.isFinite(aNumber);
    const hasBNumber = bNumber != null && Number.isFinite(bNumber);

    if (hasANumber && hasBNumber && aNumber !== bNumber) {
      return aNumber - bNumber;
    }
    if (hasANumber && !hasBNumber) return -1;
    if (!hasANumber && hasBNumber) return 1;
    return (a.serialOrEngine ?? '').localeCompare(b.serialOrEngine ?? '', 'es', {
      numeric: true,
      sensitivity: 'base',
    });
  };
  const bulkRowKey = (item: BulkItem) => `${item.skuId}::${item.ownerWarehouseId ?? 'none'}`;
  const toggleBulkRow = (item: BulkItem) => {
    const key = bulkRowKey(item);
    setExpandedBulkRows((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const worksiteBreakdown = (item: BulkItem) => (
    <Stack gap={6}>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        Distribución en obra
      </Text>
      {(item.worksiteLocations ?? []).map((location) => (
        <Group
          key={location.customerWorksiteId}
          justify="space-between"
          align="center"
          wrap="nowrap"
          gap="md"
        >
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <IconMapPin
              size={16}
              color="var(--mantine-color-blue-6)"
              style={{ flexShrink: 0 }}
            />
            <div style={{ minWidth: 0 }}>
              <Text size="sm" fw={700} truncate>
                {location.worksiteName}
              </Text>
              {location.customerName ? (
                <Text size="xs" c="dimmed" truncate>
                  {location.customerName}
                </Text>
              ) : null}
            </div>
          </Group>
          <Badge color="blue" variant="light" style={{ flexShrink: 0 }}>
            {location.quantity}
          </Badge>
        </Group>
      ))}
    </Stack>
  );

  const groupedBulk = useMemo<GroupedBulkItem[] | null>(() => {
    if (!bulkOwnerStackMode) return null;

        const map = new Map<
          string,
          {
            skuId: string;
            assetFamilyId: string | null;
            name: string;
            category: string;
            chargeType: string | null;
            minimumChargeHours: number | string | null;
            owners: Array<{
              ownerWarehouseId: string;
              ownerWarehouseName: string;
              quantity: number;
            }>;
      }
    >();

    bulk.forEach((item) => {
      const key = item.skuId;
      const ownerWarehouseId = item.ownerWarehouseId ?? `unknown-${item.skuId}`;
      const ownerWarehouseName = item.ownerWarehouseName ?? '-';
      const name = item.name ?? item.skuName ?? '-';
      const category = item.category ?? '-';
      const assetFamilyId = item.assetFamilyId ?? null;
      const chargeType = item.chargeType ?? null;
      const minimumChargeHours = item.minimumChargeHours ?? null;

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          skuId: item.skuId,
          assetFamilyId,
          name,
          category,
          chargeType,
          minimumChargeHours,
          owners: [{ ownerWarehouseId, ownerWarehouseName, quantity: item.quantity }],
        });
        return;
      }

      const ownerIndex = existing.owners.findIndex(
        (owner) => owner.ownerWarehouseId === ownerWarehouseId,
      );
      if (ownerIndex >= 0) {
        existing.owners[ownerIndex].quantity += item.quantity;
      } else {
        existing.owners.push({ ownerWarehouseId, ownerWarehouseName, quantity: item.quantity });
      }
    });

    return Array.from(map.values()).map((row) => {
      const owners = [...row.owners].sort((a, b) => {
        if (a.quantity < 0 && b.quantity >= 0) return -1;
        if (b.quantity < 0 && a.quantity >= 0) return 1;
        return b.quantity - a.quantity;
      });
      return {
        ...row,
        owners,
        visibleOwners: owners.slice(0, 2),
        hiddenOwnersCount: Math.max(0, owners.length - 2),
      };
    });
  }, [bulk, bulkOwnerStackMode]);

  const bulkFamilyGroups = useMemo(() => {
    const rows: BulkDisplayRow[] = bulkOwnerStackMode && groupedBulk ? groupedBulk : bulk;
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        totalQuantity: number;
        totalWorksiteQuantity: number;
        itemCount: number;
        items: BulkDisplayRow[];
      }
    >();

    rows.forEach((item) => {
      const familyName = item.category || 'Sin familia';
      const familyId = item.assetFamilyId || familyName;
      const totalQuantity =
        'owners' in item
          ? item.owners.reduce((sum, owner) => sum + owner.quantity, 0)
          : item.quantity;
      const worksiteQuantity = 'owners' in item ? 0 : item.worksiteQuantity ?? 0;
      const current = map.get(familyId);

      if (!current) {
        map.set(familyId, {
          id: familyId,
          name: familyName,
          totalQuantity,
          totalWorksiteQuantity: worksiteQuantity,
          itemCount: 1,
          items: [item],
        });
        return;
      }

      current.totalQuantity += totalQuantity;
      current.totalWorksiteQuantity += worksiteQuantity;
      current.itemCount += 1;
      current.items = [...current.items, item];
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [bulk, bulkOwnerStackMode, groupedBulk]);

  const bulkColumns: DataTableColumn<BulkDisplayRow>[] = [
    {
      id: 'name',
      header: 'Nombre',
      ariaLabel: 'nombre',
      width: showWorksiteQuantities ? '31%' : '38%',
      sortValue: getBulkDisplayName,
      mobile: { priority: 'primary' },
      cell: (item) => <Text fw={600}>{getBulkDisplayName(item)}</Text>,
    },
    {
      id: 'charge',
      header: 'Cobro',
      width: showWorksiteQuantities ? '14%' : '18%',
      mobile: { label: 'Cobro', priority: 'detail' },
      cell: (item) => formatCharge(item.chargeType, item.minimumChargeHours),
    },
    {
      id: 'owner',
      header: 'Bodega dueña',
      width: showWorksiteQuantities ? '22%' : '27%',
      mobile: { label: 'Bodega dueña', priority: 'detail' },
      cell: (item) => 'owners' in item ? (
        <Group gap={6} wrap="wrap">
          {item.visibleOwners.map((owner) => (
            <Badge
              key={`${item.skuId}-owner-${owner.ownerWarehouseId}`}
              color={ownerColorById(owner.ownerWarehouseId)}
              variant="light"
            >
              {owner.ownerWarehouseName}
            </Badge>
          ))}
          {item.hiddenOwnersCount > 0 ? (
            <Badge color="green" variant="filled">+{item.hiddenOwnersCount} más</Badge>
          ) : null}
        </Group>
      ) : <Text>{item.ownerWarehouseName ?? '-'}</Text>,
    },
    {
      id: 'quantity',
      header: 'Cantidad',
      ariaLabel: 'cantidad',
      width: showWorksiteQuantities ? '14%' : '17%',
      align: 'right',
      sortValue: (item) => 'owners' in item
        ? item.owners.reduce((sum, owner) => sum + owner.quantity, 0)
        : item.quantity,
      mobile: { label: 'Cantidad', priority: 'detail' },
      cell: (item) => 'owners' in item ? (
        <Group gap={6} justify="flex-end" wrap="wrap">
          {item.visibleOwners.map((owner) => (
            <span key={`${item.skuId}-qty-${owner.ownerWarehouseId}`}>
              {quantityBadge(owner.quantity, ownerColorById(owner.ownerWarehouseId))}
            </span>
          ))}
          {item.hiddenOwnersCount > 0 ? (
            <Badge color="green" variant="light">+{item.hiddenOwnersCount} más</Badge>
          ) : null}
        </Group>
      ) : isNegativeQuantity(item.quantity) ? (
        <Group gap={6} justify="flex-end" wrap="nowrap">
          <IconAlertTriangle size={16} stroke={2.5} color="var(--mantine-color-red-7)" />
          <Text c="red" fw={700}>{item.quantity}</Text>
        </Group>
      ) : item.quantity,
    },
    ...(showWorksiteQuantities ? [{
      id: 'worksiteQuantity',
      header: 'En obra',
      align: 'right' as const,
      width: '19%',
      mobile: { label: 'En obra', priority: 'detail' as const },
      cell: (item: BulkDisplayRow) => {
        if ('owners' in item) return '-';
        const locations = item.worksiteLocations ?? [];
        const expanded = expandedBulkRows.has(bulkRowKey(item));
        return (
          <Stack gap="xs" align="flex-end">
            {locations.length ? (
              <Button
                size="compact-sm"
                variant="subtle"
                color="blue"
                px={6}
                rightSection={expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                aria-label={`Ver ubicaciones de ${item.name ?? item.skuName ?? 'SKU'}`}
                aria-expanded={expanded}
                onClick={() => toggleBulkRow(item)}
              >
                {item.worksiteQuantity ?? 0}
              </Button>
            ) : <Text size="sm">{item.worksiteQuantity ?? 0}</Text>}
            {expanded && locations.length ? (
              <Paper withBorder radius="md" p="sm" miw={260}>{worksiteBreakdown(item)}</Paper>
            ) : null}
          </Stack>
        );
      },
    }] : []),
  ];

  const serialFamilyGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        items: SerialItem[];
      }
    >();

    serial.forEach((item) => {
      const familyName = item.assetFamily?.name?.trim() || 'Sin familia';
      const familyId = item.assetFamily?.id || familyName;
      const current = map.get(familyId);

      if (!current) {
        map.set(familyId, {
          id: familyId,
          name: familyName,
          items: [item],
        });
        return;
      }

      current.items = [...current.items, item];
    });

    return Array.from(map.values())
      .map((group) => ({
        ...group,
        items: [...group.items].sort(compareSerialItems),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [serial]);

  return (
    <Stack gap="lg">
      {showBulkSection && (
        <section>
          <Group justify="space-between" align="center" mb="sm">
            <Title order={3}>STOCK MASIVO</Title>
            <Group gap="xs">
              {onAddStock ? (
                <Button color="green" size="xs" onClick={onAddStock}>
                  Agregar stock
                </Button>
              ) : null}
              {onAdjust && (
                <Button variant="outline" size="xs" onClick={onAdjust}>
                  Ajuste: Admin
                </Button>
              )}
            </Group>
          </Group>

          <Stack gap="md">
            {bulkFamilyGroups.map((group) => (
              <Paper key={group.id} withBorder radius="md" p={{ base: 'sm', md: 'md' }}>
                <Stack gap="sm">
                  <Group justify="space-between" align="center" wrap="wrap">
                    <div>
                      <Text fw={800}>{group.name}</Text>
                      <Text size="sm" c="dimmed">
                        {group.itemCount} referencia{group.itemCount === 1 ? '' : 's'}
                      </Text>
                    </div>
                    <Group gap="xs">
                      {quantityBadge(group.totalQuantity, 'orange')}
                      {showWorksiteQuantities && group.totalWorksiteQuantity > 0 ? (
                        <Badge color="blue" variant="light">
                          En obra {group.totalWorksiteQuantity}
                        </Badge>
                      ) : null}
                    </Group>
                  </Group>

                  <EntityDataTable
                    rows={group.items}
                    columns={bulkColumns}
                    getRowId={(item) => 'owners' in item ? item.skuId : bulkRowKey(item)}
                    tableMinWidth={showWorksiteQuantities ? 820 : 720}
                    emptyState={{
                      title: 'No hay stock en esta familia',
                    }}
                  />
                </Stack>
              </Paper>
            ))}
          </Stack>
        </section>
      )}

      {showSerialSection && (
        <section>
          <Title order={3} mb="sm">
            {serialSectionTitle}
          </Title>
          <Stack gap="md">
            {serialFamilyGroups.map((group) => (
              <Paper
                key={group.id}
                withBorder
                radius="md"
                p={{ base: 'sm', sm: 'md' }}
                style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 420px' }}
              >
                <Stack gap="sm">
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Text fw={800}>{group.name}</Text>
                    <Badge color="green" variant="light" style={{ flexShrink: 0 }}>
                      {group.items.length} activo{group.items.length === 1 ? '' : 's'}
                    </Badge>
                  </Group>

                  <SimpleGrid
                    cols={{ base: 1, sm: 2, md: 3, xl: compactSerialCards ? 4 : 3 }}
                    spacing="sm"
                  >
                    {group.items.map((item) => (
                      <SerialAssetCard
                        key={item.assetId}
                        item={item}
                        href={`/inventory/serialized-assets/${item.assetId}`}
                        compact={compactSerialCards}
                        isWorksiteView={isWorksiteView}
                        display={{ showOwnerChip: isWorksiteView }}
                        deleteLoading={deletingSerialAssetId === item.assetId}
                        onDelete={
                          onDeleteSerialAsset ? () => onDeleteSerialAsset(item) : undefined
                        }
                      />
                    ))}
                  </SimpleGrid>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </section>
      )}
    </Stack>
  );
}
