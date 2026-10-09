'use client';
import { useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { api } from '@/lib/api';

export type AssetConditionEvent = {
  id: string; isDamaged: boolean; note: string; createdAt: string;
  changedBy: { email: string; employee?: { name: string; lastName?: string | null } | null };
};
type Condition = { isDamaged: boolean; damageNote: string | null; conditionEvents: AssetConditionEvent[] };

export default function AssetConditionAction({
  assetId, name, isDamaged, opened, onOpen, onClose, onUpdated,
}: {
  assetId: string; name: string; isDamaged: boolean; opened: boolean;
  onOpen: () => void; onClose: () => void; onUpdated: (asset: Condition) => void;
}) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    if (saving) return;
    setNote(''); setError(null); onClose();
  };
  const save = async () => {
    if (!note.trim()) {
      setError(isDamaged ? 'Describe la reparación realizada.' : 'Describe la avería.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const updated = await api<Condition>(`/assets/${assetId}/condition`, {
        method: 'PATCH', json: { isDamaged: !isDamaged, note: note.trim() },
      });
      onUpdated(updated); setNote(''); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el equipo.');
    } finally { setSaving(false); }
  };
  return <>
    <Button color={isDamaged ? 'teal' : 'orange'} variant="light" onClick={onOpen}
      leftSection={isDamaged ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />}>
      {isDamaged ? 'Marcar reparado' : 'Marcar averiado'}
    </Button>
    <Modal opened={opened} onClose={close} centered title={isDamaged ? 'Marcar equipo como reparado' : 'Reportar avería'}
      closeOnClickOutside={!saving} closeOnEscape={!saving} withCloseButton={!saving}>
      <Stack gap="md">
        <Text fw={600}>{name}</Text>
        <Text size="sm" c="dimmed">{isDamaged ? 'La reparación queda en el historial de este equipo.'
          : 'Este equipo no podrá despacharse hasta registrar su reparación.'}</Text>
        <Textarea label={isDamaged ? 'Reparación realizada' : 'Descripción de la avería'} required minRows={3}
          value={note} onChange={event => setNote(event.currentTarget.value)}
          maxLength={2000} disabled={saving} autosize />
        {error ? <Alert color="red" role="alert">{error}</Alert> : null}
        <Group justify="flex-end">
          <Button variant="default" onClick={close} disabled={saving}>Cancelar</Button>
          <Button color={isDamaged ? 'teal' : 'orange'} onClick={save} loading={saving}>
            {isDamaged ? 'Confirmar reparación' : 'Confirmar avería'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  </>;
}
