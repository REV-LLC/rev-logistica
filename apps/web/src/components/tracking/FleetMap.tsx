'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert } from '@mantine/core';
import { loadTrackingMap } from './google-map-loader';
import { trackingMapStyle } from './tracking-map-style';
import { canAnimate, interpolatePosition } from './tracking-motion';
import { gpsAge } from './tracking-types';
import type { FleetState, GpsPosition, Journey, RoadMatch, RouteHistory } from './tracking-types';
import classes from './FleetMap.module.css';

type MarkerData = { animateMs?: number; boundary?: 'start' | 'end'; latitude: number; longitude: number; label: string; selected?: boolean; stale?: boolean; site?: string; number?: string; onClick?: () => void };
type Overlay = { setMap: (map: google.maps.Map | null) => void; update: (data: MarkerData) => void };

const fitPadding = (width: number) => width < 600 ? { top: 110, bottom: 60, left: 85, right: 175 } : { top: 100, bottom: 70, left: 175, right: 175 };

function markerType() {
  return class extends google.maps.OverlayView {
    private data: MarkerData;
    private element: HTMLDivElement | null = null;
    private displayed: { latitude: number; longitude: number };
    private frame: number | null = null;
    constructor(data: MarkerData, map: google.maps.Map) { super(); this.data = data; this.displayed = { latitude: data.latitude, longitude: data.longitude }; this.setMap(map); }
    onAdd() {
      this.element = document.createElement('div'); this.element.className = classes.anchor;
      this.getPanes()?.overlayMouseTarget.appendChild(this.element);
      google.maps.OverlayView.preventMapHitsAndGesturesFrom(this.element);
      this.render();
    }
    private render() {
      if (!this.element) return;
      this.element.replaceChildren();
      const d = this.data;
      const button = document.createElement('button'); button.type = 'button';
      button.setAttribute('aria-label', d.boundary || d.site ? d.label : `Ver camión ${d.label}`);
      button.className = `${classes.marker} ${d.selected ? classes.selected : ''} ${d.stale ? classes.stale : ''}`;
      button.onclick = d.onClick || null;
      if (d.boundary) {
        button.textContent = d.boundary === 'start' ? 'I' : 'F';
        button.className = `${classes.marker} ${classes.boundary} ${d.boundary === 'end' ? classes.end : classes.start}`;
        const label = document.createElement('span'); label.className = `${classes.boundaryLabel} ${d.boundary === 'end' ? classes.endLabel : ''}`;
        label.textContent = d.label; this.element.append(label);
      } else if (d.site) {
        const primary = d.site === 'primary'; const color = primary ? '#1971c2' : '#c2410c';
        this.element.style.setProperty('--site-color', color);
        this.element.style.setProperty('--site-x', primary ? '-18px' : '18px');
        this.element.style.setProperty('--site-angle', primary ? '-29deg' : '29deg');
        const dot = document.createElement('span'); dot.className = classes.siteDot;
        const stem = document.createElement('span'); stem.className = classes.siteStem;
        this.element.append(dot, stem);
        button.className = `${classes.marker} ${classes.siteBadge}`; button.textContent = d.number || 'P';
        const label = document.createElement('span'); label.textContent = d.label;
        label.className = `${classes.siteName} ${primary ? classes.primaryName : classes.secondaryName}`;
        this.element.append(label);
      } else {
        // The SVG is fixed application markup; names are assigned with textContent below.
        button.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 5h11v12H3zM14 9h4l3 4v4h-7M6 17a2 2 0 1 0 4 0M16 17a2 2 0 1 0 4 0"/></svg>';
        const label = document.createElement('span'); label.className = classes.truckLabel; label.textContent = d.label;
        this.element.append(label);
      }
      this.element.append(button);
    }
    update(data: MarkerData) {
      const old = this.data;
      this.data = data;
      if (old.label !== data.label || old.selected !== data.selected || old.stale !== data.stale || old.site !== data.site || old.number !== data.number || old.boundary !== data.boundary) this.render();
      const changed = old.latitude !== data.latitude || old.longitude !== data.longitude;
      if (changed || data.stale || (!data.animateMs && this.frame !== null)) {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null;
        if (changed && data.animateMs && !data.stale) {
          const from = { ...this.displayed }, started = performance.now(), duration = data.animateMs;
          const step = (now: number) => {
            const t = Math.min(1, (now - started) / duration);
            this.displayed = interpolatePosition(from, data, t);
            this.draw();
            this.frame = t < 1 ? requestAnimationFrame(step) : null;
          };
          this.frame = requestAnimationFrame(step);
        } else this.displayed = { latitude: data.latitude, longitude: data.longitude };
      }
      this.draw();
    }
    draw() {
      const p = this.getProjection()?.fromLatLngToDivPixel(new google.maps.LatLng(this.displayed.latitude, this.displayed.longitude));
      if (p && this.element) { this.element.style.left = `${p.x}px`; this.element.style.top = `${p.y}px`; }
    }
    onRemove() { if (this.frame !== null) cancelAnimationFrame(this.frame); this.element?.remove(); this.element = null; }
  };
}

