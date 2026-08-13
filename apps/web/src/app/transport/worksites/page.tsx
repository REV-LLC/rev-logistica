'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconBuilding,
  IconBuildingEstate,
  IconExternalLink,
  IconPencil,
  IconPlus,
  IconSearch,
  IconUserCheck,
  IconUsersGroup,
  IconX,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import StatCard from '@/components/dashboard/StatCard';
import DataTableToolbar from '@/components/tables/DataTableToolbar';
import EntityDataTable from '@/components/tables/EntityDataTable';
import type { DataTableColumn } from '@/components/tables/table.types';
import { useClientTableData } from '@/components/tables/useClientTableData';
import { api, ApiError } from '@/lib/api';
import WorksiteAddressField from '@/components/worksites/WorksiteAddressField';

type Customer = {
  id: string;
  name: string;
  active: boolean;
};

type WorksiteRow = {
  id: string;
  alias: string | null;
  active: boolean;
  customer: {
    id: string;
    name: string;
    active: boolean;
  };
  worksite: {
    id: string;
    name: string;
    address: string | null;
    contactName: string | null;
    phone: string | null;
    active: boolean;
  };
};

type WorksiteForm = {
  customerId: string | null;
  name: string;
  address: string;
  contactName: string;
  phone: string;
  department: string | null;
  city: string | null;
  alias: string;
  active: boolean;
  worksiteActive: boolean;
};

const emptyForm: WorksiteForm = {
  customerId: null,
  name: '',
  address: '',
  contactName: '',
  phone: '',
  department: null,
  city: null,
  alias: '',
  active: true,
  worksiteActive: true,
};

function getInitialStatusFilter(value: string | null) {
  return value === 'active' || value === 'inactive' ? value : null;
}

type DepartmentOption = {
  value: string;
  label: string;
};

type CityOption = {
  value: string;
  label: string;
};

