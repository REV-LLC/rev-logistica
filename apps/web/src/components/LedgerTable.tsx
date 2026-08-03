'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, Modal, Table, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconEye } from '@tabler/icons-react';
import TableRowActions from '@/components/TableRowActions';

export type LedgerItem = {
  id: string;
  createdAt: string;
  movementType: string;
  quantity: number;
  refDocumentType?: string | null;
  refDocumentId?: string | null;
  document?: {
    id: string;
    consecutive: string | null;
    type: string;
  } | null;
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
  creator?: {
    id: string;
    email: string;
    employee?: { name: string; lastName?: string | null } | null;
  } | null;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US');
}

function formatMovementType(item: LedgerItem) {
  if (item.movementType === 'ADJUST') {
    if (item.assetId && item.quantity > 0) return 'CREATION';
    return 'ADJUSTMENT';
  }
  if (item.movementType === 'ON_SITE') return 'En obra';
  return item.movementType;
}

function renderReference(item: LedgerItem) {
  const label = item.document?.consecutive
    ? item.document.consecutive.trim()
    : item.refDocumentId
    ? item.refDocumentId.trim()
    : '-';

  const documentId = item.document?.id ?? item.refDocumentId ?? null;
  if (!documentId || label === '-') return label;
  return <Link href={`/inventory/ledger/document/${documentId}`}>{label}</Link>;
}

export default function LedgerTable({
  items,
  showItemIdentifiers = true,
}: {
  items: LedgerItem[];
  showItemIdentifiers?: boolean;
}) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsItem, setDetailsItem] = useState<LedgerItem | null>(null);

  const openDetails = (item: LedgerItem) => {
    setDetailsItem(item);
    setDetailsOpen(true);
  };

  return (
    <Card withBorder>
      <Table striped highlightOnHover className={isMobile ? 'table-mobile-fit' : undefined}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={isMobile ? { width: '25%' } : undefined}>Fecha</Table.Th>
            {!isMobile ? <Table.Th>Movimiento</Table.Th> : null}
            <Table.Th style={isMobile ? { width: '45%' } : undefined}>Ítem</Table.Th>
            <Table.Th style={isMobile ? { width: '15%', textAlign: 'center' } : { textAlign: 'center' }}>
              {isMobile ? 'Cant.' : 'Cantidad'}
            </Table.Th>
            {isMobile ? <Table.Th style={{ width: '15%' }}>Acciones</Table.Th> : null}
            {!isMobile ? <Table.Th>Ubicación</Table.Th> : null}
            {!isMobile ? <Table.Th>Registrado por</Table.Th> : null}
            {!isMobile ? <Table.Th>Referencia</Table.Th> : null}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item) => {
            const skuName =
              item.sku?.name ??
              item.asset?.sku?.name ??
              (showItemIdentifiers ? item.skuId : null) ??
              'Sin referencia';
            const primaryLabel = item.assetId
              ? item.asset?.description ??
                skuName ??
                (showItemIdentifiers ? item.assetId : null) ??
                'Sin referencia'
              : item.skuId
              ? skuName
              : '-';
            const secondaryLabel = showItemIdentifiers
              ? item.assetId
                ? item.asset?.serialOrEngine ?? item.assetId ?? null
                : item.skuId
                  ? item.skuId
                  : null
              : null;
            const location = item.warehouse
              ? item.warehouse.name
              : item.customerWorksite
              ? `${item.customerWorksite.customer?.name ?? 'Cliente'} / ${
                  item.customerWorksite.worksite?.name ?? 'Obra'
                }`
              : '-';
            const createdBy = item.creator?.employee?.name ?? item.creator?.email ?? '-';
            return (
              <Table.Tr key={item.id}>
                <Table.Td>{formatDate(item.createdAt)}</Table.Td>
                {!isMobile ? <Table.Td>{formatMovementType(item)}</Table.Td> : null}
                <Table.Td>
                  {item.assetId ? (
                    <Link href={`/inventory/ledger/asset/${item.assetId}`}>
                      {primaryLabel}
                    </Link>
                  ) : item.skuId ? (
                    <Link href={`/inventory/ledger/sku/${item.skuId}`}>
                      {primaryLabel}
                    </Link>
                  ) : (
                    '-'
                  )}
                  {secondaryLabel && (
                    <Text size="xs" c="dimmed">
                      {secondaryLabel}
                    </Text>
                  )}
                  {item.assetId ? (
                    <Text size="xs">
                      <Link href={`/inventory/serialized-assets/${item.assetId}`}>View equipment</Link>
                    </Text>
                  ) : null}
                </Table.Td>
                <Table.Td style={{ textAlign: 'center' }}>{item.quantity}</Table.Td>
                {isMobile ? (
                  <Table.Td>
                    <TableRowActions
                      actions={[
                        {
                          key: 'view',
                          label: 'Ver detalle del movimiento',
                          icon: <IconEye size={16} />,
                          color: 'blue',
                          onClick: () => openDetails(item),
                        },
                      ]}
                    />
                  </Table.Td>
                ) : null}
                {!isMobile ? <Table.Td>{location}</Table.Td> : null}
                {!isMobile ? <Table.Td>{createdBy}</Table.Td> : null}
                {!isMobile ? <Table.Td>{renderReference(item)}</Table.Td> : null}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>

      <Modal opened={detailsOpen} onClose={() => setDetailsOpen(false)} title="Movement details">
        {detailsItem ? (
          <>
            <Text>
              <strong>Fecha:</strong> {formatDate(detailsItem.createdAt)}
            </Text>
            <Text mt="xs">
              <strong>Movement:</strong> {formatMovementType(detailsItem)}
            </Text>
            <Text mt="xs">
              <strong>Cantidad:</strong> {detailsItem.quantity}
            </Text>
            <Text mt="xs">
              <strong>Location:</strong>{' '}
              {detailsItem.warehouse
                ? detailsItem.warehouse.name
                : detailsItem.customerWorksite
                ? `${detailsItem.customerWorksite.customer?.name ?? 'Cliente'} / ${
                    detailsItem.customerWorksite.worksite?.name ?? 'Obra'
                  }`
                : '-'}
            </Text>
            <Text mt="xs">
              <strong>Created by:</strong> {detailsItem.creator?.employee?.name ?? detailsItem.creator?.email ?? '-'}
            </Text>
            <Text mt="xs">
              <strong>Reference:</strong> {renderReference(detailsItem)}
            </Text>
            {detailsItem.assetId ? (
              <Text mt="xs">
                <strong>Equipment:</strong>{' '}
                <Link href={`/inventory/serialized-assets/${detailsItem.assetId}`}>Abrir ficha del equipo</Link>
              </Text>
            ) : null}
          </>
        ) : null}
      </Modal>
    </Card>
  );
}
