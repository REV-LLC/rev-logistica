'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconBell, IconDeviceFloppy } from '@tabler/icons-react';
import NotificationRecipientsEditor from './NotificationRecipientsEditor';
import { api } from '@/lib/api';
import {
  apiErrorMessage,
  recipientsFromTopic,
  type AppUserOption,
  type NotificationRecipientInput,
  type NotificationTopic,
} from '@/lib/maintenance-types';

const topicLabels: Record<string, string> = {
  SOAT_EXPIRY: 'SOAT',
  TECH_INSPECTION_EXPIRY: 'Tecnomecánica',
  MAINTENANCE_DUE: 'Mantenimiento por horas',
};

type TopicEditorProps = {
  topic: NotificationTopic;
  users: AppUserOption[];
  onSaved: () => Promise<void>;
};

function TopicEditor({ topic, users, onSaved }: TopicEditorProps) {
  const [recipients, setRecipients] = useState<NotificationRecipientInput[]>(() => recipientsFromTopic(topic));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRecipients(recipientsFromTopic(topic));
    setError(null);
  }, [topic]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api(`/notifications/topics/${topic.id}/recipients`, {
        method: 'PUT',
        json: { recipients },
      });
      await onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudieron guardar los destinatarios.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper withBorder radius="lg" p="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text fw={800}>{topicLabels[topic.eventType] ?? topic.eventType}</Text>
            <Text size="sm" c="dimmed">
              Configura quién verá y recibirá esta alerta.
            </Text>
          </div>
          <Badge color={topic.active ? 'green' : 'gray'} variant="light">
            {topic.active ? 'Activa' : 'Inactiva'}
          </Badge>
        </Group>
        {error ? <Alert color="red" role="alert">{error}</Alert> : null}
        <NotificationRecipientsEditor
          users={users}
          value={recipients}
          onChange={setRecipients}
          label="Destinatarios"
        />
        <Group justify="flex-end">
          <Button
            size="sm"
            leftSection={<IconDeviceFloppy size={16} />}
            loading={saving}
            onClick={save}
          >
            Guardar destinatarios
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
type Props = {
  entityType: string;
  entityId: string;
  entityLabel?: string;
};

export default function EntityNotificationManager({
  entityType,
  entityId,
  entityLabel,
}: Props) {
  const [topics, setTopics] = useState<NotificationTopic[]>([]);
  const [users, setUsers] = useState<AppUserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [topicData, userData] = await Promise.all([
        api<NotificationTopic[]>(`/notifications/entities/${entityType}/${entityId}/topics`),
        api<AppUserOption[]>('/users?active=true'),
      ]);
      setTopics(topicData);
      setUsers(userData);
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudieron cargar las alertas.'));
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  useEffect(() => {
    void load();
  }, [load]);

  const saved = async () => {
    await load();
    setSuccess('Destinatarios actualizados.');
  };

  return (
    <Stack gap="lg">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <ThemeIcon color="orange" variant="light" radius="xl" size={42}>
          <IconBell size={21} />
        </ThemeIcon>
        <div>
          <Text fw={900} size="lg">Alertas de {entityLabel ?? 'la entidad'}</Text>
          <Text size="sm" c="dimmed">
            Cada tipo de alerta puede tener destinatarios y canales diferentes.
          </Text>
        </div>
      </Group>

      {error ? <Alert color="red" role="alert">{error}</Alert> : null}
      {success ? (
        <Alert color="green" withCloseButton onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      ) : null}

      {loading ? (
        <Paper withBorder radius="lg" p="xl">
          <Text c="dimmed" ta="center">Cargando alertas...</Text>
        </Paper>
      ) : topics.length ? (
        <Stack gap="md">
          {topics.map((topic) => (
            <TopicEditor key={topic.id} topic={topic} users={users} onSaved={saved} />
          ))}
        </Stack>
      ) : (
        <Paper withBorder radius="lg" p="xl" bg="gray.0">
          <Text fw={700} ta="center">No hay alertas configuradas.</Text>
        </Paper>
      )}
    </Stack>
  );
}
