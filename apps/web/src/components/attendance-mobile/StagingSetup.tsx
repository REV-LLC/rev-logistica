'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import styles from './mobile-attendance.module.css';

export default function StagingSetup({ onReady }: { onReady: () => Promise<unknown> }) {
  const [camera, setCamera] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const location = useRef<GeolocationPosition | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    if (!camera) return;
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 960 } } })
      .then(async media => {
        if (cancelled) { media.getTracks().forEach(t => t.stop()); return; }
        stream.current = media;
        if (video.current) { video.current.srcObject = media; await video.current.play(); }
      }).catch(() => { if (!cancelled) { setError('Permite usar la cámara y vuelve a intentar.'); setCamera(false); } });
    return () => { cancelled = true; stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; };
  }, [camera]);
  async function begin() {
    if (lock.current) return;
    lock.current = true; setError(''); setBusy(true);
    try {
      location.current = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }));
      if (location.current.coords.accuracy > 100) throw new Error('La ubicación tiene poca precisión. Acércate a una ventana o sal al exterior.');
      setReady(false); setCamera(true);
    } catch (error) { setError(error instanceof Error ? error.message : 'Permite la ubicación para fijar el punto de prueba.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function capture() {
    if (lock.current || !video.current || !location.current || !ready) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const canvas = document.createElement('canvas'); const v = video.current;
      const scale = Math.min(1, 1024 / Math.max(v.videoWidth, v.videoHeight));
      canvas.width = Math.round(v.videoWidth * scale); canvas.height = Math.round(v.videoHeight * scale);
      canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .88));
      if (!blob) throw new Error('No se pudo tomar la foto.');
      const form = new FormData(); form.append('selfie', blob, 'referencia-prueba.jpg');
      form.append('latitude', String(location.current.coords.latitude)); form.append('longitude', String(location.current.coords.longitude));
      form.append('accuracyMeters', String(location.current.coords.accuracy)); form.append('locationCapturedAt', new Date(location.current.timestamp).toISOString());
      await api('/attendance/test-setup', { method: 'POST', body: form, redirectOnAuthError: false });
      setCamera(false); await onReady();
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo preparar la prueba.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className={styles.stack}>
    <h1>Prepara tu prueba</h1>
    <p>Registraremos tu rostro solo en esta cuenta ficticia. Tu ubicación actual será el centro de la obra de prueba, con un radio de 200 metros.</p>
    <p>Esta selfie crea la referencia facial. No registra una entrada ni cambia tu foto en producción.</p>
    {camera ? <>
      <video ref={video} autoPlay muted playsInline onLoadedData={() => setReady(true)} style={{ width: '100%', borderRadius: 24, transform: 'scaleX(-1)' }} />
      <button className={styles.primary} onClick={capture} disabled={busy || !ready}>{busy ? 'PREPARANDO…' : 'USAR ESTA SELFIE'}</button>
      <button className={styles.secondary} disabled={busy} onClick={() => setCamera(false)}>Cancelar</button>
    </> : <button className={styles.primary} disabled={busy} onClick={begin}>{busy ? 'BUSCANDO UBICACIÓN…' : 'PREPARAR MI ROSTRO'}</button>}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
  </section>;
}
