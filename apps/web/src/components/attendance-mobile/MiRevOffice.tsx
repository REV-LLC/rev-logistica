'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { TextInput, Select } from '@mantine/core';
import { api, ApiError } from '@/lib/api';
import styles from './mobile-attendance.module.css';

type Employee = { id: string; name: string; lastName: string; eps: string | null; arl: string | null };
export default function MiRevOffice() {
  const [employees, setEmployees] = useState<Employee[] | null>(null), [selected, setSelected] = useState<string | null>(null);
  const [eps, setEps] = useState(''), [arl, setArl] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    api<Employee[]>('/employee-portal/office/employees', { signal: controller.signal, cache: 'no-store' })
      .then(result => { if (!controller.signal.aborted) setEmployees(result); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof ApiError && cause.status === 403 ? 'Solo oficina puede configurar las afiliaciones de los empleados.' : 'No pudimos cargar los empleados.'); });
    return () => controller.abort();
  }, [attempt]);
  function select(id: string | null) {
    const employee = employees?.find(item => item.id === id);
    setSelected(id); setEps(employee?.eps || ''); setArl(employee?.arl || ''); setNotice(''); setError('');
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!selected || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await api<Pick<Employee,'id'|'eps'|'arl'>>(`/employee-portal/office/employees/${selected}/affiliations`, { method: 'PATCH', json: { eps, arl } });
      setEmployees(current => current?.map(item => item.id === updated.id ? { ...item, ...updated } : item) || null);
      setNotice('EPS y ARL guardadas. El empleado las verá en su perfil.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar las afiliaciones.'); }
    finally { setBusy(false); }
  }
  return <section className={styles.stack}>
    <Link className={styles.link} href="/attendance/mobile">Volver al inicio</Link>
    <div className={styles.greeting}><h1>Afiliaciones de empleados</h1><p>Configura la EPS y la ARL de cada empleado.</p></div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {!employees ? error ? <button className={styles.secondary} onClick={() => setAttempt(value => value + 1)}>Reintentar</button> : <p role="status">Cargando empleados…</p> : <form onSubmit={event => void save(event)} className={`${styles.card} ${styles.stack} ${styles.portalForm}`}>
      <Select label="Empleado" placeholder="Buscar empleado" searchable clearable nothingFoundMessage="No hay coincidencias" data={employees.map(item => ({ value: item.id, label: `${item.name} ${item.lastName}`.trim() }))} value={selected} onChange={select} disabled={busy} comboboxProps={{ withinPortal: false }} />
      {selected ? <>
        <TextInput label="EPS" placeholder="Nombre de la EPS" value={eps} onChange={event => setEps(event.currentTarget.value)} maxLength={160} disabled={busy} />
        <TextInput label="ARL" placeholder="Nombre de la ARL" value={arl} onChange={event => setArl(event.currentTarget.value)} maxLength={160} disabled={busy} />
        <button className={styles.primary} disabled={busy}>{busy ? 'GUARDANDO…' : 'GUARDAR AFILIACIONES'}</button>
      </> : null}
      {notice ? <p role="status">{notice}</p> : null}
    </form>}
  </section>;
}
