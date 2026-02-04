'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Center,
  Container,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { api } from '@/lib/api';

type Vehicle = {
  id: string;
  plate: string;
  brand?: string | null;
  model?: string | null;
  type?: string | null;
  capacity?: string | null;
  soatVigencia?: string | null;
  tecnomecanicaVigencia?: string | null;
  active: boolean;
  createdAt: string;
  drivers: Array<{
    id: string;
    name: string;
  }>;
};

type VehicleForm = {
  plate: string;
  brand: string;
  model: string;
  type: string;
  capacity: string;
  soatVigencia: string;
  tecnomecanicaVigencia: string;
  active: boolean;
};

const emptyForm = (vehicle: Vehicle): VehicleForm => ({
  plate: vehicle.plate ?? '',
  brand: vehicle.brand ?? '',
  model: vehicle.model ?? '',
  type: vehicle.type ?? '',
  capacity: vehicle.capacity ?? '',
  soatVigencia: toDateInput(vehicle.soatVigencia),
  tecnomecanicaVigencia: toDateInput(vehicle.tecnomecanicaVigencia),
  active: vehicle.active,
});

function toDateInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toPatchValue(value: string) {
  return value.trim() === '' ? undefined : value.trim();
}

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<VehicleForm | null>(null);
  const [saving, setSaving] = useState(false);

  const driversById = useMemo(() => {
    const map = new Map<string, string>();
    vehicles.forEach((vehicle) => {
      vehicle.drivers.forEach((driver) => {
        map.set(driver.id, driver.name);
      });
    });
    return map;
  }, [vehicles]);

  const loadVehicles = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<Vehicle[]>('/vehicles');
      setVehicles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar vehículos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicles();
  }, []);

  const startEdit = (vehicle: Vehicle) => {
    setEditing(vehicle);
    setForm(emptyForm(vehicle));
  };

  const closeEdit = () => {
    setEditing(null);
    setForm(null);
  };

  const saveEdit = async () => {
    if (!editing || !form) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/vehicles/${editing.id}`, {
        method: 'PATCH',
        json: {
          plate: form.plate.trim(),
          brand: toPatchValue(form.brand),
          model: toPatchValue(form.model),
          type: toPatchValue(form.type),
          capacity: toPatchValue(form.capacity),
          soatVigencia: toPatchValue(form.soatVigencia),
          tecnomecanicaVigencia: toPatchValue(form.tecnomecanicaVigencia),
          active: form.active,
        },
      });
      await loadVehicles();
      closeEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container size="xl" py="xl">
      <Paper shadow="sm" p="xl" radius="md" withBorder>
        <Group justify="space-between" align="center" mb="md">
          <Title order={2}>Vehículos</Title>
        </Group>

        {error && (
          <Text c="red" mb="md">
            {error}
          </Text>
        )}

        {loading ? (
          <Center py="xl">
            <Loader />
          </Center>
        ) : (
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Placa</Table.Th>
                <Table.Th>Marca</Table.Th>
                <Table.Th>Modelo</Table.Th>
                <Table.Th>Tipo</Table.Th>
                <Table.Th>Capacidad</Table.Th>
                <Table.Th>SOAT vence</Table.Th>
                <Table.Th>Tecnomecánica vence</Table.Th>
                <Table.Th>Conductores</Table.Th>
                <Table.Th>Activo</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {vehicles.map((vehicle) => (
                <Table.Tr key={vehicle.id}>
                  <Table.Td>{vehicle.plate}</Table.Td>
                  <Table.Td>{vehicle.brand ?? '-'}</Table.Td>
                  <Table.Td>{vehicle.model ?? '-'}</Table.Td>
                  <Table.Td>{vehicle.type ?? '-'}</Table.Td>
                  <Table.Td>{vehicle.capacity ?? '-'}</Table.Td>
                  <Table.Td>{toDateInput(vehicle.soatVigencia) || '-'}</Table.Td>
                  <Table.Td>{toDateInput(vehicle.tecnomecanicaVigencia) || '-'}</Table.Td>
                  <Table.Td>
                    {vehicle.drivers.length
                      ? vehicle.drivers.map((driver) => driversById.get(driver.id) ?? driver.name).join(', ')
                      : '-'}
                  </Table.Td>
                  <Table.Td>{vehicle.active ? 'Sí' : 'No'}</Table.Td>
                  <Table.Td>
                    <Button size="xs" variant="light" onClick={() => startEdit(vehicle)}>
                      Editar
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
              {!vehicles.length && (
                <Table.Tr>
                  <Table.Td colSpan={10}>
                    <Text c="dimmed" ta="center">
                      Sin vehículos registrados.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      <Modal opened={!!editing} onClose={closeEdit} title="Editar vehículo" size="lg">
        {form && (
          <Stack>
            <TextInput
              label="Placa"
              value={form.plate}
              onChange={(event) => setForm({ ...form, plate: event.currentTarget.value })}
              required
            />
            <Group grow>
              <TextInput
                label="Marca"
                value={form.brand}
                onChange={(event) => setForm({ ...form, brand: event.currentTarget.value })}
              />
              <TextInput
                label="Modelo"
                value={form.model}
                onChange={(event) => setForm({ ...form, model: event.currentTarget.value })}
              />
            </Group>
            <Group grow>
              <TextInput
                label="Tipo"
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.currentTarget.value })}
              />
              <TextInput
                label="Capacidad"
                value={form.capacity}
                onChange={(event) => setForm({ ...form, capacity: event.currentTarget.value })}
              />
            </Group>
            <Group grow>
              <TextInput
                label="SOAT vence"
                type="date"
                value={form.soatVigencia}
                onChange={(event) => setForm({ ...form, soatVigencia: event.currentTarget.value })}
              />
              <TextInput
                label="Tecnomecánica vence"
                type="date"
                value={form.tecnomecanicaVigencia}
                onChange={(event) =>
                  setForm({ ...form, tecnomecanicaVigencia: event.currentTarget.value })
                }
              />
            </Group>
            <Switch
              label="Activo"
              checked={form.active}
              onChange={(event) => setForm({ ...form, active: event.currentTarget.checked })}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={closeEdit}>
                Cancelar
              </Button>
              <Button onClick={saveEdit} loading={saving}>
                Guardar
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Container>
  );
}
