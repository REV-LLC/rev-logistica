'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Accordion, Alert, Badge, Button, Group, Loader, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconRoute, IconBattery, IconFocus2, IconMap2, IconRefresh, IconTruck } from '@tabler/icons-react';
import { api, ApiError } from '@/lib/api';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import KnownPlaces from './KnownPlaces';
import { gpsAge, localTime } from './tracking-types';
import type { FleetState, PlannedRoute, RouteHistory, TrackingMapConfig } from './tracking-types';
import classes from './TrackingWorkspace.module.css';

const FleetMap = dynamic(() => import('./FleetMap'), { ssr: false, loading: () => <Paper withBorder p="xl"><Loader /><Text>Cargando mapa…</Text></Paper> });
const NativeTrackingPanel = dynamic(() => import('./NativeTrackingPanel'), { ssr: false, loading: () => <Loader /> });
const message = (e: unknown) => e instanceof ApiError ? e.message : 'No fue posible completar la consulta.';

function periodStart(range: string, now: number) {
  if (range === 'today') {
    const date = new Date(now - 5 * 3600_000).toISOString().slice(0, 10);
    return new Date(`${date}T00:00:00-05:00`).getTime();
  }
  return now - Number(range) * 3600_000;
}

export default function TrackingWorkspace() {
  const router = useRouter();
  const search = useSearchParams();
  const queryId = Number(search.get('truck'));
  const selectedId = Number.isSafeInteger(queryId) && queryId > 0 ? queryId : null;
  const [fleet, setFleet] = useState<FleetState | null>(null);
  const [fleetError, setFleetError] = useState(false);
  const [denied, setDenied] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [config, setConfig] = useState<TrackingMapConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [history, setHistory] = useState<RouteHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [range, setRange] = useState<string | null>('1');
  const [follow, setFollow] = useState(false);
  const [fit, setFit] = useState(0);
  const [historyFit, setHistoryFit] = useState(0);
  const [destination, setDestination] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [planned, setPlanned] = useState<PlannedRoute | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [showNative, setShowNative] = useState(false);
  const planningRef = useRef(false);
  const generation = useRef(0);

  const select = (id: number) => {
    const params = new URLSearchParams(search.toString()); params.set('truck', String(id));
    router.replace(`?${params}`, { scroll: false }); setFollow(true);
  };

  useEffect(() => {
    let active = true, pending = false;
    const controller = new AbortController();
    const update = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const value = await api<FleetState>('/tracking/fleet', { signal: controller.signal, cache: 'no-store' });
        if (active) { setFleet(value); setFleetError(false); }
      } catch (e) {
        if (active) {
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { setDenied(true); setFleet(null); setHistory(null); setPlanned(null); }
          else setFleetError(true);
        }
      } finally { pending = false; }
    };
    void update(); const timer = setInterval(() => void update(), 5000);
    document.addEventListener('visibilitychange', update);
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [refresh]);

  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);

  useEffect(() => {
    const controller = new AbortController(); let active = true;
    void api<TrackingMapConfig>('/tracking/map-config', { cache: 'no-store', signal: controller.signal })
      .then(value => { if (active) setConfig(value); })
      .catch(e => { if (active) setConfigError(message(e)); });
    return () => { active = false; controller.abort(); };
  }, []);

  useEffect(() => {
    setHistory(null); setHistoryError(null);
    if (!selectedId || !range || denied) return;
    let active = true, pending = false;
    const controller = new AbortController();
    const update = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      const now = Date.now();
      const params = new URLSearchParams({ deviceId: String(selectedId), from: new Date(periodStart(range, now)).toISOString(), to: new Date(now).toISOString() });
      try {
        const value = await api<RouteHistory>(`/tracking/history?${params}`, { signal: controller.signal, cache: 'no-store' });
        if (active) { setHistory(value); setHistoryError(null); }
      } catch (e) { if (active) setHistoryError(message(e)); }
      finally { pending = false; }
    };
    void update(); const timer = setInterval(() => void update(), 30_000);
    document.addEventListener('visibilitychange', update);
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [selectedId, range, denied]);

  useEffect(() => { generation.current += 1; setPlanned(null); setPlanError(null); }, [selectedId]);

  const device = fleet?.devices.find(d => d.id === selectedId);
  const age = gpsAge(device?.position || null, clock);
  const invalidSelection = selectedId !== null && fleet !== null && !device;
  const plan = async () => {
    if (!device || planningRef.current) return;
    planningRef.current = true; setPlanning(true); setPlanError(null);
    const attempt = generation.current;
    try {
      const result = await api<PlannedRoute>('/tracking/route', { method: 'POST', json: { deviceId: device.id,
        ...(destination === 'address' ? { address: address.trim() } : { placeId: Number(destination) }) } });
      if (attempt === generation.current) { setFollow(false); setPlanned(result); }
    } catch (e) { if (attempt === generation.current) setPlanError(message(e)); }
    finally { planningRef.current = false; setPlanning(false); }
  };

  if (denied) return <Alert color="red" title="Acceso no disponible">Tu sesión o tus permisos de seguimiento cambiaron. Inicia sesión nuevamente.</Alert>;

  return <Stack gap="md">
    <PageHeaderCard title="Flota y rutas" description="Ubicación GPS, recorrido real y llegada estimada en una sola vista."
      icon={<IconTruck size={22} />} iconColor="teal" accentColor="rgba(18,184,134,.10)"
      aside={<Badge color={fleetError ? 'orange' : fleet ? 'teal' : 'gray'} variant="light">{fleetError ? 'Reconectando' : fleet ? 'Actualización automática' : 'Conectando'}</Badge>} />
    {fleetError ? <Alert color="orange" title="No se pudo actualizar la flota">
      Se conserva el último reporte. Comprueba la hora del GPS antes de coordinar un despacho.
      <Button size="xs" variant="light" ml="sm" onClick={() => setRefresh(n => n + 1)}>Reintentar</Button>
    </Alert> : null}
    {invalidSelection ? <Alert color="orange">El camión seleccionado ya no está disponible. Selecciona otro.</Alert> : null}
    <Group justify="space-between">
      <Group gap="sm">
        <Button variant={follow ? 'filled' : 'default'} color="teal" leftSection={<IconFocus2 size={16} />} disabled={!device?.position}
          onClick={() => setFollow(v => !v)}>{follow ? `Siguiendo ${device?.name || ''}` : 'Seguir camión'}</Button>
        <Button variant="default" onClick={() => { setFollow(false); setFit(n => n + 1); }}>Ver toda la flota</Button>
      </Group>
      <Text size="xs" c="dimmed">{fleet ? `Consulta ${localTime(fleet.fetchedAt)} · cada 5 s` : 'Consultando flota…'}</Text>
    </Group>
    <div className={classes.layout}>
      <div className={classes.list} aria-label="Camiones de la flota">
        {!fleet && !fleetError ? <Loader aria-label="Cargando flota" /> : null}
        {fleet?.devices.length === 0 ? <Text>No hay camiones registrados.</Text> : null}
        {fleet?.devices.map(d => {
          const report = gpsAge(d.position, clock);
          return <button key={d.id} className={`${classes.vehicle} ${d.id === selectedId ? classes.selected : ''}`} aria-pressed={d.id === selectedId} onClick={() => select(d.id)}>
            <Group justify="space-between" gap="xs"><Text fw={750} size="lg">{d.name}</Text><IconTruck size={23} color={d.id === selectedId ? '#0f766e' : undefined} /></Group>
            <Badge color={report.color} variant="light" mt="xs">{report.text}</Badge>
            <Group justify="space-between" gap="xs" mt="sm"><Text size="sm">{d.position?.speedKph !== null && d.position?.speedKph !== undefined ? `${d.position.speedKph} km/h` : 'Velocidad —'}</Text>
              <Text size="sm"><IconBattery size={14} style={{ verticalAlign: 'middle' }} /> {d.position?.batteryPercent !== null && d.position?.batteryPercent !== undefined ? `${Math.round(d.position.batteryPercent)}%` : '—'}</Text></Group>
            <Text size="xs" c="dimmed" mt={5}>Conexión: {d.connection === 'online' ? 'en línea' : d.connection === 'offline' ? 'fuera de línea' : 'sin confirmar'}</Text>
            {d.knownPlaces.length ? <Text size="xs" mt={5}>{report.seconds > 300 ? 'Último punto: ' : ''}{d.knownPlaces.map(p => p.name).join(' · ')}</Text> : null}
          </button>;
        })}
      </div>
      <Stack gap="xs" style={{ minWidth: 0 }}>
        {config?.browserKey ? <FleetMap browserKey={config.browserKey} fleet={fleet} selectedId={selectedId} history={history} route={planned}
          follow={follow} fitVersion={fit} historyFitVersion={historyFit} onSelect={select} onStopFollowing={() => setFollow(false)} /> :
          <Paper withBorder p="xl" radius="md"><Stack align="flex-start"><IconMap2 size={34} /><Title order={3}>Seguimiento Traccar disponible</Title>
            <Text size="sm">{configError || (config ? 'La nueva vista con tráfico está pendiente de activación.' : 'Preparando mapa…')}</Text>
            <Button variant="light" color="teal" onClick={() => setShowNative(true)}>Abrir mapa Traccar</Button></Stack></Paper>}
        <div className={classes.legend}><span><i className={classes.key} />Recorrido GPS real</span><span><i className={`${classes.key} ${classes.planned}`} />Ruta prevista con tráfico</span></div>
        {device?.position ? <Text size="xs" c="dimmed">GPS de {device.name}: {new Date(device.position.reportedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
          {device.position.accuracyMeters !== null ? ` · precisión ±${Math.round(device.position.accuracyMeters)} m` : ''}</Text> : null}
      </Stack>
    </div>
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-end"><div><Title order={4}>{device ? `Recorrido de ${device.name}` : 'Selecciona un camión para ver su recorrido'}</Title>
          {history ? <Text size="sm" c="dimmed">{history.pointCount} reportes · {(history.distanceMeters / 1000).toFixed(1)} km entre puntos registrados{history.gapCount ? ` · ${history.gapCount} tramos sin continuidad GPS` : ''}</Text> : null}</div>
          <Button variant="light" color="teal" disabled={!history?.pointCount || !config?.browserKey} onClick={() => { setFollow(false); setHistoryFit(n => n + 1); }}>Ver recorrido</Button>
          <Select label="Período del recorrido" value={range} onChange={setRange} allowDeselect={false} data={[{ value: '1', label: 'Última hora' }, { value: '3', label: 'Últimas 3 horas' }, { value: 'today', label: 'Hoy · Colombia' }]} /></Group>
        {historyError ? <Alert color="orange">{historyError}</Alert> : history && history.pointCount === 0 ? <Text size="sm">No hay posiciones GPS en este período.</Text> : null}
      </Stack>
    </Paper>
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm"><Group gap="xs"><IconRoute size={21} /><Title order={4}>Planificar llegada</Title><Badge color="violet" variant="light">Con tráfico</Badge></Group>
        <Group align="flex-end" grow><Select label="Destino" placeholder="Selecciona una sede o punto conocido" value={destination}
          onChange={v => { generation.current++; setDestination(v); setPlanned(null); setPlanError(null); }}
          data={[...(fleet?.places || []).map(p => ({ value: String(p.id), label: p.name })), { value: 'address', label: 'Otra dirección' }]} />
          {destination === 'address' ? <TextInput label="Dirección y ciudad" placeholder="Ej. Calle 10 #25-30, Cali" value={address} maxLength={240}
            onChange={e => { generation.current++; setAddress(e.currentTarget.value); setPlanned(null); }} /> : null}
          <Button color="violet" loading={planning} leftSection={<IconRefresh size={16} />} onClick={() => void plan()}
            disabled={!device?.position || age.seconds > 300 || !destination || (destination === 'address' && address.trim().length < 5) || !config?.routesAvailable || fleetError}>
            {planned ? 'Recalcular ruta' : 'Calcular ruta'}</Button></Group>
        {!config?.routesAvailable ? <Text size="sm" c="dimmed">Las rutas con tráfico aún no están habilitadas.</Text> : device && age.seconds > 300 ? <Alert color="orange">{device.name} necesita un reporte GPS de los últimos 5 minutos para calcular una ruta desde su posición.</Alert> : null}
        {planError ? <Alert color="orange" role="alert">{planError}</Alert> : null}
        {planned ? <Stack gap={5} aria-live="polite"><Group gap="lg"><Text fw={750} size="lg">{Math.ceil(planned.durationSeconds / 60)} min</Text><Text>{(planned.distanceMeters / 1000).toFixed(1)} km</Text><Badge color="violet">Llegada estimada {localTime(planned.arrivalAt)}</Badge></Group>
          <Text size="sm">{planned.deviceName} → {planned.destination.label}</Text>
          <Text size="xs" c="dimmed">Calculada a las {localTime(planned.calculatedAt)} · {planned.usage.used}/{planned.usage.limit} cálculos de hoy para toda la flota. Pulsa recalcular para actualizar el tráfico.</Text>
          <Text size="xs" c="dimmed">Ruta orientativa por carretera; comprueba restricciones de altura, peso y acceso del camión.</Text>
        </Stack> : <Text size="xs" c="dimmed">{config ? `Hasta ${config.routeDailyLimit} cálculos al día para toda la flota. Se calcula al solicitarlo.` : 'El tiempo estimado parte del último GPS válido del camión.'}</Text>}
      </Stack>
    </Paper>
    <Accordion variant="separated" radius="md"><Accordion.Item value="places"><Accordion.Control>Puntos conocidos y sedes</Accordion.Control><Accordion.Panel>
      <KnownPlaces onSaved={() => setRefresh(n => n + 1)} />
    </Accordion.Panel></Accordion.Item></Accordion>
    <Button variant="subtle" style={{ alignSelf: 'flex-start' }} onClick={() => setShowNative(v => !v)}>{showNative ? 'Cerrar panel avanzado' : 'Abrir panel avanzado Traccar'}</Button>
    {showNative ? <NativeTrackingPanel /> : null}
    <Group gap="md"><Text size="xs" component={Link} href="/map-terms" c="dimmed">Condiciones del mapa</Text><Text size="xs" component={Link} href="/privacy" c="dimmed">Privacidad</Text></Group>
  </Stack>;
}
