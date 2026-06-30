'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  ThemeIcon,
} from '@mantine/core';
import {
  IconBriefcase2,
  IconCar,
  IconPlus,
  IconUserCheck,
  IconUsers,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import EmployeeCard, {
  getEmployeeCardFullName,
  type EmployeeCardRecord,
} from '@/components/EmployeeCard';
import EmployeeViewMenu, {
  setPreferredEmployeeView,
  usePreferredEmployeeView,
} from '@/components/EmployeeViewMenu';
import FileAttachmentsPanel from '@/components/FileAttachmentsPanel';
import StatCard from '@/components/dashboard/StatCard';
import { api, apiBlob, ApiError } from '@/lib/api';

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
  usePreferredEmployeeView('cards');

  const router = useRouter();
  const [employees, setEmployees] = useState<EmployeeCardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentsEmployee, setDocumentsEmployee] = useState<EmployeeCardRecord | null>(null);
  const [downloadingIdentityEmployeeId, setDownloadingIdentityEmployeeId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const employeesData = await api<EmployeeCardRecord[]>('/employees', { method: 'GET' });
      setEmployees(employeesData);
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

  const sortedEmployees = useMemo(() => [...employees].sort(compareEmployeeCards), [employees]);

  const openCreate = () => {
    setPreferredEmployeeView('list');
    router.push('/employees');
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

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <PageHeaderCard
          title="Empleados"
          description="Boceto de empleados en tarjetas con foto de perfil."
          icon={<IconUsers size={20} />}
          iconColor="blue"
          accentColor="rgba(14,165,233,0.14)"
          aside={
            <Group gap="xs">
              <EmployeeViewMenu currentView="cards" />
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
              hint="Usuarios con login"
              color="violet"
              icon={<IconBriefcase2 size={20} />}
            />
            <StatCard
              label="Con vehiculo"
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

        {loading ? (
          <Paper withBorder radius="lg" p="xl">
            <Text c="dimmed" ta="center">
              Cargando...
            </Text>
          </Paper>
        ) : null}

        {!loading && employees.length === 0 ? (
          <Paper withBorder radius="lg" p="xl">
            <Stack align="center" gap="xs">
              <ThemeIcon color="gray" variant="light" size={40} radius="xl">
                <IconUsers size={20} />
              </ThemeIcon>
              <Text fw={700}>No hay empleados registrados</Text>
              <Text size="sm" c="dimmed" ta="center">
                Crea un nuevo empleado desde la vista de tabla.
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
                identityCardLoading={downloadingIdentityEmployeeId === employee.id}
              />
            ))}
          </SimpleGrid>
        ) : null}
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
    </Container>
  );
}
