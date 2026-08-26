'use client';

import { Group, Paper, Stack, Table, Text } from '@mantine/core';

type RequestSummaryItem = {
  selectionId: string;
  type: 'bulk' | 'serial' | 'free';
  name: string;
  quantity?: number;
  isDamaged?: boolean;
  damageDescription?: string;
};

type RequestItemsSummaryProps = {
  compact: boolean;
  documentType: 'REMISSION' | 'RETURN';
  items: RequestSummaryItem[];
  totalQuantity: number;
};

const itemQuantity = (item: RequestSummaryItem) =>
  item.type === 'serial' ? 1 : item.quantity ?? 1;

const DamageDescription = ({ item }: { item: RequestSummaryItem }) => (
  <Text size="xs" c="red" style={{ overflowWrap: 'anywhere' }}>
    Dañado: {item.damageDescription?.trim() || 'Sin descripción'}
  </Text>
);

export default function RequestItemsSummary({
  compact,
  documentType,
  items,
  totalQuantity,
}: RequestItemsSummaryProps) {
  if (compact) {
    return (
      <Stack gap="xs" mb="md">
        {items.map((item) => (
          <Paper key={item.selectionId} withBorder radius="md" p="sm">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div style={{ minWidth: 0 }}>
                <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{item.name}</Text>
                {documentType === 'RETURN' && item.isDamaged ? (
                  <DamageDescription item={item} />
                ) : null}
              </div>
              <Text fw={800} ta="right" style={{ flex: '0 0 auto' }}>
                {itemQuantity(item)}
              </Text>
            </Group>
          </Paper>
        ))}
        <Paper withBorder radius="md" p="sm" bg="gray.0">
          <Group justify="space-between" wrap="nowrap">
            <Text fw={800}>Total</Text>
            <Text fw={900}>{totalQuantity}</Text>
          </Group>
        </Paper>
      </Stack>
    );
  }

  return (
    <Table striped highlightOnHover mb="md">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Item</Table.Th>
          <Table.Th style={{ width: 110, textAlign: 'center' }}>Cantidad</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {items.map((item) => (
          <Table.Tr key={item.selectionId}>
            <Table.Td>
              <Text>{item.name}</Text>
              {documentType === 'RETURN' && item.isDamaged ? (
                <DamageDescription item={item} />
              ) : null}
            </Table.Td>
            <Table.Td style={{ textAlign: 'center' }}>{itemQuantity(item)}</Table.Td>
          </Table.Tr>
        ))}
        <Table.Tr>
          <Table.Td><Text fw={800}>Total</Text></Table.Td>
          <Table.Td style={{ textAlign: 'center' }}>
            <Text fw={800}>{totalQuantity}</Text>
          </Table.Td>
        </Table.Tr>
      </Table.Tbody>
    </Table>
  );
}
