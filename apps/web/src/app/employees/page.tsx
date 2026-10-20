'use client';

import Link from '@/components/PageTransitionLink';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconCurrencyDollar,
  IconPlus,
  IconSearch,
  IconUsers,
} from '@tabler/icons-react';
import EmployeeCard, {
  getEmployeeCardFullName,
  type EmployeeCardRecord,
} from '@/components/EmployeeCard';
import EmployeeFormModal, {
  emptyEmployeeForm,
  toUppercaseInput,
  type EmployeeForm,
  type VehicleOption,
} from '@/components/EmployeeFormModal';
import FileAttachmentsPanel from '@/components/FileAttachmentsPanel';
import { employeeProfileHref } from '@/lib/employee-profile';
import { api, apiBlob, ApiError } from '@/lib/api';
import { getCurrentUserRole } from '@/lib/auth';
import EmployeePageBackground from '@/components/EmployeePageBackground';
import styles from './directory.module.css';
import EmployeeDirectoryLoading from './EmployeeDirectoryLoading';

const EMPLOYEE_IDENTITY_CATEGORY = 'CEDULA';

type EmployeeAttachedFile = {
  id: string;
  fileType: string;
  category: string | null;
  displayName: string | null;
  originalName: string | null;
};

const roleSortWeight: Partial<Record<EmployeeCardRecord['role'], number>> = {
  MANAGER: 0,
  OFFICE: 1,
  DRIVER: 2,
};

function compareEmployeeCards(a: EmployeeCardRecord, b: EmployeeCardRecord) {
  const statusDelta = Number(b.active) - Number(a.active);
  if (statusDelta !== 0) return statusDelta;

  const roleDelta = (roleSortWeight[a.role] ?? 3) - (roleSortWeight[b.role] ?? 3);
  if (roleDelta !== 0) {
    return roleDelta;
  }

  return getEmployeeCardFullName(a).localeCompare(getEmployeeCardFullName(b), 'es', {
    sensitivity: 'base',
  });
}

function fileLabel(file: EmployeeAttachedFile) {
  return file.displayName?.trim() || file.originalName?.trim() || file.fileType;
}

