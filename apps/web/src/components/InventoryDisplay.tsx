'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Card, Group, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import Link from 'next/link';

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
  serialOrEngine: string | null;
  description: string | null;
  skuName?: string | null;
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
  serialSectionTitle = 'EQUIPOS UNICOS',
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
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const ownerPalette = [
    'blue',
    'teal',
    'orange',
    'pink',
    'cyan',
    'grape',
    'indigo',
    'lime',
  ] as const;

  const getSerialDescription = (item: SerialItem) => {
    const manualDescription = item.description?.trim();
    if (manualDescription) return manualDescription;

    const parts = [item.skuName, item.brand, item.model]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));

    return parts.length > 0 ? parts.join(' ') : '-';
  };

  const getStatusColor = (status?: string | null) => {
    const normalized = status?.toUpperCase();
    if (normalized === 'IN') return 'green';
    if (normalized === 'OUT') return 'red';
    if (normalized === 'TRANSIT') return 'yellow';
    return 'gray';
  };

  const getStatusLabel = (status?: string | null) => {
    const normalized = (status ?? 'IN').toString().toUpperCase();
    if (isWorksiteView && normalized === 'OUT') return 'En obra';
    return normalized;
  };

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
        return `Hora (mín ${minimum}h)`;
      }
      return 'Hora';
    }
    if (normalized === 'DAY') {
      return 'Día';
    }
    return '-';
  };

  const showBulkSection = (viewFilter === 'ALL' || viewFilter === 'BULK') && bulk.length > 0;
  const showSerialSection = (viewFilter === 'ALL' || viewFilter === 'SERIAL') && serial.length > 0;

  const groupedBulk = useMemo(() => {
    if (!bulkOwnerStackMode) return null;

        const map = new Map<
          string,
          {
            skuId: string;
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
      const chargeType = item.chargeType ?? null;
      const minimumChargeHours = item.minimumChargeHours ?? null;

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          skuId: item.skuId,
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
      const owners = [...row.owners].sort((a, b) => b.quantity - a.quantity);
      return {
        ...row,
        owners,
        visibleOwners: owners.slice(0, 2),
        hiddenOwnersCount: Math.max(0, owners.length - 2),
      };
    });
  }, [bulk, bulkOwnerStackMode]);

  const getOwnerColor = (ownerWarehouseId: string) => {
    let hash = 0;
    for (let index = 0; index < ownerWarehouseId.length; index += 1) {
      hash = (hash * 31 + ownerWarehouseId.charCodeAt(index)) % 9973;
    }
    return ownerPalette[Math.abs(hash) % ownerPalette.length];
  };

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

          <Card withBorder>
            {!isMobile ? (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Nombre</Table.Th>
                    <Table.Th>Categoría</Table.Th>
                    <Table.Th>Cobro</Table.Th>
                    <Table.Th>Bodega dueña</Table.Th>
                    <Table.Th>Cantidad</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {bulkOwnerStackMode && groupedBulk
                    ? groupedBulk.map((item) => (
                        <Table.Tr key={item.skuId}>
                          <Table.Td>{item.name}</Table.Td>
                          <Table.Td>{item.category}</Table.Td>
                          <Table.Td>
                            {formatCharge(item.chargeType, item.minimumChargeHours)}
                          </Table.Td>
                          <Table.Td>
                            <Group gap={6} wrap="wrap">
                              {item.visibleOwners.map((owner) => (
                                <Badge
                                  key={`${item.skuId}-owner-${owner.ownerWarehouseId}`}
                                  color={getOwnerColor(owner.ownerWarehouseId)}
                                  variant="light"
                                >
                                  {owner.ownerWarehouseName}
                                </Badge>
                              ))}
                              {item.hiddenOwnersCount > 0 ? (
                                <Badge color="green" variant="filled">
                                  +{item.hiddenOwnersCount} más
                                </Badge>
                              ) : null}
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            <Group gap={6} wrap="wrap">
                              {item.visibleOwners.map((owner) => (
                                <Badge
                                  key={`${item.skuId}-qty-${owner.ownerWarehouseId}`}
                                  color={getOwnerColor(owner.ownerWarehouseId)}
                                  variant="filled"
                                >
                                  {owner.quantity}
                                </Badge>
                              ))}
                              {item.hiddenOwnersCount > 0 ? (
                                <Badge color="green" variant="light">
                                  +{item.hiddenOwnersCount} más
                                </Badge>
                              ) : null}
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))
                    : bulk.map((item) => (
                        <Table.Tr key={`${item.skuId}-${item.ownerWarehouseId ?? 'none'}`}>
                          <Table.Td>{item.name ?? item.skuName ?? '-'}</Table.Td>
                          <Table.Td>{item.category ?? '-'}</Table.Td>
                          <Table.Td>
                            {formatCharge(item.chargeType, item.minimumChargeHours)}
                          </Table.Td>
                          <Table.Td>{item.ownerWarehouseName ?? '-'}</Table.Td>
                          <Table.Td>{item.quantity}</Table.Td>
                        </Table.Tr>
                      ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Stack gap="sm">
                {bulkOwnerStackMode && groupedBulk
                  ? groupedBulk.map((item) => (
                      <Card key={item.skuId} withBorder padding="sm" radius="md">
                        <Text fw={700}>{item.name}</Text>
                        <Text size="xs" c="dimmed">
                          {item.category}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Cobro: {formatCharge(item.chargeType, item.minimumChargeHours)}
                        </Text>
                        <Group mt="xs" gap={6} wrap="wrap">
                          {item.visibleOwners.map((owner) => (
                            <Badge
                              key={`${item.skuId}-owner-mobile-${owner.ownerWarehouseId}`}
                              color={getOwnerColor(owner.ownerWarehouseId)}
                              variant="light"
                            >
                              {owner.ownerWarehouseName}
                            </Badge>
                          ))}
                          {item.hiddenOwnersCount > 0 ? (
                            <Badge color="green" variant="filled">
                              +{item.hiddenOwnersCount} más
                            </Badge>
                          ) : null}
                        </Group>
                        <Group mt={6} gap={6} wrap="wrap">
                          {item.visibleOwners.map((owner) => (
                            <Badge
                              key={`${item.skuId}-qty-mobile-${owner.ownerWarehouseId}`}
                              color={getOwnerColor(owner.ownerWarehouseId)}
                              variant="filled"
                            >
                              {owner.quantity}
                            </Badge>
                          ))}
                          {item.hiddenOwnersCount > 0 ? (
                            <Badge color="green" variant="light">
                              +{item.hiddenOwnersCount} más
                            </Badge>
                          ) : null}
                        </Group>
                      </Card>
                    ))
                  : bulk.map((item) => (
                      <Card
                        key={`${item.skuId}-${item.ownerWarehouseId ?? 'none'}`}
                        withBorder
                        padding="sm"
                        radius="md"
                      >
                        <Text fw={700}>{item.name ?? item.skuName ?? 'SKU'}</Text>
                        <Text size="xs" c="dimmed">
                          {item.category ?? '-'}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Cobro: {formatCharge(item.chargeType, item.minimumChargeHours)}
                        </Text>
                        <Text mt="xs">
                          <strong>Cantidad:</strong> {item.quantity}
                        </Text>
                        <Text size="sm">
                          <strong>Bodega dueña:</strong> {item.ownerWarehouseName ?? '-'}
                        </Text>
                      </Card>
                    ))}
              </Stack>
            )}
          </Card>
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
                <Card
                  key={item.assetId}
                  withBorder
                  padding="sm"
                  radius="md"
                  style={{
                    aspectRatio: '1 / 1',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <Card.Section
                    style={{
                      flex: '0 0 72%',
                      height: '72%',
                      background: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderBottom: '1px solid var(--mantine-color-gray-3)',
                    }}
                  >
                    {item.imageUrl && !brokenImages[item.assetId] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={getSerialDescription(item)}
                        onError={() =>
                          setBrokenImages((prev) => ({ ...prev, [item.assetId]: true }))
                        }
                        style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#ffffff' }}
                      />
                    ) : (
                      <Text size="sm" c="dimmed">
                        {item.imageFileObjectId ? 'Imagen cargada' : 'Sin imagen'}
                      </Text>
                    )}
                  </Card.Section>

                  <Stack gap={4} mt="xs" style={{ flex: '1 1 28%', minHeight: 0 }}>
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                        <Text
                          component={Link}
                          href={`/inventory/serialized-assets/${item.assetId}`}
                          fw={700}
                          lineClamp={2}
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          {getSerialDescription(item)}
                        </Text>
                      </Group>
                      <Badge color={getStatusColor(item.status)} variant="light">
                        {getStatusLabel(item.status)}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                      #{item.internalNumber ?? '-'}
                    </Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {item.serialOrEngine ?? '-'}
                    </Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      Cobro: {formatCharge(item.chargeType, item.minimumChargeHours)}
                    </Text>
                  </Stack>
                </Card>
              ))}
            </SimpleGrid>
          </Card>
        </section>
      )}
    </Stack>
  );
}
