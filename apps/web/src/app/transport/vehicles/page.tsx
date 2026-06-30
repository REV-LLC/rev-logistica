'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Autocomplete,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconCalendarDue,
  IconCar,
  IconEye,
  IconFileDescription,
  IconPlus,
  IconSteeringWheel,
  IconTruck,
  IconUserCheck,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import FileAttachmentsPanel from '@/components/FileAttachmentsPanel';
import StatCard from '@/components/dashboard/StatCard';
import { api } from '@/lib/api';

const VEHICLE_TYPE_OPTIONS = ['CAMION/CAMIONETA', 'AUTOMOVIL', 'MOTO', 'GRUA'];
const CAPACITY_OPTIONS = Array.from({ length: 91 }, (_, index) => {
  const value = 1 + index / 10;
  const normalizedValue = value.toFixed(1).replace('.', ',');
  const displayValue = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return {
    value: normalizedValue,
    label: `${displayValue} ${value === 1 ? 'tonelada' : 'toneladas'}`,
  };
});

type Vehicle = {
  id: string;
  plate: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
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
  year: string;
  type: string;
  capacity: string;
  soatVigencia: string;
  tecnomecanicaVigencia: string;
};

const formFromVehicle = (vehicle: Vehicle): VehicleForm => ({
  plate: vehicle.plate ?? '',
  brand: vehicle.brand ?? '',
  model: vehicle.model ?? '',
  year: vehicle.year ? String(vehicle.year) : '',
  type: vehicle.type ?? '',
  capacity: vehicle.capacity ?? '',
  soatVigencia: toDateInput(vehicle.soatVigencia),
  tecnomecanicaVigencia: toDateInput(vehicle.tecnomecanicaVigencia),
});

