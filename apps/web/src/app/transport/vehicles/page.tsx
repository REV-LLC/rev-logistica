'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Autocomplete,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconEye } from '@tabler/icons-react';
import { api } from '@/lib/api';

const VEHICLE_TYPE_OPTIONS = ['CAMION/CAMIONETA', 'AUTOMOVIL', 'MOTO', 'GRUA'];
const CAPACITY_OPTIONS = Array.from({ length: 91 }, (_, index) => {
  const value = 1 + index / 10;
  return value.toFixed(1).replace('.', ',');
});

type Vehicle = {
  id: string;
  plate: string;
  brand?: string | null;
  model?: string | null;
  type?: string | null;
  capacity?: string | null;
  soatVigencia?: string | null;
  tecnomecanicaVigencia?: string | null;
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
};

const formFromVehicle = (vehicle: Vehicle): VehicleForm => ({
  plate: vehicle.plate ?? '',
  brand: vehicle.brand ?? '',
  model: vehicle.model ?? '',
  type: vehicle.type ?? '',
  capacity: vehicle.capacity ?? '',
  soatVigencia: toDateInput(vehicle.soatVigencia),
  tecnomecanicaVigencia: toDateInput(vehicle.tecnomecanicaVigencia),
});

const emptyForm: VehicleForm = {
  plate: '',
  brand: '',
  model: '',
  type: '',
  capacity: '',
  soatVigencia: '',
  tecnomecanicaVigencia: '',
};

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
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<VehicleForm | null>(null);
  const [detailsVehicle, setDetailsVehicle] = useState<Vehicle | null>(null);
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

  const brandOptions = useMemo(
    () =>
      Array.from(new Set(vehicles.map((vehicle) => vehicle.brand?.trim()).filter(Boolean) as string[])).sort(),
    [vehicles],
  );
  const modelOptions = useMemo(
    () =>
      Array.from(new Set(vehicles.map((vehicle) => vehicle.model?.trim()).filter(Boolean) as string[])).sort(),
    [vehicles],
  );
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

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
  };

  const startEdit = (vehicle: Vehicle) => {
    setEditing(vehicle);
    setForm(formFromVehicle(vehicle));
  };

  const closeEdit = () => {
    setEditing(null);
    setForm(null);
  };

  const saveEdit = async () => {
    if (!form) return;
    if (!form.plate.trim()) {
      setError('La placa es obligatoria');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        plate: form.plate.trim().toUpperCase(),
        brand: toPatchValue(form.brand)?.toUpperCase(),
        model: toPatchValue(form.model)?.toUpperCase(),
        type: toPatchValue(form.type)?.toUpperCase(),
        capacity: toPatchValue(form.capacity)?.toUpperCase(),
        soatVigencia: toPatchValue(form.soatVigencia),
        tecnomecanicaVigencia: toPatchValue(form.tecnomecanicaVigencia),
      };

      if (editing) {
        await api(`/vehicles/${editing.id}`, {
          method: 'PATCH',
          json: payload,
        });
      } else {
        await api('/vehicles', {
          method: 'POST',
          json: payload,
        });
      }

      await loadVehicles();
      closeEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container size="xl" py="xl">
      <Paper shadow="sm" p="xl" radius="md" withBorder>
        <Group justify="space-between" align="center" mb="md">
          <Title order={2}>Vehículos</Title>
          <Button onClick={startCreate}>Nuevo vehículo</Button>
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
          <Table striped highlightOnHover withTableBorder className={isMobile ? 'table-mobile-fit' : undefined}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={isMobile ? { width: '50%' } : undefined}>Placa</Table.Th>
                <Table.Th style={isMobile ? { width: '35%' } : undefined}>Marca</Table.Th>
                <Table.Th style={isMobile ? { width: '15%' } : undefined}>Ver</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {vehicles.map((vehicle) => (
                <Table.Tr key={vehicle.id}>
                  <Table.Td>{vehicle.plate}</Table.Td>
                  <Table.Td>
                    {vehicle.brand ?? '-'}
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      variant="light"
                      aria-label={`Ver detalle de ${vehicle.plate}`}
                      onClick={() => setDetailsVehicle(vehicle)}
                    >
                      <IconEye size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
              {!vehicles.length && (
                <Table.Tr>
                  <Table.Td colSpan={3}>
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

      <Modal opened={!!detailsVehicle} onClose={() => setDetailsVehicle(null)} title="Detalle de vehículo">
        {detailsVehicle ? (
          <Stack gap="xs">
            <Text><strong>Placa:</strong> {detailsVehicle.plate}</Text>
            <Text><strong>Marca:</strong> {detailsVehicle.brand ?? '-'}</Text>
            <Text><strong>Modelo:</strong> {detailsVehicle.model ?? '-'}</Text>
            <Text><strong>Tipo:</strong> {detailsVehicle.type ?? '-'}</Text>
            <Text><strong>Capacidad:</strong> {detailsVehicle.capacity ?? '-'}</Text>
            <Text><strong>SOAT vence:</strong> {toDateInput(detailsVehicle.soatVigencia) || '-'}</Text>
            <Text><strong>Tecnomecánica vence:</strong> {toDateInput(detailsVehicle.tecnomecanicaVigencia) || '-'}</Text>
            <Text>
              <strong>Conductores:</strong>{' '}
              {detailsVehicle.drivers.length
                ? detailsVehicle.drivers.map((driver) => driversById.get(driver.id) ?? driver.name).join(', ')
                : '-'}
            </Text>
            <Group justify="flex-end" mt="sm">
              <Button
                size="xs"
                variant="light"
                onClick={() => {
                  setDetailsVehicle(null);
                  startEdit(detailsVehicle);
                }}
              >
                Editar
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>

      <Modal opened={!!form} onClose={closeEdit} title={editing ? 'Editar vehículo' : 'Nuevo vehículo'} size="lg">
        {form && (
          <Stack>
            <Group gap="xs" wrap="nowrap" align="flex-end">
              <TextInput
                label="Placa"
                value={form.plate}
                onChange={(event) => setForm({ ...form, plate: event.currentTarget.value })}
                style={{ flex: '0 0 30%' }}
                required
              />
              <Autocomplete
                label="Marca"
                value={form.brand}
                data={brandOptions}
                onChange={(value) => setForm({ ...form, brand: value })}
                placeholder="Escribe para sugerir"
                style={{ flex: '1 1 35%', minWidth: 0 }}
              />
              <Autocomplete
                label="Modelo"
                value={form.model}
                data={modelOptions}
                onChange={(value) => setForm({ ...form, model: value })}
                placeholder="Escribe para sugerir"
                style={{ flex: '1 1 35%', minWidth: 0 }}
              />
            </Group>
            <Group align="flex-start" wrap={isMobile ? 'wrap' : 'nowrap'} className="mobile-stack">
              <Select
                label="Tipo"
                value={form.type}
                data={VEHICLE_TYPE_OPTIONS}
                onChange={(value) => setForm({ ...form, type: value ?? '' })}
                clearable
                style={{ flex: isMobile ? undefined : '1 1 38%' }}
              />
              <Select
                label="Capacidad"
                value={form.capacity}
                data={CAPACITY_OPTIONS}
                searchable
                clearable
                onChange={(value) => setForm({ ...form, capacity: value ?? '' })}
                style={{ flex: isMobile ? undefined : '1 1 62%' }}
              />
            </Group>
            <Group grow className="mobile-stack">
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
            <Group justify="flex-end" className="mobile-actions">
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
