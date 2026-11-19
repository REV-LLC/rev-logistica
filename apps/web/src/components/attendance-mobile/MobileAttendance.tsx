'use client';

import { getAttendanceLocation as getLocation } from '@/lib/attendance-geolocation';
import MiRevMedicalLeave from './MiRevMedicalLeave';
import dynamic from 'next/dynamic';
import { useCameraViewport } from './useCameraViewport';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { IconCamera, IconCheck, IconClock, IconDoor, IconHelpCircle, IconLoader2, IconLogin, IconLogout, IconMapPin, IconVolume } from '@tabler/icons-react';
import { api, ApiError } from '@/lib/api';
import { clearToken, getToken, isTokenExpired, setToken } from '@/lib/auth';
import { reasonLabels, type AttendancePunch, type AttendanceShift, type AttendanceSite } from '@/lib/attendance';
import NativeSelfieCapture, { useNativeSelfieCamera } from './NativeSelfieCapture';
import InstallAttendance from './InstallAttendance';
import AttendanceWorksitePicker from './AttendanceWorksitePicker';
import FaceEnrollmentGate from './FaceEnrollmentGate';
import MiRevEmployeeProfile, { MiRevEmployeeProvider, MiRevProfileButton } from './MiRevEmployeeProfile';
import { hasPriorDayShift, suggestAttendanceSite } from '@/lib/attendance-mobile-rules';
import styles from './mobile-attendance.module.css';

const MiRevOffice = dynamic(() => import('./MiRevOffice'), { loading: () => <p role="status">Cargando empleados…</p> });

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
function shortTime(date: string) {
  return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' }).format(new Date(date));
}

