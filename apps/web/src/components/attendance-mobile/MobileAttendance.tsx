'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { IconCamera, IconCheck, IconClock, IconDoor, IconHelpCircle, IconLoader2, IconLogin, IconLogout, IconMapPin, IconVolume } from '@tabler/icons-react';
import { api, ApiError } from '@/lib/api';
import { clearToken, getToken, isTokenExpired, setToken } from '@/lib/auth';
import { reasonLabels, attendanceDate, type AttendancePunch, type AttendanceShift, type AttendanceSite } from '@/lib/attendance';
import NativeSelfieCapture, { useNativeSelfieCamera } from './NativeSelfieCapture';
import StagingSetup from './StagingSetup';
import InstallAttendance from './InstallAttendance';
import styles from './mobile-attendance.module.css';

type Me = {
  employee: { id: string; name: string };
  referenceReady: boolean;
  testMode?: boolean;
  open: AttendanceShift | null;
  recent: AttendancePunch[];
  worksites: AttendanceSite[];
};
type Step = 'home' | 'sites' | 'locating' | 'camera' | 'sending' | 'retry' | 'done';
type Attempt = { me: Me; siteId: string; location: GeolocationPosition };
const storageKey = (employeeId: string) => `rev.attendance.site.v1.${employeeId}`;
function rememberedSite(me: Me) {
  if (me.open) return me.open.customerWorksite.id;
  let saved: string | null = null;
  try { saved = localStorage.getItem(storageKey(me.employee.id)); } catch { /* Storage can be disabled. */ }
  if (me.worksites.some(site => site.id === saved)) return saved!;
  return me.worksites.length === 1 ? me.worksites[0].id : '';
}
function rememberSite(employeeId: string, siteId: string) {
  try { localStorage.setItem(storageKey(employeeId), siteId); } catch { /* Optional convenience only. */ }
}
function getLocation() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Este celular no permite obtener la ubicación. Pide ayuda al encargado.'));
    navigator.geolocation.getCurrentPosition(resolve, error => reject(new Error(
      error.code === 1 ? 'No tenemos permiso de ubicación. Pide ayuda al encargado.' :
        'No encontramos tu ubicación. Acércate a un lugar despejado y vuelve a intentar.',
    )), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}
function shortTime(date: string) {
  return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' }).format(new Date(date));
}

export default function MobileAttendance() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [help, setHelp] = useState(false);
  useEffect(() => { setSignedIn(Boolean(getToken() && !isTokenExpired(getToken()))); }, []);
  const expired = useCallback(() => { clearToken(); setSignedIn(false); }, []);

  return <main className={styles.page}>
    <div className={styles.screen}>
      {process.env.NEXT_PUBLIC_ATTENDANCE_TEST === 'true' ? <div role="status" style={{ background: '#fff0bd', color: '#684900', padding: '12px 16px', borderRadius: 16, fontWeight: 700 }}>PRUEBAS · Sin efecto en producción</div> : null}
      <header className={styles.header}>
        <img className={styles.logo} src="/fiesta.svg?v=silver" alt="REV Logística" width="90" height="45" />
        <button className={`${styles.link} ${styles.help}`} onClick={() => setHelp(value => !value)} aria-expanded={help} aria-controls="attendance-help">
          <IconHelpCircle size={30} aria-hidden="true" />Ayuda
        </button>
      </header>
      {signedIn === null ? <Loading label="Un momento…" /> : signedIn ?
        <Attendance onExpired={expired} /> : <Login onLogin={() => setSignedIn(true)} />}
      {help ? <section id="attendance-help" className={styles.helpContent}>
        <h2>Estamos para ayudarte</h2>
        <ol><li>Toca el botón de entrada o salida.</li><li>Mira la cámara y toca «Tomar foto».</li><li>Espera la confirmación.</li></ol>
        <p>Si la cámara o ubicación no funcionan, pide ayuda al encargado. No necesitas cambiar configuraciones por tu cuenta.</p>
        <button className={styles.secondary} onClick={() => {
          if (!('speechSynthesis' in window)) return;
          window.speechSynthesis.cancel();
          const message = new SpeechSynthesisUtterance('Para marcar, toca el botón de entrada o salida. Mira la cámara y toca tomar foto. Espera la confirmación. Si necesitas ayuda, llama al encargado.');
          message.lang = 'es-CO'; window.speechSynthesis.speak(message);
        }}><IconVolume size={23} aria-hidden="true" /> Escuchar ayuda</button>
        {signedIn ? <details><summary>Configuración del encargado</summary>
          <p>Para cambiar de empleado, cierra la sesión e ingresa con la cuenta correcta.</p>
          <button className={styles.secondary} onClick={() => { expired(); setHelp(false); }}>Cerrar sesión</button>
        </details> : null}
      </section> : null}
      <InstallAttendance />
    </div>
  </main>;
}

