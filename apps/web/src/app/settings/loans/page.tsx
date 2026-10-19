'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Container, Group, Paper, SegmentedControl, Stack, Text } from '@mantine/core';
import { IconDeviceFloppy, IconFileDollar } from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import { api } from '@/lib/api';
import { loanMovementPresentation, type LoanDisplaySettings } from '@/lib/loan-presentation';

export default function LoanSettingsPage() {
  const [paymentsPositive, setPaymentsPositive] = useState(false);
  const [savedValue, setSavedValue] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    api<LoanDisplaySettings>('/settings/loan-display', { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setPaymentsPositive(value.paymentsPositive); setSavedValue(value.paymentsPositive); setLoaded(true); } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo cargar la configuración.'); });
    return () => controller.abort();
  }, []);

  async function save() {
    if (submitting.current || !loaded) return;
    submitting.current = true; setSaving(true); setError(null); setMessage(null);
    try {
      await api('/settings', { method: 'PATCH', json: { values: { 'loans.payments_positive': paymentsPositive } } });
      setSavedValue(paymentsPositive); setMessage('Presentación actualizada.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la configuración.'); }
    finally { submitting.current = false; setSaving(false); }
  }

  return <Container size="sm" py="xl"><Stack gap="lg">
    <PageHeaderCard title="Préstamos" description="Presentación de los movimientos" icon={<IconFileDollar size={20} />} iconColor="blue" accentColor="rgba(59, 130, 246, 0.12)" />
    {error ? <Alert color="red">{error}</Alert> : null}
    {message ? <Alert color="green" role="status">{message}</Alert> : null}
    <Paper withBorder radius="lg" p="lg"><Stack gap="lg">
      <Text fw={700}>Mostrar los pagos como</Text>
      <SegmentedControl aria-label="Signo visual de los pagos" value={paymentsPositive ? 'positive' : 'negative'}
        onChange={value => { setPaymentsPositive(value === 'positive'); setMessage(null); }} fullWidth size="md" disabled={!loaded || saving}
        data={[{ value: 'negative', label: <Text component="span" c="red.8">− Resta</Text> }, { value: 'positive', label: <Text component="span" c="green.8">+ Suma</Text> }]} />
      <Stack gap="xs" aria-label="Vista previa">
        {(['PAYMENT', 'CHARGE'] as const).map(type => {
          const presentation = loanMovementPresentation(type, paymentsPositive);
          return <Group key={type} justify="space-between" wrap="nowrap"><Text size="sm">{type === 'PAYMENT' ? 'Pago / abono' : 'Préstamo / cargo'}</Text><Text fw={600} c={presentation.color}>{presentation.sign} $ 100.000</Text></Group>;
        })}
      </Stack>
      <Text size="sm" c="dimmed">Solo cambia la vista para todos. Un pago siempre reduce la deuda y un préstamo la aumenta.</Text>
      <Button leftSection={<IconDeviceFloppy size={16} />} onClick={() => void save()} loading={saving} disabled={!loaded || paymentsPositive === savedValue}>Guardar cambios</Button>
    </Stack></Paper>
  </Stack></Container>;
}
