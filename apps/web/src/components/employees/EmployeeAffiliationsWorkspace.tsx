'use client';

import EmployeeCertificateReviews from './EmployeeCertificateReviews';
import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Checkbox, Group, Paper, Select, Stack, Tabs, Text, TextInput, Title } from '@mantine/core';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import workspace from '@/app/employees/[employeeId]/workspace.module.css';

type Employee = { id: string; name: string; lastName: string; eps: string | null; arl: string | null; epsId: string | null; arlId: string | null };
type Provider = { id: string; kind: 'EPS' | 'ARL'; name: string; active: boolean };
const endpoint = '/employee-affiliations';

export default function EmployeeAffiliationsWorkspace() {
  const router = useRouter(), params = useSearchParams();
  const tab = params.get('tab') === 'catalog' ? 'catalog' : params.get('tab') === 'certificates' ? 'certificates' : 'employees';
  const [employees, setEmployees] = useState<Employee[] | null>(null), [catalog, setCatalog] = useState<Provider[]>([]);
  const [selected, setSelected] = useState<string | null>(null), [epsId, setEpsId] = useState<string | null>(null), [arlId, setArlId] = useState<string | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<string | null>(null), [kind, setKind] = useState<string | null>('EPS'), [name, setName] = useState(''), [active, setActive] = useState(true), [search, setSearch] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setError('');
    Promise.all([
      api<Employee[]>(`${endpoint}/employees`, { signal: controller.signal, cache: 'no-store' }),
      api<Provider[]>(`${endpoint}/providers`, { signal: controller.signal, cache: 'no-store' }),
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
      const updated = await api<Employee>(`${endpoint}/employees/${selected}`, { method: 'PATCH', json: { epsId, arlId } });
      setEmployees(current => current?.map(item => item.id === updated.id ? updated : item) || null);
      setNotice('Afiliaciones asignadas. El empleado las verá en su perfil.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar las afiliaciones.'); }
    finally { setBusy(false); }
  }
  async function saveProvider(event: FormEvent) {
    event.preventDefault(); if (busy || !kind) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await api<Provider>(`${endpoint}/providers${editing ? `/${editing}` : ''}`, { method: editing ? 'PATCH' : 'POST', json: editing ? { name, active } : { kind, name } });
      setCatalog(current => [...current.filter(item => item.id !== updated.id), updated].sort((a,b) => a.name.localeCompare(b.name, 'es')));
      setEmployees(current => current?.map(person => ({ ...person, eps: person.epsId === updated.id ? updated.name : person.eps, arl: person.arlId === updated.id ? updated.name : person.arl })) || null);
      setNotice(editing ? 'Entidad actualizada en el catálogo y en los perfiles asignados.' : 'Entidad creada. Ya puedes asignarla a empleados.');
      resetProvider();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar la entidad.'); }
    finally { setBusy(false); }
  }
  const options = (providerKind: string, current: string | null) => catalog.filter(item => item.kind === providerKind && (item.active || item.id === current)).map(item => ({ value: item.id, label: `${item.name}${item.active ? '' : ' (inactiva)'}` }));
  const visibleCatalog = catalog.filter(item => `${item.kind} ${item.name}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')));
  return <Stack gap="md">
    {error ? <Alert color="red" title="No se pudo completar" role="alert">{error}</Alert> : null}
    {notice ? <Alert color="teal" role="status">{notice}</Alert> : null}
    {!employees ? error ? <Button variant="light" onClick={() => setAttempt(value => value + 1)}>Reintentar</Button> : <Text role="status">Cargando afiliaciones…</Text> : <section className={workspace.workspace} aria-label="Gestión de afiliaciones">
      <Tabs value={tab} onChange={value => { if (value && !busy) { setError(''); setNotice(''); if (value === 'employees') setAttempt(current => current + 1); router.replace(`/employees/affiliations?tab=${value}`, { scroll: false }); } }} keepMounted={false} variant="unstyled" classNames={{ list: workspace.list, tab: workspace.tab, panel: workspace.panel }}>
        <Tabs.List aria-label="Administración de EPS y ARL">
          <Tabs.Tab value="employees" disabled={busy}>Empleados</Tabs.Tab>
          <Tabs.Tab value="catalog" disabled={busy}>Catálogo EPS/ARL</Tabs.Tab>
          <Tabs.Tab value="certificates" disabled={busy}>Certificados</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="certificates"><div className={workspace.panel}><EmployeeCertificateReviews providers={catalog} onChanged={()=>setAttempt(value=>value+1)}/></div></Tabs.Panel>
        <Tabs.Panel value="employees"><form onSubmit={event => void assign(event)}><Stack gap="md">
          <Select label="Empleado" placeholder="Buscar empleado" searchable clearable nothingFoundMessage="No hay coincidencias" data={employees.map(item => ({ value: item.id, label: `${item.name} ${item.lastName}`.trim() }))} value={selected} onChange={select} disabled={busy} />
          {selected ? <>
            <Select label="EPS" placeholder="Selecciona una EPS del catálogo" searchable clearable nothingFoundMessage="Crea la EPS en el catálogo" data={options('EPS', epsId)} value={epsId} onChange={setEpsId} disabled={busy} />
            <Select label="ARL" placeholder="Selecciona una ARL del catálogo" searchable clearable nothingFoundMessage="Crea la ARL en el catálogo" data={options('ARL', arlId)} value={arlId} onChange={setArlId} disabled={busy} />
            <Text size="sm" c="dimmed">Puedes agregar entidades desde «Catálogo EPS/ARL».</Text>
            <Group><Button type="submit" loading={busy}>Guardar afiliaciones</Button></Group>
          </> : null}
        </Stack></form></Tabs.Panel>
        <Tabs.Panel value="catalog"><Stack gap="xl">
          <form onSubmit={event => void saveProvider(event)}><Stack gap="md">
            <Title order={3}>{editing ? 'Editar entidad' : 'Crear entidad'}</Title>
            <Select label="Tipo de entidad" data={['EPS','ARL']} value={kind} onChange={setKind} disabled={busy || Boolean(editing)} allowDeselect={false} />
            <TextInput label="Nombre de la entidad" placeholder="Nombre de la EPS o ARL" value={name} onChange={event => setName(event.currentTarget.value)} maxLength={160} required disabled={busy} />
            {editing ? <Checkbox label="Entidad activa" checked={active} onChange={event => setActive(event.currentTarget.checked)} disabled={busy} description="Las entidades inactivas conservan sus empleados actuales y dejan de aparecer en nuevas asignaciones." /> : null}
            <Group><Button type="submit" loading={busy} disabled={!name.trim()}>{editing ? 'Guardar entidad' : 'Crear entidad'}</Button>{editing ? <Button variant="subtle" disabled={busy} onClick={resetProvider}>Cancelar edición</Button> : null}</Group>
          </Stack></form>
          <Stack gap="md">
            <TextInput label="Buscar en el catálogo" placeholder="Buscar EPS o ARL" value={search} onChange={event => setSearch(event.currentTarget.value)} />
            <Text size="sm" c="dimmed">{visibleCatalog.length} entidades</Text>
            {visibleCatalog.map(item => <Paper withBorder p="md" radius="md" key={item.id}><Group justify="space-between" wrap="wrap" gap="sm">
              <Stack gap={4} style={{ minWidth: 0 }}><Text fw={600} style={{ overflowWrap: 'anywhere' }}>{item.name}</Text><Group gap="xs"><Badge variant="light">{item.kind}</Badge><Text size="xs" c="dimmed">{item.active ? 'Activa' : 'Inactiva'}</Text></Group></Stack>
              <Button variant="light" size="xs" disabled={busy} aria-label={`Editar ${item.kind} ${item.name}`} onClick={() => { setEditing(item.id); setKind(item.kind); setName(item.name); setActive(item.active); setError(''); setNotice(''); }}>Editar</Button>
            </Group></Paper>)}
            {!catalog.length ? <Text c="dimmed">Aún no hay entidades. Crea la primera EPS o ARL arriba.</Text> : !visibleCatalog.length ? <Text c="dimmed">No hay coincidencias.</Text> : null}
          </Stack>
        </Stack></Tabs.Panel>
      </Tabs>
    </section>}
  </Stack>;
}
