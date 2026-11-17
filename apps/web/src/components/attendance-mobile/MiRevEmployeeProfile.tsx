'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { IconLoader2, IconUserCircle } from '@tabler/icons-react';
import EmployeeAvatar from '@/components/EmployeeAvatar';
import { api, ApiError } from '@/lib/api';
import { employeeProfileName, type EmployeeProfileIdentity } from '@/lib/employee-profile';
import styles from './mobile-attendance.module.css';

type ProfileState = { status: 'loading' } | { status: 'ready'; employee: EmployeeProfileIdentity } | { status: 'error'; missing: boolean };
const ProfileContext = createContext<{ state: ProfileState; retry: () => void } | null>(null);
const EmployeeProfile = dynamic(() => import('@/components/EmployeeProfile'), { loading: () => <p role="status">Cargando tu perfil…</p> });

export function MiRevEmployeeProvider({ enabled, onExpired, children }: { enabled: boolean; onExpired: () => void; children: ReactNode }) {
  const [state, setState] = useState<ProfileState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    if (!enabled) { setState({ status: 'loading' }); return; }
    const controller = new AbortController();
    setState({ status: 'loading' });
    // The server resolves the linked employee; never accept an employee ID from the route.
    api<EmployeeProfileIdentity>('/employee-portal/profile', { signal: controller.signal, cache: 'no-store', redirectOnAuthError: false })
      .then(employee => { if (!controller.signal.aborted) setState({ status: 'ready', employee }); })
      .catch(error => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) { onExpired(); return; }
        setState({ status: 'error', missing: error instanceof ApiError && error.status === 404 });
      });
    return () => controller.abort();
  }, [enabled, attempt, onExpired]);
  return <ProfileContext.Provider value={{ state, retry }}>{children}</ProfileContext.Provider>;
}

export function MiRevProfileButton({ active }: { active: boolean }) {
  const context = useContext(ProfileContext);
  const employee = context?.state.status === 'ready' ? context.state.employee : null;
  return <Link href="/attendance/mobile/profile" className={styles.profileButton} aria-label={employee ? `Mi perfil: ${employeeProfileName(employee)}` : 'Mi perfil'} aria-current={active ? 'page' : undefined} title="Mi perfil">
    {employee ? <EmployeeAvatar employee={employee} size={40} /> : <IconUserCircle size={32} stroke={1.5} aria-hidden="true" />}
  </Link>;
}

export default function MiRevEmployeeProfile() {
  const context = useContext(ProfileContext);
  if (!context || context.state.status === 'loading') return <div className={styles.profileLoading} role="status"><IconLoader2 className={styles.spinner} size={28} aria-hidden="true" />Cargando tu perfil…</div>;
  if (context.state.status === 'error') return <section className={styles.stack}>
    <Link href="/attendance/mobile" className={styles.link}>Volver a mi asistencia</Link>
    <h1>Mi perfil</h1>
    <p className={styles.error} role="alert">{context.state.missing ? 'No tienes un empleado activo vinculado a esta cuenta. Contacta a oficina.' : 'No pudimos cargar tu perfil. Revisa la conexión y vuelve a intentar.'}</p>
    <button className={styles.secondary} onClick={context.retry}>Reintentar</button>
  </section>;
  return <div className={styles.profileView}><EmployeeProfile selfService portalBasePath="/attendance/mobile" initialEmployee={context.state.employee} /></div>;
}
