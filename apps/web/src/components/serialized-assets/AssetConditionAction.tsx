'use client';

import { useState } from 'react';
import { Alert, Button, Group, Modal, Radio, Stack, Text, Textarea } from '@mantine/core';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { api } from '@/lib/api';

export default function AssetConditionAction({
  assetId, name, isDamaged, assignedMotor, opened, onOpen, onClose, onUpdated,
}: {
  assetId: string;
  name: string;
  isDamaged: boolean;
  assignedMotor?: { id: string; name: string; isDamaged: boolean } | null;
  opened: boolean;
  onOpen: () => void;
  onClose: () => void;
  onUpdated: (asset: { isDamaged: boolean; damageNote: string | null; conditionEvents: AssetConditionEvent[] }, target: 'equipment' | 'motor') => void;
}) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<'equipment' | 'motor' | null>(null);
  const selectedTarget = assignedMotor ? target : 'equipment';
  const selected = selectedTarget === 'motor' ? assignedMotor : { id: assetId, name, isDamaged };
  const repairing = Boolean(selected?.isDamaged);
  const close = () => {
    if (saving) return;
    setNote('');
    setError(null);
    setTarget(null);
    onClose();
  };
  const save = async () => {
    if (!selectedTarget || !selected) {
      setError('Elige si deseas registrar la condición de la máquina o del motor.');
      return;
    }
    if (!note.trim()) {
      setError(repairing ? 'Describe la reparación realizada.' : 'Describe la avería.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api<{ isDamaged: boolean; damageNote: string | null; conditionEvents: AssetConditionEvent[] }>(`/assets/${selected.id}/condition`, {
        method: 'PATCH', json: { isDamaged: !repairing, note: note.trim(),
          ...(selectedTarget === 'motor' ? { expectedParentAssetId: assetId } : {}) },
      });
      onUpdated(updated, selectedTarget);
      setNote('');
      setTarget(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado del equipo.');
    } finally {
      setSaving(false);
    }
  };
  return <>
    <Button color={isDamaged ? 'teal' : 'orange'} variant="light" onClick={onOpen}
      leftSection={isDamaged ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />}>
      {assignedMotor ? 'Averías y reparaciones' : isDamaged ? 'Marcar reparado' : 'Marcar averiado'}
    </Button>
    <Modal opened={opened} onClose={close} centered title={assignedMotor ? 'Averías y reparaciones' : repairing ? 'Marcar equipo como reparado' : 'Reportar avería'}
      closeOnClickOutside={!saving} closeOnEscape={!saving} withCloseButton={!saving}>
      <Stack gap="md">
        <Text fw={600}>{name}</Text>
        {assignedMotor ? <Radio.Group label="¿Qué deseas averiar o reparar?" value={target ?? ''} onChange={value => {
          setTarget(value as 'equipment' | 'motor'); setNote(''); setError(null);
        }}>
          <Stack gap="sm" mt="xs">
            <Radio value="equipment" label={`Máquina · ${isDamaged ? 'Averiada' : 'Operativa'}`} disabled={saving} />
            <Radio value="motor" label={`Motor asignado · ${assignedMotor.name} · ${assignedMotor.isDamaged ? 'Averiado' : 'Operativo'}`} disabled={saving} />
          </Stack>
        </Radio.Group> : null}
        {selectedTarget ? <>
        <Text size="sm" c="dimmed">
          {repairing ? 'La reparación quedará registrada en el historial de la unidad seleccionada.'
            : 'La unidad seleccionada quedará averiada y no podrá despacharse hasta registrar su reparación.'}
          {assignedMotor ? ' La condición de la otra unidad no cambia.' : ''}
        </Text>
        <Textarea label={repairing ? 'Reparación realizada' : 'Descripción de la avería'}
          placeholder={repairing ? 'Describe qué se reparó y la revisión realizada.' : 'Describe la falla que presenta la unidad seleccionada.'}
          value={note} onChange={(event) => setNote(event.currentTarget.value)} required minRows={3}
          maxLength={2000} disabled={saving} autosize />
        </> : null}
        {error ? <Alert color="red" role="alert">{error}</Alert> : null}
        <Group justify="flex-end">
          <Button variant="default" onClick={close} disabled={saving}>Cancelar</Button>
          <Button color={repairing ? 'teal' : 'orange'} onClick={save} loading={saving} disabled={!selectedTarget}>
            {repairing ? 'Confirmar reparación' : 'Confirmar avería'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  </>;
}

export type AssetConditionEvent = {
  id: string;
  isDamaged: boolean;
  note: string;
  createdAt: string;
  changedBy: { email: string; employee?: { name: string; lastName?: string | null } | null };
};
