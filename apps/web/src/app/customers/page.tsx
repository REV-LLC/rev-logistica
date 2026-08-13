'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Badge,
  Button,
  Container,
  FileInput,
  Group,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconBuildingEstate,
  IconEye,
  IconFileCheck,
  IconFileText,
  IconLink,
  IconPencil,
  IconPlus,
  IconRoad,
  IconSearch,
  IconUpload,
  IconUsersGroup,
} from '@tabler/icons-react';
import FileAttachmentsPanel from '@/components/FileAttachmentsPanel';
import DataTableToolbar from '@/components/tables/DataTableToolbar';
import EntityDataTable from '@/components/tables/EntityDataTable';
import type { DataTableColumn } from '@/components/tables/table.types';
import { useClientTableData } from '@/components/tables/useClientTableData';
import { api, ApiError } from '@/lib/api';

type Customer = {
  id: string;
  name: string;
  nitOrId: string | null;
  phone: string | null;
  email: string | null;
  documentsEmail: string | null;
  active: boolean;
  createdAt: string;
};

type CustomerWorksite = {
  id: string;
  alias: string | null;
  active: boolean;
  worksite: {
    id: string;
    name: string;
    address: string | null;
    active: boolean;
  };
};

type CustomerForm = {
  name: string;
  nitOrId: string;
  phone: string;
  email: string;
  documentsEmail: string;
  active: boolean;
  initialWorksiteName: string;
  initialWorksiteAlias: string;
  initialWorksiteAddress: string;
  initialWorksiteActive: boolean;
};

type ParsedRutCustomer = {
  name: string | null;
  nitOrId: string | null;
  phone: string | null;
};

const emptyForm: CustomerForm = {
  name: '',
  nitOrId: '',
  phone: '',
  email: '',
  documentsEmail: '',
  active: true,
  initialWorksiteName: '',
  initialWorksiteAlias: '',
  initialWorksiteAddress: '',
  initialWorksiteActive: true,
};

const breakableTextStyle = {
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
} as const;

