'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Group, Modal, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { api } from '@/lib/api';
import { monthlySalaryTotal, payrollMoney } from '@/lib/payroll-period';
import { employeeName, type PayrollEmployee, type PayrollPeriodResponse } from './payroll-types';

export default function SalaryModal({ employee, date, policy, onClose, onSaved }: {
  employee: PayrollEmployee; date: string; policy: PayrollPeriodResponse['policy'];
  onClose: () => void; onSaved: () => void;
}) {
  const [salary, setSalary] = useState(employee.current?.monthlySalary ?? '');
  const [allowance, setAllowance] = useState(employee.current?.transportAllowance ?? '0');
  const [effectiveFrom, setEffectiveFrom] = useState(employee.current?.effectiveFrom.slice(0, 10) ?? date);
  const [regime, setRegime] = useState<string>(employee.current?.regime ?? 'STANDARD');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = monthlySalaryTotal(salary, allowance);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!total || !note.trim()) return;
    setSaving(true); setError(null);
    try {
      await api(`/employee-payroll/${employee.id}/salaries`, {
        method: 'POST', json: { effectiveFrom, monthlySalary: salary, transportAllowance: allowance,
          regime, note: note.trim(), expectedRevision: employee.latestRevision },
      });
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el salario.'); }
    finally { setSaving(false); }
  }
  return <Modal opened onClose={() => { if (!saving) onClose(); }} title={`Salario · ${employeeName(employee)}`} size="lg" centered closeOnClickOutside={!saving} closeOnEscape={!saving}>
    <form onSubmit={save}><Stack gap="md">
      {employee.current?.provisional ? <Alert color="yellow" title="Salario provisional">Se asignó el mínimo como referencia. Revisa salario, auxilio y régimen; guardar confirma esta configuración.</Alert> : null}
      {error ? <Alert color="red" title="No se pudo guardar">{error}</Alert> : null}
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label="Salario base mensual" description="Valor en COP, sin auxilio" inputMode="decimal" value={salary} onChange={e => setSalary(e.currentTarget.value)} required disabled={saving} />
        <TextInput label="Auxilio de transporte mensual" description="0 si no corresponde" inputMode="decimal" value={allowance} onChange={e => setAllowance(e.currentTarget.value)} required disabled={saving} />
      </SimpleGrid>
      <Group justify="space-between"><Text size="sm" c="dimmed">Base + auxilio mensual</Text><Text fw={800}>{total ? payrollMoney(total) : 'Revisa los valores'}</Text></Group>
      <Text size="xs" c="dimmed">Referencia 2026: mínimo {payrollMoney(policy.minimumMonthlySalary)} · auxilio {payrollMoney(policy.transportAllowanceReference)}. No supone que el auxilio corresponda a todas las personas.</Text>
      <Select label="Tratamiento de nómina" value={regime} onChange={value => setRegime(value ?? 'REVIEW_REQUIRED')} allowDeselect={false} disabled={saving} data={[
        { value: 'STANDARD', label: 'Régimen general: salud 4% y pensión 4%' },
        { value: 'REVIEW_REQUIRED', label: 'Requiere revisión: régimen o condiciones especiales' },
      ]} />
      <TextInput type="date" label="Vigente desde" value={effectiveFrom} onChange={e => setEffectiveFrom(e.currentTarget.value)} required disabled={saving} />
      <Textarea label="Motivo o confirmación" placeholder="Ej. Salario y auxilio confirmados por Office" value={note} onChange={e => setNote(e.currentTarget.value)} required minRows={2} maxLength={500} disabled={saving} />
      <Text size="xs" c="dimmed">Guardar agrega una revisión: no cambia salarios anteriores ni comprobantes emitidos. Un cambio dentro de la quincena requiere revisión antes de emitir.</Text>
      {employee.history.length ? <Stack gap={4}>
        <Text size="sm" fw={700}>Historial salarial</Text>
        {employee.history.slice(0, 5).map(item => <Group key={item.id} justify="space-between" gap="xs">
          <Text size="xs">{item.effectiveFrom.slice(0, 10)} · base {payrollMoney(item.monthlySalary)} + auxilio {payrollMoney(item.transportAllowance)}</Text>
          <Badge variant="light" color={item.provisional ? 'yellow' : 'blue'} size="xs">{item.provisional ? 'Provisional' : `Rev. ${item.revision}`}</Badge>
        </Group>)}
      </Stack> : null}
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Button variant="default" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button type="submit" loading={saving} disabled={!total || !note.trim() || !effectiveFrom}>Guardar y confirmar</Button>
      </SimpleGrid>
    </Stack></form>
  </Modal>;
}
