'use client';
import { useEffect, useState } from 'react';
import { attendanceDate, type AttendancePunch } from '@/lib/attendance';
import styles from './mobile-attendance.module.css';

type MapsConfig = { enabled: boolean; browserKey?: string };
export default function AttendanceLocationMap({ punches, selectedId, onSelect, point, onPointChange }: {
  punches: AttendancePunch[]; selectedId: string; onSelect: (id: string) => void;
  point: 'punch' | 'worksite'; onPointChange: (point: 'punch' | 'worksite') => void;
}) {
  const [config, setConfig] = useState<MapsConfig | null>(null);
  const [failed, setFailed] = useState(false);
  const selected = punches.find(punch => punch.id === selectedId) || punches[0];
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/attendance/maps-config', { cache: 'no-store', signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then((data: MapsConfig) => setConfig(data))
      .catch(error => { if (error.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, []);
  if (!selected) return null;
  const worksite = selected.customerWorksite.worksite;
  const siteAvailable = worksite.attendanceLatitude !== null && worksite.attendanceLongitude !== null;
  const showSite = point === 'worksite' && siteAvailable;
  const latitude = showSite ? worksite.attendanceLatitude! : selected.latitude;
  const longitude = showSite ? worksite.attendanceLongitude! : selected.longitude;
  const valid = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  const query = `${latitude},${longitude}`;
  const embedUrl = config?.enabled && config.browserKey && valid ? `https://www.google.com/maps/embed/v1/place?${new URLSearchParams({ key: config.browserKey, q: query, zoom: '18', language: 'es', maptype: 'roadmap' })}` : null;
  return <section id="attendance-location-map" className={styles.mapSection} aria-labelledby="attendance-map-title">
    <h2 id="attendance-map-title">Ubicación de mis registros</h2>
    <label className={styles.mapLabel}>Marcación
      <select value={selected.id} onChange={event => onSelect(event.target.value)}>
        {punches.map(punch => <option value={punch.id} key={punch.id}>{punch.kind === 'CHECK_IN' ? 'Entrada' : 'Salida'} · {attendanceDate(punch.occurredAt)}</option>)}
      </select>
    </label>
    <div className={styles.mapChoices}>
      <button className={styles.secondary} aria-pressed={!showSite} onClick={() => onPointChange('punch')}>Lugar del registro</button>
      <button className={styles.secondary} aria-pressed={showSite} disabled={!siteAvailable} onClick={() => onPointChange('worksite')}>Punto de la obra</button>
    </div>
    {embedUrl ? <iframe key={embedUrl} className={styles.mapFrame} title={showSite ? 'Google Maps: punto de la obra' : 'Google Maps: ubicación de la marcación'} src={embedUrl} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <p className={styles.notice} role="status">{failed || config ? 'El mapa integrado no está disponible en este momento.' : 'Cargando Google Maps…'}</p>}
    <p><strong>{showSite ? 'Punto configurado de la obra' : 'Ubicación guardada al marcar'}</strong><br />{latitude.toFixed(6)}, {longitude.toFixed(6)}</p>
    <p>Distancia calculada a la obra: {selected.distanceMeters == null ? 'sin dato' : `${selected.distanceMeters.toFixed(1)} m`}. Precisión GPS: ±{selected.accuracyMeters.toFixed(1)} m. Radio permitido: {worksite.attendanceRadiusMeters} m.</p>
    <p className={styles.muted}>El marcador representa el punto reportado por el GPS. La precisión indica su margen aproximado de error.</p>
    {valid ? <a className={styles.mapLink} href={`https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query })}`} target="_blank" rel="noopener noreferrer">Abrir este punto en Google Maps</a> : null}
  </section>;
}
