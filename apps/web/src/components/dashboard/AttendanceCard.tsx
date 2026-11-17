'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ActionIcon, Alert, Button, Group, Loader, Paper, SegmentedControl, Text, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import EmployeeAvatar from '@/components/EmployeeAvatar';
import { api } from '@/lib/api';
import styles from './AttendanceCard.module.css';

type Event = { at: string; status: string } | null;
type Summary = { date: string; employees: { id: string; name: string; lastName: string | null; entry: Event; exit: Event }[] };
function state(event: Event) {
  return !event ? 'missing' : event.status === 'REJECTED' ? 'rejected' : ['VERIFIED', 'APPROVED'].includes(event.status) ? 'registered' : 'pending';
}
const labels = { missing: 'Sin registro', pending: 'Por revisar', rejected: 'Rechazado', registered: 'Registrado' };

export default function AttendanceCard() {
  const [mode, setMode] = useState<'entry' | 'exit'>('entry');
  const [report, setReport] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    api<Summary>('/attendance/dashboard', { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setReport(data);
    }).catch(() => { if (!controller.signal.aborted) setError(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [refresh]);
  const registered = report?.employees.filter(employee => state(employee[mode]) === 'registered').length ?? 0;
  return <Paper withBorder radius="xl" p="lg" className={styles.card} aria-label="Asistencia de empleados">
    <Group justify="space-between" gap="md">
      <div><Text component="h2" fw={700} size="lg" m={0}>Asistencia de hoy</Text>{report ? <Text size="sm" c="dimmed">{new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long' }).format(new Date(`${report.date}T12:00:00-05:00`))} · {registered} de {report.employees.length} registrados</Text> : null}</div>
      <Group gap="xs"><SegmentedControl aria-label="Tipo de marcación" value={mode} onChange={value => setMode(value as 'entry' | 'exit')} data={[{ value: 'entry', label: 'Entrada' }, { value: 'exit', label: 'Salida' }]} /><Tooltip label="Actualizar asistencia"><ActionIcon variant="subtle" aria-label="Actualizar asistencia" onClick={refresh} loading={loading}><IconRefresh size={18} /></ActionIcon></Tooltip></Group>
    </Group>
    {error ? <Alert color="red" mt="md">No se pudo cargar la asistencia.<Button variant="subtle" onClick={refresh}>Reintentar</Button></Alert> : loading && !report ? <div className={styles.loading}><Loader size="sm" aria-label="Cargando asistencia" /></div> : <>
      <div className={styles.legend}>{Object.entries(labels).map(([key, label]) => <span key={key}><i data-state={key} />{label}</span>)}</div>
      {report?.employees.length ? <div className={styles.grid} aria-busy={loading}>{report.employees.map(employee => {
        const event = employee[mode], status = state(event), name = `${employee.name} ${employee.lastName ?? ''}`.trim();
        const time = event ? new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(event.at)) : null;
        const description = `${name}: ${mode === 'entry' ? 'Entrada' : 'Salida'} ${labels[status]}`;
        return <Tooltip key={employee.id} label={`${description}${time ? ` · ${time}` : ''}`} withArrow events={{ hover: true, focus: true, touch: true }}>
          <Link href={`/employees/${employee.id}`} className={styles.employee} aria-label={description}>
          <span className={styles.ring} data-state={status}><EmployeeAvatar employee={employee} size={52} /></span>
          </Link>
        </Tooltip>;
      })}</div> : <Text c="dimmed" mt="lg">No hay empleados activos.</Text>}
    </>}
  </Paper>;
}
