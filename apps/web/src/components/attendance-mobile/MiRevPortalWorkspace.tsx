'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { FloatingIndicator, Tabs } from '@mantine/core';
import { IconCalendarEvent, IconCurrencyDollar, IconFiles } from '@tabler/icons-react';
import workspace from '@/app/employees/[employeeId]/workspace.module.css';
import styles from './mobile-attendance.module.css';

const DocumentsPanel = dynamic(() => import('@/components/employees/EmployeeOwnDocumentsPanel'), { loading: () => <p role="status">Cargando documentos…</p> });
const LoansPanel = dynamic(() => import('@/app/employees/[employeeId]/loans/EmployeeLoansPanel'), { loading: () => <p role="status">Cargando préstamos…</p> });
const ActivitiesPanel = dynamic(() => import('@/app/employees/activities/EmployeeActivitiesPanel'), { loading: () => <p role="status">Cargando bitácora…</p> });

export default function MiRevPortalWorkspace({ employeeId }: { employeeId: string }) {
  const router = useRouter(), params = useSearchParams();
  const [list, setList] = useState<HTMLDivElement | null>(null);
  const [documentsTab, setDocumentsTab] = useState<HTMLButtonElement | null>(null);
  const [loansTab, setLoansTab] = useState<HTMLButtonElement | null>(null);
  const [activitiesTab, setActivitiesTab] = useState<HTMLButtonElement | null>(null);
  const requested = params.get('tab');
  const tab = ['documents', 'activities', 'loans'].includes(requested || '') ? requested! : 'documents';
  return <section className={workspace.workspace} aria-label="Gestión del empleado">
    <Tabs value={tab} onChange={value => { if (value) router.replace(`/attendance/mobile/profile?tab=${value}`, { scroll: false }); }} keepMounted={false} variant="unstyled" classNames={{ list: workspace.list, tab: styles.portalTab, tabSection: workspace.tabSection, tabLabel: workspace.tabLabel }}>
      <Tabs.List ref={setList} className={styles.portalTabs} aria-label="Secciones de mi perfil">
        <FloatingIndicator target={tab === 'documents' ? documentsTab : tab === 'loans' ? loansTab : activitiesTab} parent={list} transitionDuration={260} className={styles.portalIndicator} aria-hidden="true" />
        <Tabs.Tab ref={setDocumentsTab} value="documents" aria-label="Mis documentos" leftSection={<IconFiles size={14} />}>Documentos</Tabs.Tab>
        <Tabs.Tab ref={setLoansTab} value="loans" leftSection={<IconCurrencyDollar size={14} />}>Préstamos</Tabs.Tab>
        <Tabs.Tab ref={setActivitiesTab} value="activities" leftSection={<IconCalendarEvent size={14} />}>Bitácora</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="documents" className={styles.portalPanel}><DocumentsPanel /></Tabs.Panel>
      <Tabs.Panel value="loans" className={styles.portalPanel}><LoansPanel employeeId={employeeId} embedded selfService /></Tabs.Panel>
      <Tabs.Panel value="activities" className={styles.portalPanel}><ActivitiesPanel requestedEmployeeId={employeeId} embedded selfService /></Tabs.Panel>
    </Tabs>
  </section>;
}
