'use client';

import { useState } from 'react';
import { ActionIcon, Badge, Button, Card, Group, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconPencil } from '@tabler/icons-react';
import Link from 'next/link';

type BulkItem = {
  skuId: string;
  ownerWarehouseId?: string | null;
  id?: string | null;
  skuName: string | null;
  name?: string | null;
  category?: string | null;
  imageUrl: string | null;
  imageFileObjectId: string | null;
  assetFamilyId?: string | null;
  unitWeight?: number | string | null;
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
  viewFilter = 'ALL'
}: {
  bulk: BulkItem[];
  serial: SerialItem[];
  onAdjust?: () => void;
  viewFilter?: 'ALL' | 'BULK' | 'SERIAL';
}) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

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

  const showBulkSection = (viewFilter === 'ALL' || viewFilter === 'BULK') && bulk.length > 0;
  const showSerialSection = (viewFilter === 'ALL' || viewFilter === 'SERIAL') && serial.length > 0;

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
                    <Table.Th>SKU ID</Table.Th>
                    <Table.Th>Owner Warehouse ID</Table.Th>
                    <Table.Th>Nombre</Table.Th>
                    <Table.Th>Categoría</Table.Th>
                    <Table.Th>Asset Family ID</Table.Th>
                    <Table.Th>Unit Weight</Table.Th>
                    <Table.Th>Activo</Table.Th>
                    <Table.Th>Creado</Table.Th>
                    <Table.Th>Cantidad</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {bulk.map((item) => (
                    <Table.Tr key={item.skuId}>
                      <Table.Td>{item.id ?? item.skuId}</Table.Td>
                      <Table.Td>{item.ownerWarehouseId ?? '-'}</Table.Td>
                      <Table.Td>{item.name ?? item.skuName ?? '-'}</Table.Td>
                      <Table.Td>{item.category ?? '-'}</Table.Td>
                      <Table.Td>{item.assetFamilyId ?? '-'}</Table.Td>
                      <Table.Td>{item.unitWeight ?? '-'}</Table.Td>
                      <Table.Td>
                        {item.active === null || item.active === undefined
                          ? '-'
                          : item.active
                            ? 'Sí'
                            : 'No'}
                      </Table.Td>
                      <Table.Td>
                        {item.createdAt ? new Date(item.createdAt).toLocaleString('es-CO') : '-'}
                      </Table.Td>
                      <Table.Td>{item.quantity}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Stack gap="sm">
                {bulk.map((item) => (
                  <Card key={item.skuId} withBorder padding="sm" radius="md">
                    <Text fw={700}>{item.name ?? item.skuName ?? 'SKU'}</Text>
                    <Text size="xs" c="dimmed">{item.id ?? item.skuId}</Text>
                    <Text mt="xs"><strong>Cantidad:</strong> {item.quantity}</Text>
                    <Text size="sm"><strong>Bodega dueña:</strong> {item.ownerWarehouseId ?? '-'}</Text>
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
            EQUIPOS UNICOS
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
                        <Text fw={700} lineClamp={2}>
                          {getSerialDescription(item)}
                        </Text>
                        <ActionIcon
                          component={Link}
                          href={`/inventory/serialized-assets/${item.assetId}`}
                          variant="light"
                          size="sm"
                          aria-label="Editar equipo"
                        >
                          <IconPencil size={14} />
                        </ActionIcon>
                      </Group>
                      <Badge color={getStatusColor(item.status)} variant="light">
                        {(item.status ?? 'IN').toString().toUpperCase()}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                      #{item.internalNumber ?? '-'}
                    </Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {item.serialOrEngine ?? '-'}
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
