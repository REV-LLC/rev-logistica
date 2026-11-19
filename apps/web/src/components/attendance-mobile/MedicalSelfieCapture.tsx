'use client';

import { useEffect, useRef, useState } from 'react';
import NativeSelfieCapture, { useNativeSelfieCamera } from './NativeSelfieCapture';
import { useCameraViewport } from './useCameraViewport';
import styles from './mobile-attendance.module.css';

export default function MedicalSelfieCapture({ onPhoto }: { onPhoto: (photo: Blob) => void }) {
  const native = useNativeSelfieCamera(), video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const region = useCameraViewport(!native, ready);
  useEffect(() => {
    if (native) return;
    let cancelled = false, stream: MediaStream | undefined;
    setError(''); setReady(false);
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 960 } } });
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
      } catch { if (!cancelled) setError('No pudimos abrir la cámara. Revisa el permiso y vuelve a intentar.'); }
    })();
    return () => { cancelled = true; stream?.getTracks().forEach(track => track.stop()); };
  }, [native, attempt]);
  async function capture() {
    const frame = video.current;
    if (!frame?.videoWidth) return;
    const canvas = document.createElement('canvas'), ratio = Math.min(1, 1024 / Math.max(frame.videoWidth, frame.videoHeight));
    canvas.width = Math.round(frame.videoWidth * ratio); canvas.height = Math.round(frame.videoHeight * ratio);
    const context = canvas.getContext('2d');
    if (!context) { setError('No pudimos preparar la foto. Vuelve a intentar.'); return; }
    context.drawImage(frame, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .85));
    if (blob) onPhoto(blob); else setError('No pudimos tomar la foto. Vuelve a intentar.');
  }
  if (native) return <NativeSelfieCapture onPhoto={async photo => onPhoto(photo)} />;
  return <div ref={region} className={styles.cameraViewport}>
    {error ? <><p className={styles.error} role="alert">{error}</p><button type="button" className={styles.secondary} onClick={() => setAttempt(value => value + 1)}>Reintentar cámara</button></> : null}
    <div className={styles.camera}><video ref={video} muted playsInline onLoadedData={() => setReady(true)} aria-label="Selfie para incapacidad" />{!ready ? <div className={styles.cameraLoading} role="status">Abriendo cámara…</div> : null}</div>
    <button type="button" className={styles.primary} disabled={!ready} onClick={() => void capture()}>TOMAR FOTO</button>
  </div>;
}
