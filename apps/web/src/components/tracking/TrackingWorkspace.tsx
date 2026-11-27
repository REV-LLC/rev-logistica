'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Badge, Button, Group, Loader, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { IconBattery, IconFocus2, IconMap2, IconTruck } from '@tabler/icons-react';
import { api, ApiError } from '@/lib/api';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import JourneyHistoryPanel from './JourneyHistoryPanel';
import { subscribeTracking } from './tracking-stream';
import { assetColor } from './tracking-colors';
import { refreshPolicy } from './tracking-refresh';
import { gpsAge, localTime } from './tracking-types';
import type { FleetState, MatchingUsage, MapMatch, RouteHistory, TrackingMapConfig } from './tracking-types';
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

export default function TrackingWorkspace({ readOnly = false, pilotDeviceId, localViews = true }: { readOnly?: boolean; pilotDeviceId?: number; localViews?: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const queryId = Number(search.get('truck'));
  const selectedId = Number.isSafeInteger(queryId) && queryId > 0 ? queryId : pilotDeviceId ?? null;
  const view = localViews && search.get('view') !== 'journeys' ? 'live' : 'journeys';
  const liveView = view === 'live';
  const [fleet, setFleet] = useState<FleetState | null>(null);
  const smoothMovement = true;
  const [smoothRoute, setSmoothRoute] = useState(true);
  const [mapMatch, setMapMatch] = useState<MapMatch | null>(null);
  const [matchingUsage, setMatchingUsage] = useState<MatchingUsage | null>(null);
  const [autoMatching, setAutoMatching] = useState(true);
  const lastAutoAttempt = useRef(new Map<string, { fix: string | null; at: number }>());
  const [matching, setMatching] = useState(false);
  const [matchingError, setMatchingError] = useState<string | null>(null);
  const matchingController = useRef<AbortController | null>(null);
  const [fleetError, setFleetError] = useState(false);
  const [denied, setDenied] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [config, setConfig] = useState<TrackingMapConfig | null>(null);
  const configRef = useRef(config); configRef.current = config;
  const [configError, setConfigError] = useState<string | null>(null);
  const [history, setHistory] = useState<RouteHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [range, setRange] = useState<string | null>('today');
  const [follow, setFollow] = useState(Boolean(pilotDeviceId) && !localViews);
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

  useEffect(() => {
    if (localViews) { setFollow(false); setFit(n => n + 1); }
  }, [localViews, liveView]);

  const select = (id: number) => {
    const params = new URLSearchParams(search.toString()); params.set('truck', String(id));
    router.replace(`?${params}`, { scroll: false }); setFollow(true);
  };

  useEffect(() => {
    let active = true, pending = false, queued = false, lastFetch = 0;
    const controller = new AbortController();
    const update = async (force = false) => {
      if (!active || document.visibilityState === 'hidden') return;
      const rules = configRef.current?.trackingPolicy;
      const continuous = !rules || rules.vehicleIds.some(id => refreshPolicy(rules, id).intervalSeconds === 0);
      if (!force && Date.now() - lastFetch < (continuous ? 15000 : (rules?.slowSeconds || 30) * 1000)) return;
      if (pending) { queued = true; return; }
      pending = true; lastFetch = Date.now();
      try {
        const value = await api<FleetState>('/tracking/fleet', { signal: controller.signal, cache: 'no-store' });
        if (active) { setFleet(pilotDeviceId && !localViews ? { ...value, devices: value.devices.filter(d => d.id === pilotDeviceId) } : value); setFleetError(false); }
      } catch (e) {
        if (active) {
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { setDenied(true); setFleet(null); setHistory(null); }
          else setFleetError(true);
        }
      } finally { pending = false; if (queued && active) { queued = false; void update(true); } }
    };
    const unsubscribe = subscribeTracking(readOnly, data => {
      if (data.denied) { setDenied(true); setFleet(null); setHistory(null); return; }
      if (Array.isArray(data.deviceIds)) {
        void update(true);
        window.dispatchEvent(new CustomEvent('rev-tracking-telemetry', { detail: { deviceIds: data.deviceIds } }));
      }
    });
    const visible = () => void update();
    void update(true); const timer = setInterval(() => void update(), 1000);
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; unsubscribe(); controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [refresh, pilotDeviceId, localViews, readOnly]);

  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);

  useEffect(() => {
    const controller = new AbortController(); let active = true;
    void api<TrackingMapConfig>('/tracking/map-config', { cache: 'no-store', signal: controller.signal })
      .then(value => { if (active) setConfig(value); })
      .catch(e => { if (active) setConfigError(message(e)); });
    return () => { active = false; controller.abort(); };
  }, []);

  useEffect(() => {
    setHistory(null); setHistoryError(null); setSelectedJourneyId(null); setMapMatch(null); setMatchingError(null);
    matchingController.current?.abort(); matchingController.current = null; setMatching(false);
    if (liveView || !selectedId || !range || denied || (range === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(historyDate))) return;
    let active = true, pending = false, queued = false, initialized = false, lastFetch = 0;
    const controller = new AbortController();
    const update = async (force = false) => {
      if (!active || document.visibilityState === 'hidden') return;
      const interval = refreshPolicy(configRef.current?.trackingPolicy, selectedId).intervalSeconds;
      if (initialized && !force && Date.now() - lastFetch < (interval ? interval * 1000 : 10000)) return;
      if (pending) { queued = true; return; }
      pending = true; lastFetch = Date.now();
      const now = Date.now();
      const start = periodStart(range, now, historyDate);
      const end = range === 'date' ? Math.min(start + 86400_000 - 1, now) : now;
      const params = new URLSearchParams({ deviceId: String(selectedId), from: new Date(start).toISOString(), to: new Date(end).toISOString() });
      try {
        const value = await api<RouteHistory>(`/tracking/history?${params}`, { signal: controller.signal, cache: 'no-store' });
        if (active) {
          setHistory(value); setHistoryError(null);
          if (!initialized) {
            initialized = true;
            if (localViews && value.journeys?.length) setSelectedJourneyId(value.journeys[value.journeys.length - 1].id);
          }
        }
      } catch (e) { if (active) setHistoryError(message(e)); }
      finally { pending = false; if (queued && active) { queued = false; void update(); } }
    };
    const visible = () => void update();
    const telemetry = (event: Event) => {
      const ids = (event as CustomEvent<{ deviceIds: number[] }>).detail?.deviceIds;
      if (!ids?.includes(selectedId)) return;
      void update(refreshPolicy(configRef.current?.trackingPolicy, selectedId).intervalSeconds === 0);
    };
    void update(true); const timer = setInterval(() => void update(), 1000);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('rev-tracking-telemetry', telemetry);
    return () => { active = false; controller.abort(); matchingController.current?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('rev-tracking-telemetry', telemetry); };
  }, [selectedId, range, historyDate, denied, pilotDeviceId, liveView, localViews]);

  const matchRoute = async () => {
    if (!history || !selectedJourneyId || matchingController.current || !config?.mapMatchingAvailable) return;
    const controller = new AbortController(); matchingController.current = controller;
    setMatching(true); setMatchingError(null);
    try {
      const params = new URLSearchParams({ deviceId: String(history.deviceId), from: history.from, to: history.to, journeyId: selectedJourneyId });
      const result = await api<MapMatch>(`/tracking/map-matching?${params}`, { signal: controller.signal, cache: 'no-store' });
      if (!controller.signal.aborted) { setMapMatch(result); if (result.usage) setMatchingUsage(result.usage); }
    } catch (error) { if (!controller.signal.aborted) setMatchingError(message(error)); }
    finally { if (matchingController.current === controller) { matchingController.current = null; setMatching(false); } }
  };

  useEffect(() => {
    matchingController.current?.abort(); matchingController.current = null;
    setMatching(false); setMapMatch(null); setMatchingError(null);
    if (autoMatching) lastAutoAttempt.current.clear();
  }, [selectedJourneyId, autoMatching]);

  useEffect(() => {
    if (!localViews || liveView || !autoMatching || !config?.mapMatchingAvailable || !history || !selectedJourneyId
      || history.deviceId !== selectedId || matchingController.current || document.visibilityState === 'hidden') return;
    const cadence = refreshPolicy(config?.trackingPolicy, selectedId);
    if (!cadence.roadMatching) return;
    const journey = history.journeys?.find(j => j.id === selectedJourneyId);
    if (!journey) return;
    const key = `${history.deviceId}:${journey.id}`;
    const last = lastAutoAttempt.current.get(key);
    if (last?.fix === journey.lastReportedAt && !mapMatch?.pending) return;
    if (last && !mapMatch?.pending && Date.now() - last.at < cadence.intervalSeconds * 1000) return;
    lastAutoAttempt.current.set(key, { fix: journey.lastReportedAt, at: Date.now() });
    if (lastAutoAttempt.current.size > 100) lastAutoAttempt.current.delete(lastAutoAttempt.current.keys().next().value!);
    void matchRoute();
    // Match each new GPS fix; completing a request also picks up fixes received while it was running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, selectedId, selectedJourneyId, autoMatching, localViews, liveView, config?.mapMatchingAvailable, config?.trackingPolicy, matching, mapMatch?.pending, clock]);

  useEffect(() => {
    if (!localViews || liveView || !config?.mapMatchingAvailable) return;
    const controller = new AbortController(); let active = true;
    const update = () => { void api<NonNullable<typeof matchingUsage>>('/tracking/matching-usage', {signal: controller.signal, cache: 'no-store'})
      .then(value => { if (active) setMatchingUsage(value); }).catch(() => {}); };
    update(); const timer = setInterval(update, 30000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [localViews, liveView, config?.mapMatchingAvailable]);

  const mapFleet = useMemo(() => !fleet || !localViews ? fleet : liveView
    ? fleet
    : { ...fleet, devices: fleet.devices.filter(d => d.id === selectedId) }, [fleet, liveView, localViews, selectedId]);

  const selectedCadence = refreshPolicy(config?.trackingPolicy, selectedId, clock);
  const device = fleet?.devices.find(d => d.id === selectedId);
  const invalidSelection = selectedId !== null && fleet !== null && !device;

  if (denied) return <Alert color="red" title="Acceso no disponible">Tu sesión o tus permisos de seguimiento cambiaron. Inicia sesión nuevamente.</Alert>;

  return <Stack gap="md">
    <PageHeaderCard title={localViews ? (liveView ? 'Ubicaciones en vivo' : 'Recorridos') : pilotDeviceId ? 'Prueba de seguimiento · ZNN938' : 'Flota y recorridos'} description={localViews ? (liveView ? 'Clientes y últimas ubicaciones GPS de nuestros activos.' : 'Historial de movimiento y paradas de los últimos 30 días.') : pilotDeviceId ? 'SinoTrack · GPS real · Recorrido del día · Prueba local' : 'Ubicación actual e historial GPS de los camiones.'}
      icon={<IconTruck size={22} />} iconColor="teal" accentColor="rgba(18,184,134,.10)"
      aside={<Badge color={fleetError ? 'orange' : fleet ? 'teal' : 'gray'} variant="light">{fleetError ? 'Reconectando' : fleet ? 'Actualización automática' : 'Conectando'}</Badge>} />
    {localViews ? <SegmentedControl aria-label="Vista del mapa" value={view} data={[{ value: 'live', label: 'Ubicaciones en vivo' }, { value: 'journeys', label: 'Vehículo y recorridos' }]}
      onChange={value => {
        const params = new URLSearchParams(search.toString());
        if (value === 'live') params.delete('view'); else params.set('view', value);
        setFollow(false); setFit(n => n + 1);
        router.replace(`?${params}`, { scroll: false });
      }} style={{ alignSelf: 'flex-start' }} /> : null}
    {fleetError ? <Alert color="orange" title="No se pudo actualizar la flota">
      Se conserva el último reporte. Comprueba la hora del GPS antes de coordinar un despacho.
      <Button size="xs" variant="light" ml="sm" onClick={() => setRefresh(n => n + 1)}>Reintentar</Button>
    </Alert> : null}
    {invalidSelection ? <Alert color="orange">El camión seleccionado ya no está disponible. Selecciona otro.</Alert> : null}
    <Group justify="space-between">
      <Group gap="sm">
        <Button variant={follow ? 'filled' : 'default'} color="teal" leftSection={<IconFocus2 size={16} />} disabled={!device?.position}
          onClick={() => setFollow(v => !v)}>{follow ? `Siguiendo ${device?.name || ''}` : 'Seguir camión'}</Button>
        <Button variant="default" onClick={() => { setFollow(false); setFit(n => n + 1); }}>{localViews ? (liveView ? 'Ver todos los activos y clientes' : 'Centrar vehículo y puntos') : pilotDeviceId ? 'Centrar camión y sedes' : 'Ver toda la flota'}</Button>
      </Group>
      <Text size="xs" c="dimmed">{fleet ? `Consulta ${localTime(fleet.fetchedAt)}${config?.trackingPolicy ? ' · frecuencia según jornada REV' : ' · recepción automática'}` : 'Consultando flota…'}</Text>
    </Group>
    {fleet?.placeSync?.total ? <Text size="xs" c="dimmed" aria-label="Ubicaciones de clientes y obras">
      Clientes y obras: {fleet.placeSync.located} de {fleet.placeSync.total} direcciones ubicadas.
      {fleet.placeSync.pending > 0 ? ` ${fleet.placeSync.pending} pendientes de ubicación.` : ''}
      {fleet.placeSync.needsReview + fleet.placeSync.errors > 0 ? ` ${fleet.placeSync.needsReview + fleet.placeSync.errors} necesitan revisar su dirección o ubicación.` : ''}
    </Text> : null}
    <div className={classes.layout}>
      <div className={classes.list} aria-label="Camiones de la flota">
        {!fleet && !fleetError ? <Loader aria-label="Cargando flota" /> : null}
        {fleet?.devices.length === 0 ? <Text>No hay camiones registrados.</Text> : null}
        {fleet?.devices.map(d => {
          const report = gpsAge(d.position, clock);
          // A current device message may carry battery even when its GPS fix is invalid.
          // Never replace a missing current battery with an old archived reading.
          const battery = d.latestReport ? d.latestReport.batteryPercent : d.position?.batteryPercent;
          return <button key={d.id} className={`${classes.vehicle} ${d.id === selectedId ? classes.selected : ''}`} style={{ borderLeft: `4px solid ${assetColor(d.id)}` }} aria-pressed={d.id === selectedId} onClick={() => select(d.id)}>
            <Group justify="space-between" gap="xs"><Text fw={750} size="lg">{d.name}</Text><IconTruck size={23} color={assetColor(d.id)} /></Group>
            <Badge color={report.color} variant="light" mt="xs">{report.text}</Badge>
            <Group justify="space-between" gap="xs" mt="sm"><Text size="sm">{d.position?.speedKph !== null && d.position?.speedKph !== undefined ? `${d.position.historical || report.seconds > 90 ? 'Última velocidad: ' : ''}${d.position.speedKph} km/h` : 'Velocidad —'}</Text>
              <Text size="sm" title="Batería del dispositivo en el último reporte"><IconBattery size={14} style={{ verticalAlign: 'middle' }} /> {battery != null ? `${Math.round(battery)}%` : 'Sin dato de batería'}</Text></Group>
            <Text size="xs" c="dimmed" mt={5}>Conexión: {d.connection === 'online' ? 'en línea' : d.connection === 'offline' ? 'fuera de línea' : 'sin confirmar'}</Text>
            {d.knownPlaces.length ? <Text size="xs" mt={5}>{report.seconds > 300 ? 'Último punto: ' : ''}{d.knownPlaces.map(p => p.name).join(' · ')}</Text> : null}
          </button>;
        })}
      </div>
      <Stack gap="xs" style={{ minWidth: 0 }}>
        {config?.mapboxToken ? <FleetMap mapboxToken={config.mapboxToken} fleet={mapFleet} selectedId={selectedId} history={liveView ? null : mapHistory} journeys={liveView ? undefined : visibleJourneys}
          smoothMovement={smoothMovement} smoothRoute={smoothRoute} unconfirmedRoute={autoMatching && selectedCadence.roadMatching && Boolean(config?.mapMatchingAvailable) && !mapMatch?.segments.length} mapMatch={liveView ? null : mapMatch} follow={follow} fitVersion={fit} historyFitVersion={historyFit} onSelect={select} onStopFollowing={() => setFollow(false)} /> :
          <Paper withBorder p="xl" radius="md"><Stack align="flex-start"><IconMap2 size={34} /><Title order={3}>Seguimiento Traccar disponible</Title>
            <Text size="sm">{configError || (config ? 'La vista de mapa está pendiente de activación.' : 'Preparando mapa…')}</Text>
            {!readOnly ? <Button variant="light" color="teal" onClick={() => setShowNative(true)}>Abrir mapa Traccar</Button> : null}</Stack></Paper>}
        {!liveView ? <div className={classes.legend}><span><i className={classes.key} style={{ borderColor: selectedId ? assetColor(selectedId) : undefined }} /> {mapMatch?.segments.length ? 'Recorrido ajustado a calles · estimado' : autoMatching && selectedCadence.roadMatching && config?.mapMatchingAvailable ? 'GPS sin ajuste · conexión no confirmada' : smoothRoute ? 'GPS simplificado' : 'GPS original'}</span><span>🟢 I · Inicio</span><span>🔴 F · Fin confirmado</span></div> : null}
        {device?.position ? <Text size="xs" c="dimmed">GPS de {device.name}: {new Date(device.position.reportedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
          {device.position.accuracyMeters !== null ? ` · precisión ±${Math.round(device.position.accuracyMeters)} m` : ''}</Text> : null}
      </Stack>
    </div>
    {!liveView ? <JourneyHistoryPanel deviceId={selectedId} deviceName={device?.name} history={history} historyError={historyError}
      range={range} onRangeChange={setRange} date={historyDate} dateOptions={dateOptions} onDateChange={setHistoryDate}
      selectedJourneyId={selectedJourneyId} onSelectJourney={id=>{setSelectedJourneyId(id);setFollow(false);setHistoryFit(n=>n+1);}}
      onFit={()=>{setFollow(false);setHistoryFit(n=>n+1);}} canFit={Boolean(mapHistory?.pointCount && config?.mapboxToken)}
      showTraceControls={true} roadMatching={selectedCadence.roadMatching} matchingAvailable={Boolean(config?.mapMatchingAvailable)}
      autoMatching={autoMatching} onTraceChange={value=>{setAutoMatching(value==='roads');if(value==='gps'){setMapMatch(null);setSmoothRoute(false);}}}
      matching={matching} match={mapMatch} usage={matchingUsage} matchingError={matchingError} cadenceSeconds={selectedCadence.intervalSeconds}
      smoothRoute={smoothRoute} onToggleSmooth={()=>setSmoothRoute(value=>!value)} /> : null}
    {!readOnly ? <Button variant="subtle" style={{ alignSelf: 'flex-start' }} onClick={() => setShowNative(v => !v)}>{showNative ? 'Cerrar panel avanzado' : 'Abrir panel avanzado Traccar'}</Button> : null}
    {!readOnly && showNative ? <NativeTrackingPanel /> : null}
    <Group gap="md"><Text size="xs" component={Link} href="/map-terms" c="dimmed">Condiciones del mapa</Text><Text size="xs" component={Link} href="/privacy" c="dimmed">Privacidad</Text></Group>
  </Stack>;
}