export default function FleetMap({ browserKey, fleet, selectedId, history, journeys, follow, fitVersion, historyFitVersion, onSelect, onStopFollowing, smoothMovement = false, roadMatch }: {
  browserKey: string; fleet: FleetState | null; selectedId: number | null; history: RouteHistory | null; journeys?: Journey[];
  smoothMovement?: boolean; roadMatch?: RoadMatch | null;
  follow: boolean; fitVersion: number; historyFitVersion: number; onSelect: (id: number) => void; onStopFollowing: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef(new Map<string, Overlay>());
  const boundaries = useRef(new Map<string, Overlay>());
  const Marker = useRef<ReturnType<typeof markerType> | null>(null);
  const didFit = useRef(false);
  const lastPositions = useRef(new Map<number, GpsPosition>());
  const callbacks = useRef({ onSelect, onStopFollowing }); callbacks.current = { onSelect, onStopFollowing };
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let drag: google.maps.MapsEventListener | undefined;
    void loadTrackingMap(browserKey).then(() => {
      if (!active || !host.current) return;
      map.current = new google.maps.Map(host.current, { center: { lat: 3.4384, lng: -76.5353 }, zoom: 12,
        styles: trackingMapStyle,
        mapTypeControl: false, streetViewControl: false, rotateControl: false, fullscreenControl: true, gestureHandling: 'cooperative', clickableIcons: false });
      Marker.current = markerType();
      drag = map.current.addListener('dragstart', () => callbacks.current.onStopFollowing());
      setReady(true);
    }).catch(() => { if (active) setError(true); });
    return () => {
      active = false; drag?.remove(); boundaries.current.forEach(m => m.setMap(null)); boundaries.current.clear(); markers.current.forEach(m => m.setMap(null)); markers.current.clear();
      if (map.current) google.maps.event.clearInstanceListeners(map.current);
      map.current = null;
    };
  }, [browserKey]);

  useEffect(() => {
    if (!ready || !map.current || !Marker.current || !fleet) return;
    const needed = new Set<string>();
    const upsert = (key: string, data: MarkerData) => {
      needed.add(key);
      const existing = markers.current.get(key);
      if (existing) existing.update(data); else markers.current.set(key, new Marker.current!(data, map.current!));
    };
    for (const d of fleet.devices) if (d.position) {
      const previous = lastPositions.current.get(d.id);
      const animate = smoothMovement && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
        && d.latestReport?.valid !== false && canAnimate(previous, d.position);
      upsert(`device-${d.id}`, { ...d.position, label: d.name,
        animateMs: animate ? 3500 : 0,
        selected: d.id === selectedId, stale: Boolean(d.position.historical) || gpsAge(d.position).seconds > 90, onClick: () => callbacks.current.onSelect(d.id) });
      lastPositions.current.set(d.id, d.position);
    }
    fleet.places.forEach((p, i) => upsert(`place-${p.id}`, { ...p, label: p.name,
      site: p.siteType || (i % 2 ? 'secondary' : 'primary'), number: p.siteType === 'primary' ? '1' : p.siteType === 'secondary' ? '2' : 'P',
      onClick: () => { callbacks.current.onStopFollowing(); map.current?.panTo({ lat: p.latitude, lng: p.longitude }); } }));
    for (const [key, value] of markers.current) if (!needed.has(key)) { value.setMap(null); markers.current.delete(key); }
    if (!didFit.current) {
      const coords = [...fleet.places, ...fleet.devices.flatMap(d => d.position ? [d.position] : [])];
      if (coords.length) {
        const bounds = new google.maps.LatLngBounds(); coords.forEach(p => bounds.extend({ lat: p.latitude, lng: p.longitude }));
        map.current.fitBounds(bounds, fitPadding(host.current?.clientWidth || 800)); didFit.current = true;
      }
    }
    const selected = fleet.devices.find(d => d.id === selectedId)?.position;
    if (follow && selected) map.current.panTo({ lat: selected.latitude, lng: selected.longitude });
  }, [ready, fleet, selectedId, follow, smoothMovement]);

  useEffect(() => {
    if (!ready || !map.current || !Marker.current) return;
    const needed = new Set<string>();
    for (const journey of journeys || []) {
      const ends = [{ kind: 'start' as const, point: journey.start, label: journey.startReason === 'window' ? 'Primer GPS' : 'Inicio' },
        ...(journey.endReason === 'pause' ? [{ kind: 'end' as const, point: journey.end, label: 'Fin' }] : [])];
      for (const { kind, point, label } of ends) {
        const key = `${journey.id}:${kind}`; needed.add(key);
        const hour = new Date(point.reportedAt).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });
        const data: MarkerData = { ...point, boundary: kind, label: `${label} · ${hour}`,
          onClick: () => { callbacks.current.onStopFollowing(); map.current?.panTo({ lat: point.latitude, lng: point.longitude }); } };
        const current = boundaries.current.get(key);
        if (current) current.update(data); else boundaries.current.set(key, new Marker.current(data, map.current));
      }
    }
    for (const [key, marker] of boundaries.current) if (!needed.has(key)) { marker.setMap(null); boundaries.current.delete(key); }
  }, [ready, journeys]);

  useEffect(() => {
    if (!ready || !map.current || !fleet) return;
    const bounds = new google.maps.LatLngBounds(); let count = 0;
    [...fleet.places, ...fleet.devices.flatMap(d => d.position ? [d.position] : [])].forEach(p => { bounds.extend({ lat: p.latitude, lng: p.longitude }); count++; });
    if (count) map.current.fitBounds(bounds, fitPadding(host.current?.clientWidth || 800));
    // fitVersion is an explicit user action, not an automatic reset on telemetry refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitVersion, ready]);

  useEffect(() => {
    if (!ready || !map.current || !historyFitVersion || !history?.pointCount) return;
    const bounds = new google.maps.LatLngBounds();
    for (const segment of history.segments) for (const p of segment) bounds.extend({ lat: p.latitude, lng: p.longitude });
    map.current.fitBounds(bounds, fitPadding(host.current?.clientWidth || 800));
    // Only an explicit request fits the history; telemetry refreshes preserve the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyFitVersion, ready]);

  useEffect(() => {
    if (!ready || !map.current) return;
    const lines = (history?.segments || []).filter(segment => segment.length > 1).map(segment => new google.maps.Polyline({
      map: map.current, path: segment.map(p => ({ lat: p.latitude, lng: p.longitude })), strokeColor: '#0f766e', strokeOpacity: roadMatch?.segments.length ? .35 : .9, strokeWeight: 4, zIndex: 2 }));
    for (const segment of roadMatch?.segments || []) if (segment.length > 1) lines.push(new google.maps.Polyline({
      map: map.current, path: segment.map(p => ({ lat: p.latitude, lng: p.longitude })), strokeColor: '#2563eb', strokeOpacity: .95, strokeWeight: 5, zIndex: 3,
    }));
    return () => lines.forEach(line => line.setMap(null));
  }, [ready, history, roadMatch]);

  return <div>
    {error ? <Alert color="orange" mb="sm">No fue posible cargar el mapa. Puedes seguir usando el panel Traccar.</Alert> : null}
    <div ref={host} className={classes.map} role="region" aria-label="Mapa de flota y recorrido GPS real" />
  </div>;
}
