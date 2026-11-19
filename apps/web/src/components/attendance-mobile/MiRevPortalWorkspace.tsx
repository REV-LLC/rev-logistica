'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { FloatingIndicator, Tabs } from '@mantine/core';
import { IconCalendarEvent, IconCurrencyDollar, IconFiles } from '@tabler/icons-react';
import { api, apiBlob } from '@/lib/api';
import workspace from '@/app/employees/[employeeId]/workspace.module.css';
import styles from './mobile-attendance.module.css';

const LoansPanel = dynamic(() => import('@/app/employees/[employeeId]/loans/EmployeeLoansPanel'), { loading: () => <p role="status">Cargando préstamos…</p> });
const ActivitiesPanel = dynamic(() => import('@/app/employees/activities/EmployeeActivitiesPanel'), { loading: () => <p role="status">Cargando bitácora…</p> });
type Document = { id: string; category: string | null; displayName: string | null; originalName: string | null; expiresAt: string | null };
const categoryLabels: Record<string, string> = { HOJA_VIDA: 'Hoja de vida', CEDULA: 'Cédula', ARL: 'ARL', EPS: 'EPS', CURSO_ALTURAS: 'Curso de alturas', CONTRATO: 'Contrato', CERTIFICADO: 'Certificado', OTRO: 'Otro documento' };

function DocumentsPanel() {
  const [documents, setDocuments] = useState<Document[] | null>(null), [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0), [downloading, setDownloading] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    api<Document[]>('/employee-portal/documents', { signal: controller.signal, cache: 'no-store' })
      .then(data => { if (!controller.signal.aborted) setDocuments(data); })
      .catch(() => { if (!controller.signal.aborted) setError('No pudimos cargar tus documentos.'); });
    return () => controller.abort();
  }, [attempt]);
  async function download(file: Document) {
    if (downloading) return;
    setDownloading(file.id); setError('');
    try {
      const blob = await apiBlob(`/employee-portal/documents/${file.id}/download`, { cache: 'no-store' });
      const url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = file.originalName || file.displayName || 'documento';
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { setError('No pudimos descargar el documento. Vuelve a intentar o contacta a oficina.'); }
    finally { setDownloading(null); }
  }
  return <div className={styles.stack}>
    <h2>Mis documentos</h2><p>Consulta los documentos de tu perfil registrados por oficina.</p>
    {error ? <div role="alert"><p className={styles.error}>{error}</p>{documents === null ? <button className={styles.secondary} onClick={() => setAttempt(value => value + 1)}>Reintentar</button> : null}</div> : null}
    {!documents && !error ? <p role="status">Cargando documentos…</p> : documents?.length === 0 ? <p>Aún no tienes documentos cargados. Contacta a oficina para agregarlos.</p> : null}
    {documents ? <ul className={styles.documentList}>{documents.map(file => <li key={file.id} className={styles.documentRow}>
      <strong>{file.displayName || file.originalName || categoryLabels[file.category || ''] || 'Documento'}</strong>
      <p>{categoryLabels[file.category || ''] || 'Documento'}{file.expiresAt ? ` · Vence ${new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC' }).format(new Date(file.expiresAt))}` : ''}</p>
      <button className={styles.secondary} disabled={downloading !== null} onClick={() => void download(file)}>{downloading === file.id ? 'Descargando…' : 'Descargar'}</button>
    </li>)}</ul> : null}
  </div>;
}

export default function MiRevPortalWorkspace({ employeeId }: { employeeId: string }) {
  const router = useRouter(), params = useSearchParams();
  const [list, setList] = useState<HTMLDivElement | null>(null);
  const [documentsTab, setDocumentsTab] = useState<HTMLButtonElement | null>(null);
  const [loansTab, setLoansTab] = useState<HTMLButtonElement | null>(null);
  const [activitiesTab, setActivitiesTab] = useState<HTMLButtonElement | null>(null);
  const requested = params.get('tab');
  const tab = ['documents', 'activities', 'loans'].includes(requested || '') ? requested! : 'documents';
  return <section className={workspace.workspace} aria-label="Gestión del empleado">
    <Tabs value={tab} onChange={value => { if (value) router.replace(`/attendance/mobile/profile?tab=${value}`, { scroll: false }); }} keepMounted={false} variant="unstyled" classNames={{ list: workspace.list, tab: workspace.tab, tabSection: workspace.tabSection, tabLabel: workspace.tabLabel }}>
      <Tabs.List ref={setList} className={styles.portalTabs} aria-label="Secciones de mi perfil">
        <FloatingIndicator target={tab === 'documents' ? documentsTab : tab === 'loans' ? loansTab : activitiesTab} parent={list} transitionDuration={260} className={workspace.indicator} aria-hidden="true" />
        <Tabs.Tab ref={setDocumentsTab} value="documents" leftSection={<IconFiles size={18} />}>Mis documentos</Tabs.Tab>
        <Tabs.Tab ref={setLoansTab} value="loans" leftSection={<IconCurrencyDollar size={18} />}>Préstamos</Tabs.Tab>
        <Tabs.Tab ref={setActivitiesTab} value="activities" leftSection={<IconCalendarEvent size={18} />}>Bitácora</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="documents" className={styles.portalPanel}><DocumentsPanel /></Tabs.Panel>
      <Tabs.Panel value="loans" className={styles.portalPanel}><LoansPanel employeeId={employeeId} embedded selfService /></Tabs.Panel>
      <Tabs.Panel value="activities" className={styles.portalPanel}><ActivitiesPanel requestedEmployeeId={employeeId} embedded selfService /></Tabs.Panel>
    </Tabs>
  </section>;
}
