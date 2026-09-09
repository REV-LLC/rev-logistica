'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import styles from './LoginTransition.module.css';

const LoginTransitionContext = createContext<() => void>(() => {});

export const useLoginTransition = () => useContext(LoginTransitionContext);

export default function LoginTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const begin = useCallback(() => {
    setLeaving(false);
    setStartedAt(Date.now());
  }, []);

  useEffect(() => {
    if (startedAt === null || pathname === '/login') return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setLeaving(true),
      Math.max(0, (reducedMotion ? 0 : 800) - (Date.now() - startedAt)));
    return () => window.clearTimeout(timer);
  }, [pathname, startedAt]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setStartedAt(null), 380);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  // A failed or cancelled navigation must never leave the application covered.
  useEffect(() => {
    if (startedAt === null) return;
    const timer = window.setTimeout(() => setStartedAt(null), 12000);
    return () => window.clearTimeout(timer);
  }, [startedAt]);

  return (
    <LoginTransitionContext.Provider value={begin}>
      <div inert={startedAt !== null ? true : undefined}>{children}</div>
      {startedAt !== null && (
        <div className={styles.overlay} data-leaving={leaving} role="status" aria-live="polite" aria-label="Preparando tu espacio de trabajo">
          <div className={styles.content}>
            <Image src="/rev-logo-clean.svg" alt="REV Logística" width={160} height={160} priority />
            <p className={styles.title}>Todo listo para continuar</p>
            <p className={styles.subtitle}>Preparando tu espacio de trabajo</p>
            <div className={styles.track} aria-hidden="true"><span /></div>
          </div>
        </div>
      )}
    </LoginTransitionContext.Provider>
  );
}
