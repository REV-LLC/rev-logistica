'use client';
import { useEffect, useState } from 'react';
import { Alert, Stack, Text } from '@mantine/core';
import { api } from '@/lib/api';
import type { EquipmentMotor } from './types';
import { motorLabel } from './types';

type Change = { id: string; createdAt: string; before: { motor?: EquipmentMotor }; after: { motor?: EquipmentMotor } };
const label = (motor?: EquipmentMotor) => motor?.assignedMotor ? motorLabel(motor.assignedMotor)
  : motor?.configuration === 'FIXED' ? 'Motor fijo integrado' : motor?.configuration === 'INTERCHANGEABLE' ? 'Sin motor asignado' : 'Sin motor intercambiable';
export default function MotorHistory({ assetId, version }: { assetId: string; version: number }) {
  const [changes, setChanges] = useState<Change[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setError('');
    api<Change[]>(`/equipment-configurations/assets/${assetId}/motor-history`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setChanges(data); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [assetId, version]);
  return <Stack gap="xs"><Text fw={700}>Historial de motor</Text>
    {error ? <Alert color="red">{error}</Alert> : changes.length ? changes.map(change => <Text key={change.id} size="sm">
      {new Date(change.createdAt).toLocaleString('es-CO')} · {label(change.before.motor)} → {label(change.after.motor)}
    </Text>) : <Text size="sm" c="dimmed">Sin cambios registrados en el configurador nuevo. Se conserva la asignación previa.</Text>}
  </Stack>;
}
