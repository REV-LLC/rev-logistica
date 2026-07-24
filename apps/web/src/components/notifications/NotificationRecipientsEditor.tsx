'use client';

import { Badge, Checkbox, Group, MultiSelect, Paper, Stack, Text } from '@mantine/core';
import type { AppUserOption, NotificationRecipientInput } from '@/lib/maintenance-types';

type Props = {
  users: AppUserOption[];
  value: NotificationRecipientInput[];
  onChange: (value: NotificationRecipientInput[]) => void;
  disabled?: boolean;
  error?: string | null;
  label?: string;
};

export default function NotificationRecipientsEditor({
  users,
  value,
  onChange,
  disabled = false,
  error,
  label = 'Usuarios que recibirán la alerta',
}: Props) {
  const selectedIds = value.map((recipient) => recipient.userId);
  const userById = new Map(users.map((user) => [user.id, user]));

  const updateSelected = (ids: string[]) => {
    const existingById = new Map(value.map((recipient) => [recipient.userId, recipient]));
    onChange(
      ids.map((userId) => existingById.get(userId) ?? {
        userId,
        emailEnabled: true,
        smsEnabled: false,
      }),
    );
  };

  const updateChannel = (
    userId: string,
    channel: 'emailEnabled' | 'smsEnabled',
    checked: boolean,
  ) => {
    onChange(value.map((recipient) => (
      recipient.userId === userId ? { ...recipient, [channel]: checked } : recipient
    )));
  };

  return (
    <Stack gap="sm">
      <MultiSelect
        label={label}
        placeholder="Busca y selecciona usuarios"
        searchable
        clearable
        disabled={disabled}
        value={selectedIds}
        onChange={updateSelected}
        data={users.map((user) => ({
          value: user.id,
          label: `${user.name} · ${user.email}`,
        }))}
        error={error}
        nothingFoundMessage="No hay usuarios activos"
      />

      {value.length ? (
        <Stack gap="xs">
          {value.map((recipient) => {
            const user = userById.get(recipient.userId);
            if (!user) return null;
            return (
              <Paper key={recipient.userId} withBorder radius="md" p="sm">
                <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                  <div>
                    <Text size="sm" fw={700}>{user.name}</Text>
                    <Text size="xs" c="dimmed">{user.email}</Text>
                    <Badge mt={6} size="xs" variant="light" color="gray">{user.role}</Badge>
                  </div>
                  <Group gap="md">
                    <Checkbox
                      label="Correo"
                      checked={recipient.emailEnabled}
                      disabled={disabled}
                      onChange={(event) => updateChannel(
                        recipient.userId,
                        'emailEnabled',
                        event.currentTarget.checked,
                      )}
                    />
                    <Checkbox
                      label="SMS"
                      checked={recipient.smsEnabled}
                      disabled={disabled}
                      onChange={(event) => updateChannel(
                        recipient.userId,
                        'smsEnabled',
                        event.currentTarget.checked,
                      )}
                      description={user.phone === null ? 'Sin teléfono asociado' : undefined}
                    />
                  </Group>
                </Group>
              </Paper>
            );
          })}
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">Todavía no hay destinatarios seleccionados.</Text>
      )}
    </Stack>
  );
}
