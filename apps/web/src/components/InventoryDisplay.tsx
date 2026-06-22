'use client';

import { useMemo } from 'react';
import { Badge, Button, Card, Group, Paper, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconAlertTriangle } from '@tabler/icons-react';
import SerialAssetCard from '@/components/SerialAssetCard';
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
};

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
  internalNumber?: string | null;
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
  viewFilter = 'ALL',
  bulkOwnerStackMode = false,
  isWorksiteView = false,
  serialSectionTitle = 'UNIQUE EQUIPMENT',
}: {
  bulk: BulkItem[];
  serial: SerialItem[];
  onAdjust?: () => void;
  viewFilter?: 'ALL' | 'BULK' | 'SERIAL';
  bulkOwnerStackMode?: boolean;
  isWorksiteView?: boolean;
  serialSectionTitle?: string;
}) {
  const isMobile = useMediaQuery('(max-width: 768px)');

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
        return `Hour (min ${minimum}h)`;
      }
      return 'Hour';
    }
    if (normalized === 'DAY') {
      return 'Day';
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

  const groupedBulk = useMemo(() => {
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
    const rows = bulkOwnerStackMode && groupedBulk ? groupedBulk : bulk;
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        totalQuantity: number;
        itemCount: number;
        items: typeof rows;
      }
    >();

    rows.forEach((item) => {
      const familyName = item.category || 'Sin familia';
      const familyId = item.assetFamilyId || familyName;
      const totalQuantity =
        'owners' in item
          ? item.owners.reduce((sum, owner) => sum + owner.quantity, 0)
          : item.quantity;
      const current = map.get(familyId);

      if (!current) {
        map.set(familyId, {
          id: familyId,
          name: familyName,
          totalQuantity,
          itemCount: 1,
          items: [item] as typeof rows,
        });
        return;
      }

      current.totalQuantity += totalQuantity;
      current.itemCount += 1;
      current.items = [...current.items, item] as typeof rows;
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [bulk, bulkOwnerStackMode, groupedBulk]);

  return (
    <Stack gap="lg">
      {showBulkSection && (
        <section>
          <Group justify="space-between" align="center" mb="sm">
            <Title order={3}>STOCK MASIVO</Title>
            {onAdjust && (
              <Button variant="outline" size="xs" onClick={onAdjust}>
                Adjust: Admin
              </Button>
            )}
          </Group>

          <Stack gap="md">
            {bulkFamilyGroups.map((group) => (
              <Paper key={group.id} withBorder radius="md" p={{ base: 'sm', md: 'md' }}>
                <Stack gap="sm">
                  <Group justify="space-between" align="center" wrap="wrap">
                    <div>
                      <Text fw={800}>{group.name}</Text>
                      <Text size="sm" c="dimmed">
                        {group.itemCount} reference{group.itemCount === 1 ? '' : 's'}
                      </Text>
                    </div>
                    {quantityBadge(group.totalQuantity, 'orange')}
                  </Group>

                  {!isMobile ? (
                    <Table striped highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Name</Table.Th>
                          <Table.Th>Billing</Table.Th>
                          <Table.Th>Bodega dueña</Table.Th>
                          <Table.Th>Cantidad</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {group.items.map((item) =>
                          'owners' in item ? (
                            <Table.Tr key={item.skuId}>
                              <Table.Td>{item.name}</Table.Td>
                              <Table.Td>
                                {formatCharge(item.chargeType, item.minimumChargeHours)}
                              </Table.Td>
                              <Table.Td>
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
                                    <Badge color="green" variant="filled">
                                      +{item.hiddenOwnersCount} more
                                    </Badge>
                                  ) : null}
                                </Group>
                              </Table.Td>
                              <Table.Td>
                                <Group gap={6} wrap="wrap">
                                  {item.visibleOwners.map((owner) => (
                                    <Badge
                                      key={`${item.skuId}-qty-${owner.ownerWarehouseId}`}
                                      color={
                                        isNegativeQuantity(owner.quantity)
                                          ? 'red'
                                          : ownerColorById(owner.ownerWarehouseId)
                                      }
                                      variant="filled"
                                      leftSection={
                                        isNegativeQuantity(owner.quantity) ? (
                                          <IconAlertTriangle size={12} stroke={2.5} />
                                        ) : undefined
                                      }
                                    >
                                      {owner.quantity}
                                    </Badge>
                                  ))}
                                  {item.hiddenOwnersCount > 0 ? (
                                    <Badge color="green" variant="light">
                                      +{item.hiddenOwnersCount} more
                                    </Badge>
                                  ) : null}
                                </Group>
                              </Table.Td>
                            </Table.Tr>
                          ) : (
                            <Table.Tr key={`${item.skuId}-${item.ownerWarehouseId ?? 'none'}`}>
                              <Table.Td>{item.name ?? item.skuName ?? '-'}</Table.Td>
                              <Table.Td>
                                {formatCharge(item.chargeType, item.minimumChargeHours)}
                              </Table.Td>
                              <Table.Td>{item.ownerWarehouseName ?? '-'}</Table.Td>
                              <Table.Td>
                                {isNegativeQuantity(item.quantity) ? (
                                  <Group gap={6} wrap="nowrap">
                                    <IconAlertTriangle size={16} stroke={2.5} color="var(--mantine-color-red-7)" />
                                    <Text c="red" fw={700}>
                                      {item.quantity}
                                    </Text>
                                  </Group>
                                ) : (
                                  item.quantity
                                )}
                              </Table.Td>
                            </Table.Tr>
                          ),
                        )}
                      </Table.Tbody>
                    </Table>
                  ) : (
                    <Stack gap="sm">
                      {group.items.map((item) =>
                        'owners' in item ? (
                          <Card key={item.skuId} withBorder padding="sm" radius="md">
                            <Text fw={700}>{item.name}</Text>
                            <Text size="xs" c="dimmed">
                              Billing: {formatCharge(item.chargeType, item.minimumChargeHours)}
                            </Text>
                            <Group mt="xs" gap={6} wrap="wrap">
                              {item.visibleOwners.map((owner) => (
                                <Badge
                                  key={`${item.skuId}-owner-mobile-${owner.ownerWarehouseId}`}
                                  color={ownerColorById(owner.ownerWarehouseId)}
                                  variant="light"
                                >
                                  {owner.ownerWarehouseName}
                                </Badge>
                              ))}
                              {item.hiddenOwnersCount > 0 ? (
                                <Badge color="green" variant="filled">
                                  +{item.hiddenOwnersCount} more
                                </Badge>
                              ) : null}
                            </Group>
                            <Group mt={6} gap={6} wrap="wrap">
                              {item.visibleOwners.map((owner) => (
                                <span key={`${item.skuId}-qty-mobile-${owner.ownerWarehouseId}`}>
                                  {quantityBadge(owner.quantity, ownerColorById(owner.ownerWarehouseId))}
                                </span>
                              ))}
                              {item.hiddenOwnersCount > 0 ? (
                                <Badge color="green" variant="light">
                                  +{item.hiddenOwnersCount} more
                                </Badge>
                              ) : null}
                            </Group>
                          </Card>
                        ) : (
                          <Card
                            key={`${item.skuId}-${item.ownerWarehouseId ?? 'none'}`}
                            withBorder
                            padding="sm"
                            radius="md"
                          >
                            <Text fw={700}>{item.name ?? item.skuName ?? 'SKU'}</Text>
                            <Text size="xs" c="dimmed">
                              Billing: {formatCharge(item.chargeType, item.minimumChargeHours)}
                            </Text>
                            <Text mt="xs">
                              <strong>Cantidad:</strong>{' '}
                              {isNegativeQuantity(item.quantity) ? (
                                <Text span c="red" fw={700}>
                                  <IconAlertTriangle
                                    size={14}
                                    stroke={2.5}
                                    style={{ verticalAlign: 'text-bottom' }}
                                  />{' '}
                                  {item.quantity}
                                </Text>
                              ) : (
                                item.quantity
                              )}
                            </Text>
                            <Text size="sm">
                              <strong>Bodega dueña:</strong> {item.ownerWarehouseName ?? '-'}
                            </Text>
                          </Card>
                        ),
                      )}
                    </Stack>
                  )}
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
          <Card withBorder>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
              {serial.map((item) => (
                <SerialAssetCard
                  key={item.assetId}
                  item={item}
                  href={`/inventory/serialized-assets/${item.assetId}`}
                  isWorksiteView={isWorksiteView}
                  display={{ showOwnerChip: isWorksiteView }}
                />
              ))}
            </SimpleGrid>
          </Card>
        </section>
      )}
    </Stack>
  );
}
