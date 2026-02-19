'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  Select,
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
            active: form.active,
          },
        });
      }

      setModalOpen(false);
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
      <Paper shadow="sm" p="xl" radius="md" withBorder>
        <Group justify="space-between" mb="md">
          <Title order={2}>Obras</Title>
          <Button onClick={openCreate}>Nueva obra</Button>
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
              <Table.Th style={isMobile ? { width: '50%' } : undefined}>Obra</Table.Th>
              {!isMobile ? <Table.Th>Alias</Table.Th> : null}
              <Table.Th style={isMobile ? { width: '35%' } : undefined}>Cliente</Table.Th>
              {!isMobile ? <Table.Th>Dirección</Table.Th> : null}
              {!isMobile ? <Table.Th>Estado</Table.Th> : null}
              <Table.Th style={isMobile ? { width: '15%' } : undefined}>{isMobile ? 'Ver' : ''}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {!loading &&
              worksites.map((row) => (
                <Table.Tr key={row.id}>
                  <Table.Td>
                    <Text
                      component={Link}
                      href={`/transport/obras/${row.id}`}
                      c="blue.7"
                      style={{ textDecoration: 'underline' }}
                    >
                      {row.worksite.name}
                    </Text>
                  </Table.Td>
                  {!isMobile ? <Table.Td>{row.alias ?? '-'}</Table.Td> : null}
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
                  {!isMobile ? <Table.Td>{row.worksite.address ?? '-'}</Table.Td> : null}
                  {!isMobile ? (
                    <Table.Td>
                      <Group gap="xs">
                        <Badge variant="light" color={row.active ? 'green' : 'gray'}>
                          Relación: {row.active ? 'Activa' : 'Inactiva'}
                        </Badge>
                        <Badge variant="light" color={row.worksite.active ? 'green' : 'gray'}>
                          Obra: {row.worksite.active ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </Group>
                    </Table.Td>
                  ) : null}
                  <Table.Td>
                    {isMobile ? (
                      <ActionIcon
                        variant="light"
                        aria-label={`Ver detalle de ${row.worksite.name}`}
                        onClick={() => setDetailsRow(row)}
                      >
                        <IconEye size={16} />
                      </ActionIcon>
                    ) : (
                      <Group gap="xs" justify="flex-end">
                        <Button size="xs" variant="default" component={Link} href={`/transport/obras/${row.id}`}>
                          Abrir
                        </Button>
                        <Button size="xs" variant="light" onClick={() => openEdit(row)}>
                          Editar
                        </Button>
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}

            {!loading && worksites.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={isMobile ? 3 : 6}>
                  <Text c="dimmed" ta="center">
                    No hay obras registradas.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}

            {loading && (
              <Table.Tr>
                <Table.Td colSpan={isMobile ? 3 : 6}>
                  <Text c="dimmed" ta="center">
                    Cargando...
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Paper>

      <Modal opened={!!detailsRow} onClose={() => setDetailsRow(null)} title="Detalle de obra" centered>
        {detailsRow ? (
          <Stack gap="xs">
            <Text><strong>Obra:</strong> {detailsRow.worksite.name}</Text>
            <Text><strong>Alias:</strong> {detailsRow.alias ?? '-'}</Text>
            <Text>
              <strong>Cliente:</strong>{' '}
              <Text
                component={Link}
                href={`/customers?customerId=${detailsRow.customer.id}`}
                c="blue.7"
                style={{ textDecoration: 'underline' }}
              >
                {detailsRow.customer.name}
              </Text>
            </Text>
            <Text><strong>Dirección:</strong> {detailsRow.worksite.address ?? '-'}</Text>
            <Text>
              <strong>Relación:</strong> {detailsRow.active ? 'Activa' : 'Inactiva'}
            </Text>
            <Text>
              <strong>Obra:</strong> {detailsRow.worksite.active ? 'Activa' : 'Inactiva'}
            </Text>
            <Group className="mobile-actions" mt="sm">
              <Button
                variant="default"
                component={Link}
                href={`/transport/obras/${detailsRow.id}`}
                onClick={() => setDetailsRow(null)}
              >
                Abrir
              </Button>
              <Button
                variant="light"
                onClick={() => {
                  setDetailsRow(null);
                  openEdit(detailsRow);
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
        title={editing ? 'Editar obra' : 'Nueva obra'}
        centered
      >
        <Stack>
          <Select
            label="Cliente"
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
          <TextInput
            label="Nombre de la obra"
            value={form.name}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((prev) => ({ ...prev, name: value }));
            }}
            required
          />
          <TextInput
            label="Alias"
            value={form.alias}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((prev) => ({ ...prev, alias: value }));
            }}
          />
          <TextInput
            label="Dirección"
            value={form.address}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((prev) => ({ ...prev, address: value }));
            }}
          />
          <Switch
            label="Relación activa"
            checked={form.active}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, active: event.currentTarget.checked }))
            }
          />
          {editing && (
            <Switch
              label="Obra activa"
              checked={form.worksiteActive}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, worksiteActive: event.currentTarget.checked }))
              }
            />
          )}

          <Group justify="flex-end" className="mobile-actions">
            <Button variant="default" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveWorksite} loading={saving}>
              Guardar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
