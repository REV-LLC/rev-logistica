'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  MultiSelect,
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
  IconBriefcase2,
  IconCar,
  IconEye,
  IconMail,
  IconPhone,
  IconPlus,
  IconTrash,
  IconUserCheck,
  IconUsers,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import StatCard from '@/components/dashboard/StatCard';
import { api, apiBlob, ApiError } from '@/lib/api';

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
  lastName: string;
  role: RoleValue;
  phone: string | null;
  email: string | null;
  documentId: string | null;
  active: boolean;
  createdAt: string;
  vehicles: VehicleOption[];
  user: {
    id: string;
    email: string;
    role: AppRoleValue;
    active: boolean;
  } | null;
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
  lastName: string;
  role: RoleValue;
  phone: string;
  email: string;
  documentId: string;
  active: boolean;
  vehicleIds: string[];
  loginEnabled: boolean;
  loginEmail: string;
  loginPassword: string;
  loginRole: AppRoleValue;
  loginActive: boolean;
};

type AppRoleValue = 'ADMIN' | 'OFFICE' | 'DRIVER';

const emptyForm: EmployeeForm = {
  name: '',
  lastName: '',
  role: 'DRIVER',
  phone: '',
  email: '',
  documentId: '',
  active: true,
  vehicleIds: [],
  loginEnabled: false,
  loginEmail: '',
  loginPassword: '',
  loginRole: 'DRIVER',
  loginActive: true,
};

const roleOptions = [
  { value: 'DRIVER', label: 'Driver' },
  { value: 'HEAVY_MACHINERY_OPERATOR', label: 'Operario maquinaria amarilla' },
  { value: 'MACHINIST', label: 'Machinero' },
  { value: 'OFFICE', label: 'Oficina' },
  { value: 'MANAGER', label: 'Gerente' },
  { value: 'OPERATIONS_MANAGER', label: 'Jefe operaciones' },
  { value: 'MECHANIC', label: 'Mechanic' },
  { value: 'WAREHOUSE_KEEPER', label: 'Bodeguero' },
  { value: 'OTHER', label: 'Otro' },
];

const roleLabelByValue: Record<RoleValue, string> = {
  DRIVER: 'Driver',
  HEAVY_MACHINERY_OPERATOR: 'Operario maquinaria amarilla',
  MACHINIST: 'Machinero',
  OFFICE: 'Oficina',
  MANAGER: 'Gerente',
  OPERATIONS_MANAGER: 'Jefe operaciones',
  MECHANIC: 'Mechanic',
  WAREHOUSE_KEEPER: 'Bodeguero',
  OTHER: 'Otro',
};

const appRoleOptions = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'OFFICE', label: 'Oficina' },
  { value: 'DRIVER', label: 'Driver' },
];

const appRoleLabelByValue: Record<AppRoleValue, string> = {
  ADMIN: 'Admin',
  OFFICE: 'Oficina',
  DRIVER: 'Driver',
};

function getVehicleSummary(vehicles: VehicleOption[]) {
  if (!vehicles.length) return 'No assigned vehicles';
  return vehicles.map((entry) => entry.plate).join(', ');
}

function getEmployeeFullName(employee: Pick<Employee, 'name' | 'lastName'>) {
  return `${employee.name} ${employee.lastName}`.trim();
}

