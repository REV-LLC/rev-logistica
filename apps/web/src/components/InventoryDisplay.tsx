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
} from '@tabler/icons-react';
import SerialAssetCard from '@/components/SerialAssetCard';
import { ownerColorById } from '@/lib/owner-color';
import BulkInventoryDetails from '@/components/BulkInventoryDetails';
import BulkInventoryCard from '@/components/BulkInventoryCard';

export type BulkItem = {
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
  location?: {
    type: 'WAREHOUSE' | 'WORKSITE' | 'TRANSIT' | 'UNKNOWN';
    name: string | null;
  } | null;
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
  bulkOwnerStackMode = true,
  warehouseId,
  customerWorksiteId,
  isWorksiteView = false,
  serialSectionTitle = 'EQUIPOS UNICOS',
  compactSerialCards = false,
  showSerialOwnerChip = false,
  serialAssetScope,
  showWorksiteQuantities = false,
}: {
  warehouseId?: string;
  customerWorksiteId?: string;
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
  showSerialOwnerChip?: boolean;
  serialAssetScope?: 'own' | 'allied';
  showWorksiteQuantities?: boolean;
}) {
  const rowsBySku = useMemo(() => {
    const result = new Map<string, BulkItem[]>();
    for (const item of bulk) result.set(item.skuId, [...(result.get(item.skuId) ?? []), item]);
    return result;
  }, [bulk]);
  const [openedSkuId, setOpenedSkuId] = useState<string | null>(null);
  const [savedImages, setSavedImages] = useState<Record<string, string>>({});
  const imageBySku = useMemo(() => new Map(bulk.map(item => [item.skuId, item.imageUrl])), [bulk]);

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
  const serialLocationLabel = (item: SerialItem) => {
    if (item.location?.type === 'UNKNOWN' || item.status === 'UNKNOWN') {
      return 'Sin ubicación registrada';
    }
    if (item.location?.type === 'WORKSITE') {
      return `En obra${item.location.name ? ` · ${item.location.name}` : ''}`;
    }
    if (item.location?.type === 'WAREHOUSE') {
      return `En bodega${item.location.name ? ` · ${item.location.name}` : ''}`;
    }
    return 'En tránsito';
  };
  const bulkRowKey = (item: BulkItem) => `${item.skuId}::${item.ownerWarehouseId ?? 'none'}`;
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
      const worksiteQuantity = 'owners' in item ? (rowsBySku.get(item.skuId) ?? []).reduce((sum, row) => sum + (row.worksiteQuantity ?? 0), 0) : item.worksiteQuantity ?? 0;
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
  }, [bulk, bulkOwnerStackMode, groupedBulk, rowsBySku]);

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
      {openedSkuId && rowsBySku.has(openedSkuId) ? <BulkInventoryDetails key={openedSkuId} rows={(rowsBySku.get(openedSkuId) ?? [])}
        warehouseId={warehouseId} customerWorksiteId={customerWorksiteId} isWorksiteView={isWorksiteView}
        imageUrl={savedImages[openedSkuId] ?? imageBySku.get(openedSkuId) ?? null}
        onClose={() => setOpenedSkuId(null)} onImageSaved={(skuId, url) => setSavedImages(current => ({ ...current, [skuId]: url }))} /> : null}
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

                  <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="md">
                    {group.items.map((item) => {
                      const grouped = 'owners' in item;
                      const ownersWithStock = (grouped ? item.owners : [{
                        ownerWarehouseId: item.ownerWarehouseId ?? 'unknown',
                        ownerWarehouseName: item.ownerWarehouseName ?? 'Sin identificar',
                        quantity: item.quantity,
                      }]).filter(owner => owner.quantity !== 0);
                      const quantity = grouped ? item.owners.reduce((sum, owner) => sum + owner.quantity, 0) : item.quantity;
                      return (
                        <BulkInventoryCard key={grouped ? item.skuId : bulkRowKey(item)}
                          name={getBulkDisplayName(item)}
                          imageUrl={savedImages[item.skuId] ?? imageBySku.get(item.skuId) ?? null}
                          quantity={quantity} quantityLabel={isWorksiteView ? 'En esta obra' : 'En bodega'}
                          onOpen={() => setOpenedSkuId(item.skuId)}>
                          {ownersWithStock.length ? (
                            <Group gap={6} wrap="wrap">
                              {ownersWithStock.map(owner => (
                                <Badge key={owner.ownerWarehouseId} variant="light"
                                  color={owner.quantity < 0 ? 'red' : ownerColorById(owner.ownerWarehouseId)}
                                  title={`${owner.quantity.toLocaleString('es-CO')} ${owner.ownerWarehouseName}`}>
                                  {owner.quantity.toLocaleString('es-CO')} {owner.ownerWarehouseName}
                                </Badge>
                              ))}
                            </Group>
                          ) : <Text size="sm" c="dimmed">{isWorksiteView ? 'Sin existencias en esta obra' : 'Sin existencias en bodega'}</Text>}
                          {showWorksiteQuantities ? <Group justify="space-between"><Text size="sm" c="dimmed">En obra</Text><Text fw={600}>{(rowsBySku.get(item.skuId) ?? []).reduce((sum, row) => sum + (row.worksiteQuantity ?? 0), 0)}</Text></Group> : null}
                        </BulkInventoryCard>
                      );
                    })}
                  </SimpleGrid>
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
              <Stack
                key={group.id}
                gap="sm"
                style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 420px' }}
              >
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
                      href={
                        `/inventory/serialized-assets/${item.assetId}`
                        + (serialAssetScope ? `?scope=${serialAssetScope}` : '')
                      }
                      compact={compactSerialCards}
                      isWorksiteView={isWorksiteView}
                      statusBadge={item.status === 'UNKNOWN' || item.location?.type === 'UNKNOWN'
                        ? { label: 'SIN UBICACIÓN', color: 'gray' }
                        : undefined}
                      display={{
                        showOwnerChip: isWorksiteView || showSerialOwnerChip,
                        showCharge: false,
                      }}
                      additionalDetails={[{ label: 'Ubicación', value: serialLocationLabel(item) }]}
                      deleteLoading={deletingSerialAssetId === item.assetId}
                      onDelete={
                        onDeleteSerialAsset ? () => onDeleteSerialAsset(item) : undefined
                      }
                    />
                  ))}
                </SimpleGrid>
              </Stack>
            ))}
          </Stack>
        </section>
      )}
    </Stack>
  );
}
