'use client';

import { Alert, Badge, Button, Group, Text } from '@mantine/core';
import {
  IconCheck,
  IconEye,
  IconFileDescription,
  IconPencil,
  IconX,
} from '@tabler/icons-react';
import DataTableToolbar from '@/components/tables/DataTableToolbar';
import EntityDataTable from '@/components/tables/EntityDataTable';
import type { DataTableColumn } from '@/components/tables/table.types';

export type RequestDocument = {
  id: string;
  type: 'REMISSION' | 'RETURN' | string;
  status: string;
  consecutive: string | null;
  createdAt: string;
  docDate: string;
  creator?: { id: string; name: string | null; email: string | null } | null;
  customerWorksite?: {
    id: string;
    alias: string | null;
    customer?: { id: string; name: string } | null;
    worksite?: { id: string; name: string } | null;
  } | null;
  _count?: { items: number };
};

type RequestsListPanelProps = {
  requests: RequestDocument[];
  loading: boolean;
  error: string | null;
  successMessage: string | null;
  isDriverRole: boolean;
  canDecide: boolean;
  decidingId: string | null;
  onRefresh: () => void;
  onDismissSuccess: () => void;
  onOpenDocuments: (request: RequestDocument) => void;
  onEdit: (documentId: string) => void;
  onApprove: (documentId: string) => void;
  onReject: (documentId: string) => void;
};

function formatDocType(value: string) {
  return value === 'REMISSION' ? 'RM' : value === 'RETURN' ? 'DV' : value;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-CO');
}

function requestTypeColor(type: string) {
  return type === 'REMISSION' ? 'green' : type === 'RETURN' ? 'red' : 'gray';
}

const requestColumns: DataTableColumn<RequestDocument>[] = [
  {
    id: 'consecutive',
    header: 'Solicitud',
    width: '15%',
    mobile: { priority: 'primary' },
    cell: (row) => (
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text fw={700}>{row.consecutive ?? 'Sin consecutivo'}</Text>
          <Badge mt={4} size="sm" variant="light" color={requestTypeColor(row.type)}>
            {formatDocType(row.type)}
          </Badge>
        </div>
        <Badge hiddenFrom="md" color="yellow" variant="light">
          {row.status}
        </Badge>
      </Group>
    ),
  },
  {
    id: 'customer',
    header: 'Cliente / Obra',
    width: '22%',
    mobile: { label: 'Cliente / obra', priority: 'detail' },
    cell: (row) => (
      <div>
        <Text size="sm">{row.customerWorksite?.customer?.name ?? '-'}</Text>
        <Text size="xs" c="dimmed">
          {row.customerWorksite?.alias ?? row.customerWorksite?.worksite?.name ?? '-'}
        </Text>
      </div>
    ),
  },
  {
    id: 'items',
    header: 'Ítems',
    width: '8%',
    align: 'center',
    mobile: { label: 'Ítems', priority: 'detail' },
    cell: (row) => row._count?.items ?? 0,
  },
  {
    id: 'creator',
    header: 'Creado por',
    width: '19%',
    mobile: { label: 'Creado por', priority: 'detail' },
    cell: (row) => row.creator?.name ?? row.creator?.email ?? '-',
  },
  {
    id: 'createdAt',
    header: 'Fecha',
    width: '19%',
    mobile: { label: 'Fecha', priority: 'detail' },
    cell: (row) => formatDateTime(row.createdAt),
  },
  {
    id: 'status',
    header: 'Estado',
    width: '10%',
    mobile: false,
    cell: (row) => <Badge color="yellow" variant="light">{row.status}</Badge>,
  },
];

export default function RequestsListPanel({
  requests,
  loading,
  error,
  successMessage,
  isDriverRole,
  canDecide,
  decidingId,
  onRefresh,
  onDismissSuccess,
  onOpenDocuments,
  onEdit,
  onApprove,
  onReject,
}: RequestsListPanelProps) {
  return (
    <>
      <DataTableToolbar
        title={isDriverRole ? 'Mis borradores' : 'Solicitudes en borrador'}
        description={
          isDriverRole
            ? 'Abre un borrador para consultar y anexar fotografías.'
            : 'Revisa solicitudes pendientes, abre detalles o decide aprobacion y rechazo.'
        }
        mb="sm"
      >
        <Button variant="light" onClick={onRefresh} loading={loading}>
          Refrescar
        </Button>
      </DataTableToolbar>
      {error ? <Text c="red" mb="sm">{error}</Text> : null}
      {successMessage ? (
        <Alert color="green" variant="light" mb="sm" withCloseButton onClose={onDismissSuccess}>
          {successMessage}
        </Alert>
      ) : null}
      <EntityDataTable
        rows={requests}
        columns={requestColumns}
        getRowId={(row) => row.id}
        loading={loading}
        tableMinWidth={980}
        emptyState={{
          title: 'No hay solicitudes en borrador',
          description: 'Las nuevas solicitudes pendientes aparecerán aquí.',
        }}
        actions={(row) => [
          {
            key: 'view',
            label: `Ver ${row.consecutive ?? 'solicitud'}`,
            icon: <IconEye size={16} />,
            color: 'blue',
            href: `/inventory/ledger/document/${row.id}`,
          },
          {
            key: 'documents',
            label: isDriverRole
              ? `Anexar fotos a ${row.consecutive ?? 'la solicitud'}`
              : `Documentos de ${row.consecutive ?? 'la solicitud'}`,
            icon: <IconFileDescription size={16} />,
            color: 'violet',
            onClick: () => onOpenDocuments(row),
          },
          ...(canDecide
            ? [
                {
                  key: 'edit',
                  label: `Editar ${row.consecutive ?? 'solicitud'}`,
                  icon: <IconPencil size={16} />,
                  onClick: () => onEdit(row.id),
                },
                {
                  key: 'approve',
                  label: `Aprobar ${row.consecutive ?? 'solicitud'}`,
                  icon: <IconCheck size={16} />,
                  color: 'green',
                  loading: decidingId === row.id,
                  onClick: () => onApprove(row.id),
                },
                {
                  key: 'reject',
                  label: `Rechazar ${row.consecutive ?? 'solicitud'}`,
                  icon: <IconX size={16} />,
                  color: 'red',
                  loading: decidingId === row.id,
                  onClick: () => onReject(row.id),
                },
              ]
            : []),
        ]}
      />
    </>
  );
}