export default function EmployeeCardsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedEmployeeId = searchParams.get('employeeId');
  const [employees, setEmployees] = useState<EmployeeCardRecord[]>([]);
  const [search, setSearch] = useState('');
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeCardRecord | null>(null);
  const [form, setForm] = useState<EmployeeForm>(emptyEmployeeForm);
  const [documentsEmployee, setDocumentsEmployee] = useState<EmployeeCardRecord | null>(null);
  const [downloadingIdentityEmployeeId, setDownloadingIdentityEmployeeId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [employeesData, vehiclesData] = await Promise.all([
        api<EmployeeCardRecord[]>('/employees', { method: 'GET' }),
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
    if (requestedEmployeeId) {
      router.replace(employeeProfileHref(requestedEmployeeId));
      return;
    }
    loadData();
  }, [requestedEmployeeId, router]);

  const sortedEmployees = useMemo(() => {
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
    const terms = normalize(search).split(/\s+/).filter(Boolean);
    return employees
      .filter(employee => {
        const name = normalize(getEmployeeCardFullName(employee));
        return terms.every(term => name.includes(term));
      })
      .sort(compareEmployeeCards);
  }, [employees, search]);

  const openCreate = () => {
    setError(null);
    setEditingEmployee(null);
    setForm(emptyEmployeeForm);
    setModalOpen(true);
  };

  const openEdit = (employee: EmployeeCardRecord) => {
    setError(null);
    setEditingEmployee(employee);
    setForm({
      name: toUppercaseInput(employee.name),
      lastName: toUppercaseInput(employee.lastName),
      role: employee.role,
      phone: employee.phone ?? '',
      email: employee.email ?? '',
      documentId: toUppercaseInput(employee.documentId),
      active: employee.active,
      payrollEnabled: employee.payrollEnabled ?? true,
      vehicleIds: employee.vehicles.map((vehicle) => vehicle.id),
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
    if (form.loginEnabled && !editingEmployee?.user && !form.loginPassword.trim()) {
      setError('La contraseña de acceso es obligatoria');
      return;
    }

    setSaving(true);
    try {
      const canManageLogin = getCurrentUserRole() === 'ADMIN' || editingEmployee?.user?.role !== 'ADMIN';
      const payload = {
        name: form.name.trim().toUpperCase(),
        lastName: form.lastName.trim().toUpperCase(),
        role: form.role,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        documentId: form.documentId.trim().toUpperCase() || undefined,
        active: form.active,
        payrollEnabled: !editingEmployee && getCurrentUserRole() !== 'ADMIN' ? false : form.payrollEnabled,
        vehicleIds: form.vehicleIds,
        loginEnabled: canManageLogin ? form.loginEnabled : undefined,
        loginIdentifier: canManageLogin && form.loginEnabled
          ? form.loginIdentifier.trim().toLowerCase() || undefined
          : undefined,
        loginPassword: canManageLogin && form.loginEnabled ? form.loginPassword.trim() || undefined : undefined,
        loginRole: canManageLogin && form.loginEnabled ? form.loginRole : undefined,
        loginActive: canManageLogin && form.loginEnabled ? form.loginActive : undefined,
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
            payrollEnabled: payload.payrollEnabled,
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

  const openDocuments = (employee: EmployeeCardRecord) => {
    setDocumentsEmployee(employee);
  };

  const downloadIdentityCard = async (employee: EmployeeCardRecord) => {
    setError(null);
    setDownloadingIdentityEmployeeId(employee.id);
    try {
      const files = await api<EmployeeAttachedFile[]>(`/files/entities/EMPLOYEE/${employee.id}`);
      const identityFile = files.find(
        (file) => (file.category ?? file.fileType) === EMPLOYEE_IDENTITY_CATEGORY,
      );

      if (!identityFile) {
        setError(`No hay documento de identidad cargado para ${getEmployeeCardFullName(employee)}`);
        return;
      }

      const blob = await apiBlob(`/files/${identityFile.id}/download`, { redirectOnAuthError: false });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileLabel(identityFile);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? `${err.status}: ${err.message}` : 'No se pudo descargar la cedula');
    } finally {
      setDownloadingIdentityEmployeeId(null);
    }
  };

  const closeDocuments = () => {
    setDocumentsEmployee(null);
  };

  if (requestedEmployeeId || loading) return <EmployeeDirectoryLoading label={requestedEmployeeId ? 'Abriendo perfil del empleado' : 'Cargando empleados'} />;

  return (
    <Container size="xl" py="xl" className={styles.page}>
      <EmployeePageBackground src="/employees/rev-directory-v1.webp" mobileSrc="/employees/rev-directory-mobile-v1.webp" variant="brand" />
      <Stack gap="lg">
        <Group justify="space-between" align="center" wrap="wrap">
          <Title order={1} className={styles.title}>Empleados</Title>
          <Group gap="xs" wrap="wrap" className={styles.headerActions}>
            <Button component={Link} href="/employees/payroll" variant="light">Nómina</Button>
            <Button component={Link} href="/employees/loans" variant="light" leftSection={<IconCurrencyDollar size={16} />}>
              Préstamos
            </Button>
            <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
              Nuevo empleado
            </Button>
          </Group>
        </Group>

        <section className={styles.surface} aria-label="Directorio de empleados"><Stack gap="lg">
        <TextInput
          type="search"
          label="Buscar empleado"
          placeholder="Buscar por nombre o apellido"
          leftSection={<IconSearch size={18} />}
          value={search}
          onChange={event => setSearch(event.currentTarget.value)}
        />

        {error ? (
          <Alert color="red" variant="light" title="No se pudo completar la accion">
            {error}
          </Alert>
        ) : null}

        {!loading && employees.length === 0 ? (
          <Paper withBorder radius="lg" p="xl" className={styles.emptyState}>
            <Stack align="center" gap="xs">
              <ThemeIcon color="gray" variant="light" size={40} radius="xl">
                <IconUsers size={20} />
              </ThemeIcon>
              <Text fw={700}>No hay empleados registrados</Text>
              <Text size="sm" c="dimmed" ta="center">
                Crea un nuevo empleado para empezar.
              </Text>
            </Stack>
          </Paper>
        ) : null}

        {!loading && employees.length > 0 ? (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {sortedEmployees.map((employee) => (
              <EmployeeCard
                key={employee.id}
                employee={employee}
                onDocuments={openDocuments}
                onIdentityCard={downloadIdentityCard}
                onEdit={openEdit}
                identityCardLoading={downloadingIdentityEmployeeId === employee.id}
                appearance="glass"
              />
            ))}
          </SimpleGrid>
        ) : null}
        {!loading && employees.length > 0 && sortedEmployees.length === 0 ? (
          <Paper withBorder radius="lg" p="xl" className={styles.emptyState}>
            <Text ta="center" c="dimmed">No hay empleados que coincidan con la búsqueda.</Text>
          </Paper>
        ) : null}
        </Stack></section>
      </Stack>

      <Modal
        opened={!!documentsEmployee}
        onClose={closeDocuments}
        title={
          documentsEmployee
            ? `Documentos de ${getEmployeeCardFullName(documentsEmployee)}`
            : 'Documentos'
        }
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