function CustomerDetails({
  customer,
  worksites,
  worksitesLoading,
  worksitesError,
  onEdit,
  onCreateUpdateLink,
}: {
  customer: Customer;
  worksites: CustomerWorksite[];
  worksitesLoading: boolean;
  worksitesError: string | null;
  onEdit?: (customer: Customer) => void;
  onCreateUpdateLink?: (customer: Customer) => void;
}) {
  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={700} size="lg">
            {customer.name}
          </Text>
          <Text size="sm" c="dimmed">
            Cliente registrado
          </Text>
        </div>
        <Badge color={customer.active ? 'green' : 'gray'} variant="light">
          {customer.active ? 'Activo' : 'Inactivo'}
        </Badge>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <Paper withBorder radius="md" p="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Identificacion
          </Text>
          <Text size="sm" mt={8}>
            {customer.nitOrId ?? '-'}
          </Text>
        </Paper>

        <Paper withBorder radius="md" p="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Contacto
          </Text>
          <Text size="sm" mt={8}>
            {customer.phone ?? '-'}
          </Text>
        </Paper>

        <Paper withBorder radius="md" p="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Correo
          </Text>
          <Text size="sm" mt={8}>
            {customer.email ?? '-'}
          </Text>
        </Paper>

        <Paper withBorder radius="md" p="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Correo documentos
          </Text>
          <Text size="sm" mt={8}>
            {customer.documentsEmail ?? '-'}
          </Text>
        </Paper>
      </SimpleGrid>

      <Stack gap="sm">
        <Group justify="space-between">
          <div>
            <Text fw={800}>Obras vinculadas</Text>
            <Text size="sm" c="dimmed">
              Frentes de trabajo asociados a este cliente
            </Text>
          </div>
          <Badge color="blue" variant="light">
            {worksites.length}
          </Badge>
        </Group>

        {worksitesLoading ? (
          <Paper radius="md" p="md" bg="gray.0">
            <Text size="sm" c="dimmed" ta="center">Cargando obras...</Text>
          </Paper>
        ) : null}

        {worksitesError ? <Alert color="red">{worksitesError}</Alert> : null}

        {!worksitesLoading && !worksitesError && worksites.length === 0 ? (
          <Paper radius="md" p="md" bg="gray.0">
            <Text size="sm" c="dimmed" ta="center">Este cliente no tiene obras vinculadas.</Text>
          </Paper>
        ) : null}

        {!worksitesLoading && worksites.length ? (
          <Stack gap="xs">
            {worksites.map((entry) => (
              <Paper key={entry.id} withBorder radius="md" p="sm">
                <Group justify="space-between" align="center" gap="sm" wrap="nowrap">
                  <div style={{ minWidth: 0 }}>
                    <Text fw={700} size="sm">{entry.worksite.name}</Text>
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      {entry.alias ?? 'Sin alias'} · {entry.worksite.address ?? 'Sin dirección'}
                    </Text>
                  </div>
                  <Button
                    component={Link}
                    href={`/transport/worksites/${entry.id}`}
                    size="xs"
                    variant="default"
                    style={{ flexShrink: 0 }}
                  >
                    Abrir
                  </Button>
                </Group>
              </Paper>
            ))}
          </Stack>
        ) : null}
      </Stack>

      {onEdit ? (
        <Group className="mobile-actions">
          {onCreateUpdateLink ? (
            <Button variant="default" leftSection={<IconLink size={16} />} onClick={() => onCreateUpdateLink(customer)}>
              Copiar enlace de actualización
            </Button>
          ) : null}
          <Button variant="light" onClick={() => onEdit(customer)}>
            Editar
          </Button>
        </Group>
      ) : null}
    </Stack>
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updateLinkMessage, setUpdateLinkMessage] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [detailsCustomer, setDetailsCustomer] = useState<Customer | null>(null);
  const [detailWorksites, setDetailWorksites] = useState<CustomerWorksite[]>([]);
  const [detailWorksitesLoading, setDetailWorksitesLoading] = useState(false);
  const [detailWorksitesError, setDetailWorksitesError] = useState<string | null>(null);
  const [documentsCustomer, setDocumentsCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [rutFile, setRutFile] = useState<File | null>(null);
  const [rutParsing, setRutParsing] = useState(false);
  const [rutParseMessage, setRutParseMessage] = useState<string | null>(null);
  const [rutParseStatus, setRutParseStatus] = useState<'success' | 'error' | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const loadCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<Customer[]>('/customers', { method: 'GET' });
      setCustomers(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error cargando clientes');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const metrics = useMemo(() => {
    const activeCount = customers.filter((customer) => customer.active).length;
    return {
      total: customers.length,
      active: activeCount,
    };
  }, [customers]);

  const openCreate = () => {
    setEditingCustomer(null);
    setForm(emptyForm);
    setRutFile(null);
    setRutParseMessage(null);
    setRutParseStatus(null);
    setModalOpen(true);
  };

  const createUpdateLink = async (customer: Customer) => {
    try {
      const result = await api<{ token: string; expiresAt: string }>(`/customers/${customer.id}/update-link`, { method: 'POST' });
      const link = `${window.location.origin}/actualizar-datos?token=${result.token}`;
      await navigator.clipboard.writeText(link);
      setUpdateLinkMessage(`Enlace copiado. Vence el ${new Date(result.expiresAt).toLocaleDateString('es-CO')}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el enlace.');
    }
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setRutFile(null);
    setRutParseMessage(null);
    setRutParseStatus(null);
    setForm({
      name: customer.name ?? '',
      nitOrId: customer.nitOrId ?? '',
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      documentsEmail: customer.documentsEmail ?? '',
      active: customer.active,
      initialWorksiteName: '',
      initialWorksiteAlias: '',
      initialWorksiteAddress: '',
      initialWorksiteActive: true,
    });
    setModalOpen(true);
  };

  const openDetails = async (customer: Customer) => {
    setDetailsCustomer(customer);
    setDetailWorksites([]);
    setDetailWorksitesError(null);
    setDetailWorksitesLoading(true);

    try {
      setDetailWorksites(
        await api<CustomerWorksite[]>(`/customers/${customer.id}/worksites`, { method: 'GET' }),
      );
    } catch (detailError) {
      setDetailWorksitesError(
        detailError instanceof ApiError
          ? `${detailError.status}: ${detailError.message}`
          : 'No se pudieron cargar las obras del cliente.',
      );
    } finally {
      setDetailWorksitesLoading(false);
    }
  };

  const closeFormModal = () => {
    setModalOpen(false);
    setEditingCustomer(null);
    setForm(emptyForm);
    setRutFile(null);
    setRutParseMessage(null);
    setRutParseStatus(null);
  };

  const parseRutPdf = async () => {
    if (!rutFile) {
      setRutParseMessage('Selecciona un PDF del RUT');
      setRutParseStatus('error');
      return;
    }
    if (rutFile.type !== 'application/pdf') {
      setRutParseMessage('El RUT debe ser un PDF');
      setRutParseStatus('error');
      return;
    }

    setRutParsing(true);
    setRutParseMessage(null);
    setRutParseStatus(null);
    try {
      const formData = new FormData();
      formData.append('rut', rutFile);
      const parsed = await api<ParsedRutCustomer>('/customers/parse-rut', {
        method: 'POST',
        body: formData,
      });

      setForm((prev) => ({
        ...prev,
        name: parsed.name ?? prev.name,
        nitOrId: parsed.nitOrId ?? prev.nitOrId,
        phone: parsed.phone ?? prev.phone,
      }));
      setRutParseMessage('Datos del RUT cargados. Revisa la informacion antes de guardar.');
      setRutParseStatus('success');
    } catch (err) {
      if (err instanceof ApiError) {
        setRutParseMessage(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setRutParseMessage(err.message);
      } else {
        setRutParseMessage('Error leyendo el RUT');
      }
      setRutParseStatus('error');
    } finally {
      setRutParsing(false);
    }
  };

  const saveCustomer = async () => {
    setError(null);

    if (!form.name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (!editingCustomer && !form.initialWorksiteName.trim()) {
      setError('La primera obra es obligatoria al crear el cliente');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim().toUpperCase(),
        nitOrId: form.nitOrId.trim().toUpperCase() || undefined,
        phone: form.phone.trim().toUpperCase() || undefined,
        email: form.email.trim().toLowerCase() || undefined,
        documentsEmail: form.documentsEmail.trim().toLowerCase() || undefined,
        active: editingCustomer ? form.active : true,
        initialWorksite: editingCustomer
          ? undefined
          : {
              name: form.initialWorksiteName.trim().toUpperCase(),
              alias: form.initialWorksiteAlias.trim().toUpperCase() || undefined,
              address: form.initialWorksiteAddress.trim().toUpperCase() || undefined,
              active: true,
            },
      };

      if (editingCustomer) {
        await api(`/customers/${editingCustomer.id}`, {
          method: 'PATCH',
          json: payload,
        });
      } else {
        await api('/customers', {
          method: 'POST',
          json: payload,
        });
      }

      closeFormModal();
      await loadCustomers();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error guardando cliente');
      }
    } finally {
      setSaving(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesSearch =
        !term ||
        [
          customer.name,
          customer.nitOrId,
          customer.phone,
          customer.email,
          customer.documentsEmail,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(term));
      const matchesStatus =
        !statusFilter ||
        (statusFilter === 'active' ? customer.active : !customer.active);
      return matchesSearch && matchesStatus;
    });
  }, [customers, search, statusFilter]);

  const customerColumns: DataTableColumn<Customer>[] = [
    {
      id: 'name',
      header: 'Cliente',
      ariaLabel: 'cliente',
      width: '20%',
      sortValue: (customer) => customer.name,
      mobile: { priority: 'primary' },
      cell: (customer) => (
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div style={{ minWidth: 0 }}>
            <Text fw={700} style={breakableTextStyle}>{customer.name}</Text>
            <Text visibleFrom="md" size="sm" c="dimmed">
              Cliente registrado
            </Text>
            <Text hiddenFrom="md" size="sm" c="dimmed" style={breakableTextStyle}>
              {customer.nitOrId ?? 'Sin documento'}
            </Text>
          </div>
          <Badge hiddenFrom="md" color={customer.active ? 'green' : 'gray'} variant="light">
            {customer.active ? 'Activo' : 'Inactivo'}
          </Badge>
        </Group>
      ),
    },
    {
      id: 'identification',
      header: 'Identificacion',
      ariaLabel: 'identificación',
      width: '14%',
      sortValue: (customer) => customer.nitOrId,
      mobile: false,
      cell: (customer) => <Text style={breakableTextStyle}>{customer.nitOrId ?? '-'}</Text>,
    },
    {
      id: 'contact',
      header: 'Contacto',
      width: '22%',
      mobile: { label: 'Contacto', priority: 'secondary' },
      cell: (customer) => (
        <Stack gap={2}>
          <Text size="sm" style={breakableTextStyle}>{customer.phone ?? 'Sin telefono'}</Text>
          <Text size="xs" c="dimmed" style={breakableTextStyle}>{customer.email ?? 'Sin correo'}</Text>
        </Stack>
      ),
    },
    {
      id: 'documentsEmail',
      header: 'Correo documentos',
      ariaLabel: 'correo de documentos',
      width: '18%',
      sortValue: (customer) => customer.documentsEmail,
      mobile: { label: 'Correo documentos', priority: 'detail' },
      cell: (customer) => <Text size="sm" style={breakableTextStyle}>{customer.documentsEmail ?? '-'}</Text>,
    },
    {
      id: 'status',
      header: 'Estado',
      ariaLabel: 'estado',
      width: '10%',
      sortValue: (customer) => customer.active,
      mobile: { priority: 'hidden' },
      cell: (customer) => (
        <Badge color={customer.active ? 'green' : 'gray'} variant="light">
          {customer.active ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
  ];

  const customerTable = useClientTableData({
    rows: filteredCustomers,
    columns: customerColumns,
    initialPageSize: 20,
  });

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {updateLinkMessage ? (
          <Alert color="green" withCloseButton onClose={() => setUpdateLinkMessage(null)}>
            {updateLinkMessage}
          </Alert>
        ) : null}
        <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
          <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
            <div>
              <Group gap="xs" mb={6}>
                <ThemeIcon color="green" variant="light" size={34} radius="xl">
                  <IconUsersGroup size={18} />
                </ThemeIcon>
                <Badge color="green" variant="light">
                  {metrics.active} activos
                </Badge>
              </Group>
              <Title order={2}>Clientes</Title>
              <Text c="dimmed" size="sm" maw={680}>
                Centraliza informacion comercial, contactos y documentos del cliente para operar sin buscar en varias fuentes.
              </Text>
            </div>
            <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
              Nuevo cliente
            </Button>
          </Group>
        </Paper>

        {error ? (
          <Alert color="red" variant="light" title="No se pudo completar la accion">
            {error}
          </Alert>
        ) : null}

        <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
          <DataTableToolbar
            title="Directorio de clientes"
            description={`${filteredCustomers.length} de ${metrics.total} clientes visibles`}
          >
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Buscar cliente, NIT, telefono o correo"
              leftSection={<IconSearch size={16} />}
              style={{ flex: '1 1 300px' }}
            />
            <Select
              aria-label="Filtrar clientes por estado"
              placeholder="Todos los estados"
              clearable
              value={statusFilter}
              onChange={setStatusFilter}
              data={[
                { value: 'active', label: 'Activos' },
                { value: 'inactive', label: 'Inactivos' },
              ]}
              w={170}
            />
          </DataTableToolbar>
          <EntityDataTable
            rows={customerTable.rows}
            columns={customerColumns}
            getRowId={(customer) => customer.id}
            loading={loading}
            sort={customerTable.sort}
            onSortChange={customerTable.onSortChange}
            pagination={customerTable.pagination}
            onPageSizeChange={customerTable.onPageSizeChange}
            emptyState={{
              title: customers.length ? 'No hay resultados' : 'No hay clientes registrados',
              description: customers.length
                ? 'Ajusta la busqueda para ver mas clientes.'
                : 'Crea un nuevo cliente para empezar.',
              icon: <IconUsersGroup size={20} />,
            }}
            actions={(customer) => [
              {
                key: 'view',
                label: `Ver detalle de ${customer.name}`,
                icon: <IconEye size={16} />,
                color: 'blue',
                onClick: () => void openDetails(customer),
              },
              {
                key: 'documents',
                label: `Documentos de ${customer.name}`,
                icon: <IconFileText size={16} />,
                color: 'violet',
                onClick: () => setDocumentsCustomer(customer),
              },
              {
                key: 'edit',
                label: `Editar ${customer.name}`,
                icon: <IconPencil size={16} />,
                onClick: () => openEdit(customer),
              },
            ]}
          />
        </Paper>
      </Stack>

      <Modal
        opened={!!detailsCustomer}
        onClose={() => {
          setDetailsCustomer(null);
          setDetailWorksites([]);
          setDetailWorksitesError(null);
        }}
        title="Detalle de cliente"
        centered
        size="lg"
      >
        {detailsCustomer ? (
          <CustomerDetails
            customer={detailsCustomer}
            worksites={detailWorksites}
            worksitesLoading={detailWorksitesLoading}
            worksitesError={detailWorksitesError}
            onEdit={(customer) => {
              setDetailsCustomer(null);
              openEdit(customer);
            }}
            onCreateUpdateLink={createUpdateLink}
          />
        ) : null}
      </Modal>

      <Modal
        opened={!!documentsCustomer}
        onClose={() => setDocumentsCustomer(null)}
        title="Documentos del cliente"
        centered
        size="xl"
      >
        {documentsCustomer ? (
          <Stack gap="md">
            <Paper withBorder radius="lg" p="md" bg="gray.0">
              <Group justify="space-between" align="flex-start" gap="sm" wrap="wrap">
                <div>
                  <Text fw={800}>{documentsCustomer.name}</Text>
                  <Text size="sm" c="dimmed">
                    {documentsCustomer.nitOrId ?? 'Sin identificacion'} · {documentsCustomer.documentsEmail ?? 'Sin correo de documentos'}
                  </Text>
                </div>
                <Badge color={documentsCustomer.active ? 'green' : 'gray'} variant="light">
                  {documentsCustomer.active ? 'Activo' : 'Inactivo'}
                </Badge>
              </Group>
            </Paper>
            <FileAttachmentsPanel
              entityType="CUSTOMER"
              entityId={documentsCustomer.id}
              title="Archivo documental"
            />
          </Stack>
        ) : null}
      </Modal>

      <Modal
        opened={modalOpen}
        onClose={closeFormModal}
        title={editingCustomer ? 'Editar cliente' : 'Nuevo cliente'}
        centered
        size="lg"
      >
        <Stack gap="lg">
          {editingCustomer ? (
            <Paper
              withBorder
              radius="lg"
              p="md"
              style={{
                background:
                  'linear-gradient(135deg, rgba(248,250,252,0.96) 0%, rgba(240,253,244,0.96) 100%)',
              }}
            >
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text fw={700}>{editingCustomer.name}</Text>
                  <Text size="sm" c="dimmed">
                    {editingCustomer.nitOrId ?? 'Sin documento'}
                  </Text>
                </div>
                <Badge color={form.active ? 'green' : 'gray'} variant="light">
                  {form.active ? 'Activo' : 'Inactivo'}
                </Badge>
              </Group>
            </Paper>
          ) : null}

          {!editingCustomer ? (
            <Paper withBorder radius="lg" p="md">
              <Stack gap="md">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={700}>RUT en PDF</Text>
                    <Text size="sm" c="dimmed">
                      Precarga nombre, NIT y telefono desde el documento.
                    </Text>
                  </div>
                  <ThemeIcon color="green" variant="light" size={32} radius="xl">
                    <IconFileCheck size={16} />
                  </ThemeIcon>
                </Group>

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <FileInput
                    accept="application/pdf,.pdf"
                    label="Archivo RUT"
                    placeholder="Seleccionar PDF"
                    value={rutFile}
                    onChange={(file) => {
                      setRutFile(file);
                      setRutParseMessage(null);
                      setRutParseStatus(null);
                    }}
                    clearable
                  />
                  <Group align="flex-end">
                    <Button
                      fullWidth
                      variant="light"
                      leftSection={<IconUpload size={16} />}
                      onClick={parseRutPdf}
                      disabled={!rutFile}
                      loading={rutParsing}
                    >
                      Leer RUT
                    </Button>
                  </Group>
                </SimpleGrid>

	                {rutParseMessage ? (
	                  <Alert
	                    color={rutParseStatus === 'error' ? 'red' : 'green'}
	                    variant="light"
	                    title={rutParseStatus === 'error' ? 'No se pudo leer el RUT' : 'RUT leido'}
	                  >
                    {rutParseMessage}
                  </Alert>
                ) : null}
              </Stack>
            </Paper>
          ) : null}

          <Paper withBorder radius="lg" p="md">
            <Stack gap="md">
              <div>
                <Text fw={700}>Perfil comercial</Text>
                <Text size="sm" c="dimmed">
                  Datos base para identificar y contactar al cliente.
                </Text>
              </div>

              <TextInput
                label="Nombre"
                placeholder="Razon social o nombre del cliente"
                value={form.name}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setForm((prev) => ({ ...prev, name: value }));
                }}
                required
              />

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  label="NIT / Documento"
                  placeholder="NIT o documento"
                  value={form.nitOrId}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((prev) => ({ ...prev, nitOrId: value }));
                  }}
                />
                <TextInput
                  label="Telefono"
                  placeholder="Numero de contacto"
                  value={form.phone}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((prev) => ({ ...prev, phone: value }));
                  }}
                />
                <TextInput
                  label="Correo"
                  placeholder="correo@cliente.com"
                  type="email"
                  value={form.email}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((prev) => ({ ...prev, email: value }));
                  }}
                />
                <TextInput
                  label="Correo para documentos"
                  placeholder="documentos@cliente.com"
                  type="email"
                  value={form.documentsEmail}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((prev) => ({ ...prev, documentsEmail: value }));
                  }}
                />
              </SimpleGrid>

              {editingCustomer ? (
                <Switch
                  checked={form.active}
                  label="Cliente activo"
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, active: event.currentTarget.checked }))
                  }
                />
              ) : null}
            </Stack>
          </Paper>

          {!editingCustomer ? (
            <Paper withBorder radius="lg" p="md">
              <Stack gap="md">
                <div>
                  <Group gap="xs">
                    <ThemeIcon color="green" variant="light" size={32} radius="xl">
                      <IconBuildingEstate size={16} />
                    </ThemeIcon>
                    <div>
                      <Text fw={700}>Obra inicial</Text>
                      <Text size="sm" c="dimmed">
                        Crea la primera obra junto con el cliente para dejar listo el arranque.
                      </Text>
                    </div>
                  </Group>
                </div>

                <TextInput
                  label="Nombre de la obra"
                  placeholder="Nombre principal de la obra"
                  value={form.initialWorksiteName}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((prev) => ({ ...prev, initialWorksiteName: value }));
                  }}
                  required
                />

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <TextInput
                    label="Alias de la obra"
                    placeholder="Nombre corto o referencia interna"
                    value={form.initialWorksiteAlias}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setForm((prev) => ({ ...prev, initialWorksiteAlias: value }));
                    }}
                  />
                  <TextInput
                    label="Direccion de la obra"
                    placeholder="Ubicacion principal o direccion"
                    value={form.initialWorksiteAddress}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setForm((prev) => ({ ...prev, initialWorksiteAddress: value }));
                    }}
                  />
                </SimpleGrid>

                <Paper radius="md" p="sm" bg="gray.0">
                  <Group gap="xs" wrap="nowrap">
                    <ThemeIcon color="gray" variant="light" size={28} radius="xl">
                      <IconRoad size={14} />
                    </ThemeIcon>
                    <Text size="sm" c="dimmed">
                      La obra inicial se creara activa junto con el cliente.
                    </Text>
                  </Group>
                </Paper>
              </Stack>
            </Paper>
          ) : null}

          <Group justify="flex-end" className="mobile-actions">
            <Button variant="default" onClick={closeFormModal}>
              Cancelar
            </Button>
            <Button onClick={saveCustomer} loading={saving}>
              {editingCustomer ? 'Guardar cambios' : 'Crear cliente'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
