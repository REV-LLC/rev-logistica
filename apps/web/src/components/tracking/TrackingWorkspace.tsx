'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Accordion, Alert, Badge, Button, Group, Loader, Paper, Select, Stack, Text, Title } from '@mantine/core';
import { IconBattery, IconFocus2, IconMap2, IconTruck } from '@tabler/icons-react';
import { api, ApiError } from '@/lib/api';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import KnownPlaces from './KnownPlaces';
import { subscribeTracking } from './tracking-stream';
import { gpsAge, localTime } from './tracking-types';
import type { FleetState, RoadMatch, RouteHistory, TrackingMapConfig } from './tracking-types';
import classes from './TrackingWorkspace.module.css';

const FleetMap = dynamic(() => import('./FleetMap'), { ssr: false, loading: () => <Paper withBorder p="xl"><Loader /><Text>Cargando mapa…</Text></Paper> });
const NativeTrackingPanel = dynamic(() => import('./NativeTrackingPanel'), { ssr: false, loading: () => <Loader /> });
const message = (e: unknown) => e instanceof ApiError ? e.message : 'No fue posible completar la consulta.';

function periodStart(range: string, now: number, date: string) {
  if (range === 'date') return Date.parse(`${date}T00:00:00-05:00`);
  if (range === 'today') {
    const date = new Date(now - 5 * 3600_000).toISOString().slice(0, 10);
    return new Date(`${date}T00:00:00-05:00`).getTime();
  }
  return now - Number(range) * 3600_000;
}

