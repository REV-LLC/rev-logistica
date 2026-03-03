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
import { useMediaQuery } from '@mantine/hooks';
import { IconEye } from '@tabler/icons-react';
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

        <Table
          striped
          highlightOnHover
          withTableBorder
          className={isMobile ? 'table-mobile-fit' : undefined}
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={isMobile ? { width: '50%' } : undefined}>Nombre</Table.Th>
              {!isMobile ? <Table.Th>NIT / Documento</Table.Th> : null}
              {!isMobile ? <Table.Th>Teléfono</Table.Th> : null}
              <Table.Th style={isMobile ? { width: '30%' } : undefined}>Estado</Table.Th>
              {isMobile ? <Table.Th style={{ width: '20%' }}>Ver</Table.Th> : null}
              {!isMobile ? <Table.Th /> : null}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {!loading &&
              customers.map((customer) => (
                <Table.Tr key={customer.id}>
                  <Table.Td>{customer.name}</Table.Td>
                  {!isMobile ? <Table.Td>{customer.nitOrId ?? '-'}</Table.Td> : null}
                  {!isMobile ? <Table.Td>{customer.phone ?? '-'}</Table.Td> : null}
                  <Table.Td>
                    <Badge color={customer.active ? 'green' : 'gray'} variant="light">
                      {customer.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </Table.Td>
                  {isMobile ? (
                    <Table.Td>
                      <ActionIcon
                        variant="light"
                        aria-label={`Ver detalle de ${customer.name}`}
                        onClick={() => setDetailsCustomer(customer)}
                      >
                        <IconEye size={16} />
                      </ActionIcon>
                    </Table.Td>
                  ) : (
                    <Table.Td>
                      <Group gap="xs" justify="flex-end">
                        <Button size="xs" variant="light" onClick={() => openEdit(customer)}>
                          Editar
                        </Button>
                      </Group>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}

            {!loading && customers.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={isMobile ? 3 : 5}>
                  <Text c="dimmed" ta="center">
                    No hay clientes registrados.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}

            {loading && (
              <Table.Tr>
                <Table.Td colSpan={isMobile ? 3 : 5}>
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
        opened={!!detailsCustomer}
        onClose={() => setDetailsCustomer(null)}
        title="Detalle de cliente"
        centered
      >
        {detailsCustomer ? (
          <Stack gap="xs">
            <Text><strong>Nombre:</strong> {detailsCustomer.name}</Text>
            <Text><strong>NIT / Documento:</strong> {detailsCustomer.nitOrId ?? '-'}</Text>
            <Text><strong>Teléfono:</strong> {detailsCustomer.phone ?? '-'}</Text>
            <Text><strong>Estado:</strong> {detailsCustomer.active ? 'Activo' : 'Inactivo'}</Text>
            <Group className="mobile-actions" mt="sm">
              <Button
                variant="light"
                onClick={() => {
                  setDetailsCustomer(null);
                  openEdit(detailsCustomer);
                }}
              >
                Editar
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>

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
          {editingCustomer ? (
            <Switch
              label="Activo"
              checked={form.active}
              onChange={(event) => setForm((prev) => ({ ...prev, active: event.currentTarget.checked }))}
            />
          ) : null}
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
            </>
          )}

          <Group justify="flex-end" className="mobile-actions">
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