function Loading({ label }: { label: string }) {
  return <div className={`${styles.center} ${styles.stack}`} role="status">
    <IconLoader2 className={`${styles.stateIcon} ${styles.spinner}`} size={56} aria-hidden="true" /><h2>{label}</h2>
  </div>;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const result = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST', auth: false, redirectOnAuthError: false,
        json: { identifier: String(fields.get('identifier')).trim(), password: fields.get('password') },
      });
      if (!result.accessToken) throw new Error('No se pudo abrir tu cuenta.');
      setToken(result.accessToken); onLogin();
    } catch (error) {
      setError(error instanceof ApiError && error.status === 401 ? 'Revisa el usuario y la contraseña con el encargado.' : 'No pudimos conectar. Vuelve a intentar con conexión a internet.');
    } finally { setBusy(false); }
  }
  return <section className={`${styles.stack} ${styles.login}`}>
    <h1>Mi asistencia</h1><p>El encargado te ayudará a preparar este celular.</p>
    <form className={styles.stack} onSubmit={login} aria-busy={busy}>
      <label>Usuario o cédula<input name="identifier" autoComplete="username" autoCapitalize="none" spellCheck={false} required /></label>
      <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <button className={styles.primary} disabled={busy}>{busy ? 'Ingresando…' : 'INGRESAR'}<IconLogin aria-hidden="true" /></button>
    </form>
  </section>;
}

