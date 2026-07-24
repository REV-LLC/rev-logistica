'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, Stack } from '@mantine/core';
import MaintenanceItemFields from './MaintenanceItemFields';
import { api } from '@/lib/api';
import {
  apiErrorMessage,
  emptyMaintenanceItemInput,
  recipientsFromTopic,
  type AppUserOption,
  type MaintenanceItem,
  type MaintenanceItemInput,
} from '@/lib/maintenance-types';

type Props = {
  opened: boolean;
  planId: string | null;
  item?: MaintenanceItem | null;
  users: AppUserOption[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function fromItem(item?: MaintenanceItem | null): MaintenanceItemInput {
  if (!item) return emptyMaintenanceItemInput();
  return {
    name: item.name,
    instructions: item.instructions ?? '',
    intervalHours: Number(item.intervalHours),
    warningHours: Number(item.warningHours),
    baselineHours: Number(item.baselineHours),
    active: item.active,
    recipients: recipientsFromTopic(item.notificationTopic),
  };
}
export default function MaintenanceItemFormModal({
  opened,
  planId,
  item,
  users,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState<MaintenanceItemInput>(emptyMaintenanceItemInput);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setForm(fromItem(item));
    setError(null);
  }, [item, opened]);

  const save = async () => {
    if (!form.name.trim()) return setError('Escribe el nombre de la revisión.');
    if (form.intervalHours === '' || form.intervalHours <= 0) return setError('El intervalo debe ser mayor que cero.');
    if (!form.recipients.length) return setError('Selecciona al menos un destinatario.');
    if (!item && !planId) return setError('No se encontró el plan.');

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        instructions: form.instructions.trim(),
        intervalHours: form.intervalHours,
        warningHours: form.warningHours === '' ? 0 : form.warningHours,
        baselineHours: form.baselineHours === '' ? 0 : form.baselineHours,
        active: form.active,
        recipients: form.recipients,
      };
      await api(
        item ? `/maintenance/items/${item.id}` : `/maintenance/plans/${planId}/items`,
        { method: item ? 'PATCH' : 'POST', json: payload },
      );
      await onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo guardar la revisión.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={item ? 'Editar revisión' : 'Agregar revisión'}
      size="lg"
      centered
    >
      <Stack gap="md">
        {error ? <Alert color="red" role="alert">{error}</Alert> : null}
        <MaintenanceItemFields
          value={form}
          users={users}
          onChange={setForm}
          recipientError={error?.includes('destinatario') ? error : null}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={save}>Guardar revisión</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
