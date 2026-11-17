'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { IconCamera, IconLoader2, IconRefresh } from '@tabler/icons-react';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import NativeSelfieCapture, { useNativeSelfieCamera } from './NativeSelfieCapture';
import styles from './mobile-attendance.module.css';

type Enrollment = { required: boolean; enrolledAt: string | null };

export default function FaceEnrollmentGate({ children, onExpired }: { children: ReactNode; onExpired: () => void }) {
  const [state, setState] = useState<'loading' | 'required' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const sessionToken = useRef(getToken());
  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    api<Enrollment>('/attendance/face-enrollment', { signal: controller.signal, cache: 'no-store', redirectOnAuthError: false })
      .then(result => { if (controller.signal.aborted) return; if (getToken() !== sessionToken.current) { onExpired(); return; } setState(result.required ? 'required' : 'ready'); })
      .catch(error => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) onExpired();
        else setState('error');
      });
    return () => controller.abort();
  }, [attempt, onExpired]);
  if (state === 'ready') return children;
  if (state === 'loading') return <p role="status" className={styles.profileLoading}><IconLoader2 className={styles.spinner} aria-hidden="true" />Comprobando tu registro…</p>;
  if (state === 'error') return <section className={styles.stack}><p role="alert">No pudimos comprobar tu registro facial. Revisa tu conexión e intenta de nuevo.</p><button className={styles.secondary} onClick={() => setAttempt(value => value + 1)}>VOLVER A INTENTAR</button></section>;
  return <FaceEnrollment onDone={() => setState('ready')} onExpired={onExpired} sessionToken={sessionToken.current} />;
}

function FaceEnrollment({ onDone, onExpired, sessionToken }: { onDone: () => void; onExpired: () => void; sessionToken: string | null }) {
  const nativeCamera = useNativeSelfieCamera();
  const [camera, setCamera] = useState(false), [ready, setReady] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null), [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null);
  const lock = useRef(false), alive = useRef(true);
  const stop = useCallback(() => { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; stop(); }; }, [stop]);
  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(() => {
    if (!camera || nativeCamera) return;
    let cancelled = false;
    setReady(false);
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error();
        const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 960 } } });
        if (cancelled) { media.getTracks().forEach(track => track.stop()); return; }
        stream.current = media;
        if (video.current) { video.current.srcObject = media; await video.current.play(); }
      } catch {
        if (!cancelled) { setError('No pudimos abrir la cámara. Revisa su permiso y vuelve a intentar.'); setCamera(false); }
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [camera, nativeCamera, stop]);
  async function selected(blob: Blob) { if (alive.current) { setPhoto(blob); setError(''); setCamera(false); stop(); } }
  async function capture() {
    if (!video.current?.videoWidth || lock.current) return;
    lock.current = true;
    try {
      const frame = video.current;
      const canvas = document.createElement('canvas');
      const ratio = Math.min(1, 1024 / Math.max(frame.videoWidth, frame.videoHeight));
      canvas.width = Math.round(frame.videoWidth * ratio); canvas.height = Math.round(frame.videoHeight * ratio);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No pudimos preparar la foto.');
      context.drawImage(frame, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .85));
      if (!blob) throw new Error('Vuelve a tomar la foto.');
      await selected(blob);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Vuelve a tomar la foto.'); }
    finally { lock.current = false; }
  }
  async function save() {
    if (!photo || lock.current) return;
    if (getToken() !== sessionToken) { onExpired(); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const body = new FormData(); body.append('selfie', photo, 'registro-facial.jpg');
      const result = await api<{ enrolled: boolean }>('/attendance/face-enrollment', { method: 'POST', body, redirectOnAuthError: false });
      if (!result.enrolled) throw new Error('No se pudo guardar tu rostro.');
      if (alive.current) onDone();
    } catch (cause) {
      if (!alive.current) return;
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else setError(cause instanceof Error ? cause.message : 'No pudimos guardar tu rostro. Intenta de nuevo.');
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <section className={`${styles.stack} ${styles.enrollment}`} aria-label="Registro facial inicial" aria-busy={busy}>
    <div className={styles.greeting}><h1>Registra tu rostro</h1><p>Solo necesitas hacerlo una vez, antes de marcar tu primera entrada o salida en MiREV.</p></div>
    <p>Guardaremos esta selfie de forma protegida como referencia para comparar tus próximas marcaciones. Tu foto de perfil se conserva.</p>
    <p>Mira de frente, sin cubrir el rostro, con buena luz y sin otras personas en la imagen. Deja visibles la cabeza completa y los hombros.</p>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {preview ? <>
      <img src={preview} alt="Vista previa de tu registro facial" className={styles.enrollmentPreview} />
      <button className={styles.primary} disabled={busy} onClick={() => void save()}>{busy ? <><IconLoader2 className={styles.spinner} aria-hidden="true" />GUARDANDO…</> : 'GUARDAR MI ROSTRO Y CONTINUAR'}</button>
      <button className={styles.secondary} disabled={busy} onClick={() => { setPhoto(null); setError(''); setCamera(true); }}><IconRefresh aria-hidden="true" />VOLVER A TOMAR FOTO</button>
    </> : camera ? <>
      {nativeCamera ? <NativeSelfieCapture onPhoto={selected} /> : <>
        <div className={styles.camera}><video ref={video} autoPlay muted playsInline onLoadedData={() => setReady(true)} /><div className={styles.faceGuide} aria-hidden="true" />{!ready ? <div role="status" className={styles.cameraLoading}>Abriendo cámara…</div> : null}</div>
        <button className={styles.primary} disabled={!ready} onClick={() => void capture()}><IconCamera aria-hidden="true" />TOMAR FOTO</button>
      </>}
      <button className={styles.secondary} onClick={() => { stop(); setCamera(false); }}>VOLVER</button>
    </> : <button className={styles.primary} onClick={() => { setError(''); setCamera(true); }}><IconCamera aria-hidden="true" />REGISTRAR MI ROSTRO</button>}
  </section>;
}
