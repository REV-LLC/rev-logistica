'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { api } from '@/lib/api';
import {
  apiErrorMessage,
  type MaintenanceItem,
  type AppUserOption,
  type MaintenanceScheduleType,
} from '@/lib/maintenance-types';

type Props = {
  sessionUserId: string | null;
  users: AppUserOption[];
  opened: boolean;
  item: MaintenanceItem | null;
  currentHours: number;
  scheduleType: MaintenanceScheduleType;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function currentLocalDateTime() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function CompleteMaintenanceModal({
  users, sessionUserId,
  opened,
  item,
  currentHours,
  scheduleType,
  onClose,
  onSaved,
}: Props) {
  const [hours, setHours] = useState<number | ''>(currentHours);
  const [completedAt, setCompletedAt] = useState(currentLocalDateTime);
  const [notes, setNotes] = useState('');
  const [performedByUserId, setPerformedByUserId] = useState<string | null>(sessionUserId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setHours(currentHours);
    setCompletedAt(currentLocalDateTime());
    setNotes('');
    setPerformedByUserId(sessionUserId);
    setError(null);
  }, [currentHours, opened, sessionUserId]);

  const save = async () => {
    if (!item) return;
    if (scheduleType === 'HOURS' && hours !== '' && hours > currentHours) {
      setError(`Las horas realizadas no pueden superar ${currentHours}.`);
      return;
    }
    if (!performedByUserId) return setError('Selecciona quién realizó el mantenimiento.');
    setSaving(true);
    setError(null);
    try {
      await api(`/maintenance/items/${item.id}/completions`, {
        method: 'POST',
        json: {
          performedByUserId,
          ...(scheduleType === 'HOURS' && hours !== '' ? { completedAtHours: hours } : {}),
          completedAt: completedAt ? new Date(completedAt).toISOString() : undefined,
          notes: notes.trim() || undefined,
        },
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo registrar el mantenimiento.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={item ? `Mantenimiento realizado · ${item.name}` : 'Mantenimiento realizado'}
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {scheduleType === 'HOURS'
            ? `Si omites la lectura, se utilizará el horómetro actual de ${currentHours} h.`
            : 'La próxima revisión se calculará en días calendario desde esta fecha.'}
        </Text>
        {error ? <Alert color="red" role="alert">{error}</Alert> : null}
        {scheduleType === 'HOURS' ? (
          <NumberInput
            label="Horas de ejecución"
            value={hours}
            onChange={(value) => setHours(typeof value === 'number' ? value : '')}
            min={0}
            max={currentHours}
            decimalScale={2}
            suffix=" h"
          />
        ) : null}
        <TextInput
          label="Fecha"
          type="datetime-local"
          value={completedAt}
          onChange={(event) => setCompletedAt(event.currentTarget.value)}
        />
        <Select label="Realizado por" placeholder="Selecciona quién hizo el mantenimiento" searchable required
          data={users.map((user) => ({ value: user.id, label: `${user.name} · ${user.email}` }))}
          value={performedByUserId} onChange={setPerformedByUserId} />
        <TextInput
          label="Notas"
          placeholder="Ej. Aceite y filtro cambiados"
          value={notes}
          onChange={(event) => setNotes(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={save}>Registrar mantenimiento</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
