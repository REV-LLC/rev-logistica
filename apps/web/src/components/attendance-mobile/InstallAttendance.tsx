'use client';

import { useEffect, useState } from 'react';
import styles from './mobile-attendance.module.css';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function InstallAttendance() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [instructions, setInstructions] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const display = window.matchMedia('(display-mode: standalone)');
    const check = () => setInstalled(display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    check();
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    const beforeInstall = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const afterInstall = () => { setInstalled(true); setPrompt(null); setInstructions(false); };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', afterInstall);
    display.addEventListener('change', check);
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', afterInstall);
      display.removeEventListener('change', check);
    };
  }, []);
  async function install() {
    if (!prompt) { setInstructions(value => !value); return; }
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') setInstructions(false);
    } catch { setInstructions(true); }
    finally { setPrompt(null); }
  }
  if (installed) return null;
  return <footer className={styles.footer}>
    <button className={styles.link} onClick={install} aria-expanded={instructions}>Instalar en mi celular</button>
    {instructions ? <p role="status">{ios ? 'Pide al encargado que abra esta pantalla en Safari, toque Compartir y «Añadir a pantalla de inicio».' : 'Pide al encargado que abra el menú del navegador y toque «Instalar aplicación» o «Añadir a pantalla de inicio».'}</p> : null}
  </footer>;
}
