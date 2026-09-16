'use client';
import DataTableToolbar from '@/components/tables/DataTableToolbar';
import EntityDataTable from '@/components/tables/EntityDataTable';
import type { DataTableColumn } from '@/components/tables/table.types';
import { Alert, Button, Tabs, Text } from '@mantine/core';
import {
  IconCheck,
  IconEye,
  IconFileDescription,
  IconPencil,
  IconX,
} from '@tabler/icons-react';
import type { Dispatch, SetStateAction } from 'react';
import { RequestDocument } from './request-types';

type Props = {
  isDriverRole: boolean;
  loadRequests: () => Promise<void>;
  requestsLoading: boolean;
  requestsError: string | null;
  submitResult: string | null;
  setSubmitResult: Dispatch<SetStateAction<string | null>>;
  requests: RequestDocument[];
  requestColumns: DataTableColumn<RequestDocument>[];
  setDocumentsRequest: Dispatch<SetStateAction<RequestDocument | null>>;
  canDecide: boolean;
  editRequest: (documentId: string, autosaved?: boolean) => Promise<void>;
  decidingId: string | null;
  decideRequest: (
    documentId: string,
    action: 'APPROVE' | 'REJECT',
  ) => Promise<void>;
};

export default function RequestsListSection({
  isDriverRole,
  loadRequests,
  requestsLoading,
  requestsError,
  submitResult,
  setSubmitResult,
  requests,
  requestColumns,
  setDocumentsRequest,
  canDecide,
  editRequest,
  decidingId,
  decideRequest,
}: Props) {
  return (
    <Tabs.Panel value="list" pt="md">
      <DataTableToolbar
        title={isDriverRole ? 'Mis borradores' : 'Solicitudes en borrador'}
        description={
          isDriverRole
            ? 'Abre un borrador para consultar y anexar fotografías.'
            : 'Revisa solicitudes pendientes, abre detalles o decide aprobacion y rechazo.'
        }
        mb="sm"
      >
        <Button
          variant="light"
          onClick={loadRequests}
          loading={requestsLoading}
        >
          Refrescar
        </Button>
      </DataTableToolbar>
      {requestsError ? (
        <Text c="red" mb="sm">
          {requestsError}
        </Text>
      ) : null}
      {submitResult ? (
        <Alert
          color="green"
          variant="light"
          mb="sm"
          withCloseButton
          onClose={() => setSubmitResult(null)}
        >
          {submitResult}
        </Alert>
      ) : null}
      <EntityDataTable
        rows={requests}
        columns={requestColumns}
        getRowId={(row) => row.id}
        loading={requestsLoading}
        tableMinWidth={980}
        emptyState={{
          title: 'No hay solicitudes en borrador',
          description: 'Las nuevas solicitudes pendientes aparecerán aquí.',
        }}
        actions={(row) => [
          ...(row.status === 'IN_PROGRESS' ? [{
            key: 'resume', label: `Continuar ${row.consecutive ?? 'formulario'}`, icon: <IconPencil size={16} />,
            onClick: () => editRequest(row.id, true),
          }] : []),
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
            onClick: () => setDocumentsRequest(row),
          },
          ...(canDecide
            ? [
                {
                  key: 'edit',
                  label: `Editar ${row.consecutive ?? 'solicitud'}`,
                  icon: <IconPencil size={16} />,
                  onClick: () => editRequest(row.id),
                },
                {
                  key: 'approve',
                  label: `Aprobar ${row.consecutive ?? 'solicitud'}`,
                  icon: <IconCheck size={16} />,
                  color: 'green',
                  loading: decidingId === row.id,
                  onClick: () => decideRequest(row.id, 'APPROVE'),
                },
                {
                  key: 'reject',
                  label: `Rechazar ${row.consecutive ?? 'solicitud'}`,
                  icon: <IconX size={16} />,
                  color: 'red',
                  loading: decidingId === row.id,
                  onClick: () => decideRequest(row.id, 'REJECT'),
                },
              ]
            : []),
        ]}
      />
    </Tabs.Panel>
  );
}
