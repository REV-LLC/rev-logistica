'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconBuilding,
  IconBuildingEstate,
  IconExternalLink,
  IconEye,
  IconMapPin,
  IconPlus,
  IconUserCheck,
  IconUsersGroup,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import StatCard from '@/components/dashboard/StatCard';
import { api, ApiError } from '@/lib/api';

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
    active: boolean;
  };
};

type WorksiteForm = {
  customerId: string | null;
  name: string;
  address: string;
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
  department: null,
  city: null,
  alias: '',
  active: true,
  worksiteActive: true,
};

type DepartmentOption = {
  value: string;
  label: string;
};

type CityOption = {
  value: string;
  label: string;
};

type AddressValidationResponse = {
  inputAddress: string;
  formattedAddress: string;
  context: {
    department: string | null;
    city: string | null;
  };
  googleContext: {
    department: string | null;
    city: string | null;
  };
  placeId: string | null;
  location: { lat: number; lng: number } | null;
  verdict: {
    inputGranularity: string | null;
    validationGranularity: string | null;
    geocodeGranularity: string | null;
    hasInferredComponents: boolean;
    hasReplacedComponents: boolean;
    hasUnconfirmedComponents: boolean;
  };
};

function getMapsQuery(addressValidation: AddressValidationResponse) {
  if (addressValidation.location) {
    return `${addressValidation.location.lat},${addressValidation.location.lng}`;
  }
  return addressValidation.formattedAddress;
}

function getGoogleMapsSearchUrl(addressValidation: AddressValidationResponse) {
  const params = new URLSearchParams({
    api: '1',
    query: getMapsQuery(addressValidation),
  });
  if (addressValidation.placeId) {
    params.set('query_place_id', addressValidation.placeId);
  }
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

function getGoogleMapsPreviewUrl(addressValidation: AddressValidationResponse) {
  const params = new URLSearchParams({
    q: getMapsQuery(addressValidation),
    z: '17',
    output: 'embed',
  });
  return `https://www.google.com/maps?${params.toString()}`;
}

function WorksiteDetails({
  row,
  onEdit,
}: {
  row: WorksiteRow;
  onEdit?: (row: WorksiteRow) => void;
}) {
  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={700} size="lg">
            {row.worksite.name}
          </Text>
          <Text size="sm" c="dimmed">
            {row.alias ?? 'Sin alias'}
          </Text>
        </div>
        <Stack gap="xs" align="flex-end">
          <Badge color={row.worksite.active ? 'green' : 'gray'} variant="light">
            Obra {row.worksite.active ? 'activa' : 'inactiva'}
          </Badge>
        </Stack>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <Paper withBorder radius="md" p="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Cliente
          </Text>
          <Text size="sm" mt={8}>
            {row.customer.name}
          </Text>
        </Paper>

        <Paper withBorder radius="md" p="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Direccion
          </Text>
          <Text size="sm" mt={8}>
            {row.worksite.address ?? '-'}
          </Text>
        </Paper>
      </SimpleGrid>

      <Group className="mobile-actions">
        <Button
          variant="default"
          component={Link}
          href={`/transport/worksites/${row.id}`}
        >
          Abrir obra
        </Button>
        {onEdit ? (
          <Button variant="light" onClick={() => onEdit(row)}>
            Editar
          </Button>
        ) : null}
      </Group>
    </Stack>
  );
}

