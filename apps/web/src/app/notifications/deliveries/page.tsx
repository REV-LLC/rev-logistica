'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconBrandWhatsapp,
  IconCheck,
  IconMail,
  IconRefresh,
  IconSearch,
  IconSend,
} from '@tabler/icons-react';
import AuthGuard from '@/components/AuthGuard';
import ResponsiveShell from '@/components/ResponsiveShell';
import DataTableToolbar from '@/components/tables/DataTableToolbar';
import EntityDataTable from '@/components/tables/EntityDataTable';
import type { DataTableColumn } from '@/components/tables/table.types';
import { useClientTableData } from '@/components/tables/useClientTableData';
import { api } from '@/lib/api';

type Delivery = {
  id: string;
  channel: 'EMAIL' | 'WHATSAPP';
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
  kind: 'DRAFT' | 'FINAL' | string;
  recipient: string;
  subject: string;
  attachments: string[];
  sentAt?: string | null;
  createdAt: string;
  error?: string | null;
  legacy?: boolean;
  reference: {
    documentId: string;
    documentType: string;
    number?: string | null;
    label: string;
    customer?: string | null;
    worksite?: string | null;
    href: string;
  };
};

const statusPresentation = {
  SENT: { label: 'Enviado', color: 'green' },
  FAILED: { label: 'Falló', color: 'red' },
  SENDING: { label: 'Enviando', color: 'blue' },
  PENDING: { label: 'Pendiente', color: 'yellow' },
} as const;