function Attendance({ onExpired }: { onExpired: () => void }) {
  const nativeCamera = useNativeSelfieCamera();
  const [me, setMe] = useState<Me | null>(null);
  const [siteId, setSiteId] = useState('');
  const [step, setStep] = useState<Step>('home');
  const [error, setError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [result, setResult] = useState<AttendancePunch | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const attempt = useRef<Attempt | null>(null);
  const pending = useRef<FormData | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const audio = useRef<AudioContext | null>(null);
  const sessionToken = useRef(getToken());
  const request = useCallback(async <T,>(path: string, options: Parameters<typeof api>[1] = {}) => {
    if (getToken() !== sessionToken.current) {
      onExpired();
      throw new Error('La cuenta cambió. Pide al encargado que abra tu sesión.');
    }
    try { return await api<T>(path, { ...options, redirectOnAuthError: false }); }
    catch (error) { if (error instanceof ApiError && error.status === 401) onExpired(); throw error; }
  }, [onExpired]);
  const load = useCallback(async () => {
    const data = await request<Me>('/attendance/me', { cache: 'no-store' });
    if (alive.current) { setMe(data); setSiteId(current => data.open ? data.open.customerWorksite.id : data.worksites.some(site => site.id === current) ? current : rememberedSite(data)); }
    return data;
  }, [request]);
  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
  }, []);
  useEffect(() => {
    alive.current = true;
    load().catch(error => { if (alive.current) setError(error instanceof Error ? error.message : 'No se pudo cargar tu asistencia.'); });
    return () => { alive.current = false; stopCamera(); void audio.current?.close().catch(() => undefined); audio.current = null; };
  }, [load, stopCamera]);
  useEffect(() => {
    if (step !== 'camera' || nativeCamera) return;
    let cancelled = false;
    setCameraReady(false);
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 960 } } })
      .then(async media => {
        if (cancelled) { media.getTracks().forEach(track => track.stop()); return; }
        stream.current = media;
        if (video.current) { video.current.srcObject = media; await video.current.play(); }
      }).catch(() => {
        if (!cancelled) { setError('No pudimos abrir la cámara. Pide ayuda al encargado para revisar el permiso.'); setStep('home'); }
      });
    return () => { cancelled = true; stopCamera(); };
  }, [step, stopCamera, nativeCamera]);
  useEffect(() => {
    const hideCamera = () => { if (!nativeCamera && document.hidden && step === 'camera' && !lock.current) { stopCamera(); setStep('home'); } };
    document.addEventListener('visibilitychange', hideCamera);
    return () => document.removeEventListener('visibilitychange', hideCamera);
  }, [step, stopCamera, nativeCamera]);

  function prepareSound() {
    try { audio.current ??= new AudioContext(); void audio.current.resume().catch(() => undefined); } catch { /* Sound is optional. */ }
  }
  function feedback(verified: boolean) {
    try {
      navigator.vibrate?.(verified ? [120, 80, 120] : [250]);
      const context = audio.current;
      if (!context || context.state !== 'running') return;
      const oscillator = context.createOscillator(); const gain = context.createGain();
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.frequency.setValueAtTime(verified ? 660 : 440, context.currentTime);
      gain.gain.setValueAtTime(.12, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .35);
      oscillator.start(); oscillator.stop(context.currentTime + .35);
    } catch { /* A successful record never depends on audio. */ }
  }
  async function begin(chosenSite = siteId) {
    if (lock.current) return;
    prepareSound(); setError('');
    if (!navigator.onLine) { setError('No hay internet. Tu marcación aún no se ha registrado. Vuelve a intentar cuando tengas conexión.'); return; }
    if (!nativeCamera && !navigator.mediaDevices?.getUserMedia) { setError('No podemos usar la cámara. Abre la aplicación en un navegador compatible con conexión segura.'); return; }
    lock.current = true; setStep('locating');
    try {
      const fresh = await load();
      const nextSite = fresh.open?.customerWorksite.id || (fresh.worksites.some(site => site.id === chosenSite) ? chosenSite : rememberedSite(fresh));
      if (!nextSite) { setStep('sites'); return; }
      setSiteId(nextSite);
      rememberSite(fresh.employee.id, nextSite);
      const location = await getLocation();
      if (!alive.current) return;
      attempt.current = { me: fresh, siteId: nextSite, location };
      pending.current = null;
      setStep('camera');
    } catch (error) {
      if (alive.current) { setError(error instanceof Error ? error.message : 'No se pudo preparar la marcación.'); setStep('home'); }
    } finally { lock.current = false; }
  }
  async function send(form: FormData) {
    try {
      const punch = await request<AttendancePunch>('/attendance/punches', { method: 'POST', body: form });
      if (!alive.current) return;
      pending.current = null; attempt.current = null;
      setResult(punch); setStep('done');
      feedback(punch.status === 'VERIFIED' || punch.status === 'APPROVED');
      // A failed refresh must not turn a confirmed punch into an apparent failure.
      void load().catch(() => undefined);
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof ApiError && error.status < 500) {
        pending.current = null; attempt.current = null;
        setError(error.status === 409 ? 'Tu jornada cambió. Actualizamos tu asistencia; vuelve a marcar.' : error.message);
        if (error.status === 409) {
          try { await load(); } catch { setMe(null); }
        }
        setStep('home');
      } else {
        setError('No recibimos la confirmación. Toca «Volver a intentar» para comprobar la misma marcación.');
        setStep('retry');
      }
    }
  }
  async function captureImage(source: () => Promise<Blob>) {
    const current = attempt.current;
    if (lock.current || !current) return;
    lock.current = true; setError('');
    try {
      const photo = await source();
      stopCamera(); setStep('sending');
      // Refresh GPS after a long pause at the camera; the API requires a recent location.
      const location = Date.now() - current.location.timestamp > 60000 ? await getLocation() : current.location;
      const form = new FormData();
      form.append('requestId', crypto.randomUUID());
      form.append('kind', current.me.open ? 'CHECK_OUT' : 'CHECK_IN');
      if (current.me.open) form.append('attendanceId', current.me.open.id);
      else form.append('customerWorksiteId', current.siteId);
      form.append('latitude', String(location.coords.latitude));
      form.append('longitude', String(location.coords.longitude));
      form.append('accuracyMeters', String(location.coords.accuracy));
      form.append('locationCapturedAt', new Date(location.timestamp).toISOString());
      form.append('selfie', photo, 'selfie.jpg');
      pending.current = form;
      await send(form);
    } catch (error) {
      if (alive.current) { setError(error instanceof Error ? error.message : 'No se pudo tomar la foto.'); setStep('home'); }
    } finally { lock.current = false; }
  }
  async function capture() {
    const v = video.current;
    if (!v?.videoWidth) return;
    await captureImage(async () => {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(1, 1024 / Math.max(v.videoWidth, v.videoHeight));
      canvas.width = Math.round(v.videoWidth * ratio); canvas.height = Math.round(v.videoHeight * ratio);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No se pudo tomar la foto.');
      context.drawImage(v, 0, 0, canvas.width, canvas.height);
      const photo = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .85));
      if (!photo) throw new Error('No se pudo tomar la foto.');
      return photo;
    });
  }
  async function retry() {
    if (lock.current || !pending.current) return;
    lock.current = true; setError(''); setStep('sending');
    try { await send(pending.current); } finally { lock.current = false; }
  }
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true); setError('');
    try { await load(); } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo cargar.'); }
    finally { setRefreshing(false); }
  }

  const site = me?.open?.customerWorksite || me?.worksites.find(site => site.id === siteId);
  const isExit = Boolean(me?.open);
  const last = me?.recent[0];
  const ActionIcon = isExit ? IconLogout : IconLogin;
  if (me?.testMode && !me.referenceReady) return <StagingSetup onReady={load} />;
  return <>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {!me ? <section className={styles.stack}>
      {!error ? <Loading label="Cargando tu asistencia…" /> : <h1>No pudimos abrir tu asistencia</h1>}
      {error ? <button className={styles.primary} disabled={refreshing} onClick={refresh}>{refreshing ? 'Cargando…' : 'VOLVER A INTENTAR'}</button> : null}
    </section> : step === 'locating' || step === 'sending' ?
      <Loading label={step === 'locating' ? 'Buscando tu ubicación…' : 'Registrando…'} /> :
      step === 'sites' ? <section>
        <h1>¿En qué obra estás?</h1><p>El encargado puede ayudarte a elegir.</p>
        <div className={styles.choices}>{me.worksites.map(site => <button key={site.id} className={`${styles.secondary} ${styles.choice}`} onClick={() => {
          rememberSite(me.employee.id, site.id); setSiteId(site.id); setStep('home');
        }}><IconMapPin size={28} aria-hidden="true" /><span>{site.alias || site.worksite.name}<small>{site.customer.name}</small></span></button>)}</div>
        {!me.worksites.length ? <p className={styles.notice}>No hay obras disponibles. Pide ayuda al encargado.</p> : null}
        <button className={styles.link} onClick={() => setStep('home')}>Volver</button>
      </section> : step === 'camera' ? <section>
        <h1>{nativeCamera ? 'Toma una selfie' : 'Mira la cámara'}</h1><p>{nativeCamera ? 'Usa la cámara frontal y evita acercar demasiado el celular.' : 'Aleja el celular hasta que tu cara quepa en el óvalo pequeño. Deja visibles la cabeza completa y los hombros.'}</p>
        {nativeCamera ? <NativeSelfieCapture onPhoto={photo => captureImage(async () => photo)} /> : <>
        <div className={styles.camera}>
          <video ref={video} playsInline muted aria-label="Cámara frontal" onLoadedData={() => setCameraReady(true)} />
          <div className={styles.faceGuide} aria-hidden="true" />
          {!cameraReady ? <div className={styles.cameraLoading} role="status">Abriendo cámara…</div> : null}
        </div>
        <button className={styles.primary} disabled={!cameraReady} onClick={capture}><IconCamera size={32} aria-hidden="true" />TOMAR FOTO</button></>}
        <button className={`${styles.secondary} ${styles.footer}`} onClick={() => { attempt.current = null; setStep('home'); }}>Cancelar</button>
      </section> : step === 'retry' ? <section className={styles.stack}>
        <IconClock size={80} className={styles.stateIcon} aria-hidden="true" /><h1>Falta la confirmación</h1>
        <p>Conservamos esta solicitud mientras mantengas la aplicación abierta.</p>
        <button className={styles.primary} onClick={retry}>VOLVER A INTENTAR</button>
      </section> : step === 'done' && result ? <section className={styles.center} role="status">
        <div className={`${styles.successIcon} ${result.status === 'PENDING' || result.status === 'REJECTED' ? styles.pending : ''}`}>
          {result.status === 'PENDING' || result.status === 'REJECTED' ? <IconClock size={86} aria-hidden="true" /> : <IconCheck size={86} aria-hidden="true" />}
        </div>
        <h1>{result.kind === 'CHECK_IN' ? 'Entrada' : 'Salida'} {result.status === 'PENDING' ? 'sin verificar' : result.status === 'REJECTED' ? 'rechazada' : result.status === 'APPROVED' ? 'aprobada por oficina' : 'verificada'}</h1>
        {result.status === 'PENDING' ? <div className={styles.notice}>
          <strong>{result.reasons.includes('FACE_MISMATCH') ? 'Tu rostro no coincide con la referencia registrada.' : 'Esta marcación necesita revisión.'}</strong>
          <p>No quedó verificada. Oficina debe revisar el registro.</p>
          {result.reasons.filter(reason => reason !== 'FACE_MISMATCH').map(reason => <p key={reason}>{reasonLabels[reason] || 'Validación pendiente'}</p>)}
        </div> : result.status === 'REJECTED' ? <p className={styles.notice}>Habla con el encargado.</p> : result.status === 'APPROVED' ? <p>Marcación aprobada por oficina.</p> : <p>Identidad y ubicación verificadas.</p>}
        <div className={styles.receipt}>{result.customerWorksite.alias || result.customerWorksite.worksite.name}<time dateTime={result.occurredAt}>{shortTime(result.occurredAt)}</time></div>
        <button className={styles.primary} onClick={() => { setStep('home'); setResult(null); }}>LISTO</button>
      </section> : <>
        <div className={styles.greeting}><h1>Hola, {me.employee.name.split(' ')[0]}</h1><p>Tu asistencia</p></div>
        <section className={styles.card}>
          <div className={styles.idle}>
            <IconDoor size={70} stroke={1.7} className={styles.stateIcon} aria-hidden="true" />
            <p className={styles.stateLabel}>{isExit ? 'Tu jornada está abierta' : 'Sin entrada registrada'}</p>
            <button className={`${styles.primary} ${styles.mark} ${isExit ? styles.exit : ''}`} onClick={() => void begin()}>
              <ActionIcon size={68} stroke={1.8} aria-hidden="true" />MARCAR {isExit ? 'SALIDA' : 'ENTRADA'}
            </button>
            <p className={styles.instruction}>Toca el botón y mira la cámara</p>
          </div>
          <div className={styles.site}><IconMapPin size={30} aria-hidden="true" />
            <span className={styles.siteName}>{site ? site.alias || site.worksite.name : 'Elige tu obra'}</span>
            {!isExit ? <button className={styles.link} onClick={() => { setError(''); setStep('sites'); }}>{site ? 'Cambiar' : 'Elegir'}</button> : null}
          </div>
        </section>
        <div className={styles.recent}><IconClock size={34} aria-hidden="true" /><div>
          <span className={styles.muted}>Último registro</span>
          <strong>{last ? `${last.kind === 'CHECK_IN' ? 'Entrada' : 'Salida'} · ${attendanceDate(last.occurredAt)}` : 'Aún no hay marcaciones'}</strong>
          {last?.status === 'PENDING' ? <span>{last.reasons.includes('FACE_MISMATCH') ? 'Sin verificar: el rostro no coincidió. Revisión de oficina pendiente.' : 'Sin verificar. Oficina revisará tu registro.'}</span> : last?.status === 'REJECTED' ? <span>Rechazado. Habla con el encargado.</span> : null}
        </div></div>
      </>}
    {me?.testMode && me.recent.length ? <details className={styles.testDiagnostics}>
      <summary>Datos de mis pruebas ({me.recent.length})</summary>
      <p>Detección e identidad son puntuaciones distintas, no porcentajes de certeza. Radio de la obra de prueba: 200 m.</p>
      {me.recent.map(punch => <TestPunchDetails key={punch.id} punch={punch} />)}
    </details> : null}
  </>;
}

