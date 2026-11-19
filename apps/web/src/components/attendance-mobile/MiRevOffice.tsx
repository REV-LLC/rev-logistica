'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Checkbox, Select, Tabs, TextInput } from '@mantine/core';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import workspace from '@/app/employees/[employeeId]/workspace.module.css';
import styles from './mobile-attendance.module.css';

type Employee = { id: string; name: string; lastName: string; eps: string | null; arl: string | null; epsId: string | null; arlId: string | null };
type Provider = { id: string; kind: 'EPS' | 'ARL'; name: string; active: boolean };
const endpoint = '/employee-portal/office';

export default function MiRevOffice() {
  const router = useRouter(), params = useSearchParams();
  const tab = params.get('tab') === 'catalog' ? 'catalog' : 'employees';
  const [employees, setEmployees] = useState<Employee[] | null>(null), [catalog, setCatalog] = useState<Provider[]>([]);
  const [selected, setSelected] = useState<string | null>(null), [epsId, setEpsId] = useState<string | null>(null), [arlId, setArlId] = useState<string | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<string | null>(null), [kind, setKind] = useState<string | null>('EPS'), [name, setName] = useState(''), [active, setActive] = useState(true), [search, setSearch] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setError('');
    Promise.all([
      api<Employee[]>(`${endpoint}/employees`, { signal: controller.signal, cache: 'no-store' }),
      api<Provider[]>(`${endpoint}/affiliation-providers`, { signal: controller.signal, cache: 'no-store' }),
    ]).then(([people, providers]) => { if (!controller.signal.aborted) { setEmployees(people); setCatalog(providers); } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof ApiError && [401,403].includes(cause.status) ? 'Solo oficina puede configurar las afiliaciones de los empleados.' : 'No pudimos cargar las afiliaciones.'); });
    return () => controller.abort();
  }, [attempt]);
  function select(id: string | null) {
    const employee = employees?.find(item => item.id === id);
    setSelected(id); setEpsId(employee?.epsId || null); setArlId(employee?.arlId || null); setNotice(''); setError('');
  }
  function resetProvider() { setEditing(null); setName(''); setActive(true); }
  async function assign(event: FormEvent) {
    event.preventDefault(); if (!selected || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await api<Employee>(`${endpoint}/employees/${selected}/affiliations`, { method: 'PATCH', json: { epsId, arlId } });
      setEmployees(current => current?.map(item => item.id === updated.id ? updated : item) || null);
      setNotice('Afiliaciones asignadas. El empleado las verá en su perfil.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar las afiliaciones.'); }
    finally { setBusy(false); }
  }
  async function saveProvider(event: FormEvent) {
    event.preventDefault(); if (busy || !kind) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await api<Provider>(`${endpoint}/affiliation-providers${editing ? `/${editing}` : ''}`, { method: editing ? 'PATCH' : 'POST', json: editing ? { name, active } : { kind, name } });
      setCatalog(current => [...current.filter(item => item.id !== updated.id), updated].sort((a,b) => a.name.localeCompare(b.name, 'es')));
      setEmployees(current => current?.map(person => ({ ...person, eps: person.epsId === updated.id ? updated.name : person.eps, arl: person.arlId === updated.id ? updated.name : person.arl })) || null);
      setNotice(editing ? 'Entidad actualizada en el catálogo y en los perfiles asignados.' : 'Entidad creada. Ya puedes asignarla a empleados.');
      resetProvider();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar la entidad.'); }
    finally { setBusy(false); }
  }
  const options = (providerKind: string, current: string | null) => catalog.filter(item => item.kind === providerKind && (item.active || item.id === current)).map(item => ({ value: item.id, label: `${item.name}${item.active ? '' : ' (inactiva)'}` }));
  const visibleCatalog = catalog.filter(item => `${item.kind} ${item.name}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')));
  return <section className={styles.stack}>
    <Link className={styles.link} href="/attendance/mobile">Volver al inicio</Link>
    <div className={styles.greeting}><h1>EPS y ARL</h1><p>Crea las entidades en el catálogo y asígnalas a tus empleados.</p></div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    {!employees ? error ? <button className={styles.secondary} onClick={() => setAttempt(value => value + 1)}>Reintentar</button> : <p role="status">Cargando afiliaciones…</p> : <section className={workspace.workspace} aria-label="Gestión de afiliaciones">
      <Tabs value={tab} onChange={value => { if (value && !busy) { setError(''); setNotice(''); router.replace(`/attendance/mobile/office?tab=${value}`, { scroll: false }); } }} keepMounted={false} variant="unstyled" classNames={{ list: workspace.list, tab: workspace.tab, tabLabel: workspace.tabLabel }}>
        <Tabs.List className={styles.portalTabs} aria-label="Administración de EPS y ARL">
          <Tabs.Tab value="employees" disabled={busy}>Empleados</Tabs.Tab>
          <Tabs.Tab value="catalog" disabled={busy}>Catálogo EPS/ARL</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="employees" className={styles.portalPanel}>
          <form onSubmit={event => void assign(event)} className={`${styles.stack} ${styles.portalForm}`}>
            <Select label="Empleado" placeholder="Buscar empleado" searchable clearable nothingFoundMessage="No hay coincidencias" data={employees.map(item => ({ value: item.id, label: `${item.name} ${item.lastName}`.trim() }))} value={selected} onChange={select} disabled={busy} comboboxProps={{ withinPortal: false }} />
            {selected ? <>
              <Select label="EPS" placeholder="Selecciona una EPS del catálogo" searchable clearable nothingFoundMessage="Crea la EPS en el catálogo" data={options('EPS', epsId)} value={epsId} onChange={setEpsId} disabled={busy} comboboxProps={{ withinPortal: false }} />
              <Select label="ARL" placeholder="Selecciona una ARL del catálogo" searchable clearable nothingFoundMessage="Crea la ARL en el catálogo" data={options('ARL', arlId)} value={arlId} onChange={setArlId} disabled={busy} comboboxProps={{ withinPortal: false }} />
              <p className={styles.muted}>Si falta una entidad, agrégala primero en «Catálogo EPS/ARL».</p>
              <button className={styles.primary} disabled={busy}>{busy ? 'GUARDANDO…' : 'GUARDAR AFILIACIONES'}</button>
            </> : null}
          </form>
        </Tabs.Panel>
        <Tabs.Panel value="catalog" className={styles.portalPanel}>
          <form onSubmit={event => void saveProvider(event)} className={`${styles.stack} ${styles.portalForm}`}>
            <h2>{editing ? 'Editar entidad' : 'Crear entidad'}</h2>
            <Select label="Tipo de entidad" data={['EPS','ARL']} value={kind} onChange={setKind} disabled={busy || Boolean(editing)} allowDeselect={false} comboboxProps={{ withinPortal: false }} />
            <TextInput label="Nombre de la entidad" placeholder="Nombre de la EPS o ARL" value={name} onChange={event => setName(event.currentTarget.value)} maxLength={160} required disabled={busy} />
            {editing ? <Checkbox label="Entidad activa" checked={active} onChange={event => setActive(event.currentTarget.checked)} disabled={busy} description="Las entidades inactivas conservan sus empleados actuales y dejan de aparecer para nuevas asignaciones." /> : null}
            <button className={styles.primary} disabled={busy || !name.trim()}>{busy ? 'GUARDANDO…' : editing ? 'GUARDAR ENTIDAD' : 'CREAR ENTIDAD'}</button>
            {editing ? <button type="button" className={styles.secondary} disabled={busy} onClick={resetProvider}>Cancelar edición</button> : null}
          </form>
          <div className={`${styles.stack} ${styles.portalForm}`}>
            <TextInput label="Buscar en el catálogo" placeholder="Buscar EPS o ARL" value={search} onChange={event => setSearch(event.currentTarget.value)} />
            <p className={styles.muted}>{visibleCatalog.length} entidades</p>
            <ul className={styles.documentList}>{visibleCatalog.map(item => <li key={item.id} className={styles.documentRow}>
              <strong>{item.name}</strong><p>{item.kind} · {item.active ? 'Activa' : 'Inactiva'}</p>
              <button type="button" className={styles.secondary} disabled={busy} aria-label={`Editar ${item.kind} ${item.name}`} onClick={() => { setEditing(item.id); setKind(item.kind); setName(item.name); setActive(item.active); setError(''); setNotice(''); }}>Editar</button>
            </li>)}</ul>
            {!catalog.length ? <p>Aún no hay entidades. Crea la primera EPS o ARL arriba.</p> : !visibleCatalog.length ? <p>No hay coincidencias.</p> : null}
          </div>
        </Tabs.Panel>
      </Tabs>
    </section>}
  </section>;
}
