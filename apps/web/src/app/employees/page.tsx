'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import {
  IconBriefcase2,
  IconCar,
  IconEye,
  IconFileDescription,
  IconMail,
  IconPencil,
  IconPhone,
  IconPlus,
  IconTrash,
  IconUserCheck,
  IconUsers,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import EntityDataTable from '@/components/tables/EntityDataTable';
import type { DataTableColumn } from '@/components/tables/table.types';
import { useClientTableData } from '@/components/tables/useClientTableData';
import EmployeeFormModal, {
  appRoleLabelByValue,
  emptyEmployeeForm,
  roleLabelByValue,
  toUppercaseInput,
  type AppRoleValue,
  type EmployeeForm,
  type RoleValue,
  type VehicleOption,
} from '@/components/EmployeeFormModal';
import EmployeePhotoControl from '@/components/EmployeePhotoControl';
import EmployeePhotoModal from '@/components/EmployeePhotoModal';
import EmployeeViewMenu, { usePreferredEmployeeView } from '@/components/EmployeeViewMenu';
import FileAttachmentsPanel from '@/components/FileAttachmentsPanel';
import StatCard from '@/components/dashboard/StatCard';
import { api, ApiError } from '@/lib/api';

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


function getVehicleSummary(vehicles: VehicleOption[]) {
  if (!vehicles.length) return 'Sin vehículos asignados';
  return vehicles.map((entry) => entry.plate).join(', ');
}

function getEmployeeFullName(employee: Pick<Employee, 'name' | 'lastName'>) {
  return `${employee.name} ${employee.lastName}`.trim();
}

function EmployeeStatusBadge({ active }: { active: boolean }) {
  return (
    <Badge
      color={active ? 'green' : 'gray'}
      variant="light"
      style={{ minWidth: 76, flexShrink: 0, textAlign: 'center' }}
    >
      {active ? 'Activo' : 'Inactivo'}
    </Badge>
  );
}

function EmployeeDetails({
  employee,
  onEdit,
  onDelete,
  onPhotoPreview,
}: {
  employee: Employee;
  onEdit?: (employee: Employee) => void;
  onDelete?: (employee: Employee) => void;
  onPhotoPreview?: (employee: Employee) => void;
}) {
  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Group align="flex-start" gap="sm" wrap="nowrap">
          <EmployeePhotoControl
            employee={employee}
            size={52}
            editable
            onPreview={() => onPhotoPreview?.(employee)}
          />
          <div>
            <Text fw={700} size="lg">
              {getEmployeeFullName(employee)}
            </Text>
            <Text size="sm" c="dimmed">
              {roleLabelByValue[employee.role] ?? employee.role}
            </Text>
          </div>
        </Group>
        <EmployeeStatusBadge active={employee.active} />
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
            Identificación
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
            <Text size="sm">{employee.user?.email ?? 'Sin acceso creado'}</Text>
            <Text size="xs" c="dimmed">
              {employee.user
                ? `${appRoleLabelByValue[employee.user.role]} · ${
                    employee.user.active ? 'Activo' : 'Inactivo'
                  }`
                : 'Este empleado no tiene usuario asociado'}
            </Text>
          </Stack>
        </Paper>

        <Paper withBorder radius="md" p="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Vehículos asignados
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
              Eliminar
            </Button>
          ) : null}
          {onEdit ? (
            <Button variant="light" onClick={() => onEdit(employee)}>
              Editar
            </Button>
          ) : null}
        </Group>
      ) : null}
    </Stack>
  );
}

