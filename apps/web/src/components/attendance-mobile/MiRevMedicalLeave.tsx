'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { IconFileDescription, IconFirstAidKit, IconUpload } from '@tabler/icons-react';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { getAttendanceLocation } from '@/lib/attendance-geolocation';
import styles from './mobile-attendance.module.css';
const MedicalSelfieCapture = dynamic(() => import('./MedicalSelfieCapture'), { loading: () => <p role="status">Preparando cámara…</p> });
type Diagnosis = { id: string; name: string };
type Leave = { id: string; day: string; description: string; providerType: string; providerName: string | null; latitude: number; longitude: number; accuracyMeters: number; diagnoses: Diagnosis[] };
type Today = { selfieRequired: boolean; leave: Leave | null };

export default function MiRevMedicalLeave({ today }: { today: Date | null }) {
  const [data, setData] = useState<Today | null>(null), [error, setError] = useState('');
  const [form, setForm] = useState(false), [busy, setBusy] = useState(false), [petition, setPetition] = useState(false);
  const [description, setDescription] = useState(''), [providerType, setProviderType] = useState('EPS');
  const [photo, setPhoto] = useState<Blob | null>(null), [preview, setPreview] = useState(''), [camera, setCamera] = useState(false);
  const [location, setLocation] = useState<GeolocationPosition | null>(null);
  const sessionToken = useRef(getToken());
  function checkSession() { if (getToken() !== sessionToken.current) throw new Error('La cuenta cambió. Cierra sesión e ingresa nuevamente.'); }
  const requestId = useRef(''), lock = useRef(false), alive = useRef(true), formRef = useRef<HTMLFormElement>(null);
  const day = today ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(today) : '';
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    const load = () => {
      if (document.hidden || lock.current) return;
      void api<Today>('/employee-portal/medical-leave/today', { signal: controller.signal, cache: 'no-store' })
        .then(result => { if (!controller.signal.aborted) setData(result); })
        .catch(() => { if (!controller.signal.aborted) setError('No pudimos consultar la incapacidad del día. Vuelve a intentar.'); });
    };
    load(); document.addEventListener('visibilitychange', load);
    return () => { alive.current = false; controller.abort(); document.removeEventListener('visibilitychange', load); };
  }, [day]);
  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url);
  }, [photo]);
  async function open() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setForm(true); setPhoto(null); setCamera(false); setLocation(null);
    requestId.current = crypto.randomUUID();
    try {
      checkSession();
      const [current, gps] = await Promise.all([api<Today>('/employee-portal/medical-leave/today', { cache: 'no-store' }), getAttendanceLocation()]);
      if (!alive.current) return;
      setData(current); setLocation(gps);
      if (current.leave) setForm(false);
      else requestAnimationFrame(() => formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'No pudimos obtener tu ubicación.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (lock.current || !data || !location) return;
    if (data.selfieRequired && !photo) { setCamera(true); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const gps = Date.now() - location.timestamp > 60000 ? await getAttendanceLocation() : location;
      const body = new FormData();
      for (const [key, value] of Object.entries({ clientRequestId: requestId.current, description: description.trim(), providerType, latitude: gps.coords.latitude, longitude: gps.coords.longitude, accuracyMeters: gps.coords.accuracy, locationCapturedAt: new Date(gps.timestamp).toISOString() })) body.append(key, String(value));
      if (data.selfieRequired && photo) body.append('selfie', photo, 'incapacidad.jpg');
      checkSession();
      const leave = await api<Leave>('/employee-portal/medical-leave', { method: 'POST', body });
      if (alive.current) { setData({ ...data, leave }); setForm(false); setPhoto(null); setDescription(''); setCamera(false); }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'No pudimos guardar la incapacidad. Vuelve a intentar.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || !data?.leave || lock.current) return;
    if (file.size > 10 * 1024 * 1024) { setError('El diagnóstico debe pesar menos de 10 MB.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const body = new FormData(); body.append('diagnosis', file);
      checkSession();
      const diagnosis = await api<Diagnosis>(`/employee-portal/medical-leave/${data.leave.id}/diagnosis`, { method: 'POST', body });
      if (alive.current) setData(current => current?.leave ? { ...current, leave: { ...current.leave, diagnoses: [...current.leave.diagnoses, diagnosis] } } : current);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'No pudimos subir el diagnóstico.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <>
    {error && !form ? <p className={styles.error} role="alert">{error}</p> : null}
    {data?.leave ? <section className={`${styles.card} ${styles.medicalCard}`} aria-label="Incapacidad del día">
      <h2>Incapacidad del día</h2><p>{data.leave.description}</p>
      <p><strong>{data.leave.providerType}</strong> · {data.leave.providerName || 'Entidad pendiente de configurar por oficina'}</p>
      <p>Ubicación registrada · precisión de {Math.round(data.leave.accuracyMeters)} m</p>
      <a className={styles.link} href={`https://www.google.com/maps?q=${data.leave.latitude},${data.leave.longitude}`} target="_blank" rel="noopener noreferrer">Ver ubicación</a>
      {data.leave.diagnoses.length ? <div role="status"><strong>Diagnóstico adjunto</strong><ul>{data.leave.diagnoses.map(item => <li key={item.id}>{item.name}</li>)}</ul></div> : <p>Pendiente de subir el diagnóstico.</p>}
      {data.leave.diagnoses.length < 5 ? <label className={`${styles.secondary} ${styles.nativeCapture}`}><IconUpload size={22} />{busy ? 'SUBIENDO…' : 'SUBIR DIAGNÓSTICO'}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" aria-label="Subir diagnóstico" disabled={busy} onChange={event => void upload(event)} /></label> : null}
    </section> : null}
    {form && !data?.leave ? <form ref={formRef} className={`${styles.card} ${styles.stack} ${styles.portalForm}`} onSubmit={event => void submit(event)} aria-busy={busy}>
      <h2>Registrar incapacidad</h2>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <p role="status">{busy && !location ? 'Obteniendo tu ubicación…' : location ? `Ubicación obtenida · precisión ${Math.round(location.coords.accuracy)} m` : 'Necesitamos tu ubicación para continuar.'}</p>
      {!location && !busy ? <button type="button" className={styles.secondary} onClick={() => void open()}>Obtener ubicación</button> : null}
      <label>Motivo breve<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={500} required placeholder="Cuéntanos brevemente por qué fue" disabled={busy} /></label>
      <label>Atención por<select value={providerType} onChange={event => setProviderType(event.target.value)} disabled={busy}><option value="EPS">EPS</option><option value="ARL">ARL</option></select></label>
      {data?.selfieRequired ? <>
        <p>Como no has marcado entrada hoy, necesitamos una selfie para acompañar este registro.</p>
        {preview ? <><img className={styles.enrollmentPreview} src={preview} alt="Selfie para la incapacidad" /><button type="button" className={styles.secondary} disabled={busy} onClick={() => { setPhoto(null); setCamera(true); }}>Volver a tomar selfie</button></> : camera ? <MedicalSelfieCapture onPhoto={blob => { setPhoto(blob); setCamera(false); }} /> : null}
      </> : data ? <p>Ya marcaste entrada hoy. Puedes registrar la incapacidad sin otra foto.</p> : null}
      {!camera ? <button className={styles.primary} disabled={busy || !location || !data}>{busy ? 'GUARDANDO…' : data?.selfieRequired && !photo ? 'CONTINUAR CON SELFIE' : 'REGISTRAR INCAPACIDAD'}</button> : null}
      <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setForm(false); setPhoto(null); setCamera(false); setError(''); }}>Cancelar</button>
    </form> : null}
    <div className={styles.portalActions}>
      {!data?.leave && !form ? <button className={styles.secondary} disabled={busy} onClick={() => void open()}><IconFirstAidKit size={24} />REGISTRAR INCAPACIDAD</button> : null}
      <button className={styles.secondary} onClick={() => setPetition(value => !value)} aria-expanded={petition}><IconFileDescription size={24} />HACER PETICIÓN</button>
      {petition ? <p role="status" className={styles.muted}>Próximamente podrás enviar tus peticiones desde aquí.</p> : null}
    </div>
  </>;
}