export default function MobileAttendance({ view = 'attendance' }: { view?: 'attendance' | 'profile' | 'office' }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [help, setHelp] = useState(false);
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setToday(new Date());
    update();
    const timer = window.setInterval(update, 30000);
    document.addEventListener('visibilitychange', update);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, []);
  useEffect(() => { setSignedIn(Boolean(getToken() && !isTokenExpired(getToken()))); }, []);
  const expired = useCallback(() => { clearToken(); setSignedIn(false); }, []);

  return <MiRevEmployeeProvider enabled={signedIn === true} onExpired={expired}><main className={styles.page}>
    <div className={`${styles.screen} ${view !== 'attendance' ? styles.profileScreen : ''}`}>
      <header className={styles.header}>
        <a href="/attendance/mobile" className={styles.brand} aria-label="Inicio de MiREV"><img className={styles.logo} src="/fiesta.svg?v=silver" alt="REV" width="108" height="54" /><span>MiREV</span></a>
        <div className={styles.headerActions}><button className={`${styles.link} ${styles.help}`} onClick={() => setHelp(value => !value)} aria-expanded={help} aria-controls="attendance-help">
          <IconHelpCircle size={25} aria-hidden="true" /><span>Ayuda</span>
        </button>
        {signedIn ? <MiRevProfileButton active={view === 'profile'} /> : null}</div>
      </header>
      {today ? <p className={styles.today}><time dateTime={today.toISOString()}>{new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' }).format(today)}</time></p> : null}
      {signedIn === null ? <Loading label="Un momento…" /> : signedIn ?
        <FaceEnrollmentGate onExpired={expired}>{view === 'office' ? <MiRevOffice /> : view === 'profile' ? <MiRevEmployeeProfile /> : <Attendance onExpired={expired} today={today} />}</FaceEnrollmentGate> : <Login onLogin={() => setSignedIn(true)} />}
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
  </main></MiRevEmployeeProvider>;
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
    <div className={styles.greeting}><h1>Mi asistencia</h1><p>Ingresa para registrar tu jornada.</p></div>
    <form className={styles.stack} onSubmit={login} aria-busy={busy}>
      <label>Usuario o cédula<input name="identifier" autoComplete="username" autoCapitalize="none" spellCheck={false} required /></label>
      <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <button className={styles.primary} disabled={busy}>{busy ? 'Ingresando…' : 'INGRESAR'}<IconLogin aria-hidden="true" /></button>
    </form>
  </section>;
}

function Attendance({ onExpired, today }: { onExpired: () => void; today: Date | null }) {
  const nativeCamera = useNativeSelfieCamera();
  const [me, setMe] = useState<Me | null>(null);
  const [siteId, setSiteId] = useState('');
  const [suggestion, setSuggestion] = useState<'idle' | 'checking' | 'found' | 'none'>('idle');
  const manualSite = useRef(false);
  const suggestionVersion = useRef(0);
  const suggestionBusy = useRef(false);
  const atHome = useRef(true);
  const [step, setStep] = useState<Step>('home');
  useEffect(() => { atHome.current = step === 'home'; }, [step]);
  const [error, setError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRegion = useCameraViewport(step === 'camera' && !nativeCamera, cameraReady);
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
    if (alive.current) { setMe(data); setSiteId(current => data.open ? data.open.customerWorksite.id : data.worksites.some(site => site.id === current) ? current : ''); }
    return data;
  }, [request]);
  const suggestSite = useCallback(async (data: Me) => {
    if (data.open || manualSite.current || suggestionBusy.current) return;
    const version = ++suggestionVersion.current;
    suggestionBusy.current = true;
    setSuggestion('checking');
    try {
      const position = await getLocation();
      if (!alive.current || manualSite.current || version !== suggestionVersion.current || !atHome.current) return;
      const suggested = suggestAttendanceSite(data.worksites, { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp });
      setSiteId(suggested || '');
      setSuggestion(suggested ? 'found' : 'none');
    } catch {
      if (alive.current && !manualSite.current && version === suggestionVersion.current) { setSiteId(''); setSuggestion('none'); }
    } finally { suggestionBusy.current = false; }
  }, []);
  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
  }, []);
  useEffect(() => {
    alive.current = true;
    const refreshHome = (event?: Event) => {
      if (document.hidden || !atHome.current || lock.current) return;
      if (event) manualSite.current = false;
      void load().then(suggestSite).catch(error => { if (alive.current) setError(error instanceof Error ? error.message : 'No se pudo cargar tu asistencia.'); });
    };
    refreshHome();
    document.addEventListener('visibilitychange', refreshHome);
    window.addEventListener('pageshow', refreshHome);
    return () => { alive.current = false; document.removeEventListener('visibilitychange', refreshHome); window.removeEventListener('pageshow', refreshHome); stopCamera(); void audio.current?.close().catch(() => undefined); audio.current = null; };
  }, [load, stopCamera, suggestSite]);
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
    suggestionVersion.current++; setSuggestion('idle');
    lock.current = true; setStep('locating');
    try {
      const fresh = await load();
      if ((me?.open?.id || null) !== (fresh.open?.id || null)) { setError('Tu jornada cambió. Revisa el botón y vuelve a marcar.'); setStep('home'); return; }
      const nextSite = fresh.open?.customerWorksite.id || (fresh.worksites.some(site => site.id === chosenSite) ? chosenSite : '');
      if (!nextSite) { setStep('sites'); return; }
      setSiteId(nextSite);
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

  const ActionIcon = isExit ? IconLogout : IconLogin;
  const overdue = Boolean(me?.open && today && hasPriorDayShift(me.open.enteredAt, today));
  return <>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {!me ? <section className={styles.stack}>
      {!error ? <Loading label="Cargando tu asistencia…" /> : <h1>No pudimos abrir tu asistencia</h1>}
      {error ? <button className={styles.primary} disabled={refreshing} onClick={refresh}>{refreshing ? 'Cargando…' : 'VOLVER A INTENTAR'}</button> : null}
    </section> : step === 'locating' || step === 'sending' ?
      <Loading label={step === 'locating' ? 'Buscando tu ubicación…' : 'Registrando…'} /> :
      step === 'sites' ? <AttendanceWorksitePicker sites={me.worksites} onSelect={site => {
        manualSite.current = true; suggestionVersion.current++; setSuggestion('idle'); setSiteId(site.id); setStep('home');
      }} onBack={() => setStep('home')} /> : step === 'camera' ? <section>
        <div className={styles.greeting}><h1>{nativeCamera ? 'Toma una selfie' : 'Mira la cámara'}</h1><p>{nativeCamera ? 'Usa la cámara frontal y evita acercar demasiado el celular.' : 'Deja visibles la cabeza completa y los hombros.'}</p></div>
        {nativeCamera ? <NativeSelfieCapture onPhoto={photo => captureImage(async () => photo)} /> : <div ref={cameraRegion} className={styles.cameraViewport}>
        <div className={styles.camera}>
          <video ref={video} playsInline muted aria-label="Cámara frontal" onLoadedData={() => setCameraReady(true)} />
          <div className={styles.faceGuide} aria-hidden="true" /><span className={styles.cameraHint}>Aleja el celular hasta encajar en el óvalo</span>
          {!cameraReady ? <div className={styles.cameraLoading} role="status">Abriendo cámara…</div> : null}
        </div>
        <button className={styles.primary} disabled={!cameraReady} onClick={capture}><IconCamera size={32} aria-hidden="true" />TOMAR FOTO</button></div>}
        <button className={`${styles.secondary} ${styles.footer}`} onClick={() => { attempt.current = null; setStep('home'); }}>Cancelar</button>
      </section> : step === 'retry' ? <section className={styles.stack}>
        <IconClock size={80} className={styles.stateIcon} aria-hidden="true" /><h1>Falta la confirmación</h1>
        <p>Conservamos esta solicitud mientras mantengas la aplicación abierta.</p>
        <button className={styles.primary} onClick={retry}>VOLVER A INTENTAR</button>
      </section> : step === 'done' && result ? <section className={styles.center} role="status">
        <div className={`${styles.successIcon} ${result.status === 'REJECTED' ? styles.rejected : result.status === 'PENDING' ? styles.pending : ''}`}>
          {result.status === 'PENDING' || result.status === 'REJECTED' ? <IconClock size={86} aria-hidden="true" /> : <IconCheck size={86} aria-hidden="true" />}
        </div>
        <h1>{result.kind === 'CHECK_IN' ? 'Entrada' : 'Salida'} {result.status === 'PENDING' ? 'pendiente de revisión' : result.status === 'REJECTED' ? 'rechazada' : 'registrada'}</h1>
        {result.status === 'PENDING' ? <div className={styles.notice}>
          <strong>{result.reasons.includes('FACE_MISMATCH') ? 'Tu rostro no coincide con la referencia registrada.' : 'Esta marcación necesita revisión.'}</strong>
          <p>No quedó verificada. Oficina debe revisar el registro.</p>
          {result.reasons.filter(reason => reason !== 'FACE_MISMATCH').map(reason => <p key={reason}>{reasonLabels[reason] || 'Validación pendiente'}</p>)}
        </div> : result.status === 'REJECTED' ? <p className={styles.notice}>Habla con el encargado.</p> : result.status === 'APPROVED' ? <p>Marcación aprobada por oficina.</p> : <p>Identidad y ubicación verificadas.</p>}
        <div className={styles.receipt}><IconMapPin size={24} aria-hidden="true" /><strong>{result.customerWorksite.alias || result.customerWorksite.worksite.name}</strong><time dateTime={result.occurredAt}>{shortTime(result.occurredAt)}</time></div>
        <button className={styles.primary} onClick={() => { setStep('home'); setResult(null); }}>LISTO</button>
      </section> : <>
        <div className={styles.greeting} data-page-heading-glass><h1>Mi asistencia</h1><p>Hola, {me.employee.name.split(' ')[0]}</p></div>
        {overdue ? <p className={styles.notice} role="status">Tienes una jornada de un día anterior sin cerrar. Marca la salida para poder registrar una nueva entrada.</p> : null}
        <section className={styles.card} aria-label="Registrar asistencia">
          <div className={styles.idle}>
            <IconDoor size={48} stroke={1.7} className={styles.stateIcon} aria-hidden="true" />
            <p className={styles.stateLabel}>{overdue ? 'Falta cerrar tu jornada anterior' : isExit ? 'Tu jornada está abierta' : 'Sin entrada registrada'}</p>
            {me.open ? <p className={styles.shiftTime}>Entrada {overdue ? new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', timeZone: 'America/Bogota' }).format(new Date(me.open.enteredAt)) + ' · ' : 'a las '}{shortTime(me.open.enteredAt)}</p> : null}
            <button className={`${styles.primary} ${styles.mark} ${isExit ? styles.exit : styles.entry}`} onClick={() => void begin()}>
              <ActionIcon size={40} stroke={1.8} aria-hidden="true" />MARCAR {isExit ? 'SALIDA' : 'ENTRADA'}
            </button>
            <p className={styles.instruction}>Toca el botón y mira la cámara</p>
          </div>
          <div className={styles.site}><IconMapPin size={26} aria-hidden="true" />
            <div className={styles.siteName}><span>{!isExit && suggestion === 'found' ? 'Obra sugerida' : 'Obra'}</span><strong>{site ? site.alias || site.worksite.name : 'Elige tu obra'}</strong></div>
            {!isExit ? <button className={styles.link} onClick={() => { setError(''); setSuggestion('idle'); suggestionVersion.current++; setStep('sites'); }}>{site ? 'Cambiar' : 'Elegir'}</button> : null}
          </div>
          {!isExit ? <p className={styles.siteHint} role="status">{suggestion === 'checking' ? 'Buscando una obra cercana…' : suggestion === 'found' ? 'Sugerida por tu ubicación. Confirma que estás en esta obra antes de marcar.' : !site ? 'Selecciona la obra donde estás.' : 'Verifica la obra antes de marcar.'}</p> : null}
        </section>
        <MiRevMedicalLeave today={today} />
      </>}

  </>;
}
