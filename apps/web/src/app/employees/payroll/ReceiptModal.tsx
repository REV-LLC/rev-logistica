'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Divider, Group, Modal, NumberInput, SimpleGrid, Stack, Text, Textarea } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconDownload, IconFileTypePdf } from '@tabler/icons-react';
import { api, apiBlob } from '@/lib/api';
import { payrollMoney, type PayrollPeriod } from '@/lib/payroll-period';
import { employeeName, type PayrollEmployee, type PayrollPreview, type PayrollReceipt } from './payroll-types';

export default function ReceiptModal({ employee, period, onClose, onIssued }: {
  employee: PayrollEmployee; period: PayrollPeriod; onClose: () => void; onIssued: () => void;
}) {
  const [days, setDays] = useState<number | string>(employee.receipts[0]?.days ?? period.defaultDays);
  const [observations, setObservations] = useState(employee.receipts[0]?.observations ?? '');
  const [preview, setPreview] = useState<{ key: string; data: PayrollPreview } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [receipts, setReceipts] = useState(employee.receipts);
  const requestKey = JSON.stringify({ from: period.from, to: period.to, days, observations: observations.trim() });
  const [debouncedKey] = useDebouncedValue(requestKey, 250);
  const idempotency = useRef<{ key: string; id: string } | null>(null);
  const validDays = typeof days === 'number' && Number.isInteger(days) && days >= 1 && days <= 15;
  const issued = receipts[0] ?? null;
  const ready = issued ?? (preview?.key === requestKey ? preview.data : null);

  useEffect(() => {
    if (issued || debouncedKey !== requestKey || !validDays) return;
    const controller = new AbortController();
    setLoading(true); setError(null);
    api<PayrollPreview>(`/employee-payroll/${employee.id}/preview`, { method: 'POST', json: JSON.parse(debouncedKey), signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setPreview({ key: debouncedKey, data }); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo calcular la nómina.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [debouncedKey, employee.id, requestKey, validDays, issued]);

  async function download(receipt: PayrollReceipt) {
    const blob = await apiBlob(`/employee-payroll/receipts/${receipt.id}/pdf`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url;
    link.download = `nomina-${employeeName(employee).replace(/[^\p{L}\p{N}-]+/gu, '-')}-${period.from}.pdf`;
    document.body.appendChild(link); link.click(); link.remove();
    // Keep the URL alive while the browser starts the download.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  async function existingPdf(receipt: PayrollReceipt) {
    setBusy(receipt.id); setError(null);
    try { await download(receipt); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo descargar el comprobante.'); }
    finally { setBusy(null); }
  }
  async function issue() {
    if (!ready?.eligible || !validDays || (days !== 15 && !observations.trim())) return;
    const key = `${requestKey}:${ready.expectedSalaryRevision}`;
    if (idempotency.current?.key !== key) idempotency.current = { key, id: crypto.randomUUID() };
    setBusy('new'); setError(null);
    try {
      const receipt = await api<PayrollReceipt>(`/employee-payroll/${employee.id}/receipts`, {
        method: 'POST', json: { ...JSON.parse(requestKey), expectedSalaryRevision: ready.expectedSalaryRevision, idempotencyKey: idempotency.current.id },
      });
      setReceipts(current => current.some(item => item.id === receipt.id) ? current : [receipt, ...current]);
      onIssued();
      await download(receipt);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo emitir el comprobante.'); }
    finally { setBusy(null); }
  }
  const figures: Array<[string, string | null | undefined]> = [
    ['Salario del período', ready?.salaryEarned], ['Auxilio del período', ready?.transportEarned],
    ['Total devengado', ready?.totalEarned], ['Salud · 4%', ready?.healthDeduction],
    ['Pensión · 4%', ready?.pensionDeduction], ['Neto a pagar', ready?.netPay],
  ];
  return <Modal opened onClose={() => { if (!busy) onClose(); }} title={`Comprobante · ${employeeName(employee)}`} size="lg" centered closeOnClickOutside={!busy} closeOnEscape={!busy}>
    <Stack gap="md">
      <Text size="sm" c="dimmed">{period.from} al {period.to} · nómina quincenal</Text>
      {error ? <Alert color="red" title="No se pudo completar la operación">{error}</Alert> : null}
      {issued ? <Alert color="teal" title="Comprobante emitido">Estos valores están congelados. Descarga el PDF original; no se recalcula con cambios de salario. Las rectificaciones de comprobantes emitidos requieren un flujo separado.</Alert> : null}
      <NumberInput label="Días liquidados" description="Quincena completa: 15 días de nómina, incluso cuando el mes tiene 28 o 31 días." value={days} onChange={setDays} min={1} max={15} allowDecimal={false} disabled={!!busy || !!issued} />
      <Textarea label="Observaciones" description={days !== 15 ? 'Indica el motivo de liquidar menos de 15 días.' : 'Opcional; se imprime en el comprobante.'} value={observations} onChange={e => setObservations(e.currentTarget.value)} minRows={2} maxLength={1000} disabled={!!busy || !!issued} required={days !== 15} />
      {ready && !ready.eligible ? <Alert color="yellow" title="Requiere revisión"><Stack gap={4}>{ready.blockingReasons.map(reason => <Text key={reason} size="sm">{reason}</Text>)}</Stack></Alert> : null}
      <SimpleGrid cols={{ base: 1, xs: 2 }}>{figures.map(([label, value]) => <div key={label}><Text size="xs" c="dimmed">{label}</Text><Text fw={label === 'Neto a pagar' ? 800 : 600}>{value == null ? (loading ? 'Calculando…' : 'Pendiente') : payrollMoney(value)}</Text></div>)}</SimpleGrid>
      <Text size="xs" c="dimmed">Deducciones sobre el salario, sin auxilio. Cada concepto se redondea al peso y el total suma esos valores. El PDF conserva la liquidación; emitir no registra un pago ni una firma.</Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Button variant="default" onClick={onClose} disabled={!!busy}>Cerrar</Button>
        {issued ? <Button leftSection={<IconDownload size={16} />} loading={busy === issued.id} onClick={() => existingPdf(issued)} disabled={!!busy}>Descargar PDF emitido</Button> : <Button leftSection={<IconFileTypePdf size={16} />} loading={busy === 'new'} onClick={issue} disabled={!!busy || !ready?.eligible || !validDays || (days !== 15 && !observations.trim())}>Emitir y descargar PDF</Button>}
      </SimpleGrid>
      {receipts.length > 1 ? <><Divider /><Text size="sm" fw={700}>Comprobantes emitidos de esta quincena</Text>{receipts.map(receipt => <Group key={receipt.id} justify="space-between" wrap="wrap">
        <Stack gap={2}><Group gap="xs"><Badge variant="light">Emitido</Badge><Text size="sm">{receipt.days} días · neto {payrollMoney(receipt.netPay)}</Text></Group><Text size="xs" c="dimmed">{receipt.createdAt.slice(0, 10)} · los cambios de salario no alteran este PDF</Text></Stack>
        <Button variant="light" size="xs" leftSection={<IconDownload size={14} />} loading={busy === receipt.id} disabled={!!busy} onClick={() => existingPdf(receipt)}>Descargar PDF</Button>
      </Group>)}</> : null}
    </Stack>
  </Modal>;
}
