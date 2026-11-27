'use client';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@mantine/core';
import { loadMapbox } from './mapbox-map-loader';
import type { MapInstance, MapboxLibrary, MarkerInstance } from './mapbox-map-loader';
import { canAnimate, interpolatePosition } from './tracking-motion';
import { simplifyGpsPath } from './tracking-path';
import { assetColor } from './tracking-colors';
import { gpsAge, localTime } from './tracking-types';
import type { FleetState, GpsPosition, Journey, MapMatch, RouteHistory } from './tracking-types';
import classes from './FleetMap.module.css';

type Point = { latitude: number; longitude: number };
const PLACE_MIN_ZOOM = 16;
type Pin = { kind: 'truck' | 'place' | 'boundary'; marker: MarkerInstance; element: HTMLDivElement; displayed: Point; frame: number | null };
const lines = (segments: Point[][]) => ({ type: 'FeatureCollection', features: segments.filter(s => s.length > 1).map(segment => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: segment.map(p => [p.longitude, p.latitude]) } })) });
function fit(map: MapInstance, points: Point[]) {
 if (!points.length) return;
 map.fitBounds([[Math.min(...points.map(p => p.longitude)), Math.min(...points.map(p => p.latitude))], [Math.max(...points.map(p => p.longitude)), Math.max(...points.map(p => p.latitude))]], { padding: 80, maxZoom: 17, duration: 500 });
}
export default function FleetMap({ mapboxToken, fleet, selectedId, history, journeys, follow, fitVersion, historyFitVersion, onSelect, onStopFollowing, smoothMovement = false, mapMatch, smoothRoute = true, unconfirmedRoute = false }: {
 mapboxToken: string; fleet: FleetState | null; selectedId: number | null; history: RouteHistory | null; journeys?: Journey[];
 unconfirmedRoute?: boolean; smoothRoute?: boolean; smoothMovement?: boolean; mapMatch?: MapMatch | null;
 follow: boolean; fitVersion: number; historyFitVersion: number; onSelect: (id: number) => void; onStopFollowing: () => void;
}) {
 const host = useRef<HTMLDivElement>(null), map = useRef<MapInstance | null>(null), library = useRef<MapboxLibrary | null>(null);
 const pins = useRef(new Map<string, Pin>()), previous = useRef(new Map<number, GpsPosition>()), didFit = useRef(false);
 const callbacks = useRef({ onSelect, onStopFollowing }); callbacks.current = { onSelect, onStopFollowing };
 const [ready, setReady] = useState(false), [error, setError] = useState(false);
 useEffect(() => {
  let active = true; setReady(false); setError(false); didFit.current = false;
  void loadMapbox().then(lib => {
   if (!active || !host.current) return;
   library.current = lib;
   const instance = new lib.Map({ container: host.current, accessToken: mapboxToken, style: 'mapbox://styles/mapbox/light-v11', center: [-76.5353, 3.4384], zoom: 12, attributionControl: true, scrollZoom: true });
   map.current = instance;
   instance.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
   instance.addControl(new lib.FullscreenControl(), 'top-right');
   instance.on('dragstart', () => callbacks.current.onStopFollowing());
   instance.on('zoom', () => {
    const showPlaces = instance.getZoom() >= PLACE_MIN_ZOOM;
    pins.current.forEach(pin => { if (pin.kind === 'place') pin.element.style.display = showPlaces ? '' : 'none'; });
   });
   instance.on('load', () => {
    if (!active) return;
    for (const layer of instance.getStyle().layers || []) if (layer.id.includes('poi')) instance.setLayoutProperty(layer.id, 'visibility', 'none');
    for (const id of ['raw', 'matched']) {
     instance.addSource(id, { type: 'geojson', data: lines([]) });
     instance.addLayer({ id, type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2563eb', 'line-width': id === 'matched' ? 5 : 4, 'line-opacity': id === 'matched' ? .95 : .6, ...(id === 'raw' ? { 'line-dasharray': [2, 2] } : {}) } });
    }
    setReady(true);
   });
  }).catch(() => { if (active) setError(true); });
  return () => {
   active = false;
   pins.current.forEach(pin => { if (pin.frame !== null) cancelAnimationFrame(pin.frame); pin.marker.remove(); }); pins.current.clear(); previous.current.clear();
   map.current?.remove(); map.current = null;
  };
 }, [mapboxToken]);
 useEffect(() => {
  if (!ready || !map.current || !library.current) return;
  const instance = map.current, lib = library.current, needed = new Set<string>();
  const upsert = (key: string, point: Point, label: string, color: string, kind: 'truck' | 'place' | 'boundary', click: () => void, animate = false, stale = false, badge?: string) => {
   needed.add(key); let pin = pins.current.get(key);
   if (!pin) {
    const element = document.createElement('div');
    pin = { kind, element, marker: new lib.Marker({ element }).setLngLat([point.longitude, point.latitude]).addTo(instance), displayed: point, frame: null };
    pins.current.set(key, pin);
   }
   const current = pin;
   current.element.style.display = kind === 'place' && instance.getZoom() < PLACE_MIN_ZOOM ? 'none' : '';
   // Preserve the SDK anchor classes; replacing className offsets markers from GPS.
   current.element.classList.add(classes.pin);
   current.element.style.setProperty('--asset-color', color);
   current.element.style.zIndex = kind === 'truck' ? '3' : kind === 'boundary' ? '2' : '1';
   current.element.style.opacity = stale ? '.65' : '1';
   const button = document.createElement('button'); button.type = 'button'; button.className = `${classes.badge} ${kind === 'truck' && key === `device-${selectedId}` ? classes.selected : ''}`;
   button.setAttribute('aria-label', kind === 'truck' ? `Ver camión ${label}` : label); button.onclick = click;
   if (kind === 'truck') button.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 5h11v12H3zM14 9h4l3 4v4h-7M6 17a2 2 0 1 0 4 0M16 17a2 2 0 1 0 4 0"/></svg>';
   else button.textContent = badge || 'P';
   const text = document.createElement('span'); text.className = classes.label; text.textContent = label; text.title = label; button.title = label;
   current.element.replaceChildren(button, text);
   if (current.frame !== null) cancelAnimationFrame(current.frame); current.frame = null;
   const changed = current.displayed.latitude !== point.latitude || current.displayed.longitude !== point.longitude;
   if (changed && animate && !stale) {
    const from = current.displayed, started = performance.now();
    const step = (now: number) => { const progress = Math.min(1, (now - started) / 3500); current.displayed = interpolatePosition(from, point, progress); current.marker.setLngLat([current.displayed.longitude, current.displayed.latitude]); current.frame = progress < 1 ? requestAnimationFrame(step) : null; };
    current.frame = requestAnimationFrame(step);
   } else { current.displayed = point; current.marker.setLngLat([point.longitude, point.latitude]); }
  };
  for (const device of fleet?.devices || []) if (device.position) {
   const position = device.position;
   const animate = smoothMovement && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && device.latestReport?.valid !== false && canAnimate(previous.current.get(device.id), position);
   upsert(`device-${device.id}`, position, device.name, assetColor(device.id), 'truck', () => callbacks.current.onSelect(device.id), animate, Boolean(position.historical) || gpsAge(position).seconds > 90);
   previous.current.set(device.id, position);
  }
  for (const place of fleet?.places || []) upsert(`place-${place.id}`, place, place.approximate ? `${place.name} · ubicación aproximada` : place.name, place.approximate ? '#b45309' : place.siteType === 'secondary' ? '#c2410c' : '#1971c2', 'place', () => { callbacks.current.onStopFollowing(); instance.easeTo({ center: [place.longitude, place.latitude] }); }, false, false, place.approximate ? '?' : place.siteType === 'primary' ? '1' : place.siteType === 'secondary' ? '2' : 'P');
  for (const journey of journeys || []) {
   const ends = [{ kind: 'start', point: journey.start, label: journey.startReason === 'window' ? 'Primer GPS' : 'Inicio' }, ...(journey.endReason === 'pause' ? [{ kind: 'end', point: journey.end, label: 'Fin' }] : [])];
   for (const end of ends) upsert(`${journey.id}:${end.kind}`, end.point, `${end.label} · ${localTime(end.point.reportedAt)}`, end.kind === 'start' ? '#059669' : '#dc2626', 'boundary', () => { callbacks.current.onStopFollowing(); instance.easeTo({ center: [end.point.longitude, end.point.latitude] }); }, false, false, end.kind === 'start' ? 'I' : 'F');
  }
  for (const [key, pin] of pins.current) if (!needed.has(key)) { if (pin.frame !== null) cancelAnimationFrame(pin.frame); pin.marker.remove(); pins.current.delete(key); }
  if (!didFit.current && fleet) { const positions = fleet.devices.flatMap(d => d.position ? [d.position] : []); const points = positions.length ? [...fleet.places.filter(p => p.siteType === 'primary' || p.siteType === 'secondary'), ...positions] : fleet.places; if (points.length) { fit(instance, points); didFit.current = true; } }
  const selected = fleet?.devices.find(d => d.id === selectedId)?.position;
  if (follow && selected) instance.easeTo({ center: [selected.longitude, selected.latitude], duration: 500 });
 }, [ready, fleet, journeys, selectedId, follow, smoothMovement]);
 useEffect(() => {
  if (!ready || !map.current) return;
  const raw = mapMatch?.segments.length ? [] : (history?.segments || []).map(segment => smoothRoute ? simplifyGpsPath(segment) : segment);
  map.current.getSource('raw')?.setData(lines(raw)); map.current.getSource('matched')?.setData(lines(mapMatch?.segments || []));
  const color = assetColor(history?.deviceId ?? mapMatch?.deviceId ?? selectedId ?? 0);
  for (const id of ['raw', 'matched']) map.current.setPaintProperty(id, 'line-color', color);
  map.current.setPaintProperty('raw', 'line-dasharray', unconfirmedRoute ? [2, 2] : [1, 0]);
 }, [ready, history, mapMatch, smoothRoute, unconfirmedRoute, selectedId]);
 useEffect(() => {
  if (ready && map.current && fleet) fit(map.current, [...fleet.places, ...fleet.devices.flatMap(d => d.position ? [d.position] : [])]);
  // Explicit camera action; telemetry updates preserve the current zoom.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [ready, fitVersion]);
 useEffect(() => {
  if (ready && map.current && historyFitVersion && history) fit(map.current, history.segments.flat());
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [ready, historyFitVersion]);
 return <div>{error ? <Alert color="orange" mb="sm">No fue posible cargar Mapbox. El historial GPS permanece guardado.</Alert> : null}<div ref={host} className={classes.map} role="region" aria-label="Mapa Mapbox de flota y recorridos" /></div>;
}
