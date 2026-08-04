'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Container, NumberInput, Paper, Stack, Switch, Text } from '@mantine/core';
import { IconBell, IconDeviceFloppy } from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import { api } from '@/lib/api';

type Setting = { key: string; value: boolean | number; description: string };
type Values = Record<string, boolean | number>;

export default function TaskNotificationSettingsPage() {
  const [values, setValues] = useState<Values>({});
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Setting[]>('/settings?category=TASKS')
      .then((rows) => {
        setValues(Object.fromEntries(rows.map((row) => [row.key, row.value])));
        setDescriptions(Object.fromEntries(rows.map((row) => [row.key, row.description])));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar la configuración.'))
      .finally(() => setLoading(false));
  }, []);

  const setValue = (key: string, value: boolean | number) => setValues((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true); setError(null); setMessage(null);
    try {
      await api('/settings', { method: 'PATCH', json: { values } });
      setMessage('Configuración actualizada. Los próximos eventos usarán estos valores.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la configuración.');
    } finally { setSaving(false); }
  };

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <PageHeaderCard
          icon={<IconBell size={20} />}
          iconColor="blue"
          accentColor="rgba(59, 130, 246, 0.12)"
          title="Alertas de tareas"
          description="Controla cuándo se notifica al responsable de una tarea."
        />
        {error ? <Alert color="red">{error}</Alert> : null}
        {message ? <Alert color="green">{message}</Alert> : null}
        <Paper withBorder radius="lg" p="lg">
          <Stack gap="lg">
            <Switch
              label="Avisar al asignar o reasignar"
              description={descriptions['tasks.notify_on_assignment']}
              checked={Boolean(values['tasks.notify_on_assignment'])}
              onChange={(event) => setValue('tasks.notify_on_assignment', event.currentTarget.checked)}
              disabled={loading}
            />
            <Switch
              label="Avisar cuando cambie la fecha"
              description={descriptions['tasks.notify_on_due_date_change']}
              checked={Boolean(values['tasks.notify_on_due_date_change'])}
              onChange={(event) => setValue('tasks.notify_on_due_date_change', event.currentTarget.checked)}
              disabled={loading}
            />
            <NumberInput
              label="Anticipación del vencimiento"
              description={descriptions['tasks.due_warning_hours']}
              suffix=" horas"
              min={0}
              value={Number(values['tasks.due_warning_hours'] ?? 24)}
              onChange={(value) => setValue('tasks.due_warning_hours', Number(value) || 0)}
              disabled={loading}
            />
            <Switch
              label="Repetir mientras esté vencida"
              description={descriptions['tasks.overdue_repeat_enabled']}
              checked={Boolean(values['tasks.overdue_repeat_enabled'])}
              onChange={(event) => setValue('tasks.overdue_repeat_enabled', event.currentTarget.checked)}
              disabled={loading}
            />
            <NumberInput
              label="Frecuencia para tareas vencidas"
              description={descriptions['tasks.overdue_repeat_interval_hours']}
              suffix=" horas"
              min={1}
              value={Number(values['tasks.overdue_repeat_interval_hours'] ?? 24)}
              onChange={(value) => setValue('tasks.overdue_repeat_interval_hours', Math.max(1, Number(value) || 1))}
              disabled={loading || !values['tasks.overdue_repeat_enabled']}
            />
            <Text size="sm" c="dimmed">El aviso de asignación es inmediato. Los vencimientos se procesan en el ciclo automático de notificaciones.</Text>
            <Button leftSection={<IconDeviceFloppy size={16} />} onClick={save} loading={saving} disabled={loading}>Guardar cambios</Button>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