function getEmployeeInitials(employee: Pick<Employee, 'name' | 'lastName'>) {
  const parts = getEmployeeFullName(employee).split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` || 'E';
}

function EmployeeAvatar({ employee, size = 40 }: { employee: Employee; size?: number }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setPhotoUrl(null);

    apiBlob(`/employees/${employee.id}/photo`, { redirectOnAuthError: false })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPhotoUrl(objectUrl);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [employee.id]);

  return (
    <Avatar src={photoUrl} radius="xl" size={size} color="blue" alt={getEmployeeFullName(employee)}>
      {getEmployeeInitials(employee)}
    </Avatar>
  );
}

function EmployeeDetails({
  employee,
  onEdit,
  onDelete,
}: {
  employee: Employee;
  onEdit?: (employee: Employee) => void;
  onDelete?: (employee: Employee) => void;
}) {
  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Group align="flex-start" gap="sm" wrap="nowrap">
          <EmployeeAvatar employee={employee} size={44} />
          <div>
            <Text fw={700} size="lg">
              {getEmployeeFullName(employee)}
            </Text>
            <Text size="sm" c="dimmed">
              {roleLabelByValue[employee.role] ?? employee.role}
            </Text>
          </div>
        </Group>
        <Badge color={employee.active ? 'green' : 'gray'} variant="light">
          {employee.active ? 'Active' : 'Inactive'}
        </Badge>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <Paper withBorder radius="md" p="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Contacto
          </Text>
          <Stack gap={6} mt={8}>
            <Group gap={8} wrap="nowrap">
              <IconPhone size={14} />
              <Text size="sm">{employee.phone ?? '-'}</Text>
            </Group>
            <Group gap={8} wrap="nowrap">
              <IconMail size={14} />
              <Text size="sm">{employee.email ?? '-'}</Text>
            </Group>
          </Stack>
        </Paper>

        <Paper withBorder radius="md" p="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Identification
          </Text>
          <Text size="sm" mt={8}>
            {employee.documentId ?? '-'}
          </Text>
        </Paper>

        <Paper withBorder radius="md" p="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Acceso a la app
          </Text>
          <Stack gap={4} mt={8}>
            <Text size="sm">{employee.user?.email ?? 'No access created'}</Text>
            <Text size="xs" c="dimmed">
              {employee.user
                ? `${appRoleLabelByValue[employee.user.role]} · ${
                    employee.user.active ? 'Active' : 'Inactive'
                  }`
                : 'Este empleado no tiene usuario asociado'}
            </Text>
          </Stack>
        </Paper>

        <Paper withBorder radius="md" p="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Assigned vehicles
          </Text>
          <Text size="sm" mt={8}>
            {getVehicleSummary(employee.vehicles)}
          </Text>
        </Paper>
      </SimpleGrid>

      {onEdit || onDelete ? (
        <Group className="mobile-actions">
          {onDelete ? (
            <Button color="red" variant="light" onClick={() => onDelete(employee)}>
              Delete
            </Button>
          ) : null}
          {onEdit ? (
            <Button variant="light" onClick={() => onEdit(employee)}>
              Edit
            </Button>
          ) : null}
        </Group>
      ) : null}
    </Stack>
  );
}

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

  const metrics = useMemo(() => {
    const activeCount = employees.filter((employee) => employee.active).length;
    const withAccessCount = employees.filter((employee) => employee.user).length;
    const assignedVehicleCount = employees.filter((employee) => employee.vehicles.length > 0).length;
    return {
      total: employees.length,
      active: activeCount,
      withAccess: withAccessCount,
      assignedVehicle: assignedVehicleCount,
    };
  }, [employees]);

  const openCreate = () => {
    setEditingEmployee(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setForm({
      name: employee.name ?? '',
      lastName: employee.lastName ?? '',
      role: employee.role ?? 'DRIVER',
      phone: employee.phone ?? '',
      email: employee.email ?? '',
      documentId: employee.documentId ?? '',
      active: employee.active,
      vehicleIds: employee.vehicles.map((entry) => entry.id),
      loginEnabled: Boolean(employee.user),
      loginEmail: employee.user?.email ?? '',
      loginPassword: '',
      loginRole: employee.user?.role ?? (employee.role === 'DRIVER' ? 'DRIVER' : 'OFFICE'),
      loginActive: employee.user?.active ?? true,
    });
    setModalOpen(true);
  };

  const closeFormModal = () => {
    setModalOpen(false);
    setEditingEmployee(null);
    setForm(emptyForm);
  };

  const saveEmployee = async () => {
    setError(null);

    if (!form.name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (!form.lastName.trim()) {
      setError('El apellido es obligatorio');
      return;
    }
    if (form.loginEnabled && !form.loginEmail.trim()) {
      setError('Access email is required');
      return;
    }
    if (form.loginEnabled && !editingEmployee && !form.loginPassword.trim()) {
      setError('Access password is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim().toUpperCase(),
        lastName: form.lastName.trim().toUpperCase(),
        role: form.role,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        documentId: form.documentId.trim().toUpperCase() || undefined,
        active: form.active,
        vehicleIds: form.vehicleIds,
        loginEnabled: form.loginEnabled,
        loginEmail: form.loginEnabled ? form.loginEmail.trim().toLowerCase() || undefined : undefined,
        loginPassword: form.loginEnabled ? form.loginPassword.trim() || undefined : undefined,
        loginRole: form.loginEnabled ? form.loginRole : undefined,
        loginActive: form.loginEnabled ? form.loginActive : undefined,
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
            lastName: payload.lastName,
            role: payload.role,
            phone: payload.phone,
            email: payload.email,
            documentId: payload.documentId,
            vehicleIds: payload.vehicleIds,
            loginEmail: payload.loginEmail,
            loginPassword: payload.loginPassword,
            loginRole: payload.loginRole,
            loginActive: payload.loginActive,
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
        setError('Error guardando empleado');
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteEmployee = async (employee: Employee) => {
    if (!window.confirm(`Delete employee ${getEmployeeFullName(employee)}?`)) return;

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
      <Stack gap="lg">
        <PageHeaderCard
          title="Employees"
          description="Manage staff, access, and vehicle assignments from one view."
          icon={<IconUsers size={20} />}
          iconColor="blue"
          accentColor="rgba(14,165,233,0.14)"
          aside={
            <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
              New employee
            </Button>
          }
        >
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
            <StatCard
              label="Total"
              value={String(metrics.total)}
              hint="Registered employees"
              color="blue"
              icon={<IconUsers size={20} />}
            />
            <StatCard
              label="Activos"
              value={String(metrics.active)}
              hint={`${Math.max(metrics.total - metrics.active, 0)} inactivos`}
              color="green"
              icon={<IconUserCheck size={20} />}
            />
            <StatCard
              label="With access"
              value={String(metrics.withAccess)}
              hint="Usuarios con login habilitado"
              color="violet"
              icon={<IconBriefcase2 size={20} />}
            />
            <StatCard
              label="With vehicle"
              value={String(metrics.assignedVehicle)}
              hint="Asignaciones vigentes"
              color="teal"
              icon={<IconCar size={20} />}
            />
          </SimpleGrid>
        </PageHeaderCard>

        {error ? (
          <Alert color="red" variant="light" title="Could not complete the action">
            {error}
          </Alert>
        ) : null}

        <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
          {isMobile ? (
            <Stack gap="sm">
              {!loading &&
                employees.map((employee) => (
                  <Paper key={employee.id} withBorder radius="lg" p="md">
                    <Stack gap="md">
                      <Group justify="space-between" align="flex-start">
                        <Group align="flex-start" gap="sm" wrap="nowrap">
                          <EmployeeAvatar employee={employee} size={42} />
                          <div>
                            <Text fw={700}>{getEmployeeFullName(employee)}</Text>
                            <Text size="sm" c="dimmed">
                              {roleLabelByValue[employee.role] ?? employee.role}
                            </Text>
                          </div>
                        </Group>
                        <Badge color={employee.active ? 'green' : 'gray'} variant="light">
                          {employee.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </Group>

                      <SimpleGrid cols={2} spacing="sm">
                        <div>
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                            Contacto
                          </Text>
                          <Text size="sm">{employee.phone ?? employee.email ?? '-'}</Text>
                        </div>
                        <div>
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                            Acceso
                          </Text>
                          <Text size="sm">{employee.user ? appRoleLabelByValue[employee.user.role] : 'No'}</Text>
                        </div>
                      </SimpleGrid>

                      <Text size="sm" c="dimmed">
                        {getVehicleSummary(employee.vehicles)}
                      </Text>

                      <Group grow>
                        <Button
                          variant="light"
                          leftSection={<IconEye size={16} />}
                          onClick={() => setDetailsEmployee(employee)}
                        >
                          Ver detalle
                        </Button>
                        <ActionIcon
                          color="red"
                          variant="light"
                          size={36}
                          aria-label="Delete employee"
                          onClick={() => deleteEmployee(employee)}
                        >
                          <IconTrash size={18} />
                        </ActionIcon>
                      </Group>
                    </Stack>
                  </Paper>
                ))}

              {!loading && employees.length === 0 ? (
                <Paper radius="lg" p="xl" bg="gray.0">
                  <Stack align="center" gap="xs">
                    <ThemeIcon color="gray" variant="light" size={40} radius="xl">
                      <IconUsers size={20} />
                    </ThemeIcon>
                    <Text fw={700}>No employees registered</Text>
                    <Text size="sm" c="dimmed" ta="center">
                      Crea un nuevo empleado para empezar.
                    </Text>
                  </Stack>
                </Paper>
              ) : null}

              {loading ? (
                <Paper radius="lg" p="xl" bg="gray.0">
                  <Text c="dimmed" ta="center">
                    Loading...
                  </Text>
                </Paper>
              ) : null}
            </Stack>
          ) : (
            <Table highlightOnHover verticalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Employee</Table.Th>
                  <Table.Th>Contacto</Table.Th>
                  <Table.Th>Documento</Table.Th>
                  <Table.Th>Acceso</Table.Th>
                  <Table.Th>Vehicles</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {!loading &&
                  employees.map((employee) => (
                    <Table.Tr key={employee.id}>
                      <Table.Td>
                        <Group gap="sm" wrap="nowrap">
                          <EmployeeAvatar employee={employee} size={36} />
                          <Stack gap={2}>
                            <Text fw={700}>{getEmployeeFullName(employee)}</Text>
                            <Text size="sm" c="dimmed">
                              {roleLabelByValue[employee.role] ?? employee.role}
                            </Text>
                          </Stack>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text size="sm">{employee.phone ?? '-'}</Text>
                          <Text size="xs" c="dimmed">
                            {employee.email ?? 'No email'}
                          </Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>{employee.documentId ?? '-'}</Table.Td>
                      <Table.Td>
                        {employee.user ? (
                          <Stack gap={2}>
                            <Text size="sm">{employee.user.email}</Text>
                            <Badge
                              color={employee.user.active ? 'blue' : 'gray'}
                              variant="light"
                              size="sm"
                              style={{ width: 'fit-content' }}
                            >
                              {appRoleLabelByValue[employee.user.role]} ·{' '}
                              {employee.user.active ? 'Active' : 'Inactive'}
                            </Badge>
                          </Stack>
                        ) : (
                          <Text size="sm" c="dimmed">
                            No access
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" maw={260}>
                          {getVehicleSummary(employee.vehicles)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={employee.active ? 'green' : 'gray'} variant="light">
                          {employee.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                          <Button size="xs" variant="light" onClick={() => openEdit(employee)}>
                            Edit
                          </Button>
                          <ActionIcon
                            color="gray"
                            variant="light"
                            aria-label={`Ver detalle de ${getEmployeeFullName(employee)}`}
                            onClick={() => setDetailsEmployee(employee)}
                          >
                            <IconEye size={16} />
                          </ActionIcon>
                          <ActionIcon
                            color="red"
                            variant="light"
                            aria-label="Delete employee"
                            onClick={() => deleteEmployee(employee)}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}

                {!loading && employees.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={7}>
                      <Stack align="center" gap="xs" py="lg">
                        <ThemeIcon color="gray" variant="light" size={40} radius="xl">
                          <IconUsers size={20} />
                        </ThemeIcon>
                        <Text fw={700}>No employees to show</Text>
                        <Text size="sm" c="dimmed">
                          Registra un nuevo empleado.
                        </Text>
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                )}

                {loading && (
                  <Table.Tr>
                    <Table.Td colSpan={7}>
                      <Text c="dimmed" ta="center">
                        Loading...
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
        opened={!!detailsEmployee}
        onClose={() => setDetailsEmployee(null)}
        title="Detalle de empleado"
        centered
        size="lg"
      >
        {detailsEmployee ? (
          <EmployeeDetails
            employee={detailsEmployee}
            onEdit={(employee) => {
              setDetailsEmployee(null);
              openEdit(employee);
            }}
            onDelete={(employee) => {
              setDetailsEmployee(null);
              deleteEmployee(employee);
            }}
          />
        ) : null}
      </Modal>

      <Modal
        opened={modalOpen}
        onClose={closeFormModal}
        title={editingEmployee ? 'Edit employee' : 'New employee'}
        centered
        size="lg"
      >
        <Stack gap="lg">
          {editingEmployee ? (
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
                  <Text fw={700}>{getEmployeeFullName(editingEmployee)}</Text>
                  <Text size="sm" c="dimmed">
                    {roleLabelByValue[editingEmployee.role] ?? editingEmployee.role}
                  </Text>
                </div>
                <Badge color={form.active ? 'green' : 'gray'} variant="light">
                  {form.active ? 'Active' : 'Inactive'}
                </Badge>
              </Group>
            </Paper>
          ) : null}

          <Paper withBorder radius="lg" p="md">
            <Stack gap="md">
              <div>
                <Text fw={700}>Perfil del empleado</Text>
                <Text size="sm" c="dimmed">
                  Basic data to identify the collaborator in the system.
                </Text>
              </div>

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  label="Nombres"
                  placeholder="Nombres"
                  value={form.name}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((prev) => ({ ...prev, name: value }));
                  }}
                  required
                />
                <TextInput
                  label="Apellidos"
                  placeholder="Apellidos"
                  value={form.lastName}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((prev) => ({ ...prev, lastName: value }));
                  }}
                  required
                />
              </SimpleGrid>

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
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
                <TextInput
                  label="Phone"
                  placeholder="Contact number"
                  value={form.phone}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((prev) => ({ ...prev, phone: value }));
                  }}
                />
                <TextInput
                  label="Email"
                  placeholder="Correo de contacto"
                  value={form.email}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((prev) => ({ ...prev, email: value }));
                  }}
                />
              </SimpleGrid>

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  label="Documento"
                  placeholder="Document or identification"
                  value={form.documentId}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setForm((prev) => ({ ...prev, documentId: value }));
                  }}
                />
                <Switch
                  mt="xl"
                  checked={form.active}
                  label="Active employee"
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, active: event.currentTarget.checked }))
                  }
                />
              </SimpleGrid>
            </Stack>
          </Paper>

          <Paper withBorder radius="lg" p="md">
            <Stack gap="md">
              <div>
                <Text fw={700}>Operational assignment</Text>
                <Text size="sm" c="dimmed">
                  Link the vehicles currently assigned to this employee.
                </Text>
              </div>

              <MultiSelect
                label="Assigned vehicles"
                placeholder="Select one or more vehicles"
                value={form.vehicleIds}
                onChange={(value) => setForm((prev) => ({ ...prev, vehicleIds: value }))}
                data={vehicles.map((vehicle) => ({
                  value: vehicle.id,
                  label: `${vehicle.plate}${vehicle.brand ? ` · ${vehicle.brand}` : ''}${
                    vehicle.model ? ` ${vehicle.model}` : ''
                  }`,
                }))}
                searchable
                nothingFoundMessage="No results"
              />
            </Stack>
          </Paper>

          <Paper withBorder radius="lg" p="md">
            <Stack gap="md">
              <div>
                <Text fw={700}>Acceso a la app</Text>
                <Text size="sm" c="dimmed">
                  Control whether the employee can enter the system and with which operational role.
                </Text>
              </div>

              <Switch
                checked={form.loginEnabled}
                label="Create or keep access for this employee"
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, loginEnabled: event.currentTarget.checked }))
                }
              />

              {form.loginEnabled ? (
                <Stack gap="md">
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <TextInput
                      label="Access email"
                      placeholder="usuario@empresa.com"
                      value={form.loginEmail}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setForm((prev) => ({ ...prev, loginEmail: value }));
                      }}
                      required
                    />
                    <Select
                      label="Rol en la app"
                      value={form.loginRole}
                      onChange={(value) =>
                        setForm((prev) => ({ ...prev, loginRole: (value as AppRoleValue) ?? 'DRIVER' }))
                      }
                      data={appRoleOptions}
                      allowDeselect={false}
                    />
                  </SimpleGrid>

                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <TextInput
                      label={editingEmployee ? 'New password (optional)' : 'Password'}
                      placeholder={
                        editingEmployee ? 'Leave empty to keep the current one' : 'Initial password'
                      }
                      type="password"
                      value={form.loginPassword}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setForm((prev) => ({ ...prev, loginPassword: value }));
                      }}
                    />
                    <Switch
                      mt="xl"
                      checked={form.loginActive}
                      label="Usuario activo"
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, loginActive: event.currentTarget.checked }))
                      }
                    />
                  </SimpleGrid>
                </Stack>
              ) : (
                <Paper radius="md" p="sm" bg="gray.0">
                  <Text size="sm" c="dimmed">
                    This employee will lose system access. Their operational data will remain available.
                  </Text>
                </Paper>
              )}
            </Stack>
          </Paper>

          <Group justify="flex-end" className="mobile-actions">
            <Button variant="default" onClick={closeFormModal}>
              Cancel
            </Button>
            <Button loading={saving} onClick={saveEmployee}>
              {editingEmployee ? 'Save changes' : 'Create employee'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
