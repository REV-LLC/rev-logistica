'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconEye } from '@tabler/icons-react';
import TableRowActions from '@/components/TableRowActions';
import type { LedgerItem } from '@/components/LedgerTable';

export type LedgerDocumentGroup = {
  key: string;
  documentId: string | null;
  reference: string;
  documentType: string | null;
  items: LedgerItem[];
};

function getDocumentId(item: LedgerItem) {
  return item.document?.id ?? item.refDocumentId?.trim() ?? null;
}

function getReference(item: LedgerItem) {
  return item.document?.consecutive?.trim() || item.refDocumentId?.trim() || 'Sin documento';
}

export function groupLedgerItemsByDocument(items: LedgerItem[]) {
  const groups = new Map<string, LedgerDocumentGroup>();

  items.forEach((item) => {
    const documentId = getDocumentId(item);
    const key = documentId ? `document:${documentId}` : `movement:${item.id}`;
    const current = groups.get(key);

    if (current) {
      current.items.push(item);
      return;
    }

    groups.set(key, {
      key,
      documentId,
      reference: getReference(item),
      documentType: item.document?.type ?? item.refDocumentType ?? null,
      items: [item],
    });
  });

  return Array.from(groups.values());
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-CO');
}

function formatMovementType(item: LedgerItem) {
  if (item.movementType === 'ADJUST') {
    if (item.assetId && item.quantity > 0) return 'CREACIÓN';
    return 'AJUSTE';
  }
  return item.movementType;
}

function getItemName(item: LedgerItem) {
  const skuName = item.sku?.name ?? item.asset?.sku?.name ?? item.skuId ?? 'Ítem';
  if (item.assetId) {
    return item.asset?.description ?? skuName ?? item.assetId;
  }
  return skuName;
}

function getLocation(item: LedgerItem) {
  if (item.warehouse) return item.warehouse.name;
  if (item.customerWorksite) {
    return `${item.customerWorksite.customer?.name ?? 'Cliente'} / ${
      item.customerWorksite.worksite?.name ?? 'Obra'
    }`;
  }
  return '-';
}

function getCreator(item: LedgerItem) {
  const employeeName = item.creator?.employee
    ? `${item.creator.employee.name} ${item.creator.employee.lastName ?? ''}`.trim()
    : null;
  return employeeName || item.creator?.email || '-';
}

function getDocumentRequester(item: LedgerItem) {
  const employeeName = item.document?.creator?.employee
    ? `${item.document.creator.employee.name} ${item.document.creator.employee.lastName ?? ''}`.trim()
    : null;
  return employeeName || item.document?.creator?.email || '-';
}

function getMovementSummary(group: LedgerDocumentGroup) {
  return Array.from(new Set(group.items.map(formatMovementType))).join(' / ');
}

function getLocationSummary(group: LedgerDocumentGroup) {
  const locations = Array.from(new Set(group.items.map(getLocation)));
  if (locations.length <= 1) return locations[0] ?? '-';
  return `${locations[0]} +${locations.length - 1}`;
}

function ItemLink({ item }: { item: LedgerItem }) {
  const name = getItemName(item);
  const href = item.assetId
    ? `/inventory/ledger/asset/${item.assetId}`
    : item.skuId
      ? `/inventory/ledger/sku/${item.skuId}`
      : null;

  return (
    <div>
      {href ? (
        <Text component={Link} href={href} fw={600} size="sm" c="inherit">
          {name}
        </Text>
      ) : (
        <Text fw={600} size="sm">
          {name}
        </Text>
      )}
    </div>
  );
}

