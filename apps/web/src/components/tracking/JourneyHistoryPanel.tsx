'use client';
import type { CSSProperties } from 'react';
import { Accordion, Alert, Badge, Button, Group, Loader, Paper, SegmentedControl, Select, Stack, Switch, Text, Title } from '@mantine/core';
import { IconChevronRight, IconClock, IconFocus2, IconRoute } from '@tabler/icons-react';
import { assetColor } from './tracking-colors';
import { localTime } from './tracking-types';
import type { MapMatch, MatchingUsage, RouteHistory } from './tracking-types';
import classes from './TrackingWorkspace.module.css';

type Props = {
 deviceId: number | null; deviceName?: string; history: RouteHistory | null; historyError: string | null;
 range: string | null; onRangeChange: (value: string | null) => void;
 date: string; dateOptions: { value: string; label: string }[]; onDateChange: (value: string) => void;
 selectedJourneyId: string | null; onSelectJourney: (id: string | null) => void; onFit: () => void; canFit: boolean;
 showTraceControls: boolean; roadMatching: boolean; matchingAvailable: boolean; autoMatching: boolean;
 onTraceChange: (value: string) => void; matching: boolean; match: MapMatch | null; usage: MatchingUsage | null;
 matchingError: string | null; cadenceSeconds: number; smoothRoute: boolean; onToggleSmooth: () => void;
};
const dateTime = (value: string) => new Date(value).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const km = (meters: number) => (meters / 1000).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export default function JourneyHistoryPanel(p: Props) {
 const journeys = p.history?.journeys;
 const selected = journeys?.find(j => j.id === p.selectedJourneyId);
 const distance = selected?.distanceMeters ?? p.history?.distanceMeters;
 const journeyTime = p.range === 'today' ? localTime : dateTime;
 const color = p.deviceId ? assetColor(p.deviceId) : '#0f766e';
 return <Paper withBorder radius="md" className={classes.routePanel} component="section" aria-label="Historial de recorridos">
  <div className={classes.routeHeader}>
   <Group gap="sm" wrap="nowrap"><span className={classes.routeIcon} style={{color}}><IconRoute size={23} /></span><div>
    <Title order={3} size="h4">{p.deviceName ? `Recorridos de ${p.deviceName}` : 'Historial de recorridos'}</Title>
    <Text size="xs" c="dimmed">Consulta y selecciona un recorrido para verlo en el mapa.</Text>
   </div></Group>
   <div className={classes.routeFilters}>
    <Select label="Período" aria-label="Período del recorrido" value={p.range} onChange={p.onRangeChange} allowDeselect={false} data={[{value:'today',label:'Hoy'},{value:'1',label:'Última hora'},{value:'3',label:'Últimas 3 horas'},{value:'date',label:'Elegir fecha'}]} />
    {p.range === 'date' ? <Select className={classes.routeDate} label="Fecha" aria-label="Fecha del recorrido" value={p.date} data={p.dateOptions} searchable allowDeselect={false} onChange={value=>{if(value)p.onDateChange(value);}} /> : null}
    <Select className={classes.routeSelector} label="Recorrido" aria-label="Seleccionar recorrido" value={selected?.id || 'all'} allowDeselect={false} disabled={!journeys?.length}
     onChange={value=>{if(value)p.onSelectJourney(value==='all'?null:value);}}
     data={[{value:'all',label:'Todos los recorridos'},...(journeys||[]).map((journey,index)=>({value:journey.id,label:`Recorrido ${index+1} · ${localTime(journey.startedAt)}${journey.status==='active'?' · En curso':''}`}))]} />
    <Button variant="light" color="teal" leftSection={<IconFocus2 size={16}/>} disabled={!p.canFit} onClick={p.onFit}>Centrar recorrido</Button>
   </div>
  </div>
  <div className={classes.routeToolbar}>
   <div className={classes.routeMetrics}>
    <div><Text size="xs" c="dimmed">{selected ? 'Distancia del recorrido' : 'Distancia del período'}</Text><Text fw={700} size="xl">{distance == null ? '—' : km(distance)} <Text component="span" size="sm" c="dimmed">km GPS</Text></Text></div>
    <div><Text size="xs" c="dimmed">Recorridos</Text><Text fw={700} size="xl">{journeys?.length ?? '—'}</Text></div>
   </div>
   {p.showTraceControls ? <div className={classes.traceControl}>
    <Text size="xs" c="dimmed" mb={5}>Mostrar trazado</Text>
    {p.roadMatching ? <SegmentedControl aria-label="Trazado del recorrido" value={p.autoMatching?'roads':'gps'} onChange={p.onTraceChange}
     data={[{value:'roads',label:'Ajustado a calles',disabled:!p.matchingAvailable},{value:'gps',label:'GPS original'}]} size="sm" /> : <Text size="sm" fw={600}>GPS original</Text>}
    {!p.selectedJourneyId && p.autoMatching && p.roadMatching && Boolean(journeys?.length) ? <Text size="xs" c="dimmed" mt={5}>Selecciona un recorrido para ajustarlo a calles.</Text> : null}
    {p.matching ? <Group gap={5} mt={5}><Loader size={10}/><Text size="xs" c="dimmed" role="status">Actualizando trazado…</Text></Group> : null}
   </div> : null}
  </div>
  {p.matchingError || p.historyError || p.history?.archive?.error ? <Stack gap="xs" px="lg" pt="md">
   {p.matchingError ? <Alert color="orange">{p.matchingError}</Alert>:null}
   {p.historyError ? <Alert color="orange">{p.historyError}</Alert>:null}
   {p.history?.archive?.error ? <Alert color="orange">{p.history.archive.error}</Alert>:null}
  </Stack> : null}
  <div className={classes.journeySection}>
   <Group justify="space-between" mb="xs" gap="xs"><Text fw={650} size="sm">Recorridos del período</Text>
    {journeys && journeys.length > 0 ? <Button variant="subtle" size="xs" color="teal" disabled={!p.selectedJourneyId} onClick={()=>p.onSelectJourney(null)}>Ver todos</Button>:null}
   </Group>
   {!p.history && !p.historyError ? <Group className={classes.journeyEmpty} gap="sm"><Loader size="sm"/><Text size="sm" c="dimmed">Cargando recorridos…</Text></Group> : null}
   {journeys?.length ? <div className={classes.journeyList} aria-label="Recorridos disponibles">
    {journeys.map((journey,index)=>{
     const active=journey.id===p.selectedJourneyId;
     const status=journey.status==='closed'?'Finalizado':journey.status==='active'?'En curso':journey.status==='gap'?'Corte GPS':'Sin señal reciente';
     return <button key={journey.id} className={`${classes.journeyRow} ${active?classes.journeySelected:''}`}
      style={{'--journey-color':color} as CSSProperties} aria-pressed={active} aria-label={`Ver recorrido ${index+1}`} onClick={()=>p.onSelectJourney(journey.id)}>
      <span className={classes.journeyDot} aria-hidden="true"/>
      <span className={classes.journeyIdentity}><span className={classes.journeyName}>Recorrido {index+1}</span><Badge size="sm" variant="light" color={journey.status==='closed'?'gray':journey.status==='active'?'teal':'orange'}>{status}</Badge></span>
      <span className={classes.journeyTimes}><span><small>Inicio</small><span>{journeyTime(journey.startedAt)}</span></span><span aria-hidden="true" className={classes.timeArrow}>→</span><span><small>{journey.endReason==='pause'?'Fin':journey.endReason==='gap'?'Último GPS':'Hasta'}</small><span>{journey.endReason==='pause'?journeyTime(journey.endedAt!):journey.endReason==='gap'?journeyTime(journey.lastReportedAt):journey.status==='active'?'Ahora':journeyTime(journey.lastReportedAt)}</span></span></span>
      <span className={classes.journeyDistance}>{km(journey.distanceMeters)}<small>km GPS</small></span>
      <IconChevronRight size={17} className={classes.journeyChevron} aria-hidden="true"/>
     </button>;
    })}
   </div> : p.history ? <div className={classes.journeyEmpty}><IconRoute size={27}/><Text size="sm" fw={600}>{p.history.pointCount ? 'Sin desplazamientos en este período' : 'Sin ubicaciones en este período'}</Text><Text size="xs" c="dimmed">{p.history.pointCount ? 'Los reportes recibidos no forman un recorrido con movimiento suficiente.' : 'Prueba con otra fecha o un período más amplio.'}</Text></div> : null}
   <Group gap={6} mt="sm" wrap="nowrap"><IconClock size={14} aria-hidden="true"/><Text size="xs" c="dimmed">Una parada de 15 minutos separa los recorridos. Historial disponible durante 30 días.</Text></Group>
  </div>
  <Accordion className={classes.routeDetails} chevronSize={14}>
   <Accordion.Item value="details"><Accordion.Control>Detalles de seguimiento</Accordion.Control><Accordion.Panel>
    <Stack gap="sm">
     <Text size="xs" c="dimmed">{p.roadMatching ? p.cadenceSeconds===0?'Seguimiento continuo durante la jornada REV.':'Actualización cada 30 segundos fuera de la jornada REV.' : 'Ubicación cada 30 segundos; la maquinaria conserva el recorrido GPS original.'} Hora de Colombia.</Text>
     {p.showTraceControls && !p.matchingAvailable && p.roadMatching ? <Text size="xs" c="orange">El ajuste a calles no está disponible. Se muestra el GPS recibido.</Text>:null}
     {p.match ? <Text size="xs" c="dimmed">{p.match.message}{p.match.through?` Ajustado hasta ${localTime(p.match.through)}.`:''} {p.match.matchedPointCount} puntos utilizados.</Text>:null}
     {p.usage ? <Text size="xs" c="dimmed">{p.usage.requestsToday} ajustes locales hoy · {p.usage.averageDurationMs} ms de respuesta promedio · {p.usage.httpErrorsToday} errores HTTP. Mapbox solo muestra el mapa.</Text>:null}
     {p.history ? <Text size="xs" c="dimmed">{p.history.pointCount} reportes GPS en el período{p.history.gapCount?` · ${p.history.gapCount} tramos sin continuidad GPS`:''}. Las distancias se calculan entre los puntos recibidos.</Text>:null}
     {p.history?.archive ? <Text size="xs" c="dimmed">Archivo de {p.history.archive.retentionDays} días.{p.history.archive.earliestReportedAt?` Datos desde ${dateTime(p.history.archive.earliestReportedAt)}.`:''}{p.history.archive.syncing?' Sincronizando historial…':''} Los datos se conservan al reiniciar.</Text>:null}
     {!p.autoMatching ? <Switch label="Suavizar pequeñas variaciones del GPS" description="Tolerancia de 8 m. Solo cambia el dibujo, no los datos guardados." checked={p.smoothRoute} onChange={p.onToggleSmooth} size="sm"/>:null}
    </Stack>
   </Accordion.Panel></Accordion.Item>
  </Accordion>
 </Paper>;
}
