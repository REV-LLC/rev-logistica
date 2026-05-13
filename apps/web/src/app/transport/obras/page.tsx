'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ActionIcon,
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
  IconEye,
  IconMapPin,
  IconPlus,
  IconRoute2,
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
  alias: string;
  active: boolean;
  worksiteActive: boolean;
};

const emptyForm: WorksiteForm = {
  customerId: null,
  name: '',
  address: '',
  alias: '',
  active: true,
  worksiteActive: true,
};

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
          <Badge color={row.active ? 'green' : 'gray'} variant="light">
            Relación {row.active ? 'activa' : 'inactiva'}
          </Badge>
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
            Dirección
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
          href={`/transport/obras/${row.id}`}
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

export default function ObrasPage() {
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

  const metrics = useMemo(() => {
    const activeRelations = worksites.filter((row) => row.active).length;
    const activeWorksites = worksites.filter((row) => row.worksite.active).length;
    const withAddress = worksites.filter((row) => row.worksite.address?.trim()).length;
    const uniqueCustomers = new Set(worksites.map((row) => row.customer.id)).size;
    return {
      total: worksites.length,
      activeRelations,
      activeWorksites,
      withAddress,
      uniqueCustomers,
    };
  }, [worksites]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (row: WorksiteRow) => {
    setEditing(row);
    setForm({
      customerId: row.customer.id,
      name: row.worksite.name ?? '',
      address: row.worksite.address ?? '',
      alias: row.alias ?? '',
      active: row.active,
      worksiteActive: row.worksite.active,
    });
    setModalOpen(true);
  };

  const closeFormModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
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
            address: form.address.trim().toUpperCase() || undefined,
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
            address: form.address.trim().toUpperCase() || undefined,
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
          description="Administra frentes de trabajo, cliente asociado y estado operativo desde una sola vista."
          icon={<IconBuildingEstate size={20} />}
          iconColor="blue"
          accentColor="rgba(59,130,246,0.12)"
          aside={
            <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
              Nueva obra
            </Button>
          }
        >
          <SimpleGrid cols={{ base: 1, sm: 2, xl: 5 }} spacing="md">
            <StatCard
              label="Total"
              value={String(metrics.total)}
              hint="Obras registradas"
              color="blue"
              icon={<IconBuildingEstate size={20} />}
            />
            <StatCard
              label="Relaciones activas"
              value={String(metrics.activeRelations)}
              hint="Cliente obra en operación"
              color="green"
              icon={<IconRoute2 size={20} />}
            />
            <StatCard
              label="Obras activas"
              value={String(metrics.activeWorksites)}
              hint="Estado propio de la obra"
              color="teal"
              icon={<IconBuilding size={20} />}
            />
            <StatCard
              label="Con dirección"
              value={String(metrics.withAddress)}
              hint="Ubicación cargada"
              color="grape"
              icon={<IconMapPin size={20} />}
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
          <Alert color="red" variant="light" title="No se pudo completar la acción">
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
                          {row.worksite.active ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </Group>

                      <SimpleGrid cols={2} spacing="sm">
                        <div>
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                            Alias
                          </Text>
                          <Text size="sm">{row.alias ?? '-'}</Text>
                        </div>
                        <div>
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                            Relación
                          </Text>
                          <Text size="sm">{row.active ? 'Activa' : 'Inactiva'}</Text>
                        </div>
                      </SimpleGrid>

                      <Text size="sm" c="dimmed">
                        {row.worksite.address ?? 'Sin dirección registrada'}
                      </Text>

                      <Button
                        variant="light"
                        leftSection={<IconEye size={16} />}
                        onClick={() => setDetailsRow(row)}
                      >
                        Ver detalle
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
                      Crea una nueva obra para empezar.
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
                  <Table.Th>Dirección</Table.Th>
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
                            href={`/transport/obras/${row.id}`}
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
                          {row.worksite.address ?? 'Sin dirección'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap="xs">
                          <Badge variant="light" color={row.active ? 'green' : 'gray'} style={{ width: 'fit-content' }}>
                            Relación: {row.active ? 'Activa' : 'Inactiva'}
                          </Badge>
                          <Badge
                            variant="light"
                            color={row.worksite.active ? 'green' : 'gray'}
                            style={{ width: 'fit-content' }}
                          >
                            Obra: {row.worksite.active ? 'Activa' : 'Inactiva'}
                          </Badge>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                          <Button size="xs" variant="default" component={Link} href={`/transport/obras/${row.id}`}>
                            Abrir
                          </Button>
                          <Button size="xs" variant="light" onClick={() => openEdit(row)}>
                            Editar
                          </Button>
                          <ActionIcon
                            color="gray"
                            variant="light"
                            aria-label={`Ver detalle de ${row.worksite.name}`}
                            onClick={() => setDetailsRow(row)}
                          >
                            <IconEye size={16} />
                          </ActionIcon>
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
                          Registra una nueva obra.
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
                <Text fw={700}>Vinculación</Text>
                <Text size="sm" c="dimmed">
                  Define el cliente al que pertenece esta obra y el nombre operativo visible.
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
                  placeholder="Referencia corta o nombre interno"
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
                  Registra la dirección para facilitar referencia operativa y futura geolocalización.
                </Text>
              </div>

              <TextInput
                label="Dirección"
                placeholder="Dirección o descripción de ubicación"
                value={form.address}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setForm((prev) => ({ ...prev, address: value }));
                }}
              />
            </Stack>
          </Paper>

          {editing ? (
            <Paper withBorder radius="lg" p="md">
              <Stack gap="md">
                <div>
                  <Text fw={700}>Estado operativo</Text>
                  <Text size="sm" c="dimmed">
                    Controla por separado la relación cliente-obra y la activación propia de la obra.
                  </Text>
                </div>

                <Switch
                  label="Relación activa"
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