const channelOptions = [
  { value: 'ALL', label: 'Todos los canales' },
  { value: 'EMAIL', label: 'Correo' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
];

const statusOptions = [
  { value: 'ALL', label: 'Todos los estados' },
  { value: 'SENT', label: 'Enviado' },
  { value: 'FAILED', label: 'Falló' },
  { value: 'SENDING', label: 'Enviando' },
  { value: 'PENDING', label: 'Pendiente' },
];

function getStatusPresentation(status?: string | null) {
  if (status && status in statusPresentation) {
    return statusPresentation[status as keyof typeof statusPresentation];
  }
  return { label: status?.trim() || 'Estado desconocido', color: 'gray' };
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getDeliverySearchValue(delivery: Delivery) {
  return [
    delivery.recipient,
    delivery.subject,
    delivery.reference.label,
    delivery.reference.customer,
    delivery.reference.worksite,
    ...delivery.attachments,
  ].filter(Boolean).join(' ');
}

function DeliveryMetric({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: typeof IconSend;
}) {
  return (
    <Paper withBorder radius="lg" p="md">
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">{label}</Text>
          <Text fz={28} fw={750} lh={1.15} mt={4}>{value}</Text>
        </div>
        <ThemeIcon variant="light" color={color} radius="xl" size={42}>
          <Icon size={21} stroke={1.8} />
        </ThemeIcon>
      </Group>
    </Paper>
  );
}

const deliveryColumns: DataTableColumn<Delivery>[] = [
  {
    id: 'reference',
    header: 'Referencia',
    ariaLabel: 'referencia',
    width: '20%',
    sortValue: (delivery) => delivery.reference.label,
    mobile: { priority: 'primary' },
    cell: (delivery) => {
      const presentation = getStatusPresentation(delivery.status);
      return (
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Text component={Link} href={delivery.reference.href} fw={700} size="sm" c="blue">
              {delivery.reference.label}
            </Text>
            <Text size="xs" c="dimmed" mt={3}>
              {[delivery.reference.customer, delivery.reference.worksite].filter(Boolean).join(' · ') ||
                'Sin cliente u obra'}
            </Text>
          </div>
          <Badge hiddenFrom="md" color={presentation.color} variant="light" size="sm">
            {presentation.label}
          </Badge>
        </Group>
      );
    },
  },
  {
    id: 'status',
    header: 'Estado',
    ariaLabel: 'estado',
    width: '13%',
    sortValue: (delivery) => delivery.status,
    mobile: false,
    cell: (delivery) => {
      const presentation = getStatusPresentation(delivery.status);
      return (
        <div>
          <Badge color={presentation.color} variant="light">{presentation.label}</Badge>
          {delivery.error ? <Text size="xs" c="red" mt={5}>{delivery.error}</Text> : null}
        </div>
      );
    },
  },
  {
    id: 'channel',
    header: 'Canal',
    ariaLabel: 'canal',
    width: '14%',
    sortValue: (delivery) => delivery.channel,
    mobile: { label: 'Canal', priority: 'detail' },
    cell: (delivery) => (
      <div>
        <Group gap={7} wrap="nowrap">
          {delivery.channel === 'EMAIL' ? (
            <IconMail size={17} color="#2563eb" />
          ) : (
            <IconBrandWhatsapp size={18} color="#16a34a" />
          )}
          <Text size="sm" fw={650}>{delivery.channel === 'EMAIL' ? 'Correo' : 'WhatsApp'}</Text>
        </Group>
        <Text size="xs" c="dimmed" mt={3}>
          {delivery.kind === 'FINAL' ? 'Documento final' : 'Borrador'}
        </Text>
      </div>
    ),
  },
  {
    id: 'recipient',
    header: 'Destinatario',
    ariaLabel: 'destinatario',
    width: '22%',
    sortValue: (delivery) => delivery.recipient,
    mobile: { label: 'Destinatario', priority: 'detail' },
    cell: (delivery) => (
      <div>
        <Text size="sm" fw={600}>{delivery.recipient}</Text>
        <Text size="xs" c="dimmed" mt={3}>{delivery.subject}</Text>
      </div>
    ),
  },
  {
    id: 'content',
    header: 'Contenido',
    width: '18%',
    mobile: { label: 'Archivos', priority: 'detail' },
    cell: (delivery) => delivery.attachments.length ? (
      <Stack gap={2}>
        {delivery.attachments.slice(0, 2).map((attachment) => (
          <Text key={attachment} size="xs">{attachment}</Text>
        ))}
        {delivery.attachments.length > 2 ? (
          <Text size="xs" c="dimmed">+{delivery.attachments.length - 2} archivos</Text>
        ) : null}
      </Stack>
    ) : <Text size="xs" c="dimmed">Sin archivo registrado</Text>,
  },
  {
    id: 'date',
    header: 'Fecha',
    ariaLabel: 'fecha',
    width: '13%',
    sortValue: (delivery) => new Date(delivery.sentAt || delivery.createdAt),
    mobile: { label: 'Fecha', priority: 'detail' },
    cell: (delivery) => (
      <div>
        <Text size="sm">{formatDateTime(delivery.sentAt || delivery.createdAt)}</Text>
        {delivery.legacy ? <Text size="xs" c="dimmed" mt={3}>Registro anterior</Text> : null}
      </div>
    ),
  },
];

export default function NotificationDeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState<string | null>('ALL');
  const [status, setStatus] = useState<string | null>('ALL');

  const loadDeliveries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api<unknown>('/notifications/deliveries?limit=300');
      if (!Array.isArray(response)) {
        const serverMessage = response && typeof response === 'object' && 'message' in response &&
          typeof response.message === 'string' ? response.message : null;
        throw new Error(serverMessage || 'El servidor respondió con un formato inesperado.');
      }
      setDeliveries(response as Delivery[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar el historial.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDeliveries();
  }, [loadDeliveries]);

  const filteredDeliveries = useMemo(() => deliveries.filter((delivery) => {
    if (channel !== 'ALL' && delivery.channel !== channel) return false;
    if (status !== 'ALL' && delivery.status !== status) return false;
    return true;
  }), [channel, deliveries, status]);

  const notificationTable = useClientTableData({
    rows: filteredDeliveries,
    columns: deliveryColumns,
    search: query,
    searchValue: getDeliverySearchValue,
    initialPageSize: 20,
  });

  const metrics = useMemo(() => ({
    sent: deliveries.filter((item) => item.status === 'SENT').length,
    failed: deliveries.filter((item) => item.status === 'FAILED').length,
    email: deliveries.filter((item) => item.channel === 'EMAIL').length,
    whatsapp: deliveries.filter((item) => item.channel === 'WHATSAPP').length,
  }), [deliveries]);

  return (
    <AuthGuard allowedRoles={['ADMIN', 'OFFICE']}>
      <ResponsiveShell>
        <Container size="xl" py="md">
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start">
              <div>
                <Title order={2}>Centro de notificaciones</Title>
                <Text c="dimmed" mt={4}>Trazabilidad de documentos enviados por correo y WhatsApp.</Text>
              </div>
              <Button
                variant="light"
                leftSection={<IconRefresh size={16} />}
                onClick={() => void loadDeliveries()}
                loading={loading}
              >
                Actualizar
              </Button>
            </Group>

            <SimpleGrid cols={{ base: 2, md: 4 }}>
              <DeliveryMetric label="Enviados" value={metrics.sent} color="green" icon={IconCheck} />
              <DeliveryMetric label="Fallidos" value={metrics.failed} color="red" icon={IconAlertTriangle} />
              <DeliveryMetric label="Correos" value={metrics.email} color="blue" icon={IconMail} />
              <DeliveryMetric label="WhatsApp" value={metrics.whatsapp} color="green" icon={IconBrandWhatsapp} />
            </SimpleGrid>

            {error ? <Alert color="red" title="No se pudo cargar">{error}</Alert> : null}

            <Paper withBorder radius="lg" p={{ base: 'md', md: 'lg' }}>
              <DataTableToolbar
                title="Historial de envíos"
                description={loading ? 'Cargando historial...' : `${notificationTable.filteredTotal} envíos encontrados`}
              >
                <TextInput
                  aria-label="Buscar en el historial"
                  placeholder="Documento, cliente o destinatario"
                  leftSection={<IconSearch size={15} />}
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  w={{ base: '100%', sm: 280 }}
                />
                <Select
                  aria-label="Filtrar por canal"
                  value={channel}
                  onChange={setChannel}
                  allowDeselect={false}
                  data={channelOptions}
                  w={{ base: '100%', sm: 180 }}
                />
                <Select
                  aria-label="Filtrar por estado"
                  value={status}
                  onChange={setStatus}
                  allowDeselect={false}
                  data={statusOptions}
                  w={{ base: '100%', sm: 180 }}
                />
              </DataTableToolbar>

              <EntityDataTable
                rows={notificationTable.rows}
                columns={deliveryColumns}
                getRowId={(delivery) => delivery.id}
                loading={loading}
                sort={notificationTable.sort}
                onSortChange={notificationTable.onSortChange}
                pagination={notificationTable.pagination}
                onPageSizeChange={notificationTable.onPageSizeChange}
                tableMinWidth={900}
                emptyState={{
                  title: 'No hay envíos para mostrar',
                  description: 'Prueba cambiando la búsqueda o los filtros seleccionados.',
                }}
              />
            </Paper>
          </Stack>
        </Container>
      </ResponsiveShell>
    </AuthGuard>
  );
}
