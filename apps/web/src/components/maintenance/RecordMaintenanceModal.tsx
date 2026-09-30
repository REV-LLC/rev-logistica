'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, NumberInput, Paper, Select, SimpleGrid, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core';
import MaintenanceWorkFields, { workKind, workReference, requiresReference, type WorkDetails } from './MaintenanceWorkFields';
import NotificationRecipientsEditor from '@/components/notifications/NotificationRecipientsEditor';
import { api } from '@/lib/api';
import { apiErrorMessage, type AppUserOption, type MaintenancePlan, type MaintenanceScheduleType, type MaintenanceSubject, type NotificationRecipientInput } from '@/lib/maintenance-types';

type Task = WorkDetails & { key: string; itemId: string | null; name: string; repeat: boolean; interval: number | ''; warning: number | '' };
const newTask = (): Task => ({ key: crypto.randomUUID(), itemId: null, kind: null, name: '', reference: '', viscosityWinter: '', viscosityHot: '', repeat: false, interval: '', warning: 0 });
function localNow() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

type Props = {
  sessionUserId: string | null;
  opened: boolean;
  subject: MaintenanceSubject;
  currentHours: number;
  scheduleType: MaintenanceScheduleType;
  plans: MaintenancePlan[];
  users: AppUserOption[];
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export default function RecordMaintenanceModal({ sessionUserId, opened, subject, currentHours, scheduleType, plans, users, onClose, onSaved }: Props) {
  const [completedAt, setCompletedAt] = useState('');
  const [hours, setHours] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [performedByUserId, setPerformedByUserId] = useState<string | null>(sessionUserId);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recipients, setRecipients] = useState<NotificationRecipientInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const hourly = scheduleType === 'HOURS';
  const options = plans.filter((plan) => plan.active).flatMap((plan) => plan.items.filter((item) => item.active).map((item) => ({ value: item.id, label: `${item.name} · ${plan.name}` })));
  const needsRecipients = tasks.some((task) => !task.itemId && task.repeat);

  useEffect(() => {
    if (!opened) return;
    setCompletedAt(localNow());
    setHours(currentHours);
    setNotes('');
    setPerformedByUserId(sessionUserId);
    setTasks([newTask()]);
    setRecipients([]);
    setError(null);
  }, [opened, currentHours, sessionUserId]);

  function updateTask(key: string, update: Partial<Task>) {
    setTasks((current) => current.map((task) => task.key === key ? { ...task, ...update } : task));
  }

  async function save() {
    const date = new Date(completedAt);
    if (!completedAt || !Number.isFinite(date.getTime()) || date > new Date()) return setError('Selecciona la fecha real del mantenimiento, sin fechas futuras.');
    if (hourly && (hours === '' || hours < 0)) return setError('Ingresa el horómetro al realizar el mantenimiento.');
    if (tasks.some((task) => !task.itemId && (!task.kind || !task.name.trim()))) return setError('Selecciona cada trabajo realizado y describe los que sean Otro.');
    if (tasks.some((task) => requiresReference(task.kind) && !workReference(task))) return setError('Completa la referencia o viscosidad de cada aceite y filtro.');
    const selectedIds = tasks.flatMap((task) => task.itemId ? [task.itemId] : []);
    if (new Set(selectedIds).size !== selectedIds.length) return setError('No repitas una revisión en el mismo registro.');
    if (tasks.some((task) => !task.itemId && task.repeat && (task.interval === '' || task.interval <= 0 || (!hourly && !Number.isInteger(task.interval))))) return setError('Ingresa un intervalo válido para cada próximo cambio.');
    if (needsRecipients && !recipients.length) return setError('Selecciona quién recibirá las alertas.');
    if (!performedByUserId) return setError('Selecciona quién realizó el mantenimiento.');
    setSaving(true);
    setError(null);
    try {
      await api('/maintenance/records', {
        method: 'POST',
        json: {
          performedByUserId,
          ...(subject.type === 'ASSET' ? { assetId: subject.id } : { vehicleId: subject.id }),
          completedAt: date.toISOString(),
          ...(hourly ? { completedAtHours: hours } : {}),
          notes: notes.trim() || undefined,
          tasks: tasks.map((task) => task.itemId ? { itemId: task.itemId, reference: workReference(task) || undefined } : {
            reference: workReference(task) || undefined,
            name: task.name.trim(),
            ...(task.repeat ? { recurrence: {
              name: task.name.trim(),
              ...(hourly ? { intervalHours: task.interval, warningHours: task.warning || 0 } : { intervalDays: task.interval, warningDays: task.warning || 0 }),
              recipients,
            } } : {}),
          }),
        },
      });
      onClose();
      await onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo registrar el mantenimiento.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={`Registrar mantenimiento · ${subject.label}`} size="lg" centered closeOnClickOutside={!saving} closeOnEscape={!saving} withCloseButton={!saving}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">Registra lo que ya se hizo y, si lo necesitas, programa los próximos cambios desde este mantenimiento.</Text>
        {error ? <Alert color="red" role="alert">{error}</Alert> : null}
        <SimpleGrid cols={{ base: 1, sm: hourly ? 2 : 1 }}>
          <TextInput label="Fecha del mantenimiento" type="datetime-local" value={completedAt} onChange={(event) => setCompletedAt(event.currentTarget.value)} required />
          {hourly ? <NumberInput inputWrapperOrder={['label', 'input', 'description', 'error']} label="Horómetro al realizarlo" description={`Último registrado: ${currentHours} h`} value={hours} onChange={(value) => setHours(typeof value === 'number' ? value : '')} min={0} decimalScale={2} suffix=" h" required /> : null}
        </SimpleGrid>
        {hourly && hours !== '' && hours > currentHours ? <Alert color="blue">El horómetro del equipo se actualizará a {hours} h y quedará una lectura asociada a este registro.</Alert> : null}
        <Select label="Realizado por" placeholder="Selecciona quién hizo el mantenimiento" searchable required
          data={users.map((user) => ({ value: user.id, label: `${user.name} · ${user.email}` }))}
          value={performedByUserId} onChange={setPerformedByUserId} />
        {tasks.map((task, index) => (
          <Paper key={task.key} withBorder p="md" radius="md">
            <Stack gap="sm">
              <Group justify="space-between"><Text fw={700}>Trabajo {index + 1}</Text>{tasks.length > 1 ? <Button size="xs" color="red" variant="subtle" onClick={() => setTasks((current) => current.filter((entry) => entry.key !== task.key))}>Quitar trabajo {index + 1}</Button> : null}</Group>
              {options.length ? <Select label={`Revisión existente · trabajo ${index + 1}`} placeholder="Trabajo nuevo" data={options} value={task.itemId} onChange={(itemId) => {
                const item = plans.flatMap((plan) => plan.items).find((candidate) => candidate.id === itemId);
                updateTask(task.key, { itemId, kind: item ? workKind(item.name) : null, name: item?.name ?? '', reference: '', viscosityWinter: '', viscosityHot: '' });
              }} clearable searchable /> : null}
              <MaintenanceWorkFields value={task} index={index} existing={Boolean(task.itemId)} onChange={(update) => updateTask(task.key, update)} />
              {task.itemId ? <Text size="sm" c="dimmed">Se reiniciará el ciclo de esta revisión desde la fecha y el horómetro indicados, conservando su intervalo y destinatarios.</Text> : <>
                <Switch label={`Programar próximo cambio · trabajo ${index + 1}`} checked={task.repeat} onChange={(event) => updateTask(task.key, { repeat: event.currentTarget.checked })} />
                {task.repeat ? <>
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <NumberInput label={`Repetir cada · trabajo ${index + 1}`} value={task.interval} onChange={(value) => updateTask(task.key, { interval: typeof value === 'number' ? value : '' })} min={hourly ? 0.01 : 1} decimalScale={hourly ? 2 : 0} allowDecimal={hourly} suffix={hourly ? ' h' : ' días'} required />
                    <NumberInput label={`Avisar antes · trabajo ${index + 1}`} value={task.warning} onChange={(value) => updateTask(task.key, { warning: typeof value === 'number' ? value : '' })} min={0} decimalScale={hourly ? 2 : 0} allowDecimal={hourly} suffix={hourly ? ' h' : ' días'} />
                  </SimpleGrid>
                  {task.interval !== '' && task.interval > 0 ? <Text size="sm" fw={600} c="blue">{hourly && hours !== '' ? `Próximo cambio a las ${Number((hours + task.interval).toFixed(2))} h` : 'El próximo cambio se calculará desde la fecha de este mantenimiento.'}</Text> : null}
                </> : null}
              </>}
            </Stack>
          </Paper>
        ))}
        <Button variant="light" onClick={() => setTasks((current) => [...current, newTask()])}>Agregar otro trabajo</Button>
        {needsRecipients ? <NotificationRecipientsEditor users={users} value={recipients} onChange={setRecipients} label="Destinatarios de los próximos cambios" /> : null}
        <Textarea label="Detalle del mantenimiento" placeholder="Aceite utilizado, filtros instalados y observaciones" value={notes} onChange={(event) => setNotes(event.currentTarget.value)} autosize minRows={3} />
        <Group justify="flex-end"><Button variant="default" onClick={onClose} disabled={saving}>Cancelar</Button><Button loading={saving} onClick={save}>Guardar mantenimiento</Button></Group>
      </Stack>
    </Modal>
  );
}
