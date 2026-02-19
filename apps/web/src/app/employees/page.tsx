'use client';

import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  MultiSelect,
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
import { IconEye, IconTrash } from '@tabler/icons-react';
import { api, ApiError } from '@/lib/api';

type VehicleOption = {
  id: string;
  plate: string;
  brand?: string | null;
  model?: string | null;
  active?: boolean;
};

type Employee = {
  id: string;
  name: string;
  role: RoleValue;
  phone: string | null;
  email: string | null;
  documentId: string | null;
  active: boolean;
  createdAt: string;
  vehicles: VehicleOption[];
};

type RoleValue =
  | 'DRIVER'
  | 'HEAVY_MACHINERY_OPERATOR'
  | 'MACHINIST'
  | 'OFFICE'
  | 'MANAGER'
  | 'OPERATIONS_MANAGER'
  | 'MECHANIC'
  | 'WAREHOUSE_KEEPER'
  | 'OTHER';

type EmployeeForm = {
  name: string;
  role: RoleValue;
  phone: string;
  email: string;
  documentId: string;
  active: boolean;
  vehicleIds: string[];
};

const emptyForm: EmployeeForm = {
  name: '',
  role: 'DRIVER',
  phone: '',
  email: '',
  documentId: '',
  active: true,
  vehicleIds: [],
};

const roleOptions = [
  { value: 'DRIVER', label: 'Conductor' },
  { value: 'HEAVY_MACHINERY_OPERATOR', label: 'Operario maquinaria amarilla' },
  { value: 'MACHINIST', label: 'Machinero' },
  { value: 'OFFICE', label: 'Oficina' },
  { value: 'MANAGER', label: 'Gerente' },
  { value: 'OPERATIONS_MANAGER', label: 'Jefe operaciones' },
  { value: 'MECHANIC', label: 'Mecánico' },
  { value: 'WAREHOUSE_KEEPER', label: 'Bodeguero' },
  { value: 'OTHER', label: 'Otro' },
];

const roleLabelByValue: Record<RoleValue, string> = {
  DRIVER: 'Conductor',
  HEAVY_MACHINERY_OPERATOR: 'Operario maquinaria amarilla',
  MACHINIST: 'Machinero',
  OFFICE: 'Oficina',
  MANAGER: 'Gerente',
  OPERATIONS_MANAGER: 'Jefe operaciones',
  MECHANIC: 'Mecánico',
  WAREHOUSE_KEEPER: 'Bodeguero',
  OTHER: 'Otro',
};

