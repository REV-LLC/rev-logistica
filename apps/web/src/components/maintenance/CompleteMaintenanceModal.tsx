'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, NumberInput, Stack, Text, TextInput } from '@mantine/core';
import { api } from '@/lib/api';
import { apiErrorMessage, type MaintenanceItem } from '@/lib/maintenance-types';

type Props = {
  opened: boolean;
  item: MaintenanceItem | null;
  currentHours: number;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function currentLocalDateTime() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function CompleteMaintenanceModal({
  opened,
  item,
  currentHours,
  onClose,
  onSaved,
}: Props) {
  const [hours, setHours] = useState<number | ''>(currentHours);
  const [completedAt, setCompletedAt] = useState(currentLocalDateTime);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setHours(currentHours);
    setCompletedAt(currentLocalDateTime());
    setNotes('');
    setError(null);
  }, [currentHours, opened]);

  const save = async () => {
    if (!item) return;
    if (hours !== '' && hours > currentHours) {
      setError(`Las horas realizadas no pueden superar ${currentHours}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/maintenance/items/${item.id}/completions`, {
        method: 'POST',
        json: {
          completedAtHours: hours === '' ? undefined : hours,
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
          Si omites la lectura, se utilizará el horómetro actual de {currentHours} h.
        </Text>
        {error ? <Alert color="red" role="alert">{error}</Alert> : null}
        <NumberInput
          label="Horas de ejecución"
          value={hours}
          onChange={(value) => setHours(typeof value === 'number' ? value : '')}
          min={0}
          max={currentHours}
          decimalScale={2}
          suffix=" h"
        />
        <TextInput
          label="Fecha"
          type="datetime-local"
          value={completedAt}
          onChange={(event) => setCompletedAt(event.currentTarget.value)}
        />
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