function TestPunchDetails({ punch }: { punch: AttendancePunch }) {
  const score = (value: number | null | undefined) => value == null ? 'Sin dato' : value.toFixed(4);
  return <section className={styles.testDiagnostics}>
    <strong>{punch.kind === 'CHECK_IN' ? 'Entrada' : 'Salida'} · {attendanceDate(punch.occurredAt)}</strong>
    <p>{punch.status === 'VERIFIED' ? 'Verificada' : punch.status === 'PENDING' ? 'Pendiente de revisión' : punch.status}</p>
    <dl>
      <dt>Detección de rostro</dt><dd>{score(punch.detectionScore)} / mín. {score(punch.detectionThreshold)}</dd>
      <dt>Coincidencia de identidad</dt><dd>{score(punch.similarity)} / mín. {score(punch.threshold)}</dd>
      <dt>Distancia a la obra</dt><dd>{punch.distanceMeters == null ? 'Sin dato' : `${punch.distanceMeters.toFixed(1)} m`}</dd>
      <dt>Precisión GPS</dt><dd>±{punch.accuracyMeters.toFixed(1)} m</dd>
    </dl>
    <p>Coordenadas: {punch.latitude.toFixed(6)}, {punch.longitude.toFixed(6)}</p>
    {punch.detectionReprocessedAt ? <p>Detección recalculada desde la evidencia guardada.</p> : null}
    {punch.reasons.map(reason => <p key={reason}>{reasonLabels[reason] || reason}</p>)}
  </section>;
}
