'use client';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import styles from './mobile-attendance.module.css';

export function useNativeSelfieCamera() {
  const [nativeCamera, setNativeCamera] = useState(false);
  useEffect(() => {
    const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const installed = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setNativeCamera(iphone && installed);
  }, []);
  return nativeCamera;
}

async function normalizeCameraFile(file: File) {
  if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) throw new Error('Toma una foto de menos de 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext('2d');
    if (!context || !canvas.width || !canvas.height) throw new Error('No pudimos leer la foto.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .85));
    if (!blob) throw new Error('No pudimos preparar la selfie.');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

export default function NativeSelfieCapture({ onPhoto }: { onPhoto: (photo: Blob) => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function selected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { const photo = await normalizeCameraFile(file); if (alive.current) await onPhoto(photo); }
    catch (error) { if (alive.current) setError(error instanceof Error ? error.message : 'Vuelve a tomar la selfie.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <div className={styles.stack}>
    <p>Abriremos la cámara del iPhone. Toma una selfie de frente, con la cabeza completa y los hombros visibles. Después toca «Usar foto».</p>
    <label className={`${styles.primary} ${styles.nativeCapture}`}>
      {busy ? 'PREPARANDO FOTO…' : 'ABRIR CÁMARA DEL IPHONE'}
      <input type="file" accept="image/*" capture="user" aria-label="Tomar selfie con la cámara del iPhone" disabled={busy} onChange={selected} />
    </label>

    {error ? <p className={styles.error} role="alert">{error}</p> : null}
  </div>;
}
