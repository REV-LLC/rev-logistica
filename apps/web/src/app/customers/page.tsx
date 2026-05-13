'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Paper,
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
  IconBuildingEstate,
  IconEye,
  IconFileText,
  IconPhone,
  IconPlus,
  IconRoad,
  IconUserCheck,
  IconUsersGroup,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import StatCard from '@/components/dashboard/StatCard';
import { api, ApiError } from '@/lib/api';

type Customer = {
  id: string;
  name: string;
  nitOrId: string | null;
  phone: string | null;
  active: boolean;
  createdAt: string;
};

type CustomerForm = {
  name: string;
  nitOrId: string;
  phone: string;
  active: boolean;
  initialWorksiteName: string;
  initialWorksiteAlias: string;
  initialWorksiteAddress: string;
  initialWorksiteActive: boolean;
};

const emptyForm: CustomerForm = {
  name: '',
  nitOrId: '',
  phone: '',
  active: true,
  initialWorksiteName: '',
  initialWorksiteAlias: '',
  initialWorksiteAddress: '',
  initialWorksiteActive: true,
};

function CustomerDetails({
  customer,
  onEdit,
}: {
  customer: Customer;
  onEdit?: (customer: Customer) => void;
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
            Identificación
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
      </SimpleGrid>

      {onEdit ? (
        <Group className="mobile-actions">
          <Button variant="light" onClick={() => onEdit(customer)}>
            Editar
          </Button>
        </Group>
      ) : null}
    </Stack>
  );
}

export default function CustomersPage() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [detailsCustomer, setDetailsCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);

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
    const identifiedCount = customers.filter((customer) => customer.nitOrId?.trim()).length;
    const withPhoneCount = customers.filter((customer) => customer.phone?.trim()).length;
    return {
      total: customers.length,
      active: activeCount,
      identified: identifiedCount,
      withPhone: withPhoneCount,
    };
  }, [customers]);

  const openCreate = () => {
    setEditingCustomer(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({
      name: customer.name ?? '',
      nitOrId: customer.nitOrId ?? '',
      phone: customer.phone ?? '',
      active: customer.active,
      initialWorksiteName: '',
      initialWorksiteAlias: '',
      initialWorksiteAddress: '',
      initialWorksiteActive: true,
    });
    setModalOpen(true);
  };

  const closeFormModal = () => {
    setModalOpen(false);
    setEditingCustomer(null);
    setForm(emptyForm);
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

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <PageHeaderCard
          title="Clientes"
          description="Centraliza la información comercial y deja listo el arranque operativo de cada cliente."
          icon={<IconUsersGroup size={20} />}
          iconColor="green"
          accentColor="rgba(34,197,94,0.12)"
          aside={
            <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
              Nuevo cliente
            </Button>
          }
        >
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
            <StatCard
              label="Total"
              value={String(metrics.total)}
              hint="Clientes registrados"
              color="green"
              icon={<IconUsersGroup size={20} />}
            />
            <StatCard
              label="Activos"
              value={String(metrics.active)}
              hint={`${Math.max(metrics.total - metrics.active, 0)} inactivos`}
              color="teal"
              icon={<IconUserCheck size={20} />}
            />
            <StatCard
              label="Con documento"
              value={String(metrics.identified)}
              hint="NIT o documento cargado"
              color="lime"
              icon={<IconFileText size={20} />}
            />
            <StatCard
              label="Con teléfono"
              value={String(metrics.withPhone)}
              hint="Canal de contacto disponible"
              color="blue"
              icon={<IconPhone size={20} />}
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
                customers.map((customer) => (
                  <Paper key={customer.id} withBorder radius="lg" p="md">
                    <Stack gap="md">
                      <Group justify="space-between" align="flex-start">
                        <div>
                          <Text fw={700}>{customer.name}</Text>
                          <Text size="sm" c="dimmed">
                            {customer.nitOrId ?? 'Sin documento'}
                          </Text>
                        </div>
                        <Badge color={customer.active ? 'green' : 'gray'} variant="light">
                          {customer.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </Group>

                      <SimpleGrid cols={2} spacing="sm">
                        <div>
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                            Contacto
                          </Text>
                          <Text size="sm">{customer.phone ?? '-'}</Text>
                        </div>
                        <div>
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                            Estado
                          </Text>
                          <Text size="sm">{customer.active ? 'Operando' : 'Pausado'}</Text>
                        </div>
                      </SimpleGrid>

                      <Button
                        variant="light"
                        leftSection={<IconEye size={16} />}
                        onClick={() => setDetailsCustomer(customer)}
                      >
                        Ver detalle
                      </Button>
                    </Stack>
                  </Paper>
                ))}

              {!loading && customers.length === 0 ? (
                <Paper radius="lg" p="xl" bg="gray.0">
                  <Stack align="center" gap="xs">
                    <ThemeIcon color="gray" variant="light" size={40} radius="xl">
                      <IconUsersGroup size={20} />
                    </ThemeIcon>
                    <Text fw={700}>No hay clientes registrados</Text>
                    <Text size="sm" c="dimmed" ta="center">
                      Crea un nuevo cliente para empezar.
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
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th>Identificación</Table.Th>
                  <Table.Th>Contacto</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {!loading &&
                  customers.map((customer) => (
                    <Table.Tr key={customer.id}>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text fw={700}>{customer.name}</Text>
                          <Text size="sm" c="dimmed">
                            Cliente registrado
                          </Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>{customer.nitOrId ?? '-'}</Table.Td>
                      <Table.Td>
                        <Text size="sm">{customer.phone ?? 'Sin teléfono'}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={customer.active ? 'green' : 'gray'} variant="light">
                          {customer.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                          <Button size="xs" variant="light" onClick={() => openEdit(customer)}>
                            Editar
                          </Button>
                          <ActionIcon
                            color="gray"
                            variant="light"
                            aria-label={`Ver detalle de ${customer.name}`}
                            onClick={() => setDetailsCustomer(customer)}
                          >
                            <IconEye size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}

                {!loading && customers.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <Stack align="center" gap="xs" py="lg">
                        <ThemeIcon color="gray" variant="light" size={40} radius="xl">
                          <IconUsersGroup size={20} />
                        </ThemeIcon>
                        <Text fw={700}>No hay clientes para mostrar</Text>
                        <Text size="sm" c="dimmed">
                          Registra un nuevo cliente.
                        </Text>
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                )}

                {loading && (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
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

      <Modal
        opened={!!detailsCustomer}
        onClose={() => setDetailsCustomer(null)}
        title="Detalle de cliente"
        centered
        size="lg"
      >
        {detailsCustomer ? (
          <CustomerDetails
            customer={detailsCustomer}
            onEdit={(customer) => {
              setDetailsCustomer(null);
              openEdit(customer);
            }}
          />
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
                placeholder="Razón social o nombre del cliente"
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
                  placeholder="Identificación tributaria o documento"
                  value={form.nitOrId}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((prev) => ({ ...prev, nitOrId: value }));
                  }}
                />
                <TextInput
                  label="Teléfono"
                  placeholder="Número de contacto"
                  value={form.phone}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((prev) => ({ ...prev, phone: value }));
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
                    label="Dirección de la obra"
                    placeholder="Ubicación o dirección principal"
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
                      La obra inicial se creará activa junto con el cliente.
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
