'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { employeeWorkspaceTab } from '@/lib/employee-profile';
import { FloatingIndicator, Group, Loader, Tabs, Text } from '@mantine/core';
import { IconCalendarEvent, IconCurrencyDollar, IconReceipt } from '@tabler/icons-react';
import styles from './workspace.module.css';

function PanelLoading() {
  return <Group gap="sm" role="status"><Loader size="sm" /><Text size="sm">Cargando…</Text></Group>;
}

const PayrollPanel = dynamic(() => import('../payroll/EmployeePayrollPanel'), { loading: PanelLoading });
const LoansPanel = dynamic(() => import('./loans/EmployeeLoansPanel'), { loading: PanelLoading });
const ActivitiesPanel = dynamic(() => import('../activities/EmployeeActivitiesPanel'), { loading: PanelLoading });

export default function EmployeeProfileWorkspace({ employeeId, selfService = false }: { employeeId: string; selfService?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [selection, setSelection] = useState<{ requestedTab: string | null; tab: string } | null>(null);
  const defaultTab = employeeWorkspaceTab(requestedTab, selfService);
  const tab = selection?.requestedTab === requestedTab ? selection.tab : defaultTab;
  const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
  const [payrollElement, setPayrollElement] = useState<HTMLButtonElement | null>(null);
  const [loansElement, setLoansElement] = useState<HTMLButtonElement | null>(null);
  const [activitiesElement, setActivitiesElement] = useState<HTMLButtonElement | null>(null);
  const activeElement = tab === 'payroll' ? payrollElement : tab === 'loans' ? loansElement : activitiesElement;
  return <section className={styles.workspace} aria-label="Gestión del empleado">
    <Tabs value={tab} onChange={value => {
      if (!value || (selfService && value === 'payroll')) return;
      setSelection({ requestedTab, tab: value });
      if (selfService) router.replace(`/profile?tab=${value}`, { scroll: false });
    }} variant="unstyled" keepMounted={false} classNames={{ list: styles.list, tab: styles.tab, tabSection: styles.tabSection, tabLabel: styles.tabLabel, panel: styles.panel }}>
      <Tabs.List ref={setListElement} aria-label="Secciones del empleado">
        <FloatingIndicator target={activeElement} parent={listElement} transitionDuration={260} className={styles.indicator} aria-hidden="true" />
        {!selfService ? <Tabs.Tab ref={setPayrollElement} value="payroll" leftSection={<IconReceipt size={18} aria-hidden />}>Nómina</Tabs.Tab> : null}
        <Tabs.Tab ref={setLoansElement} value="loans" leftSection={<IconCurrencyDollar size={18} aria-hidden />}>Préstamos</Tabs.Tab>
        <Tabs.Tab ref={setActivitiesElement} value="activities" leftSection={<IconCalendarEvent size={18} aria-hidden />}>Bitácora</Tabs.Tab>
      </Tabs.List>
      {!selfService ? <Tabs.Panel value="payroll"><PayrollPanel key={employeeId} employeeId={employeeId} embedded /></Tabs.Panel> : null}
      <Tabs.Panel value="loans"><LoansPanel key={employeeId} employeeId={employeeId} embedded selfService={selfService} /></Tabs.Panel>
      <Tabs.Panel value="activities"><ActivitiesPanel key={employeeId} requestedEmployeeId={employeeId} embedded selfService={selfService} /></Tabs.Panel>
    </Tabs>
  </section>;
}