export default function WorksitesPage() {
  const searchParams = useSearchParams();
  const [worksites, setWorksites] = useState<WorksiteRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WorksiteRow | null>(null);
  const [form, setForm] = useState<WorksiteForm>(emptyForm);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [customerFilter, setCustomerFilter] = useState<string | null>(
    () => searchParams.get('customerId'),
  );
  const [statusFilter, setStatusFilter] = useState<string | null>(
    () => getInitialStatusFilter(searchParams.get('status')),
  );

  useEffect(() => {
    const nextParams = new URLSearchParams(window.location.search);

    if (search.trim()) {
      nextParams.set('q', search);
    } else {
      nextParams.delete('q');
    }

    if (customerFilter) {
      nextParams.set('customerId', customerFilter);
    } else {
      nextParams.delete('customerId');
    }

    if (statusFilter) {
      nextParams.set('status', statusFilter);
    } else {
      nextParams.delete('status');
    }

    const query = nextParams.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  }, [customerFilter, search, statusFilter]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [worksitesData, customersData] = await Promise.all([
        api<WorksiteRow[]>('/worksites', { method: 'GET' }),
        api<Customer[]>('/customers', { method: 'GET' }),
      ]);
      setWorksites(worksitesData);
      setCustomers(customersData);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error cargando obras');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadDepartments = async () => {
    setLocationsLoading(true);
    setLocationsError(null);
    try {
      const response = await api<{ name: string; code: string }[]>('/locations/departments', {
        method: 'GET',
      });
      setDepartments(
        response
          .map((department) => ({ value: department.code, label: department.name }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setLocationsError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setLocationsError(err.message);
      } else {
        setLocationsError('No se pudieron cargar departamentos y ciudades.');
      }
    } finally {
      setLocationsLoading(false);
    }
  };

  const loadCities = async (departmentCode: string) => {
    setLocationsLoading(true);
    setLocationsError(null);
    try {
      const response = await api<{ name: string }[]>(
        `/locations/cities?state=${encodeURIComponent(departmentCode)}`,
        { method: 'GET' },
      );
      setCities(
        response
          .map((city) => ({ value: city.name, label: city.name }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setLocationsError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setLocationsError(err.message);
      } else {
        setLocationsError('No se pudieron cargar ciudades.');
      }
    } finally {
      setLocationsLoading(false);
    }
  };

  useEffect(() => {
    loadDepartments();
  }, []);

  const metrics = useMemo(() => {
    const activeWorksites = worksites.filter((row) => row.worksite.active).length;
    const uniqueCustomers = new Set(worksites.map((row) => row.customer.id)).size;
    return {
      total: worksites.length,
      activeWorksites,
      uniqueCustomers,
    };
  }, [worksites]);

  const filteredWorksites = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return worksites.filter((row) => {
      const matchesSearch =
        !term ||
        [
          row.worksite.name,
          row.alias,
          row.customer.name,
          row.worksite.address,
          row.worksite.contactName,
          row.worksite.phone,
        ]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase('es').includes(term));
      const matchesCustomer = !customerFilter || row.customer.id === customerFilter;
      const matchesStatus =
        !statusFilter ||
        (statusFilter === 'active' ? row.worksite.active : !row.worksite.active);

      return matchesSearch && matchesCustomer && matchesStatus;
    });
  }, [customerFilter, search, statusFilter, worksites]);

  const hasActiveFilters = Boolean(search.trim() || customerFilter || statusFilter);

  const clearFilters = () => {
    setSearch('');
    setCustomerFilter(null);
    setStatusFilter(null);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setCities([]);
    setModalOpen(true);
  };

  const openEdit = (row: WorksiteRow) => {
    setEditing(row);
    setForm({
      customerId: row.customer.id,
      name: row.worksite.name ?? '',
      address: row.worksite.address ?? '',
      contactName: row.worksite.contactName ?? '',
      phone: row.worksite.phone ?? '',
      department: null,
      city: null,
      alias: row.alias ?? '',
      active: row.active,
      worksiteActive: row.worksite.active,
    });
    setCities([]);
    setModalOpen(true);
  };

  const closeFormModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setCities([]);
  };

  const selectedDepartmentName =
    departments.find((department) => department.value === form.department)?.label ??
    form.department ??
    '';

  const saveWorksite = async () => {
    setError(null);

    if (!form.customerId) {
      setError('Selecciona un cliente');
      return;
    }
    if (!form.name.trim()) {
      setError('El nombre de la obra es obligatorio');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await api(`/worksites/${editing.id}`, {
          method: 'PATCH',
          json: {
            customerId: form.customerId,
            name: form.name.trim().toUpperCase(),
            address: form.address.trim() || undefined,
            contactName: form.contactName.trim() || undefined,
            phone: form.phone.trim() || undefined,
            alias: form.alias.trim().toUpperCase() || undefined,
            active: form.active,
            worksiteActive: form.worksiteActive,
          },
        });
      } else {
        await api('/worksites', {
          method: 'POST',
          json: {
            customerId: form.customerId,
            name: form.name.trim().toUpperCase(),
            address: form.address.trim() || undefined,
            contactName: form.contactName.trim() || undefined,
            phone: form.phone.trim() || undefined,
            alias: form.alias.trim().toUpperCase() || undefined,
            active: true,
          },
        });
      }

      closeFormModal();
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error guardando obra');
      }
    } finally {
      setSaving(false);
    }
  };

  const worksiteColumns: DataTableColumn<WorksiteRow>[] = [
    {
      id: 'worksite',
      header: 'Obra',
      ariaLabel: 'obra',
      width: '22%',
      sortValue: (row) => row.worksite.name,
      mobile: { priority: 'primary' },
      cell: (row) => (
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2}>
            <Text fw={700}>{row.worksite.name}</Text>
            <Text size="sm" c="dimmed">{row.customer.name}</Text>
          </Stack>
          <Badge hiddenFrom="md" color={row.worksite.active ? 'green' : 'gray'} variant="light">
            {row.worksite.active ? 'Activo' : 'Inactivo'}
          </Badge>
        </Group>
      ),
    },
    {
      id: 'customer',
      header: 'Cliente',
      width: '20%',
      sortValue: (row) => row.customer.name,
      mobile: false,
      cell: (row) => <Text>{row.customer.name}</Text>,
    },
    {
      id: 'alias',
      header: 'Alias',
      width: '14%',
      sortValue: (row) => row.alias,
      mobile: { label: 'Alias', priority: 'secondary' },
      cell: (row) => row.alias ?? '-',
    },
    {
      id: 'address',
      header: 'Direccion',
      width: '28%',
      mobile: { label: 'Dirección', priority: 'detail' },
      cell: (row) => <Text size="sm" maw={280}>{row.worksite.address ?? 'Sin direccion'}</Text>,
    },
    {
      id: 'status',
      header: 'Estado',
      ariaLabel: 'estado',
      width: '10%',
      sortValue: (row) => row.worksite.active,
      mobile: { priority: 'hidden' },
      cell: (row) => (
        <Badge
          variant="light"
          color={row.worksite.active ? 'green' : 'gray'}
          style={{ minWidth: 74, justifyContent: 'center' }}
        >
          {row.worksite.active ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
  ];

  const worksiteTable = useClientTableData({
    rows: filteredWorksites,
    columns: worksiteColumns,
    initialPageSize: 20,
  });

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <PageHeaderCard
          title="Obras"
          description="Gestiona frentes de trabajo, clientes asociados y estado operativo desde una sola vista."
          icon={<IconBuildingEstate size={20} />}
          iconColor="blue"
          accentColor="rgba(59,130,246,0.12)"
          aside={
            <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
              Nueva obra
            </Button>
          }
        >
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <StatCard
              label="Total"
              value={String(metrics.total)}
              hint="Obras registradas"
              color="blue"
              icon={<IconBuildingEstate size={20} />}
            />
            <StatCard
              label="Obras activas"
              value={String(metrics.activeWorksites)}
              hint="Estado propio de la obra"
              color="teal"
              icon={<IconBuilding size={20} />}
            />
            <StatCard
              label="Clientes"
              value={String(metrics.uniqueCustomers)}
              hint="Con obras vinculadas"
              color="cyan"
              icon={<IconUsersGroup size={20} />}
            />
          </SimpleGrid>
        </PageHeaderCard>

        {error ? (
          <Alert color="red" variant="light" title="No se pudo completar la accion">
            {error}
          </Alert>
        ) : null}

        <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
          <DataTableToolbar
            title="Directorio de obras"
            description={`${filteredWorksites.length} de ${worksites.length} obras visibles`}
            mb="lg"
            controlsStyle={{ flex: '1 1 620px', justifyContent: 'flex-end' }}
          >
            <TextInput
              aria-label="Buscar obras"
              placeholder="Buscar obra, cliente, alias o dirección"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              leftSection={<IconSearch size={16} />}
              w="100%"
              flex={{ base: '1 1 100%', sm: '1 1 280px' }}
            />
            <Select
              aria-label="Filtrar obras por cliente"
              placeholder="Todos los clientes"
              searchable
              clearable
              value={customerFilter}
              onChange={setCustomerFilter}
              data={customers.map((customer) => ({ value: customer.id, label: customer.name }))}
              w="100%"
              flex={{ base: '1 1 100%', sm: '1 1 210px' }}
            />
            <Select
              aria-label="Filtrar obras por estado"
              placeholder="Todos los estados"
              clearable
              value={statusFilter}
              onChange={setStatusFilter}
              data={[
                { value: 'active', label: 'Activas' },
                { value: 'inactive', label: 'Inactivas' },
              ]}
              w="100%"
              flex={{ base: '1 1 100%', sm: '0 0 150px' }}
            />
            {hasActiveFilters ? (
              <Button
                variant="subtle"
                color="gray"
                leftSection={<IconX size={15} />}
                onClick={clearFilters}
              >
                Limpiar
              </Button>
            ) : null}
          </DataTableToolbar>
          <EntityDataTable
            rows={worksiteTable.rows}
            columns={worksiteColumns}
            getRowId={(row) => row.id}
            loading={loading}
            sort={worksiteTable.sort}
            onSortChange={worksiteTable.onSortChange}
            pagination={worksiteTable.pagination}
            onPageSizeChange={worksiteTable.onPageSizeChange}
            emptyState={{
              title: worksites.length ? 'No hay resultados' : 'No hay obras registradas',
              description: worksites.length
                ? 'Ajusta o limpia los filtros para ver más obras.'
                : 'Crea una obra para empezar.',
              icon: <IconBuildingEstate size={20} />,
            }}
            actions={(row) => [
              {
                key: 'open',
                label: `Abrir ${row.worksite.name}`,
                icon: <IconExternalLink size={16} />,
                color: 'blue',
                href: `/transport/worksites/${row.id}`,
              },
              {
                key: 'edit',
                label: `Editar ${row.worksite.name}`,
                icon: <IconPencil size={16} />,
                onClick: () => openEdit(row),
              },
            ]}
          />
        </Paper>
      </Stack>

      <Modal
        opened={modalOpen}
        onClose={closeFormModal}
        title={editing ? 'Editar obra' : 'Nueva obra'}
        centered
        size="lg"
      >
        <Stack gap="lg">
          {editing ? (
            <Paper
              withBorder
              radius="lg"
              p="md"
              style={{
                background:
                  'linear-gradient(135deg, rgba(248,250,252,0.96) 0%, rgba(239,246,255,0.96) 100%)',
              }}
            >
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text fw={700}>{editing.worksite.name}</Text>
                  <Text size="sm" c="dimmed">
                    {editing.customer.name}
                  </Text>
                </div>
                <Badge color={form.worksiteActive ? 'green' : 'gray'} variant="light">
                  {form.worksiteActive ? 'Obra activa' : 'Obra inactiva'}
                </Badge>
              </Group>
            </Paper>
          ) : null}

          <Paper withBorder radius="lg" p="md">
            <Stack gap="md">
              <div>
                <Text fw={700}>Vinculacion</Text>
                <Text size="sm" c="dimmed">
                  Define el cliente dueño de esta obra y el nombre operativo visible.
                </Text>
              </div>

              <Select
                label="Cliente"
                placeholder="Selecciona un cliente"
                value={form.customerId}
                onChange={(value) => setForm((prev) => ({ ...prev, customerId: value }))}
                data={customers.map((customer) => ({
                  value: customer.id,
                  label: customer.name,
                }))}
                searchable
                clearable
                required
              />

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  label="Nombre de la obra"
                  placeholder="Nombre principal de la obra"
                  value={form.name}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((prev) => ({ ...prev, name: value }));
                  }}
                  required
                />
                <TextInput
                  label="Alias"
                  placeholder="Short reference or internal name"
                  value={form.alias}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((prev) => ({ ...prev, alias: value }));
                  }}
                />
              </SimpleGrid>
            </Stack>
          </Paper>

          <Paper withBorder radius="lg" p="md">
            <Stack gap="md">
              <div>
                <Text fw={700}>Ubicación</Text>
                <Text size="sm" c="dimmed">
                  Registra la dirección para referencia operativa y revisa la sugerencia antes de aplicarla.
                </Text>
              </div>

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <Select
                  label="Departamento"
                  placeholder="Opcional"
                  data={departments}
                  value={form.department}
                  onChange={(value) => {
                    setForm((prev) => ({ ...prev, department: value, city: null }));
                    setCities([]);
                    if (value) loadCities(value);
                  }}
                  searchable
                  clearable
                  disabled={locationsLoading}
                  className="select-pointer"
                />
                <Select
                  label="Ciudad"
                  placeholder={form.department ? 'Opcional' : 'Selecciona departamento'}
                  data={cities}
                  value={form.city}
                  onChange={(value) => setForm((prev) => ({ ...prev, city: value }))}
                  searchable
                  clearable
                  disabled={!form.department || locationsLoading}
                  className="select-pointer"
                />
              </SimpleGrid>

              {locationsError ? (
                <Alert color="yellow" variant="light" title="No se pudieron cargar ubicaciones">
                  {locationsError}
                </Alert>
              ) : null}

              <WorksiteAddressField
                value={form.address}
                department={selectedDepartmentName}
                city={form.city}
                onChange={(value) => {
                  setForm((prev) => ({ ...prev, address: value }));
                }}
              />

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  label="Encargado en obra"
                  placeholder="Nombre de la persona de contacto"
                  value={form.contactName}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((prev) => ({ ...prev, contactName: value }));
                  }}
                />
                <TextInput
                  label="Teléfono en obra"
                  placeholder="Número de contacto"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((prev) => ({ ...prev, phone: value }));
                  }}
                />
              </SimpleGrid>

            </Stack>
          </Paper>

          {editing ? (
            <Paper withBorder radius="lg" p="md">
              <Stack gap="md">
                <div>
                  <Text fw={700}>Estado operativo</Text>
                  <Text size="sm" c="dimmed">
                    Controla si la obra sigue disponible para operaciones.
                  </Text>
                </div>

                <Switch
                  label="Relacion activa"
                  checked={form.active}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, active: event.currentTarget.checked }))
                  }
                />
                <Switch
                  label="Obra activa"
                  checked={form.worksiteActive}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, worksiteActive: event.currentTarget.checked }))
                  }
                />
              </Stack>
            </Paper>
          ) : null}

          <Group justify="flex-end" className="mobile-actions">
            <Button variant="default" onClick={closeFormModal}>
              Cancelar
            </Button>
            <Button onClick={saveWorksite} loading={saving}>
              {editing ? 'Guardar cambios' : 'Crear obra'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
