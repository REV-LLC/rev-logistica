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
  IconCalendar,
  IconGauge,
  IconHistory,
  IconPlus,
  IconSettings,
  IconTool,
} from '@tabler/icons-react';
import RecordMaintenanceModal from './RecordMaintenanceModal';
import MaintenanceHistory from './MaintenanceHistory';
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
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [reminders, setReminders] = useState<NotificationReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hoursOpened, setHoursOpened] = useState(false);
  const [recordOpened, setRecordOpened] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>('completions');
  const [planOpened, setPlanOpened] = useState(false);
  const [editingItem, setEditingItem] = useState<MaintenanceItem | null>(null);
  const [viewingItem, setViewingItem] = useState<MaintenanceItem | null>(null);
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
      const [maintenance, activeUsers, allReminders, session] = await Promise.all([
        api<MaintenanceResponse>(`/maintenance/${routeSegment}/${subject.id}`),
        api<AppUserOption[]>('/users?active=true'),
        api<NotificationReminder[]>('/notifications/reminders'),
        api<{ userId: string }>('/maintenance/session'),
      ]);
      setData(maintenance);
      setUsers(activeUsers);
      setSessionUserId(session.userId);
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
  const scheduleType = data?.scheduleType ?? (subject.type === 'VEHICLE' ? 'HOURS' : 'CALENDAR_DAYS');
  const isHourly = scheduleType === 'HOURS';

  const refreshWithSuccess = async (message: string) => {
    await load();
    setSuccess(message);
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
              {isHourly ? <IconTool size={21} /> : <IconCalendar size={21} />}
            </ThemeIcon>
            <div>
              <Text fw={900} size="lg">
                {isHourly ? 'Mantenimiento por horómetro' : 'Mantenimiento por calendario'}
              </Text>
              <Text size="sm" c="dimmed">
                {isHourly
                  ? `Lecturas, revisiones periódicas y responsables de ${subject.label}.`
                  : `Revisiones programadas por días calendario para ${subject.label}.`}
              </Text>
            </div>
          </Group>
          <Group gap="xs">
            <Button leftSection={<IconTool size={16} />} onClick={() => setRecordOpened(true)} disabled={!data}>
              Registrar mantenimiento
            </Button>
            {isHourly ? (
              <Button
                variant="light"
                leftSection={<IconGauge size={16} />}
                onClick={() => setHoursOpened(true)}
                disabled={!data}
              >
                Registrar horas
              </Button>
            ) : null}
            <Button
              variant="default"
              leftSection={<IconPlus size={16} />}
              onClick={() => setPlanOpened(true)}
              disabled={!data}
            >
              Nuevo plan
            </Button>
          </Group>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm" mt="lg">
          <Paper radius="lg" p="md" bg="blue.0">
            <Text size="xs" c="blue.8" fw={700} tt="uppercase">
              {isHourly ? 'Horómetro actual' : 'Programación'}
            </Text>
            <Text fw={900} size="xl">
              {isHourly ? `${data?.currentHours ?? 0} h` : 'Días calendario'}
            </Text>
          </Paper>
          <Paper radius="lg" p="md" bg="gray.0">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">Planes activos</Text>
            <Text fw={900} size="xl">{data?.plans.filter((plan) => plan.active).length ?? 0}</Text>
          </Paper>
          <Paper radius="lg" p="md" bg="gray.0">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
              {isHourly ? 'Lecturas registradas' : 'Revisiones configuradas'}
            </Text>
            <Text fw={900} size="xl">
              {isHourly
                ? data?.readings.length ?? 0
                : data?.plans.reduce((total, plan) => total + plan.items.filter((item) => item.active).length, 0) ?? 0}
            </Text>
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
        <Tabs value={activeTab} onChange={setActiveTab} keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="completions" leftSection={<IconTool size={16} />}>Mantenimientos realizados</Tabs.Tab>
            <Tabs.Tab value="plans" leftSection={<IconSettings size={16} />}>Planes</Tabs.Tab>
            {isHourly ? (
              <Tabs.Tab value="history" leftSection={<IconHistory size={16} />}>Historial de horas</Tabs.Tab>
            ) : null}
          </Tabs.List>
          <Tabs.Panel value="completions" pt="md">
            <MaintenanceHistory completions={data.completions ?? []} plans={data.plans} onConfigure={setEditingItem} onComplete={canManage ? setCompletingItem : undefined} />
          </Tabs.Panel>
          <Tabs.Panel value="plans" pt="md">
            <MaintenancePlanList
              plans={data.plans}
              users={users}
              reminderByItemId={reminderByItemId}
              canManage={canManage}
              scheduleType={scheduleType}
              onAddItem={() => setRecordOpened(true)}
              onEditItem={(item) => setEditingItem({ ...item, active: true })}
              onViewLatest={setViewingItem}
              onEditPlan={(plan) => {
                setEditingPlan(plan);
                setPlanName(plan.name);
              }}
            />
          </Tabs.Panel>
          {isHourly ? (
            <Tabs.Panel value="history" pt="md">
              <HourReadingHistory readings={data.readings} showReportedHours={subject.type === 'ASSET'} />
            </Tabs.Panel>
          ) : null}
        </Tabs>
      ) : null}

      <Modal opened={!!viewingItem} onClose={() => setViewingItem(null)} title={`Último cambio · ${viewingItem?.name ?? ''}`} centered>
        {viewingItem?.completions?.[0] ? (() => {
          const latest = viewingItem.completions[0];
          const performer = latest.performedBy;
          return <Stack gap="sm">
            <Text fw={700}>{new Date(latest.completedAt).toLocaleString('es-CO')}</Text>
            {latest.completedAtHours != null ? <Text>Horómetro: {Number(latest.completedAtHours)} h</Text> : null}
            {latest.reference ? <Text>Referencia: {latest.reference}</Text> : null}
            <Text>Realizado por: {performer ? [performer.employee?.name, performer.employee?.lastName].filter(Boolean).join(' ') || performer.email : 'No registrado'}</Text>
            <Text size="sm">Registrado por: {[latest.completedBy.employee?.name, latest.completedBy.employee?.lastName].filter(Boolean).join(' ') || latest.completedBy.email}</Text>
            <Text style={{ whiteSpace: 'pre-wrap' }}>{latest.notes || 'Sin observaciones'}</Text>
          </Stack>;
        })() : <Text c="dimmed">Todavía no hay cambios registrados para esta revisión.</Text>}
      </Modal>

      <RecordMaintenanceModal
        sessionUserId={sessionUserId}
        opened={recordOpened || !!completingItem}
        initialItem={completingItem}
        subject={subject}
        currentHours={data?.currentHours ?? 0}
        scheduleType={scheduleType}
        plans={data?.plans ?? []}
        users={users}
        onClose={() => { setRecordOpened(false); setCompletingItem(null); }}
        onSaved={async () => {
          setActiveTab('completions');
          await refreshWithSuccess('Mantenimiento guardado. Puedes consultar el detalle en el historial.');
        }}
      />
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
        scheduleType={scheduleType}
        users={users}
        onClose={() => setPlanOpened(false)}
        onSaved={() => refreshWithSuccess('Plan creado correctamente.')}
      />
      <MaintenanceItemFormModal
        opened={!!editingItem}
        planId={editingItem?.planId ?? null}
        item={editingItem}
        users={users}
        scheduleType={scheduleType}
        onClose={() => {
          setEditingItem(null);
        }}
        onSaved={() => refreshWithSuccess(editingItem ? 'Revisión actualizada.' : 'Revisión agregada.')}
      />


      <Modal
        opened={!!editingPlan}
        onClose={() => setEditingPlan(null)}
        title="Configurar plan"
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