export default function EmployeesPage() {
  usePreferredEmployeeView('list');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [detailsEmployee, setDetailsEmployee] = useState<Employee | null>(null);
  const [photoEmployee, setPhotoEmployee] = useState<Employee | null>(null);
  const [documentsEmployee, setDocumentsEmployee] = useState<Employee | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(emptyEmployeeForm);

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
    setForm(emptyEmployeeForm);
    setModalOpen(true);
  };

  const openEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setForm({
      name: toUppercaseInput(employee.name),
      lastName: toUppercaseInput(employee.lastName),
      role: employee.role ?? 'DRIVER',
      phone: employee.phone ?? '',
      email: employee.email ?? '',
      documentId: toUppercaseInput(employee.documentId),
      active: employee.active,
      vehicleIds: employee.vehicles.map((entry) => entry.id),
      loginEnabled: Boolean(employee.user),
      loginIdentifier: employee.user?.email ?? '',
      loginPassword: '',
      loginRole:
        employee.user?.role ??
        (['HEAVY_MACHINERY_OPERATOR', 'MACHINIST', 'MECHANIC'].includes(employee.role)
          ? 'OPERATOR'
          : employee.role === 'DRIVER'
            ? 'DRIVER'
            : 'OFFICE'),
      loginActive: employee.user?.active ?? true,
    });
    setModalOpen(true);
  };

  const closeFormModal = () => {
    setModalOpen(false);
    setEditingEmployee(null);
    setForm(emptyEmployeeForm);
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
    if (form.loginEnabled && !form.loginIdentifier.trim()) {
      setError('El usuario o correo de acceso es obligatorio');
      return;
    }
    if (form.loginEnabled && !editingEmployee && !form.loginPassword.trim()) {
      setError('La contraseña de acceso es obligatoria');
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
        loginIdentifier: form.loginEnabled ? form.loginIdentifier.trim().toLowerCase() || undefined : undefined,
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
            loginIdentifier: payload.loginIdentifier,
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
    if (!window.confirm(`Eliminar empleado ${getEmployeeFullName(employee)}?`)) return;

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

  const employeeColumns: DataTableColumn<Employee>[] = [
    {
      id: 'employee',
      header: 'Empleado',
      ariaLabel: 'empleado',
      width: '20%',
      sortValue: (employee) => getEmployeeFullName(employee),
      mobile: { priority: 'primary' },
      cell: (employee) => (
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="sm" align="flex-start" wrap="nowrap">
            <EmployeePhotoControl
              employee={employee}
              size={44}
              editable
              onPreview={() => setPhotoEmployee(employee)}
            />
            <Stack gap={2}>
              <Text fw={700}>{getEmployeeFullName(employee)}</Text>
              <Text size="sm" c="dimmed">{roleLabelByValue[employee.role] ?? employee.role}</Text>
            </Stack>
          </Group>
          <Box hiddenFrom="md">
            <EmployeeStatusBadge active={employee.active} />
          </Box>
        </Group>
      ),
    },
    {
      id: 'contact',
      header: 'Contacto',
      width: '15%',
      mobile: { label: 'Contacto', priority: 'secondary' },
      cell: (employee) => (
        <Stack gap={2}>
          <Text size="sm">{employee.phone ?? '-'}</Text>
          <Text size="xs" c="dimmed">{employee.email ?? 'Sin correo'}</Text>
        </Stack>
      ),
    },
    {
      id: 'document',
      header: 'Documento',
      width: '12%',
      sortValue: (employee) => employee.documentId,
      mobile: false,
      cell: (employee) => employee.documentId ?? '-',
    },
    {
      id: 'access',
      header: 'Acceso',
      width: '21%',
      mobile: { label: 'Acceso', priority: 'detail' },
      cell: (employee) => employee.user ? (
        <Stack gap={2}>
          <Text size="sm">{employee.user.email}</Text>
          <Badge
            color={employee.user.active ? 'blue' : 'gray'}
            variant="light"
            size="sm"
            style={{ width: 'fit-content' }}
          >
            {appRoleLabelByValue[employee.user.role]} · {employee.user.active ? 'Activo' : 'Inactivo'}
          </Badge>
        </Stack>
      ) : <Text size="sm" c="dimmed">Sin acceso</Text>,
    },
    {
      id: 'vehicles',
      header: 'Vehículos',
      width: '16%',
      mobile: { label: 'Vehículos', priority: 'detail' },
      cell: (employee) => <Text size="sm" maw={260}>{getVehicleSummary(employee.vehicles)}</Text>,
    },
    {
      id: 'status',
      header: 'Estado',
      ariaLabel: 'estado',
      width: '10%',
      sortValue: (employee) => employee.active,
      mobile: { priority: 'hidden' },
      cell: (employee) => <EmployeeStatusBadge active={employee.active} />,
    },
  ];

  const employeeTable = useClientTableData({
    rows: employees,
    columns: employeeColumns,
    initialPageSize: 20,
  });

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <PageHeaderCard
          title="Empleados"
          description="Administra empleados, accesos y asignaciones de vehículos desde una sola vista."
          icon={<IconUsers size={20} />}
          iconColor="blue"
          accentColor="rgba(14,165,233,0.14)"
          aside={
            <Group gap="xs">
              <EmployeeViewMenu currentView="list" />
              <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
                Nuevo empleado
              </Button>
            </Group>
          }
        >
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
            <StatCard
              label="Total"
              value={String(metrics.total)}
              hint="Empleados registrados"
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
              label="Con acceso"
              value={String(metrics.withAccess)}
              hint="Usuarios con login habilitado"
              color="violet"
              icon={<IconBriefcase2 size={20} />}
            />
            <StatCard
              label="Con vehículo"
              value={String(metrics.assignedVehicle)}
              hint="Asignaciones vigentes"
              color="teal"
              icon={<IconCar size={20} />}
            />
          </SimpleGrid>
        </PageHeaderCard>

        {error ? (
          <Alert color="red" variant="light" title="No se pudo completar la accion">
            {error}
          </Alert>
        ) : null}

        <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
          <EntityDataTable
            rows={employeeTable.rows}
            columns={employeeColumns}
            getRowId={(employee) => employee.id}
            loading={loading}
            sort={employeeTable.sort}
            onSortChange={employeeTable.onSortChange}
            pagination={employeeTable.pagination}
            onPageSizeChange={employeeTable.onPageSizeChange}
            emptyState={{
              title: 'No hay empleados registrados',
              description: 'Crea un nuevo empleado para empezar.',
              icon: <IconUsers size={20} />,
            }}
            actions={(employee) => [
              {
                key: 'view',
                label: `Ver detalle de ${getEmployeeFullName(employee)}`,
                icon: <IconEye size={16} />,
                color: 'blue',
                onClick: () => setDetailsEmployee(employee),
              },
              {
                key: 'documents',
                label: `Documentos de ${getEmployeeFullName(employee)}`,
                icon: <IconFileDescription size={16} />,
                color: 'violet',
                onClick: () => setDocumentsEmployee(employee),
              },
              {
                key: 'edit',
                label: `Editar ${getEmployeeFullName(employee)}`,
                icon: <IconPencil size={16} />,
                onClick: () => openEdit(employee),
              },
              {
                key: 'delete',
                label: `Eliminar ${getEmployeeFullName(employee)}`,
                icon: <IconTrash size={16} />,
                color: 'red',
                onClick: () => deleteEmployee(employee),
              },
            ]}
          />
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
            onPhotoPreview={setPhotoEmployee}
          />
        ) : null}
      </Modal>

      <EmployeePhotoModal employee={photoEmployee} onClose={() => setPhotoEmployee(null)} />

      <Modal
        opened={!!documentsEmployee}
        onClose={() => setDocumentsEmployee(null)}
        title={documentsEmployee ? `Documentos de ${getEmployeeFullName(documentsEmployee)}` : 'Documentos'}
        centered
        size="xl"
      >
        {documentsEmployee ? (
          <FileAttachmentsPanel
            entityType="EMPLOYEE"
            entityId={documentsEmployee.id}
            title="Documentos del empleado"
          />
        ) : null}
      </Modal>

      <EmployeeFormModal
        opened={modalOpen}
        mode={editingEmployee ? 'edit' : 'create'}
        form={form}
        vehicles={vehicles}
        saving={saving}
        error={modalOpen ? error : null}
        editingEmployee={editingEmployee}
        onClose={closeFormModal}
        onSave={saveEmployee}
        onChange={setForm}
      />
    </Container>
  );
}
