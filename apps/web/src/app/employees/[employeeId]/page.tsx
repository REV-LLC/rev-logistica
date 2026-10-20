'use client';

import { useEffect, useState } from 'react';
import Link from '@/components/PageTransitionLink';
import EmployeePageBackground from '@/components/EmployeePageBackground';
import { useParams } from 'next/navigation';
import { Alert, Button, Container, Skeleton, Stack, Title } from '@mantine/core';
import { IconArrowLeft, IconId, IconPhone, IconTruck } from '@tabler/icons-react';
import EmployeePhotoControl from '@/components/EmployeePhotoControl';
import { api, ApiError } from '@/lib/api';
import { employeeProfileBackground, employeeProfileName, employeeProfileVehicleLabel, type EmployeeProfileIdentity } from '@/lib/employee-profile';
import { employeeRoleLabels } from '@/lib/employee-roles';
import styles from './profile.module.css';
import EmployeeProfileWorkspace from './EmployeeProfileWorkspace';

type ProfileState =
  | { status: 'loading' }
  | { status: 'ready'; employee: EmployeeProfileIdentity }
  | { status: 'missing' }
  | { status: 'error' };

export default function EmployeeProfilePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  return <EmployeeProfile key={employeeId} employeeId={employeeId} />;
}

function EmployeeProfile({ employeeId }: { employeeId: string }) {
  const [state, setState] = useState<ProfileState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const backgroundSrc = employeeProfileBackground(state.status === 'ready' ? state.employee.role : undefined);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    api<EmployeeProfileIdentity>(`/employees/${encodeURIComponent(employeeId)}`, { signal: controller.signal })
      .then(employee => { if (!controller.signal.aborted) setState({ status: 'ready', employee }); })
      .catch(cause => {
        if (!controller.signal.aborted) setState({ status: cause instanceof ApiError && [400, 404].includes(cause.status) ? 'missing' : 'error' });
      });
    return () => controller.abort();
  }, [employeeId, attempt]);

  return <Container className={styles.page} data-page-loading={state.status === 'loading' ? 'true' : 'false'} fluid px={{ base: 8, sm: 24 }} py={{ base: 16, sm: 40 }}>
    <EmployeePageBackground src={backgroundSrc} variant={state.status === 'ready' && state.employee.role === 'DRIVER' ? 'transport' : undefined} />
    <Stack gap={20}>
      <Button component={Link} href="/employees" className={styles.backLink} variant="subtle" leftSection={<IconArrowLeft size={18} />} w="fit-content">Empleados</Button>
      {state.status === 'loading' ? <section className={styles.identity} aria-busy="true" aria-label="Cargando perfil del empleado">
        <div className={styles.portrait}><Skeleton circle width={200} height={200} style={{ flexShrink: 0 }} /></div>
        <Skeleton height={38} width="min(420px, 100%)" />
      </section> : null}
      {state.status === 'ready' ? <section className={styles.identity} aria-labelledby="employee-profile-name">
        <div className={styles.portrait}><EmployeePhotoControl employee={state.employee} size={200} fullSize editable /></div>
        <div className={styles.details}>
          <Title order={1} id="employee-profile-name" className={styles.name}>{employeeProfileName(state.employee)}</Title>
          <div className={styles.contact}>
            <div className={styles.contactLine}><IconId size={18} stroke={1.5} aria-hidden /><span>{state.employee.documentId?.trim() ? `Documento · ${state.employee.documentId.trim()}` : 'Documento sin registrar'}</span></div>
            <div className={styles.contactLine}><IconPhone size={18} stroke={1.5} aria-hidden /><span>{state.employee.phone?.trim() || 'Teléfono sin registrar'}</span></div>
          </div>
          <div className={styles.subtitle}>
            <span>{employeeRoleLabels[state.employee.role] ?? 'Empleado'}</span>
            {state.employee.role === 'DRIVER' ? state.employee.vehicles.length ? state.employee.vehicles.map(vehicle =>
              <span key={vehicle.id} className={styles.vehicle}><IconTruck size={18} stroke={1.5} aria-hidden />{employeeProfileVehicleLabel(vehicle)}</span>
            ) : <span>Sin camión asignado</span> : null}
          </div>
        </div>
      </section> : null}
      {state.status === 'ready' ? <EmployeeProfileWorkspace key={state.employee.id} employeeId={state.employee.id} /> : null}
      {state.status === 'missing' ? <Alert color="red" title="Empleado no disponible" role="alert">No se encontró el empleado de este enlace.</Alert> : null}
      {state.status === 'error' ? <Alert color="red" title="No se pudo cargar el perfil" role="alert">
        Comprueba la conexión e intenta de nuevo.
        <Button variant="subtle" onClick={() => setAttempt(value => value + 1)}>Reintentar</Button>
      </Alert> : null}
    </Stack>
  </Container>;
}