export default function WorksitesPage() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [worksites, setWorksites] = useState<WorksiteRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WorksiteRow | null>(null);
  const [detailsRow, setDetailsRow] = useState<WorksiteRow | null>(null);
  const [form, setForm] = useState<WorksiteForm>(emptyForm);
  const [addressValidation, setAddressValidation] = useState<AddressValidationResponse | null>(null);
  const [addressValidationError, setAddressValidationError] = useState<string | null>(null);
  const [addressValidationLoading, setAddressValidationLoading] = useState(false);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);

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

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setCities([]);
    setAddressValidation(null);
    setAddressValidationError(null);
    setModalOpen(true);
  };

  const openEdit = (row: WorksiteRow) => {
    setEditing(row);
    setForm({
      customerId: row.customer.id,
      name: row.worksite.name ?? '',
      address: row.worksite.address ?? '',
      department: null,
      city: null,
      alias: row.alias ?? '',
      active: row.active,
      worksiteActive: row.worksite.active,
    });
    setCities([]);
    setAddressValidation(null);
    setAddressValidationError(null);
    setModalOpen(true);
  };

  const closeFormModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setCities([]);
    setAddressValidation(null);
    setAddressValidationError(null);
  };

  const selectedDepartmentName =
    departments.find((department) => department.value === form.department)?.label ??
    form.department ??
    '';

  const validateAddressWithMaps = async () => {
    const address = form.address.trim();
    setAddressValidation(null);
    setAddressValidationError(null);

    if (!address) {
      setAddressValidationError('Ingresa una direccion para revisarla con Maps.');
      return;
    }

    setAddressValidationLoading(true);
    try {
      const result = await api<AddressValidationResponse>('/worksites/address/validate', {
        method: 'POST',
        json: {
          address,
          regionCode: 'CO',
          department: selectedDepartmentName || undefined,
          city: form.city || undefined,
        },
      });
      setAddressValidation(result);
    } catch (err) {
      if (err instanceof ApiError) {
        setAddressValidationError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setAddressValidationError(err.message);
      } else {
        setAddressValidationError('No se pudo revisar la direccion con Maps.');
      }
    } finally {
      setAddressValidationLoading(false);
    }
  };

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
          {isMobile ? (
            <Stack gap="sm">
              {!loading &&
                worksites.map((row) => (
                  <Paper key={row.id} withBorder radius="lg" p="md">
                    <Stack gap="md">
                      <Group justify="space-between" align="flex-start">
                        <div>
                          <Text fw={700}>{row.worksite.name}</Text>
                          <Text size="sm" c="dimmed">
                            {row.customer.name}
                          </Text>
                        </div>
                        <Badge color={row.worksite.active ? 'green' : 'gray'} variant="light">
                          {row.worksite.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </Group>

                      <SimpleGrid cols={2} spacing="sm">
                        <div>
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                            Alias
                          </Text>
                          <Text size="sm">{row.alias ?? '-'}</Text>
                        </div>
                      </SimpleGrid>

                      <Text size="sm" c="dimmed">
                        {row.worksite.address ?? 'Sin direccion registrada'}
                      </Text>

                      <Button variant="light" component={Link} href={`/transport/worksites/${row.id}`}>
                        Ver obra
                      </Button>
                    </Stack>
                  </Paper>
                ))}

              {!loading && worksites.length === 0 ? (
                <Paper radius="lg" p="xl" bg="gray.0">
                  <Stack align="center" gap="xs">
                    <ThemeIcon color="gray" variant="light" size={40} radius="xl">
                      <IconBuildingEstate size={20} />
                    </ThemeIcon>
                    <Text fw={700}>No hay obras registradas</Text>
                    <Text size="sm" c="dimmed" ta="center">
                      Crea una obra para empezar.
                    </Text>
                  </Stack>
                </Paper>
              ) : null}

              {loading ? (
                <Paper radius="lg" p="xl" bg="gray.0">
                  <Text c="dimmed" ta="center">
                    Cargando...
                  </Text>
                </Paper>
              ) : null}
            </Stack>
          ) : (
            <Table highlightOnHover verticalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Obra</Table.Th>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th>Alias</Table.Th>
                  <Table.Th>Direccion</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {!loading &&
                  worksites.map((row) => (
                    <Table.Tr key={row.id}>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text
                            component={Link}
                            href={`/transport/worksites/${row.id}`}
                            c="blue.7"
                            style={{ textDecoration: 'underline' }}
                            fw={700}
                          >
                            {row.worksite.name}
                          </Text>
                          <Text size="sm" c="dimmed">
                            {row.worksite.active ? 'Obra activa' : 'Obra inactiva'}
                          </Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Text
                          component={Link}
                          href={`/customers?customerId=${row.customer.id}`}
                          c="blue.7"
                          style={{ textDecoration: 'underline' }}
                        >
                          {row.customer.name}
                        </Text>
                      </Table.Td>
                      <Table.Td>{row.alias ?? '-'}</Table.Td>
                      <Table.Td>
                        <Text size="sm" maw={280}>
                          {row.worksite.address ?? 'Sin direccion'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap="xs">
                          <Badge
                            variant="light"
                            color={row.worksite.active ? 'green' : 'gray'}
                            style={{ minWidth: 74, justifyContent: 'center' }}
                          >
                            {row.worksite.active ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                          <Button
                            size="xs"
                            variant="default"
                            component={Link}
                            href={`/transport/worksites/${row.id}`}
                            rightSection={<IconEye size={14} />}
                          >
                            Ver
                          </Button>
                          <Button size="xs" variant="light" onClick={() => openEdit(row)}>
                            Editar
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}

                {!loading && worksites.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Stack align="center" gap="xs" py="lg">
                        <ThemeIcon color="gray" variant="light" size={40} radius="xl">
                          <IconBuildingEstate size={20} />
                        </ThemeIcon>
                        <Text fw={700}>No hay obras para mostrar</Text>
                        <Text size="sm" c="dimmed">
                          Registra una obra nueva.
                        </Text>
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                )}

                {loading && (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Text c="dimmed" ta="center">
                        Cargando...
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          )}
        </Paper>
      </Stack>

      <Modal opened={!!detailsRow} onClose={() => setDetailsRow(null)} title="Detalle de obra" centered size="lg">
        {detailsRow ? (
          <WorksiteDetails
            row={detailsRow}
            onEdit={(row) => {
              setDetailsRow(null);
              openEdit(row);
            }}
          />
        ) : null}
      </Modal>

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
                    setAddressValidation(null);
                    setAddressValidationError(null);
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
                  onChange={(value) => {
                    setForm((prev) => ({ ...prev, city: value }));
                    setAddressValidation(null);
                    setAddressValidationError(null);
                  }}
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

              <TextInput
                label="Dirección"
                placeholder="Dirección o descripción de ubicación"
                value={form.address}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setForm((prev) => ({ ...prev, address: value }));
                  setAddressValidation(null);
                  setAddressValidationError(null);
                }}
              />

              <Group justify="space-between" align="flex-start" gap="sm">
                <Button
                  variant="default"
                  leftSection={<IconMapPin size={16} />}
                  loading={addressValidationLoading}
                  disabled={!form.address.trim()}
                  onClick={validateAddressWithMaps}
                >
                  Revisar con Maps
                </Button>
                {addressValidation?.location ? (
                  <Text size="xs" c="dimmed">
                    {addressValidation.location.lat.toFixed(6)}, {addressValidation.location.lng.toFixed(6)}
                  </Text>
                ) : null}
              </Group>

              {addressValidationError ? (
                <Alert color="yellow" variant="light" title="Maps no pudo normalizar la dirección">
                  {addressValidationError}
                </Alert>
              ) : null}

              {addressValidation ? (
                <Alert
                  color={addressValidation.verdict.hasUnconfirmedComponents ? 'yellow' : 'green'}
                  variant="light"
                  title={
                    addressValidation.verdict.hasUnconfirmedComponents
                      ? 'Maps encontró una sugerencia para confirmar'
                      : 'Dirección normalizada por Maps'
                  }
                >
                  <Stack gap="md">
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                      <div>
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                          Escrita
                        </Text>
                        <Text size="sm">{addressValidation.inputAddress}</Text>
                        {addressValidation.context.city || addressValidation.context.department ? (
                          <Text size="xs" c="dimmed" mt={4}>
                            {[addressValidation.context.city, addressValidation.context.department, 'Colombia']
                              .filter(Boolean)
                              .join(', ')}
                          </Text>
                        ) : null}
                      </div>
                      <div>
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                          Sugerida por Maps
                        </Text>
                        <Text size="sm">{addressValidation.formattedAddress}</Text>
                        {addressValidation.googleContext.city || addressValidation.googleContext.department ? (
                          <Text size="xs" c="dimmed" mt={4}>
                            {[addressValidation.googleContext.city, addressValidation.googleContext.department]
                              .filter(Boolean)
                              .join(', ')}
                          </Text>
                        ) : null}
                      </div>
                    </SimpleGrid>

                    <div
                      style={{
                        border: '1px solid var(--mantine-color-gray-3)',
                        borderRadius: 8,
                        height: 220,
                        overflow: 'hidden',
                        background: 'var(--mantine-color-gray-0)',
                      }}
                    >
                      <iframe
                        title="Vista previa de la ubicación"
                        src={getGoogleMapsPreviewUrl(addressValidation)}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        style={{ border: 0, width: '100%', height: '100%' }}
                      />
                    </div>

                    <Group justify="flex-end">
                      <Button
                        size="xs"
                        variant="default"
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            address: addressValidation.inputAddress,
                          }));
                          setAddressValidation(null);
                        }}
                      >
                        Conservar escrita
                      </Button>
                      <Button
                        size="xs"
                        variant="default"
                        component="a"
                        href={getGoogleMapsSearchUrl(addressValidation)}
                        target="_blank"
                        rel="noreferrer"
                        leftSection={<IconExternalLink size={14} />}
                      >
                        Abrir en Maps
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            address: addressValidation.formattedAddress,
                          }));
                          setAddressValidation(null);
                        }}
                      >
                        Usar sugerida
                      </Button>
                    </Group>
                  </Stack>
                </Alert>
              ) : null}
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