export default function LedgerDocumentTable({
  groups,
}: {
  groups: LedgerDocumentGroup[];
}) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [detailsGroup, setDetailsGroup] = useState<LedgerDocumentGroup | null>(null);

  return (
    <Card withBorder>
      {isMobile ? (
        <Stack gap="xs">
          {groups.map((group) => {
            const primaryItem = group.items[0];
            const itemNames = Array.from(new Set(group.items.map(getItemName)));
            return (
              <Paper key={group.key} withBorder radius="md" p="sm">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <div>
                    <Text size="xs" c="dimmed">
                      {formatDate(primaryItem.createdAt)}
                    </Text>
                    {group.documentId ? (
                      <Text
                        component={Link}
                        href={`/inventory/ledger/document/${group.documentId}`}
                        fw={800}
                        c="inherit"
                      >
                        {group.reference}
                      </Text>
                    ) : (
                      <Text fw={800}>{group.reference}</Text>
                    )}
                  </div>
                  <TableRowActions
                    actions={[
                      {
                        key: 'view',
                        label: `Ver movimientos del documento ${group.reference}`,
                        icon: <IconEye size={16} />,
                        color: 'blue',
                        onClick: () => setDetailsGroup(group),
                      },
                    ]}
                  />
                </Group>
                <Group gap={6} mt={6}>
                  {group.documentType ? (
                    <Badge size="xs" variant="light" color="gray">
                      {group.documentType}
                    </Badge>
                  ) : null}
                  <Badge size="xs" variant="light" color="blue">
                    {group.items.length} ítem{group.items.length === 1 ? '' : 's'}
                  </Badge>
                  <Badge size="xs" variant="outline" color="gray">
                    {getMovementSummary(group)}
                  </Badge>
                </Group>
                <Text size="sm" mt="xs" lineClamp={2}>
                  {itemNames.slice(0, 2).join(', ')}
                  {itemNames.length > 2 ? ` +${itemNames.length - 2}` : ''}
                </Text>
                <Text size="xs" c="dimmed" mt={4} lineClamp={1}>
                  {getLocationSummary(group)}
                </Text>
                <Text size="xs" c="dimmed" mt={4} lineClamp={1}>
                  Solicitado por: {getDocumentRequester(primaryItem)}
                </Text>
              </Paper>
            );
          })}
        </Stack>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Fecha</Table.Th>
              <Table.Th>Documento</Table.Th>
              <Table.Th>Movimiento</Table.Th>
              <Table.Th>Ítems</Table.Th>
              <Table.Th>Ubicación</Table.Th>
              <Table.Th>Solicitado por</Table.Th>
              <Table.Th>Creado por</Table.Th>
              <Table.Th style={{ width: 92, textAlign: 'right' }}>Acciones</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {groups.map((group) => {
              const primaryItem = group.items[0];
              const itemNames = Array.from(new Set(group.items.map(getItemName)));
              return (
                <Table.Tr key={group.key}>
                  <Table.Td>{formatDate(primaryItem.createdAt)}</Table.Td>
                  <Table.Td>
                    {group.documentId ? (
                      <Text
                        component={Link}
                        href={`/inventory/ledger/document/${group.documentId}`}
                        fw={700}
                        c="inherit"
                      >
                        {group.reference}
                      </Text>
                    ) : (
                      <Text fw={700}>{group.reference}</Text>
                    )}
                    {group.documentType ? (
                      <Text size="xs" c="dimmed">
                        {group.documentType}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td>{getMovementSummary(group)}</Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Badge variant="light" color="blue" style={{ flexShrink: 0 }}>
                        {group.items.length}
                      </Badge>
                      <Text size="sm" lineClamp={2}>
                        {itemNames.slice(0, 2).join(', ')}
                        {itemNames.length > 2 ? ` +${itemNames.length - 2}` : ''}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>{getLocationSummary(group)}</Table.Td>
                  <Table.Td>{getDocumentRequester(primaryItem)}</Table.Td>
                  <Table.Td>{getCreator(primaryItem)}</Table.Td>
                  <Table.Td>
                    <TableRowActions
                      actions={[
                        {
                          key: 'view',
                          label: `Ver movimientos del documento ${group.reference}`,
                          icon: <IconEye size={16} />,
                          color: 'blue',
                          onClick: () => setDetailsGroup(group),
                        },
                      ]}
                    />
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}

      <Modal
        opened={Boolean(detailsGroup)}
        onClose={() => setDetailsGroup(null)}
        title={detailsGroup ? `Documento ${detailsGroup.reference}` : 'Detalle del documento'}
        size="xl"
        fullScreen={isMobile}
        radius={isMobile ? 0 : 'md'}
      >
        {detailsGroup ? (
          <Stack gap="md">
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <div>
                <Text size="sm" c="dimmed">
                  {formatDate(detailsGroup.items[0].createdAt)}
                </Text>
                <Text fw={700}>{getMovementSummary(detailsGroup)}</Text>
                <Text size="sm">{getLocationSummary(detailsGroup)}</Text>
                <Text size="sm" c="dimmed">
                  Solicitado por: {getDocumentRequester(detailsGroup.items[0])}
                </Text>
              </div>
              <Badge variant="light" color="blue">
                {detailsGroup.items.length} ítem{detailsGroup.items.length === 1 ? '' : 's'}
              </Badge>
            </Group>

            {isMobile ? (
              <Stack gap="xs">
                {detailsGroup.items.map((item) => (
                  <Paper key={item.id} withBorder radius="md" p="sm">
                    <ItemLink item={item} />
                    <Group justify="space-between" mt="xs">
                      <Badge size="xs" variant="outline" color="gray">
                        {formatMovementType(item)}
                      </Badge>
                      <Text fw={800}>{item.quantity}</Text>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Table striped verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Ítem</Table.Th>
                    <Table.Th>Movimiento</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Cantidad</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {detailsGroup.items.map((item) => (
                    <Table.Tr key={item.id}>
                      <Table.Td>
                        <ItemLink item={item} />
                      </Table.Td>
                      <Table.Td>{formatMovementType(item)}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{item.quantity}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}

            {detailsGroup.documentId ? (
              <Group justify="flex-end">
                <Button
                  component={Link}
                  href={`/inventory/ledger/document/${detailsGroup.documentId}`}
                >
                  Abrir documento completo
                </Button>
              </Group>
            ) : null}
          </Stack>
        ) : null}
      </Modal>
    </Card>
  );
}
