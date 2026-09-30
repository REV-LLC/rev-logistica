'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Badge, Button, Container, Group, Loader, Modal, Paper, Stack, Table, Text, Textarea, TextInput, Title } from '@mantine/core';
import { api } from '@/lib/api';

type Salary = { id: string; effectiveFrom: string; monthlySalary: string; note: string; revision: number; createdAt: string };
type Employee = { id: string; name: string; lastName: string; active: boolean; latestRevision: number; current: (Salary & { hourlyRate: string }) | null; history: Salary[] };
type Data = { initialWorkSchedule: { label: string }; policy: { date: string; minimumMonthlySalary: string; transportAllowanceReference: string; monthlyHourDivisor: number; weeklyHours: number; restOrHolidayRate: string }; employees: Employee[] };
const money = (value: string) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(Number(value));
const dateLabel = (value: string) => value.slice(0, 10).split('-').reverse().join('/');

export default function EmployeePayrollPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [salary, setSalary] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    api<Data>('/employee-payroll', { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo cargar la nómina base'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  function open(employee: Employee) {
    setSelected(employee); setSalary(employee.current?.monthlySalary ?? data!.policy.minimumMonthlySalary);
    setDate(data!.policy.date); setNote(''); setSaveError(null);
  }
  async function save() {
    if (!selected || saving) return;
    setSaving(true); setSaveError(null);
    try {
      await api(`/employee-payroll/${selected.id}/salaries`, { method: 'POST', json: {
        monthlySalary: salary.trim(), effectiveFrom: date, note, expectedRevision: selected.latestRevision,
      } });
      setSelected(null); setAttempt(value => value + 1);
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'No se pudo guardar'); }
    finally { setSaving(false); }
  }
  return <Container size="xl" py="xl"><Stack gap="lg">
    <Group><Button component={Link} href="/employees" variant="subtle">Volver a empleados</Button></Group>
    <div><Title order={1}>Nómina base</Title><Text c="dimmed">Salario mensual de cada empleado y su historial de cambios.</Text></div>
    <Alert title="Configuración salarial inicial" color="blue">El salario base se configura inicialmente con el mínimo. Esta pantalla no liquida pagos, deducciones ni prestaciones. Los extras se incorporarán con los reportes y la jornada de cada operario. El valor hora mostrado es una referencia de la jornada máxima legal; no es una liquidación del horario pactado.</Alert>
    {loading ? <Loader aria-label="Cargando salarios" /> : error ? <Alert color="red" title="No se pudo cargar"><Stack><Text>{error}</Text><Button onClick={() => setAttempt(n => n + 1)}>Reintentar</Button></Stack></Alert> : data ? <>
      <Paper withBorder p="md"><Stack gap="xs">
        <Text fw={600}>Referencia Colombia · {dateLabel(data.policy.date)}</Text>
        <Text>Salario mínimo: {money(data.policy.minimumMonthlySalary)} · Jornada general: {data.policy.weeklyHours} horas semanales.</Text>
        <Text size="sm">Horario inicial REV: {data.initialWorkSchedule.label}.</Text>
        <Text size="sm">Hora ordinaria de referencia: salario mensual ÷ {data.policy.monthlyHourDivisor}. Auxilio de transporte: {money(data.policy.transportAllowanceReference)}, sujeto a condiciones y separado de la base de recargos.</Text>
        <Text size="sm">Recargos: nocturno 35% · extra diurna 25% · extra nocturna 75% · descanso obligatorio o festivo {Number(data.policy.restOrHolidayRate) * 100}%.</Text>
      </Stack></Paper>
      <Paper withBorder style={{ overflow: 'auto' }}><Table miw={760} verticalSpacing="md">
        <Table.Thead><Table.Tr><Table.Th>Empleado</Table.Th><Table.Th>Salario mensual</Table.Th><Table.Th>Hora ordinaria</Table.Th><Table.Th>Vigente desde</Table.Th><Table.Th>Acciones</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{data.employees.map(e => <Table.Tr key={e.id}>
          <Table.Td><Text fw={600}>{e.name} {e.lastName}</Text>{!e.active ? <Badge color="gray">Inactivo</Badge> : null}</Table.Td>
          <Table.Td>{e.current ? money(e.current.monthlySalary) : 'Sin configuración vigente'}</Table.Td>
          <Table.Td>{e.current ? money(e.current.hourlyRate) : '—'}</Table.Td>
          <Table.Td>{e.current ? dateLabel(e.current.effectiveFrom) : '—'}</Table.Td>
          <Table.Td><Button variant="light" onClick={() => open(e)} aria-label={`Editar salario de ${e.name} ${e.lastName}`}>Editar / historial</Button></Table.Td>
        </Table.Tr>)}</Table.Tbody>
      </Table>{!data.employees.length ? <Text p="lg">No hay empleados registrados.</Text> : null}</Paper>
    </> : null}
    <Modal opened={selected !== null} onClose={() => { if (!saving) setSelected(null); }} title={`Salario · ${selected?.name ?? ''} ${selected?.lastName ?? ''}`} size="lg">
      <form onSubmit={event => { event.preventDefault(); void save(); }}><Stack>
        <TextInput label="Salario mensual (COP)" description="Sin separador de miles; usa punto para los decimales." value={salary} onChange={event => setSalary(event.currentTarget.value)} required disabled={saving} inputMode="decimal" />
        <TextInput type="date" label="Vigente desde" value={date} min="2026-09-16" max="2026-12-31" onChange={event => setDate(event.currentTarget.value)} required disabled={saving} />
        <Textarea label="Motivo del cambio" value={note} onChange={event => setNote(event.currentTarget.value)} required maxLength={500} disabled={saving} />
        <Text size="sm" c="dimmed">El cambio se guarda como una nueva versión. Una corrección con la misma fecha sustituye su valor aplicable y conserva el historial.</Text>
        {saveError ? <Alert color="red">{saveError}</Alert> : null}
        <Button type="submit" loading={saving}>Guardar salario</Button>
        <Title order={3}>Historial</Title>
        {selected?.history.map(s => <Paper key={s.id} withBorder p="sm"><Text fw={600}>{money(s.monthlySalary)} · desde {dateLabel(s.effectiveFrom)}</Text><Text size="sm">{s.note}</Text><Text size="xs" c="dimmed">Versión {s.revision} · registrada {dateLabel(s.createdAt)}</Text></Paper>)}
      </Stack></form>
    </Modal>
  </Stack></Container>;
}
