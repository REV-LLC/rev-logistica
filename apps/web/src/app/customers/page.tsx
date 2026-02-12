'use client';

import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
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

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
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
        active: form.active,
        initialWorksite: editingCustomer
          ? undefined
          : {
              name: form.initialWorksiteName.trim().toUpperCase(),
              alias: form.initialWorksiteAlias.trim().toUpperCase() || undefined,
              address: form.initialWorksiteAddress.trim().toUpperCase() || undefined,
              active: form.initialWorksiteActive,
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

      setModalOpen(false);
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

  const deleteCustomer = async (customer: Customer) => {
    if (!window.confirm(`¿Eliminar cliente ${customer.name}?`)) return;

    setError(null);
    try {
      await api(`/customers/${customer.id}`, {
        method: 'DELETE',
      });
      await loadCustomers();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error eliminando cliente');
      }
    }
  };

  return (
    <Container size="xl" py="xl">
      <Paper shadow="sm" p="xl" radius="md" withBorder>
        <Group justify="space-between" mb="md">
          <Title order={2}>Clientes</Title>
          <Button onClick={openCreate}>Nuevo cliente</Button>
        </Group>

        {error && (
          <Text c="red" mb="md">
            {error}
          </Text>
        )}

        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nombre</Table.Th>
              <Table.Th>NIT / Documento</Table.Th>
              <Table.Th>Teléfono</Table.Th>
              <Table.Th>Estado</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {!loading &&
              customers.map((customer) => (
                <Table.Tr key={customer.id}>
                  <Table.Td>{customer.name}</Table.Td>
                  <Table.Td>{customer.nitOrId ?? '-'}</Table.Td>
                  <Table.Td>{customer.phone ?? '-'}</Table.Td>
                  <Table.Td>
                    <Badge color={customer.active ? 'green' : 'gray'} variant="light">
                      {customer.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="flex-end">
                      <Button size="xs" variant="light" onClick={() => openEdit(customer)}>
                        Editar
                      </Button>
                      <ActionIcon
                        color="red"
                        variant="light"
                        aria-label="Eliminar cliente"
                        onClick={() => deleteCustomer(customer)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}

            {!loading && customers.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" ta="center">
                    No hay clientes registrados.
                  </Text>
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
      </Paper>

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCustomer ? 'Editar cliente' : 'Nuevo cliente'}
        centered
      >
        <Stack>
          <TextInput
            label="Nombre"
            value={form.name}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((prev) => ({ ...prev, name: value }));
            }}
            required
          />
          <TextInput
            label="NIT / Documento"
            value={form.nitOrId}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((prev) => ({ ...prev, nitOrId: value }));
            }}
          />
          <TextInput
            label="Teléfono"
            value={form.phone}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((prev) => ({ ...prev, phone: value }));
            }}
          />
          <Switch
            label="Activo"
            checked={form.active}
            onChange={(event) => setForm((prev) => ({ ...prev, active: event.currentTarget.checked }))}
          />
          {!editingCustomer && (
            <>
              <Text fw={600} mt="sm">
                Obra inicial
              </Text>
              <TextInput
                label="Nombre de la obra"
                value={form.initialWorksiteName}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setForm((prev) => ({ ...prev, initialWorksiteName: value }));
                }}
                required
              />
              <TextInput
                label="Alias de la obra"
                value={form.initialWorksiteAlias}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setForm((prev) => ({ ...prev, initialWorksiteAlias: value }));
                }}
              />
              <TextInput
                label="Dirección de la obra"
                value={form.initialWorksiteAddress}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setForm((prev) => ({ ...prev, initialWorksiteAddress: value }));
                }}
              />
              <Switch
                label="Obra activa"
                checked={form.initialWorksiteActive}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, initialWorksiteActive: event.currentTarget.checked }))
                }
              />
            </>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveCustomer} loading={saving}>
              Guardar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