export default function TrackingWorkspace({ readOnly = false, pilotDeviceId }: { readOnly?: boolean; pilotDeviceId?: number }) {
  const router = useRouter();
  const search = useSearchParams();
  const queryId = Number(search.get('truck'));
  const [fleet, setFleet] = useState<FleetState | null>(null);
  const selectedId = pilotDeviceId ?? (Number.isSafeInteger(queryId) && queryId > 0 ? queryId : fleet?.devices.find(d=>d.id===3)?.id ?? null);
  const [liveState, setLiveState] = useState<'connecting' | 'live' | 'fallback'>('connecting');
  const [smoothMovement, setSmoothMovement] = useState(true);
  const [roadMatch, setRoadMatch] = useState<RoadMatch | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchingError, setMatchingError] = useState<string | null>(null);
  const roadController = useRef<AbortController | null>(null);
  const [fleetError, setFleetError] = useState(false);
  const [denied, setDenied] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [config, setConfig] = useState<TrackingMapConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [history, setHistory] = useState<RouteHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [range, setRange] = useState<string | null>('today');
  const [follow, setFollow] = useState(true);
  const [fit, setFit] = useState(0);
  const [historyFit, setHistoryFit] = useState(0);
  const [showNative, setShowNative] = useState(false);
  const [historyDate, setHistoryDate] = useState(() => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10));
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const colombiaDay = new Date(clock - 5 * 3600_000).toISOString().slice(0, 10);
  const dateOptions = useMemo(() => Array.from({ length: 31 }, (_, offset) => {
    const date = new Date(Date.parse(`${colombiaDay}T12:00:00-05:00`) - offset * 86400_000);
    return { value: new Date(date.getTime() - 5 * 3600_000).toISOString().slice(0, 10),
      label: date.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'long', year: 'numeric' }) };
  }), [colombiaDay]);
  const dayLabel = (value: string) => new Date(value).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const visibleJourneys = useMemo(() => {
    const journeys = history?.journeys;
    if (!journeys) return undefined;
    const selected = journeys.find(j => j.id === selectedJourneyId);
    return selected ? [selected] : journeys;
  }, [history, selectedJourneyId]);
  const mapHistory = useMemo(() => {
    if (!history || !visibleJourneys) return history;
    const segments = visibleJourneys.flatMap(j => j.segments);
    return { ...history, segments, pointCount: segments.reduce((n, segment) => n + segment.length, 0) };
  }, [history, visibleJourneys]);

  const select = (id: number) => {
    const params = new URLSearchParams(search.toString()); params.set('truck', String(id));
    router.replace(`?${params}`, { scroll: false }); setFollow(true);
  };

  useEffect(() => {
    let active = true, pending = false, queued = false;
    const controller = new AbortController();
    const update = async () => {
      if (!active || document.visibilityState === 'hidden') return;
      if (pending) { queued = true; return; }
      pending = true;
      try {
        const value = await api<FleetState>('/tracking/fleet', { signal: controller.signal, cache: 'no-store' });
        if (active) { setFleet(pilotDeviceId ? { ...value, devices: value.devices.filter(d => d.id === pilotDeviceId) } : value); setFleetError(false); }
      } catch (e) {
        if (active) {
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { setDenied(true); setFleet(null); setHistory(null); setRoadMatch(null); }
          else setFleetError(true);
        }
      } finally { pending = false; if (queued && active) { queued = false; void update(); } }
    };
    const stopStream = subscribeTracking(readOnly, data => {
      if (!active) return;
      if (data.denied) { setDenied(true); setFleet(null); setHistory(null); setRoadMatch(null); return; }
      setLiveState(data.connected ? 'live' : 'fallback');
      if (data.deviceIds?.length && (!pilotDeviceId || data.deviceIds.includes(pilotDeviceId))) {
        void update(); window.dispatchEvent(new Event('rev-tracking-telemetry'));
      }
    });
    void update(); const timer = setInterval(() => void update(), 15_000);
    document.addEventListener('visibilitychange', update);
    return () => { active = false; stopStream(); controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [refresh, pilotDeviceId, readOnly]);

  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);

  useEffect(() => {
    const controller = new AbortController(); let active = true;
    void api<TrackingMapConfig>('/tracking/map-config', { cache: 'no-store', signal: controller.signal })
      .then(value => { if (active) setConfig(value); })
      .catch(e => { if (active) setConfigError(message(e)); });
    return () => { active = false; controller.abort(); };
  }, []);

  useEffect(() => {
    setHistory(null); setHistoryError(null); setSelectedJourneyId(null); setRoadMatch(null); setMatchingError(null);
    roadController.current?.abort(); roadController.current = null; setMatching(false);
    if (!selectedId || !range || denied || (range === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(historyDate))) return;
    let active = true, pending = false, queued = false;
    const controller = new AbortController();
    const update = async () => {
      if (!active || document.visibilityState === 'hidden') return;
      if (pending) { queued = true; return; }
      pending = true;
      const now = Date.now();
      const start = periodStart(range, now, historyDate);
      const end = range === 'date' ? Math.min(start + 86400_000 - 1, now) : now;
      const params = new URLSearchParams({ deviceId: String(selectedId), from: new Date(start).toISOString(), to: new Date(end).toISOString() });
      try {
        const value = await api<RouteHistory>(`/tracking/history?${params}`, { signal: controller.signal, cache: 'no-store' });
        if (active) { setHistory(value); setHistoryError(null); }
      } catch (e) { if (active) setHistoryError(message(e)); }
      finally { pending = false; if (queued && active) { queued = false; void update(); } }
    };
    void update(); const timer = setInterval(() => void update(), 10_000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('rev-tracking-telemetry', update);
    return () => { active = false; controller.abort(); roadController.current?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', update); window.removeEventListener('rev-tracking-telemetry', update); };
  }, [selectedId, range, historyDate, denied, pilotDeviceId]);

  const matchRoads = async () => {
    if (!history || matching || roadController.current || !config?.roadMatchingAvailable) return;
    const controller = new AbortController(); roadController.current = controller;
    setMatching(true); setMatchingError(null);
    try {
      const params = new URLSearchParams({ deviceId: String(history.deviceId), from: history.from, to: history.to });
      const result = await api<RoadMatch>(`/tracking/road-match?${params}`, { signal: controller.signal, cache: 'no-store' });
      if (!controller.signal.aborted) setRoadMatch(result);
    } catch (error) { if (!controller.signal.aborted) setMatchingError(message(error)); }
    finally { if (roadController.current === controller) { roadController.current = null; setMatching(false); } }
  };

  const device = fleet?.devices.find(d => d.id === selectedId);
  const invalidSelection = selectedId !== null && fleet !== null && !device;

  if (denied) return <Alert color="red" title="Acceso no disponible">Tu sesión o tus permisos de seguimiento cambiaron. Inicia sesión nuevamente.</Alert>;

  return <Stack gap="md">
    <PageHeaderCard title={pilotDeviceId ? 'Prueba de seguimiento · ZNN938' : 'Flota y recorridos'} description={pilotDeviceId ? 'SinoTrack · GPS real · Recorrido del día · Prueba local' : 'Ubicación actual e historial GPS de los camiones.'}
      icon={<IconTruck size={22} />} iconColor="teal" accentColor="rgba(18,184,134,.10)"
      aside={<Badge color={fleetError ? 'orange' : fleet ? 'teal' : 'gray'} variant="light">{fleetError ? 'Reconectando' : fleet ? 'Actualización automática' : 'Conectando'}</Badge>} />
    {device ? <Paper withBorder p="md" radius="md"><Stack gap="xs">
      <Group gap="sm"><Badge color={device.connection === 'online' ? 'teal' : 'orange'}>Datos: {device.connection === 'online' ? 'en línea' : 'sin conexión confirmada'}</Badge>
        <Badge color={device.latestReport?.valid ? 'teal' : 'orange'}>{device.latestReport?.valid ? 'Último reporte con GPS válido' : 'Último reporte sin GPS válido'}</Badge>
        <Badge variant="light">ACC: {device.latestReport?.ignition === true ? 'encendido' : device.latestReport?.ignition === false ? 'apagado' : 'sin dato'}</Badge></Group>
      <Text size="sm">Último mensaje recibido: {device.latestReport?.receivedAt ? new Date(device.latestReport.receivedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : 'sin confirmar'}.
        {' '}Última ubicación válida: {device.position ? new Date(device.position.reportedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : 'aún no disponible'}.</Text>
      {!device.latestReport?.valid ? <Alert color="orange" title="Esperando ubicación GPS válida">El mapa conserva únicamente la última ubicación válida disponible. Puede ser histórica; estar en línea no confirma la ubicación actual.</Alert> : null}
      <Text size="xs" c="dimmed">{liveState === 'live' ? 'Recepción en directo desde Traccar' : liveState === 'connecting' ? 'Conectando recepción en directo' : 'Recepción en directo interrumpida'} · Consulta de respaldo cada 15 s · Configuración del equipo: objetivo 10 s · Historial de 30 días · Paradas de 15 min. ACC pendiente de contrastar con la llave del camión.</Text>
    </Stack></Paper> : null}
    <Paper withBorder p="md" radius="md"><Stack gap="xs">
      <Group gap="sm"><Badge color={liveState === 'live' ? 'teal' : 'orange'}>{liveState === 'live' ? 'En directo · Traccar' : 'Respaldo por consultas'}</Badge>
        <Button size="xs" variant={smoothMovement ? 'filled' : 'default'} color="teal" aria-pressed={smoothMovement}
          onClick={() => setSmoothMovement(value => !value)}>{smoothMovement ? 'Movimiento suave activado' : 'Activar movimiento suave'}</Button></Group>
      <Text size="xs" c="dimmed">La animación une posiciones ya recibidas. No predice dónde está el camión y se detiene ante GPS inválido o cortes de señal.</Text>
    </Stack></Paper>
    {fleetError ? <Alert color="orange" title="No se pudo actualizar la flota">
      Se conserva el último reporte. Comprueba la hora del GPS antes de coordinar un despacho.
      <Button size="xs" variant="light" ml="sm" onClick={() => setRefresh(n => n + 1)}>Reintentar</Button>
    </Alert> : null}
    {invalidSelection ? <Alert color="orange">El camión seleccionado ya no está disponible. Selecciona otro.</Alert> : null}
    <Group justify="space-between">
      <Group gap="sm">
        <Button variant={follow ? 'filled' : 'default'} color="teal" leftSection={<IconFocus2 size={16} />} disabled={!device?.position}
          onClick={() => setFollow(v => !v)}>{follow ? `Siguiendo ${device?.name || ''}` : 'Seguir camión'}</Button>
        <Button variant="default" onClick={() => { setFollow(false); setFit(n => n + 1); }}>{pilotDeviceId ? 'Centrar camión y sedes' : 'Ver toda la flota'}</Button>
      </Group>
      <Text size="xs" c="dimmed">{fleet ? `Consulta ${localTime(fleet.fetchedAt)} · recepción automática` : 'Consultando flota…'}</Text>
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
            <Group justify="space-between" gap="xs" mt="sm"><Text size="sm">{d.position?.speedKph !== null && d.position?.speedKph !== undefined ? `${d.position.historical || report.seconds > 90 ? 'Última velocidad: ' : ''}${d.position.speedKph} km/h` : 'Velocidad —'}</Text>
              <Text size="sm"><IconBattery size={14} style={{ verticalAlign: 'middle' }} /> {d.position?.batteryPercent !== null && d.position?.batteryPercent !== undefined ? `${Math.round(d.position.batteryPercent)}%` : '—'}</Text></Group>
            <Text size="xs" c="dimmed" mt={5}>Conexión: {d.connection === 'online' ? 'en línea' : d.connection === 'offline' ? 'fuera de línea' : 'sin confirmar'}</Text>
            {d.knownPlaces.length ? <Text size="xs" mt={5}>{report.seconds > 300 ? 'Último punto: ' : ''}{d.knownPlaces.map(p => p.name).join(' · ')}</Text> : null}
          </button>;
        })}
      </div>
      <Stack gap="xs" style={{ minWidth: 0 }}>
        {config?.browserKey ? <FleetMap browserKey={config.browserKey} fleet={fleet} selectedId={selectedId} history={mapHistory} journeys={visibleJourneys}
          smoothMovement={smoothMovement} roadMatch={roadMatch} follow={follow} fitVersion={fit} historyFitVersion={historyFit} onSelect={select} onStopFollowing={() => setFollow(false)} /> :
          <Paper withBorder p="xl" radius="md"><Stack align="flex-start"><IconMap2 size={34} /><Title order={3}>Seguimiento Traccar disponible</Title>
            <Text size="sm">{configError || (config ? 'La vista de mapa está pendiente de activación.' : 'Preparando mapa…')}</Text>
            {!readOnly ? <Button variant="light" color="teal" onClick={() => setShowNative(true)}>Abrir mapa Traccar</Button> : null}</Stack></Paper>}
        <div className={classes.legend}><span><i className={classes.key} />GPS original</span>{roadMatch?.segments.length ? <span>🔵 Trazado ajustado estimado</span> : null}<span>🟢 I · Inicio</span><span>🔴 F · Fin confirmado</span></div>
        {device?.position ? <Text size="xs" c="dimmed">GPS de {device.name}: {new Date(device.position.reportedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
          {device.position.accuracyMeters !== null ? ` · precisión ±${Math.round(device.position.accuracyMeters)} m` : ''}</Text> : null}
      </Stack>
    </div>
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-end"><div><Title order={4}>{device ? `Recorrido de ${device.name}` : 'Selecciona un camión para ver su recorrido'}</Title>
          {history ? <Text size="sm" c="dimmed">{history.pointCount} reportes · {(history.distanceMeters / 1000).toFixed(1)} km entre puntos registrados{history.gapCount ? ` · ${history.gapCount} tramos sin continuidad GPS` : ''}</Text> : null}</div>
          <Button variant="light" color="teal" disabled={!mapHistory?.pointCount || !config?.browserKey} onClick={() => { setFollow(false); setHistoryFit(n => n + 1); }}>Ver recorrido</Button>
          <Select label="Período del recorrido" value={range} onChange={setRange} allowDeselect={false} data={[{ value: '1', label: 'Última hora' }, { value: '3', label: 'Últimas 3 horas' }, { value: 'today', label: 'Hoy · Colombia' }, { value: 'date', label: 'Elegir día · últimos 30 días' }]} /></Group>
        {range === 'date' ? <Select label="Fecha del recorrido" value={historyDate} data={dateOptions} searchable allowDeselect={false}
          onChange={value => { if (value) setHistoryDate(value); }} style={{ maxWidth: 320 }} /> : null}
        <Stack gap="xs"><Group gap="sm">
          <Button variant="light" color="blue" loading={matching} disabled={!history?.pointCount || !config?.roadMatchingAvailable}
            onClick={() => void matchRoads()}>Ajustar últimos 15 min a calles</Button>
          {roadMatch ? <Button variant="subtle" size="xs" onClick={() => setRoadMatch(null)}>Ver solo GPS original</Button> : null}
        </Group><Text size="xs" c="dimmed">{config?.roadMatchingAvailable ? `Ajuste manual · máximo ${config.roadMatchingDailyLimit} consultas al día compartidas por la flota.` : 'El ajuste a calles no está disponible en este momento.'}</Text>
          {roadMatch ? <Text size="sm" c="blue">{roadMatch.message} · Hasta {localTime(roadMatch.through)} · {roadMatch.matchedPointCount} puntos de entrada.</Text> : null}
          {matchingError ? <Alert color="orange">{matchingError}</Alert> : null}
        </Stack>
        {history?.archive ? <Stack gap={4}>
          <Group gap="xs"><Badge color="teal" variant="light">Historial · {history.archive.retentionDays} días</Badge><Badge variant="light">Paradas de {history.archive.parkingMinutes} min</Badge>
            {history.archive.syncing ? <Text size="xs" c="dimmed">Sincronizando historial con Traccar…</Text> : null}</Group>
          {history.archive.earliestReportedAt ? <Text size="xs" c="dimmed">Datos disponibles desde {dayLabel(history.archive.earliestReportedAt)}. Fuente: Traccar.</Text> : null}
          {history.archive.error ? <Alert color="orange">{history.archive.error}</Alert> : null}
        </Stack> : null}
        {history?.journeys ? <Stack gap="sm">
          <Group justify="space-between"><Text fw={600}>{history.journeys.length} recorridos en este período</Text>
            {selectedJourneyId ? <Button size="xs" variant="light" onClick={() => { setSelectedJourneyId(null); setFollow(false); setHistoryFit(n => n + 1); }}>Ver todos los recorridos</Button> : null}</Group>
          <div className={classes.journeys}>{history.journeys.map((journey, index) => <button key={journey.id}
            className={`${classes.journey} ${selectedJourneyId === journey.id ? classes.selected : ''}`}
            aria-pressed={selectedJourneyId === journey.id} aria-label={`Ver recorrido ${index + 1}`}
            onClick={() => { setSelectedJourneyId(journey.id); setFollow(false); setHistoryFit(n => n + 1); }}>
            <Group justify="space-between" gap="xs"><Text fw={700}>Recorrido {index + 1}</Text><Badge size="sm" color={journey.status === 'closed' ? 'teal' : journey.status === 'active' ? 'blue' : 'orange'}>
              {journey.status === 'closed' ? 'Finalizado' : journey.status === 'active' ? 'En curso' : journey.status === 'gap' ? 'Corte GPS' : 'Sin señal reciente'}</Badge></Group>
            <Text size="sm" mt={6}>Inicio · {dayLabel(journey.startedAt)}</Text>
            <Text size="sm">{journey.endReason === 'pause' ? `Fin · ${dayLabel(journey.endedAt!)}` : journey.endReason === 'gap' ? `Último GPS · ${dayLabel(journey.lastReportedAt)}` : 'Fin aún sin confirmar'}</Text>
            <Text size="xs" c="dimmed" mt={5}>{(journey.distanceMeters / 1000).toFixed(1)} km · {journey.pointCount} reportes
              {journey.endReason === 'pause' ? ' · parada ≥15 min' : ''}{journey.startReason === 'window' ? ' · inicio según datos disponibles' : ''}</Text>
          </button>)}</div>
          {!history.journeys.length && history.pointCount > 0 ? <Text size="sm" c="dimmed">Hay reportes GPS, pero no se detectó desplazamiento suficiente para iniciar un recorrido.</Text> : null}
          <Text size="xs" c="dimmed">Una parada se confirma con reportes durante 15 minutos. Los cortes de señal se indican por separado.</Text>
        </Stack> : null}
        {historyError ? <Alert color="orange">{historyError}</Alert> : history && history.pointCount === 0 ? <Text size="sm">No hay posiciones GPS en este período.</Text> : null}
      </Stack>
    </Paper>
    <Accordion variant="separated" radius="md"><Accordion.Item value="places"><Accordion.Control>Puntos conocidos y sedes</Accordion.Control><Accordion.Panel>
      {readOnly ? <Stack gap="xs">{fleet?.places.map(place => <Text key={place.id}>{place.name} · {place.radiusMeters} m</Text>)}</Stack> : <KnownPlaces onSaved={() => setRefresh(n => n + 1)} />}
    </Accordion.Panel></Accordion.Item></Accordion>
    {!readOnly ? <Button variant="subtle" style={{ alignSelf: 'flex-start' }} onClick={() => setShowNative(v => !v)}>{showNative ? 'Cerrar panel avanzado' : 'Abrir panel avanzado Traccar'}</Button> : null}
    {!readOnly && showNative ? <NativeTrackingPanel /> : null}
    <Group gap="md"><Text size="xs" component={Link} href="/map-terms" c="dimmed">Condiciones del mapa</Text><Text size="xs" component={Link} href="/privacy" c="dimmed">Privacidad</Text></Group>
  </Stack>;
}
