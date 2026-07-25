'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import {
  IconGauge,
  IconHistory,
  IconPlus,
  IconSettings,
  IconTool,
} from '@tabler/icons-react';
import CompleteMaintenanceModal from './CompleteMaintenanceModal';
import HourReadingHistory from './HourReadingHistory';
import MaintenanceItemFormModal from './MaintenanceItemFormModal';
import MaintenancePlanFormModal from './MaintenancePlanFormModal';
import MaintenancePlanList from './MaintenancePlanList';
import RecordHoursModal from './RecordHoursModal';
import { api } from '@/lib/api';
import { getCurrentUserRole } from '@/lib/auth';
import {
  apiErrorMessage,
  type AppUserOption,
  type MaintenanceItem,
  type MaintenancePlan,
  type MaintenanceResponse,
  type MaintenanceSubject,
  type NotificationReminder,
} from '@/lib/maintenance-types';

export default function MaintenancePanel({ subject }: { subject: MaintenanceSubject }) {
  const role = getCurrentUserRole();
  const canManage = role === 'ADMIN' || role === 'OFFICE';
  const [data, setData] = useState<MaintenanceResponse | null>(null);
  const [users, setUsers] = useState<AppUserOption[]>([]);
  const [reminders, setReminders] = useState<NotificationReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hoursOpened, setHoursOpened] = useState(false);
  const [planOpened, setPlanOpened] = useState(false);
  const [itemPlan, setItemPlan] = useState<MaintenancePlan | null>(null);
  const [editingItem, setEditingItem] = useState<MaintenanceItem | null>(null);
  const [completingItem, setCompletingItem] = useState<MaintenanceItem | null>(null);
  const [editingPlan, setEditingPlan] = useState<MaintenancePlan | null>(null);
  const [planName, setPlanName] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);

  const routeSegment = subject.type === 'ASSET' ? 'assets' : 'vehicles';

  const load = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [maintenance, activeUsers, allReminders] = await Promise.all([
        api<MaintenanceResponse>(`/maintenance/${routeSegment}/${subject.id}`),
        api<AppUserOption[]>('/users?active=true'),
        api<NotificationReminder[]>('/notifications/reminders'),
      ]);
      setData(maintenance);
      setUsers(activeUsers);
      setReminders(allReminders);
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo cargar el mantenimiento.'));
    } finally {
      setLoading(false);
    }
  }, [canManage, routeSegment, subject.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const reminderByItemId = useMemo(
    () => new Map(reminders.filter((reminder) => reminder.itemId).map((reminder) => [reminder.itemId!, reminder])),
    [reminders],
  );

  const refreshWithSuccess = async (message: string) => {
    await load();
    setSuccess(message);
  };

  const archivePlan = async (plan: MaintenancePlan) => {
    if (!window.confirm(`¿Archivar el plan "${plan.name}"? El historial se conservará.`)) return;
    setError(null);
    try {
      await api(`/maintenance/plans/${plan.id}`, { method: 'DELETE' });
      await refreshWithSuccess('Plan archivado.');
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo archivar el plan.'));
    }
  };

  const archiveItem = async (item: MaintenanceItem) => {
    if (!window.confirm(`¿Archivar la revisión "${item.name}"? El historial se conservará.`)) return;
    setError(null);
    try {
      await api(`/maintenance/items/${item.id}`, { method: 'DELETE' });
      await refreshWithSuccess('Revisión archivada.');
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo archivar la revisión.'));
    }
  };

  const savePlanName = async () => {
    if (!editingPlan || !planName.trim()) return;
    setSavingPlan(true);
    setError(null);
    try {
      await api(`/maintenance/plans/${editingPlan.id}`, {
        method: 'PATCH',
        json: { name: planName.trim() },
      });
      setEditingPlan(null);
      await refreshWithSuccess('Plan actualizado.');
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo actualizar el plan.'));
    } finally {
      setSavingPlan(false);
    }
  };

  if (!canManage) {
    return (
      <Alert color="yellow" title="Acceso de consulta limitado">
        La administración de mantenimiento está disponible para usuarios ADMIN y OFFICE.
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Group gap="sm" align="flex-start" wrap="nowrap">
            <ThemeIcon color="blue" variant="light" radius="xl" size={42}>
              <IconTool size={21} />
            </ThemeIcon>
            <div>
              <Text fw={900} size="lg">Mantenimiento por horómetro</Text>
              <Text size="sm" c="dimmed">
                Lecturas, revisiones periódicas y responsables de {subject.label}.
              </Text>
            </div>
          </Group>
          <Group gap="xs">
            <Button
              variant="light"
              leftSection={<IconGauge size={16} />}
              onClick={() => setHoursOpened(true)}
              disabled={!data}
            >
              Registrar horas
            </Button>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setPlanOpened(true)}
            >
              Nuevo plan
            </Button>
          </Group>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm" mt="lg">
          <Paper radius="lg" p="md" bg="blue.0">
            <Text size="xs" c="blue.8" fw={700} tt="uppercase">Horómetro actual</Text>
            <Text fw={900} size="xl">{data?.currentHours ?? 0} h</Text>
          </Paper>
          <Paper radius="lg" p="md" bg="gray.0">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">Planes activos</Text>
            <Text fw={900} size="xl">{data?.plans.filter((plan) => plan.active).length ?? 0}</Text>
          </Paper>
          <Paper radius="lg" p="md" bg="gray.0">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">Lecturas registradas</Text>
            <Text fw={900} size="xl">{data?.readings.length ?? 0}</Text>
          </Paper>
        </SimpleGrid>
      </Paper>

      {error ? <Alert color="red" role="alert">{error}</Alert> : null}
      {success ? (
        <Alert color="green" withCloseButton onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      ) : null}

      {loading ? (
        <Paper withBorder radius="lg" p="xl">
          <Text c="dimmed" ta="center">Cargando mantenimiento...</Text>
        </Paper>
      ) : data ? (
        <Tabs defaultValue="plans" keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="plans" leftSection={<IconSettings size={16} />}>Planes</Tabs.Tab>
            <Tabs.Tab value="history" leftSection={<IconHistory size={16} />}>Historial de horas</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="plans" pt="md">
            <MaintenancePlanList
              plans={data.plans}
              users={users}
              reminderByItemId={reminderByItemId}
              canManage={canManage}
              onAddItem={setItemPlan}
              onEditItem={setEditingItem}
              onCompleteItem={setCompletingItem}
              onArchiveItem={(item) => void archiveItem(item)}
              onEditPlan={(plan) => {
                setEditingPlan(plan);
                setPlanName(plan.name);
              }}
              onArchivePlan={(plan) => void archivePlan(plan)}
            />
          </Tabs.Panel>
          <Tabs.Panel value="history" pt="md">
            <HourReadingHistory readings={data.readings} />
          </Tabs.Panel>
        </Tabs>
      ) : null}

      <RecordHoursModal
        opened={hoursOpened}
        subject={subject}
        currentHours={data?.currentHours ?? 0}
        onClose={() => setHoursOpened(false)}
        onSaved={() => refreshWithSuccess('Lectura registrada correctamente.')}
      />
      <MaintenancePlanFormModal
        opened={planOpened}
        subject={subject}
        users={users}
        onClose={() => setPlanOpened(false)}
        onSaved={() => refreshWithSuccess('Plan creado correctamente.')}
      />
      <MaintenanceItemFormModal
        opened={!!itemPlan || !!editingItem}
        planId={itemPlan?.id ?? editingItem?.planId ?? null}
        item={editingItem}
        users={users}
        onClose={() => {
          setItemPlan(null);
          setEditingItem(null);
        }}
        onSaved={() => refreshWithSuccess(editingItem ? 'Revisión actualizada.' : 'Revisión agregada.')}
      />
      <CompleteMaintenanceModal
        opened={!!completingItem}
        item={completingItem}
        currentHours={data?.currentHours ?? 0}
        onClose={() => setCompletingItem(null)}
        onSaved={() => refreshWithSuccess('Mantenimiento registrado como realizado.')}
      />

      <Modal
        opened={!!editingPlan}
        onClose={() => setEditingPlan(null)}
        title="Editar plan"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Nombre del plan"
            value={planName}
            onChange={(event) => setPlanName(event.currentTarget.value)}
            required
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setEditingPlan(null)}>Cancelar</Button>
            <Button loading={savingPlan} onClick={savePlanName}>Guardar</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
