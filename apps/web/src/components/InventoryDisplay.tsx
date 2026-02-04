'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title
} from '@mantine/core';
import { BulkItem, getNormalizedSkuDisplayName, groupFormaletas } from '@/lib/formaleta';

type SerialItem = {
  assetId: string;
  serialOrEngine: string | null;
  description: string | null;
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
  viewFilter?: 'ALL' | 'FORMALETAS' | 'OTROS' | 'SERIAL';
}) {
  const { formaletas, otherItems } = groupFormaletas(bulk);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const sortedOtherItems = useMemo(
    () =>
      [...otherItems].sort((a, b) =>
        (a.skuName ?? '').localeCompare(b.skuName ?? '', 'es', { sensitivity: 'base' })
      ),
    [otherItems]
  );

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const groupKey = (group: { kind: string; widthCm: number; heightCm?: number }) =>
    `${group.kind}:${group.widthCm}:${group.heightCm ?? ''}`;

  const formatLength = (lengthCm: number, kind: string) => {
    if (kind === 'alineador') {
      const meters = (lengthCm / 100).toFixed(2).replace('.', ',');
      return `${meters} m`;
    }
    return `${lengthCm} cm`;
  };

  return (
    <Stack gap="lg">
      <section>
        <Group justify="space-between" align="center" mb="sm">
          <Title order={3}>STOCK MASIVO</Title>
          {onAdjust && (
            <Button variant="outline" size="xs" onClick={onAdjust}>
              Adjust: Admin
            </Button>
          )}
        </Group>
        {bulk.length === 0 ? (
          <Text c="dimmed">No hay items BULK.</Text>
        ) : (
          <Stack gap="lg">
            {(viewFilter === 'ALL' || viewFilter === 'FORMALETAS') && formaletas.length > 0 && (
              <Stack gap="sm">
                <Group gap="xs">
                  <Text fw={600}>FORMALETAS AGRUPADAS</Text>
                  <Badge size="sm" variant="light">
                    {formaletas.length}
                  </Badge>
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                  {formaletas.map((group) => {
                    const key = groupKey(group);
                    return (
                    <Card key={key} withBorder>
                      <Group align="center" gap="sm">
                        {group.imageUrl ? (
                          <img
                            src={group.imageUrl}
                            alt={`Formaleta ${group.widthCm} cm`}
                            width={56}
                            height={56}
                            style={{ borderRadius: 12, objectFit: 'cover' }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 56,
                              height: 56,
                              borderRadius: 12,
                              background: '#f0f0f0',
                              display: 'grid',
                              placeItems: 'center',
                              fontSize: 12
                            }}
                          >
                            N/A
                          </div>
                        )}
                        <div>
                          <Text fw={600}>{group.label}</Text>
                          <Text size="xs" c="dimmed">
                            {group.items.length} largos ·{' '}
                            {group.items.reduce((acc, item) => acc + item.quantity, 0)} unidades
                          </Text>
                        </div>
                      </Group>
                      <Group mt="md" gap="xs" wrap="wrap">
                        {group.items.map((item) => (
                          <Badge
                            key={`${key}-${item.lengthCm}`}
                            variant="outline"
                          >
                            {formatLength(item.lengthCm, group.kind)} · {item.quantity}
                          </Badge>
                        ))}
                      </Group>
                      <Group mt="sm">
                        <Button
                          variant="light"
                          size="xs"
                          onClick={() => toggleGroup(key)}
                        >
                          {openGroups[key] ? 'Ocultar SKU IDs' : 'Ver SKU IDs'}
                        </Button>
                      </Group>
                      {openGroups[key] && (
                        <Stack mt="sm" gap={4}>
                          {group.items.map((item) => (
                            <Text
                              key={`${key}-ids-${item.lengthCm}`}
                              size="xs"
                              c="dimmed"
                            >
                              <strong>{formatLength(item.lengthCm, group.kind)}:</strong>{' '}
                              {item.skuEntries
                                .map((entry) => `${entry.skuId} (${entry.displayName})`)
                                .join(', ')}
                            </Text>
                          ))}
                        </Stack>
                      )}
                    </Card>
                  );
                  })}
                </SimpleGrid>
              </Stack>
            )}

            {(viewFilter === 'ALL' &&
              formaletas.length > 0 &&
              sortedOtherItems.length > 0) && <Divider />}

            {(viewFilter === 'ALL' || viewFilter === 'OTROS') && sortedOtherItems.length > 0 && (
              <Stack gap="sm">
                <Group gap="xs">
                  <Text fw={600}>OTROS BULK</Text>
                  <Badge size="sm" variant="light">
                    {sortedOtherItems.length}
                  </Badge>
                </Group>
                <Card withBorder>
                  <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Descripción</Table.Th>
                        <Table.Th>Cantidad</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                      {sortedOtherItems.map((item) => (
                        <Table.Tr key={item.skuId}>
                          <Table.Td>{getNormalizedSkuDisplayName(item) ?? 'SKU'}</Table.Td>
                          <Table.Td>{item.quantity}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Card>
              </Stack>
            )}
          </Stack>
        )}
      </section>

      {(viewFilter === 'ALL' || viewFilter === 'SERIAL') && (
      <section>
        <Title order={3} mb="sm">
          EQUIPOS UNICOS
        </Title>
        {serial.length === 0 ? (
          <Text c="dimmed">No hay items SERIAL.</Text>
        ) : (
          <Card withBorder>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Descripción</Table.Th>
                  <Table.Th></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {serial.map((item) => (
                  <Table.Tr key={item.assetId}>
                    <Table.Td>
                      {item.description ?? '-'}{' '}
                      {item.internalNumber != null && (
                        <Text component="span" size="xs" c="dimmed">
                          #{item.internalNumber}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        variant="subtle"
                        size="xs"
                        onClick={() => toggleGroup(`serial:${item.assetId}`)}
                      >
                        {openGroups[`serial:${item.assetId}`] ? 'Ocultar' : 'Ver'}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {serial.map((item) =>
                  openGroups[`serial:${item.assetId}`] ? (
                    <Table.Tr key={`${item.assetId}-details`}>
                      <Table.Td colSpan={3}>
                        <Stack gap={4}>
                          <Text size="xs">
                            <strong>Serial/Engine:</strong> {item.serialOrEngine ?? '-'}
                          </Text>
                          <Text size="xs">
                            <strong>Asset ID:</strong> {item.assetId}
                          </Text>
                          {item.assetFamily?.name && (
                            <Text size="xs">
                              <strong>Familia:</strong> {item.assetFamily.name}
                            </Text>
                          )}
                        </Stack>
                      </Table.Td>
                    </Table.Tr>
                  ) : null
                )}
              </Table.Tbody>
            </Table>
          </Card>
        )}
      </section>
      )}
    </Stack>
  );
}