const emptyForm: VehicleForm = {
  plate: '',
  brand: '',
  model: '',
  year: '',
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

function formatDisplayDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

function formatCapacity(value?: string | null) {
  if (!value) return '-';
  const normalized = Number(value.replace(',', '.'));
  if (Number.isNaN(normalized)) return value;
  const displayValue = Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
  return `${displayValue} ${normalized === 1 ? 'tonelada' : 'toneladas'}`;
}

function formatVehicleIdentity(vehicle: Pick<Vehicle, 'brand' | 'model' | 'year'>) {
  return [vehicle.brand, vehicle.model, vehicle.year ? String(vehicle.year) : null].filter(Boolean).join(' · ');
}

function toPatchValue(value: string) {
  return value.trim() === '' ? undefined : value.trim();
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getDocumentStatus(days: number | null) {
  if (days === null) return { label: 'Sin fecha', color: 'gray' };
  if (days < 0) return { label: 'Vencido', color: 'red' };
  if (days <= 30) return { label: `${days} dias`, color: 'orange' };
  return { label: `${days} dias`, color: 'green' };
}

function VehicleDetails({
  vehicle,
  onEdit,
}: {
  vehicle: Vehicle;
  onEdit?: (vehicle: Vehicle) => void;
}) {
  const soatStatus = getDocumentStatus(daysUntil(vehicle.soatVigencia));
  const technoStatus = getDocumentStatus(daysUntil(vehicle.tecnomecanicaVigencia));

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={700} size="lg">
            {vehicle.plate}
          </Text>
          <Text size="sm" c="dimmed">
            {formatVehicleIdentity(vehicle) || 'Sin marca, modelo o año'}
          </Text>
        </div>
        <Badge color="blue" variant="light">
          {vehicle.type ?? 'Sin tipo'}
        </Badge>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <Paper withBorder radius="md" p="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Configuracion
          </Text>
          <Stack gap={6} mt={8}>
            <Text size="sm">Año: {vehicle.year ?? '-'}</Text>
            <Text size="sm">Peso (Toneladas): {formatCapacity(vehicle.capacity)}</Text>
            <Text size="sm">
              Conductores: {vehicle.drivers.length ? vehicle.drivers.map((driver) => driver.name).join(', ') : '-'}
            </Text>
          </Stack>
        </Paper>

        <Paper withBorder radius="md" p="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Documentacion
          </Text>
          <Stack gap={8} mt={8}>
            <Group justify="space-between">
              <Text size="sm">SOAT</Text>
              <Badge color={soatStatus.color} variant="light">
                {soatStatus.label}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              Vence: {formatDisplayDate(vehicle.soatVigencia)}
            </Text>
            <Group justify="space-between">
              <Text size="sm">Tecnomecanica</Text>
              <Badge color={technoStatus.color} variant="light">
                {technoStatus.label}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              Vence: {formatDisplayDate(vehicle.tecnomecanicaVigencia)}
            </Text>
          </Stack>
        </Paper>
      </SimpleGrid>

      {onEdit ? (
        <Group className="mobile-actions">
          <Button variant="light" onClick={() => onEdit(vehicle)}>
            Editar
          </Button>
        </Group>
      ) : null}
    </Stack>
  );
}

export default function VehiclesPage() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<VehicleForm | null>(null);
  const [detailsVehicle, setDetailsVehicle] = useState<Vehicle | null>(null);
  const [documentsVehicle, setDocumentsVehicle] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);

  const brandOptions = useMemo(
    () =>
      Array.from(
        new Set(vehicles.map((vehicle) => vehicle.brand?.trim()).filter(Boolean) as string[]),
      ).sort(),
    [vehicles],
  );

  const modelOptions = useMemo(
    () =>
      Array.from(
        new Set(vehicles.map((vehicle) => vehicle.model?.trim()).filter(Boolean) as string[]),
      ).sort(),
    [vehicles],
  );

  const loadVehicles = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<Vehicle[]>('/vehicles');
      setVehicles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar vehiculos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicles();
  }, []);

  const metrics = useMemo(() => {
    const withDrivers = vehicles.filter((vehicle) => vehicle.drivers.length > 0).length;
    const soatSoon = vehicles.filter((vehicle) => {
      const days = daysUntil(vehicle.soatVigencia);
      return days !== null && days <= 30;
    }).length;
    const technoSoon = vehicles.filter((vehicle) => {
      const days = daysUntil(vehicle.tecnomecanicaVigencia);
      return days !== null && days <= 30;
    }).length;
    return {
      total: vehicles.length,
      withDrivers,
      soatSoon,
      technoSoon,
    };
  }, [vehicles]);

  const startCreate = () => {
    setEditing(null);
    setFormError(null);
    setSuccess(null);
    setForm(emptyForm);
  };

  const startEdit = (vehicle: Vehicle) => {
    setEditing(vehicle);
    setFormError(null);
    setSuccess(null);
    setForm(formFromVehicle(vehicle));
  };

  const closeEdit = () => {
    setEditing(null);
    setFormError(null);
    setForm(null);
  };

  const handleSaveSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveEdit();
  };

  const saveEdit = async () => {
    if (!form) return;
    if (!form.plate.trim()) {
      setFormError('La placa es obligatoria');
      return;
    }
    const parsedYear = form.year.trim() ? Number(form.year.trim()) : undefined;
    if (parsedYear !== undefined && (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > 2100)) {
      setFormError('El año del vehículo debe estar entre 1900 y 2100');
      return;
    }
    setSaving(true);
    setFormError(null);
    setSuccess(null);
    try {
      const payload = {
        plate: form.plate.trim().toUpperCase(),
        brand: toPatchValue(form.brand)?.toUpperCase(),
        model: toPatchValue(form.model)?.toUpperCase(),
        year: parsedYear,
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
      setSuccess('Vehiculo guardado.');
      closeEdit();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <PageHeaderCard
          title="Vehiculos"
          description="Administra flota, documentacion y disponibilidad operativa desde una sola vista."
          icon={<IconTruck size={20} />}
          iconColor="orange"
          accentColor="rgba(249,115,22,0.12)"
          aside={
            <Button onClick={startCreate} leftSection={<IconPlus size={16} />}>
              Nuevo vehiculo
            </Button>
          }
        >
          <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="md">
            <StatCard
              label="Total"
              value={String(metrics.total)}
              hint="Vehiculos registrados"
              color="orange"
              icon={<IconTruck size={20} />}
            />
            <StatCard
              label="Con conductor"
              value={String(metrics.withDrivers)}
              hint="Asignaciones activas"
              color="blue"
              icon={<IconUserCheck size={20} />}
            />
            <StatCard
              label="SOAT proximo"
              value={String(metrics.soatSoon)}
              hint="Vence en 30 dias o menos"
              color="red"
              icon={<IconFileDescription size={20} />}
            />
            <StatCard
              label="Tecnomecanica proxima"
              value={String(metrics.technoSoon)}
              hint="Vence en 30 dias o menos"
              color="grape"
              icon={<IconCalendarDue size={20} />}
            />
          </SimpleGrid>
        </PageHeaderCard>

        {error ? (
          <Alert color="red" variant="light" title="No se pudo completar la carga">
            {error}
          </Alert>
        ) : null}

        {success ? (
          <Alert color="green" variant="light" withCloseButton onClose={() => setSuccess(null)}>
            <Text role="status" aria-live="polite">
              {success}
            </Text>
          </Alert>
        ) : null}

        <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
          {loading ? (
            <Paper radius="lg" p="xl" bg="gray.0">
              <Text c="dimmed" ta="center">
                Cargando...
              </Text>
            </Paper>
          ) : isMobile ? (
            <Stack gap="sm">
              {vehicles.map((vehicle) => {
                const soatStatus = getDocumentStatus(daysUntil(vehicle.soatVigencia));
                return (
                  <Paper key={vehicle.id} withBorder radius="lg" p="md">
                    <Stack gap="md">
                      <Group justify="space-between" align="flex-start">
                        <div>
                          <Text fw={700}>{vehicle.plate}</Text>
                          <Text size="sm" c="dimmed">
                            {formatVehicleIdentity(vehicle) || 'Sin marca, modelo o año'}
                          </Text>
                        </div>
                        <Badge color={soatStatus.color} variant="light">
                          SOAT {soatStatus.label}
                        </Badge>
                      </Group>

                      <SimpleGrid cols={2} spacing="sm">
                        <div>
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                            Año
                          </Text>
                          <Text size="sm">{vehicle.year ?? '-'}</Text>
                        </div>
                        <div>
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                            Conductores
                          </Text>
                          <Text size="sm">{vehicle.drivers.length || 0}</Text>
                        </div>
                      </SimpleGrid>

                      <Group grow>
                        <Button
                          variant="light"
                          leftSection={<IconEye size={16} />}
                          onClick={() => setDetailsVehicle(vehicle)}
                        >
                          Ver detalle
                        </Button>
                        <Button
                          variant="light"
                          leftSection={<IconFileDescription size={16} />}
                          onClick={() => setDocumentsVehicle(vehicle)}
                        >
                          Documentos
                        </Button>
                      </Group>
                    </Stack>
                  </Paper>
                );
              })}

              {!vehicles.length ? (
                <Paper radius="lg" p="xl" bg="gray.0">
                  <Stack align="center" gap="xs">
                    <ThemeIcon color="gray" variant="light" size={40} radius="xl">
                      <IconCar size={20} />
                    </ThemeIcon>
                    <Text fw={700}>No hay vehiculos registrados</Text>
                    <Text size="sm" c="dimmed" ta="center">
                      Crea un vehiculo para empezar.
                    </Text>
                  </Stack>
                </Paper>
              ) : null}
            </Stack>
          ) : (
            <Table highlightOnHover verticalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Vehiculo</Table.Th>
                  <Table.Th>Tipo / año / peso</Table.Th>
                  <Table.Th>Conductores</Table.Th>
                  <Table.Th>Documentacion</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {vehicles.map((vehicle) => {
                  const soatStatus = getDocumentStatus(daysUntil(vehicle.soatVigencia));
                  const technoStatus = getDocumentStatus(daysUntil(vehicle.tecnomecanicaVigencia));
                  return (
                    <Table.Tr key={vehicle.id}>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text fw={700}>{vehicle.plate}</Text>
                          <Text size="sm" c="dimmed">
                            {formatVehicleIdentity(vehicle) || 'Sin marca, modelo o año'}
                          </Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text size="sm">{vehicle.type ?? 'Sin tipo'}</Text>
                          <Text size="xs" c="dimmed">
                            Año: {vehicle.year ?? '-'}
                          </Text>
                          <Text size="xs" c="dimmed">
                            Peso (Toneladas): {formatCapacity(vehicle.capacity)}
                          </Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {vehicle.drivers.length
                            ? vehicle.drivers.map((driver) => driver.name).join(', ')
                            : 'Sin conductores'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap="xs">
                          <Badge color={soatStatus.color} variant="light" style={{ width: 'fit-content' }}>
                            SOAT: {soatStatus.label}
                          </Badge>
                          <Badge color={technoStatus.color} variant="light" style={{ width: 'fit-content' }}>
                            Tecno: {technoStatus.label}
                          </Badge>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                          <Button size="xs" variant="light" onClick={() => startEdit(vehicle)}>
                            Editar
                          </Button>
                          <ActionIcon
                            variant="light"
                            aria-label={`Ver detalle de ${vehicle.plate}`}
                            onClick={() => setDetailsVehicle(vehicle)}
                          >
                            <IconEye size={16} />
                          </ActionIcon>
                          <ActionIcon
                            color="blue"
                            variant="light"
                            aria-label={`Documentos de ${vehicle.plate}`}
                            onClick={() => setDocumentsVehicle(vehicle)}
                          >
                            <IconFileDescription size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
                {!vehicles.length && (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <Stack align="center" gap="xs" py="lg">
                        <ThemeIcon color="gray" variant="light" size={40} radius="xl">
                          <IconCar size={20} />
                        </ThemeIcon>
                        <Text fw={700}>No hay vehiculos registrados</Text>
                        <Text size="sm" c="dimmed">
                          Crea un vehiculo.
                        </Text>
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          )}
        </Paper>
      </Stack>

      <Modal opened={!!detailsVehicle} onClose={() => setDetailsVehicle(null)} title="Detalle de vehiculo" size="lg">
        {detailsVehicle ? (
          <VehicleDetails
            vehicle={detailsVehicle}
            onEdit={(vehicle) => {
              setDetailsVehicle(null);
              startEdit(vehicle);
            }}
          />
        ) : null}
      </Modal>

      <Modal
        opened={!!documentsVehicle}
        onClose={() => setDocumentsVehicle(null)}
        title={documentsVehicle ? `Documentos de ${documentsVehicle.plate}` : 'Documentos'}
        size="xl"
        centered
      >
        {documentsVehicle ? (
          <FileAttachmentsPanel
            entityType="VEHICLE"
            entityId={documentsVehicle.id}
            title="Documentos del vehiculo"
          />
        ) : null}
      </Modal>

      <Modal opened={!!form} onClose={closeEdit} title={editing ? 'Editar vehiculo' : 'Nuevo vehiculo'} size="lg">
        {form ? (
          <form onSubmit={handleSaveSubmit}>
            <Stack gap="lg">
              {editing ? (
                <Paper
                  withBorder
                  radius="lg"
                  p="md"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(248,250,252,0.96) 0%, rgba(255,247,237,0.96) 100%)',
                  }}
                >
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text fw={700}>{editing.plate}</Text>
                      <Text size="sm" c="dimmed">
                        {formatVehicleIdentity(editing) || 'Sin marca, modelo o año'}
                      </Text>
                    </div>
                    <Badge color="orange" variant="light">
                      {editing.type ?? 'Sin tipo'}
                    </Badge>
                  </Group>
                </Paper>
              ) : null}

              {formError ? (
                <Alert color="red" variant="light" role="alert">
                  {formError}
                </Alert>
              ) : null}

              <Paper withBorder radius="lg" p="md">
                <Stack gap="md">
                  <div>
                    <Text fw={700}>Ficha del vehiculo</Text>
                    <Text size="sm" c="dimmed">
                      Datos basicos para identificar el vehiculo dentro de la flota.
                    </Text>
                  </div>

                  <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="sm">
                    <TextInput
                      label="Placa"
                      name="plate"
                      autoComplete="off"
                      value={form.plate}
                      onChange={(event) => setForm({ ...form, plate: event.currentTarget.value })}
                      required
                    />
                    <Autocomplete
                      label="Marca"
                      name="brand"
                      autoComplete="off"
                      value={form.brand}
                      data={brandOptions}
                      onChange={(value) => setForm({ ...form, brand: value })}
                      placeholder="Escribe para sugerir"
                    />
                    <Autocomplete
                      label="Modelo"
                      name="model"
                      autoComplete="off"
                      value={form.model}
                      data={modelOptions}
                      onChange={(value) => setForm({ ...form, model: value })}
                      placeholder="Escribe para sugerir"
                    />
                    <TextInput
                      label="Año"
                      name="year"
                      autoComplete="off"
                      type="number"
                      min={1900}
                      max={2100}
                      value={form.year}
                      onChange={(event) => setForm({ ...form, year: event.currentTarget.value })}
                      placeholder="Ej. 2024"
                    />
                  </SimpleGrid>

                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <Select
                      label="Tipo"
                      name="vehicleType"
                      value={form.type}
                      data={VEHICLE_TYPE_OPTIONS}
                      onChange={(value) => setForm({ ...form, type: value ?? '' })}
                      clearable
                      leftSection={<IconSteeringWheel size={16} />}
                    />
                    <Select
                      label="Peso (Toneladas)"
                      name="capacity"
                      value={form.capacity}
                      data={CAPACITY_OPTIONS}
                      searchable
                      clearable
                      onChange={(value) => setForm({ ...form, capacity: value ?? '' })}
                    />
                  </SimpleGrid>
                </Stack>
              </Paper>

              <Paper withBorder radius="lg" p="md">
                <Stack gap="md">
                  <div>
                    <Text fw={700}>Documentacion</Text>
                    <Text size="sm" c="dimmed">
                      Registra fechas de vencimiento para control preventivo de la flota.
                    </Text>
                  </div>

                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <TextInput
                      label="SOAT vence"
                      name="soatVigencia"
                      autoComplete="off"
                      type="date"
                      value={form.soatVigencia}
                      onChange={(event) => setForm({ ...form, soatVigencia: event.currentTarget.value })}
                    />
                    <TextInput
                      label="Tecnomecanica vence"
                      name="tecnomecanicaVigencia"
                      autoComplete="off"
                      type="date"
                      value={form.tecnomecanicaVigencia}
                      onChange={(event) =>
                        setForm({ ...form, tecnomecanicaVigencia: event.currentTarget.value })
                      }
                    />
                  </SimpleGrid>
                </Stack>
              </Paper>

              <Group justify="flex-end" className="mobile-actions">
                <Button type="button" variant="default" onClick={closeEdit}>
                  Cancelar
                </Button>
                <Button type="submit" loading={saving}>
                  {editing ? 'Guardar cambios' : 'Crear vehiculo'}
                </Button>
              </Group>
            </Stack>
          </form>
        ) : null}
      </Modal>
    </Container>
  );
}
