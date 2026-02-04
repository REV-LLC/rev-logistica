'use client';

import Link from 'next/link';
import { Card, Table, Text } from '@mantine/core';

export type LedgerItem = {
  id: string;
  createdAt: string;
  movementType: string;
  quantity: number;
  refDocumentType?: string | null;
  refDocumentId?: string | null;
  skuId?: string | null;
  assetId?: string | null;
  sku?: { id: string; name: string; imageUrl?: string | null; imageFileObjectId?: string | null } | null;
  asset?: {
    id: string;
    serialOrEngine?: string | null;
    description?: string | null;
    sku?: { id: string; name: string } | null;
  } | null;
  warehouse?: { id: string; name: string } | null;
  customerWorksite?: {
    id: string;
    customer?: { id: string; name: string } | null;
    worksite?: { id: string; name: string } | null;
  } | null;
  creator?: { id: string; email: string } | null;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-CO');
}

export default function LedgerTable({ items }: { items: LedgerItem[] }) {
  return (
    <Card withBorder>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Fecha</Table.Th>
            <Table.Th>Movimiento</Table.Th>
            <Table.Th>Item</Table.Th>
            <Table.Th>Cantidad</Table.Th>
            <Table.Th>Ubicación</Table.Th>
            <Table.Th>Creado por</Table.Th>
            <Table.Th>Referencia</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item) => {
            const skuName = item.sku?.name ?? item.asset?.sku?.name ?? item.skuId ?? '-';
            const assetLabel = item.asset?.serialOrEngine ?? item.assetId ?? null;
            const location = item.warehouse
              ? item.warehouse.name
              : item.customerWorksite
              ? `${item.customerWorksite.customer?.name ?? 'Cliente'} / ${
                  item.customerWorksite.worksite?.name ?? 'Worksite'
                }`
              : '-';
            const createdBy = item.creator?.email ?? '-';
            const refLabel = item.refDocumentType
              ? `${item.refDocumentType} ${item.refDocumentId ?? ''}`.trim()
              : '-';

            return (
              <Table.Tr key={item.id}>
                <Table.Td>{formatDate(item.createdAt)}</Table.Td>
                <Table.Td>{item.movementType}</Table.Td>
                <Table.Td>
                  {item.assetId ? (
                    <Link href={`/inventory/ledger/asset/${item.assetId}`}>
                      {assetLabel}
                    </Link>
                  ) : item.skuId ? (
                    <Link href={`/inventory/ledger/sku/${item.skuId}`}>
                      {skuName}
                    </Link>
                  ) : (
                    '-'
                  )}
                  <Text size="xs" c="dimmed">
                    {item.assetId ? skuName : item.skuId}
                  </Text>
                </Table.Td>
                <Table.Td>{item.quantity}</Table.Td>
                <Table.Td>{location}</Table.Td>
                <Table.Td>{createdBy}</Table.Td>
                <Table.Td>{refLabel}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Card>
  );
}