export default function EmployeesPage() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [detailsEmployee, setDetailsEmployee] = useState<Employee | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [employeesData, vehiclesData] = await Promise.all([
        api<Employee[]>('/employees', { method: 'GET' }),
        api<VehicleOption[]>('/vehicles', { method: 'GET' }),
      ]);
      setEmployees(employeesData);
      setVehicles(vehiclesData);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error cargando empleados');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setEditingEmployee(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setForm({
      name: employee.name ?? '',
      role: employee.role ?? 'DRIVER',
      phone: employee.phone ?? '',
      email: employee.email ?? '',
      documentId: employee.documentId ?? '',
      active: employee.active,
      vehicleIds: employee.vehicles.map((entry) => entry.id),
    });
    setModalOpen(true);
  };

  const saveEmployee = async () => {
    setError(null);

    if (!form.name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim().toUpperCase(),
        role: form.role,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        documentId: form.documentId.trim().toUpperCase() || undefined,
        active: form.active,
        vehicleIds: form.vehicleIds,
      };

      if (editingEmployee) {
        await api(`/employees/${editingEmployee.id}`, {
          method: 'PATCH',
          json: payload,
        });
      } else {
        await api('/employees', {
          method: 'POST',
          json: {
            name: payload.name,
            role: payload.role,
            phone: payload.phone,
            email: payload.email,
            documentId: payload.documentId,
            vehicleIds: payload.vehicleIds,
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
        setError('Error guardando empleado');
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteEmployee = async (employee: Employee) => {
    if (!window.confirm(`¿Eliminar empleado ${employee.name}?`)) return;

    setError(null);
    try {
      await api(`/employees/${employee.id}`, { method: 'DELETE' });
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error eliminando empleado');
      }
    }
  };

  return (
    <Container size="xl" py="xl">
      <Paper shadow="sm" p="xl" radius="md" withBorder>
        <Group justify="space-between" mb="md">
          <Title order={2}>Empleados</Title>
          <Button onClick={openCreate}>Nuevo empleado</Button>
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
              {!isMobile ? <Table.Th>Rol</Table.Th> : null}
              {!isMobile ? <Table.Th>Teléfono</Table.Th> : null}
              {!isMobile ? <Table.Th>Email</Table.Th> : null}
              {!isMobile ? <Table.Th>Documento</Table.Th> : null}
              {!isMobile ? <Table.Th>Vehículos</Table.Th> : null}
              <Table.Th style={isMobile ? { width: '30%' } : undefined}>Estado</Table.Th>
              {isMobile ? <Table.Th style={{ width: '20%' }}>Ver</Table.Th> : null}
              {!isMobile ? <Table.Th /> : null}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {!loading &&
              employees.map((employee) => (
                <Table.Tr key={employee.id}>
                  <Table.Td>{employee.name}</Table.Td>
                  {!isMobile ? <Table.Td>{roleLabelByValue[employee.role] ?? employee.role}</Table.Td> : null}
                  {!isMobile ? <Table.Td>{employee.phone ?? '-'}</Table.Td> : null}
                  {!isMobile ? <Table.Td>{employee.email ?? '-'}</Table.Td> : null}
                  {!isMobile ? <Table.Td>{employee.documentId ?? '-'}</Table.Td> : null}
                  {!isMobile ? (
                    <Table.Td>
                      {employee.vehicles.length
                        ? employee.vehicles.map((entry) => entry.plate).join(', ')
                        : '-'}
                    </Table.Td>
                  ) : null}
                  <Table.Td>
                    <Badge color={employee.active ? 'green' : 'gray'} variant="light">
                      {employee.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </Table.Td>
                  {isMobile ? (
                    <Table.Td>
                      <ActionIcon
                        variant="light"
                        aria-label={`Ver detalle de ${employee.name}`}
                        onClick={() => setDetailsEmployee(employee)}
                      >
                        <IconEye size={16} />
                      </ActionIcon>
                    </Table.Td>
                  ) : (
                    <Table.Td>
                      <Group gap="xs" justify="flex-end">
                        <Button size="xs" variant="light" onClick={() => openEdit(employee)}>
                          Editar
                        </Button>
                        <ActionIcon
                          color="red"
                          variant="light"
                          aria-label="Eliminar empleado"
                          onClick={() => deleteEmployee(employee)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}

            {!loading && employees.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={isMobile ? 4 : 8}>
                  <Text c="dimmed" ta="center">
                    No hay empleados registrados.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}

            {loading && (
              <Table.Tr>
                <Table.Td colSpan={isMobile ? 4 : 8}>
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
        opened={!!detailsEmployee}
        onClose={() => setDetailsEmployee(null)}
        title="Detalle de empleado"
        centered
      >
        {detailsEmployee ? (
          <Stack gap="xs">
            <Text><strong>Nombre:</strong> {detailsEmployee.name}</Text>
            <Text><strong>Rol:</strong> {roleLabelByValue[detailsEmployee.role] ?? detailsEmployee.role}</Text>
            <Text><strong>Teléfono:</strong> {detailsEmployee.phone ?? '-'}</Text>
            <Text><strong>Email:</strong> {detailsEmployee.email ?? '-'}</Text>
            <Text><strong>Documento:</strong> {detailsEmployee.documentId ?? '-'}</Text>
            <Text>
              <strong>Vehículos:</strong>{' '}
              {detailsEmployee.vehicles.length
                ? detailsEmployee.vehicles.map((entry) => entry.plate).join(', ')
                : '-'}
            </Text>
            <Text><strong>Estado:</strong> {detailsEmployee.active ? 'Activo' : 'Inactivo'}</Text>

            <Group className="mobile-actions" mt="sm">
              <Button
                variant="light"
                onClick={() => {
                  setDetailsEmployee(null);
                  openEdit(detailsEmployee);
                }}
              >
                Editar
              </Button>
              <Button
                color="red"
                variant="light"
                onClick={() => {
                  setDetailsEmployee(null);
                  deleteEmployee(detailsEmployee);
                }}
              >
                Eliminar
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingEmployee ? 'Editar empleado' : 'Nuevo empleado'}
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
          <Select
            label="Rol"
            value={form.role}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, role: (value as RoleValue) ?? 'DRIVER' }))
            }
            data={roleOptions}
            allowDeselect={false}
            required
          />
          <Group grow className="mobile-stack">
            <TextInput
              label="Teléfono"
              value={form.phone}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setForm((prev) => ({ ...prev, phone: value }));
              }}
            />
            <TextInput
              label="Email"
              value={form.email}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setForm((prev) => ({ ...prev, email: value }));
              }}
            />
          </Group>
          <TextInput
            label="Documento"
            value={form.documentId}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((prev) => ({ ...prev, documentId: value }));
            }}
          />
          <MultiSelect
            label="Vehículos asignados"
            value={form.vehicleIds}
            onChange={(value) => setForm((prev) => ({ ...prev, vehicleIds: value }))}
            data={vehicles.map((vehicle) => ({
              value: vehicle.id,
              label: `${vehicle.plate}${vehicle.brand ? ` · ${vehicle.brand}` : ''}${vehicle.model ? ` ${vehicle.model}` : ''}`,
            }))}
            searchable
            clearable
          />
          {editingEmployee && (
            <Switch
              label="Activo"
              checked={form.active}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, active: event.currentTarget.checked }))
              }
            />
          )}

          <Group justify="flex-end" className="mobile-actions">
            <Button variant="default" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveEmployee} loading={saving}>
              Guardar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
