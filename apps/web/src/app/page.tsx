'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Badge, Center, Container, Loader, Text } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import AuthGuard from '@/components/AuthGuard';
import ResponsiveShell from '@/components/ResponsiveShell';
import { api } from '@/lib/api';
import { getCurrentUserRole, getCurrentUserSession, type AppRole } from '@/lib/auth';
import styles from './home.module.css';

type Vehicle = { id: string; plate: string; soatVigencia?: string | null; tecnomecanicaVigencia?: string | null; active?: boolean };
type Task = { id: string; title: string; description?: string | null; dueDate?: string | null; status?: 'OPEN' | 'DOING' | 'DONE' | 'DELETED' | null; priority?: 'LOW' | 'MEDIUM' | 'HIGH' | null; assignedToUserId?: string | null };
type RequestDocument = { id: string; consecutive: string | null; type?: string | null; createdAt: string; status?: string | null };
type NotificationReminder = { topicId: string; eventType: string; title: string; message: string; status: 'UPCOMING' | 'DUE' | 'OVERDUE'; unit: 'HOURS' | 'DAYS'; remainingHours?: number; remainingDays?: number; entity: { id: string; type: 'ASSET' | 'VEHICLE'; label: string } };
type PendingVehicle = { id: string; plate: string; document: 'SOAT' | 'Tecnomecánica'; days: number };

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5 || hour >= 19) return 'Buenas noches';
  if (hour < 12) return 'Buenos días';
  return 'Buenas tardes';
}

function todayLabel() {
  return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
}

function userName() {
  const session = getCurrentUserSession();
  return session?.firstName || session?.name?.split(' ')[0] || session?.email?.split('@')[0] || 'Usuario';
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function relativeDate(value?: string | null) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'Vencida';
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return `En ${days} días`;
}

function compactHourDuration(value: number) {
  const totalMinutes = Math.max(0, Math.round(Math.abs(value) * 60));
  if (totalMinutes === 0) return null;

  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return [
      `${days} ${days === 1 ? 'día' : 'días'}`,
      hours > 0 ? `${hours} h` : null,
    ].filter(Boolean).join(' ');
  }

  return [
    hours > 0 ? `${hours} h` : null,
    minutes > 0 ? `${minutes} min` : null,
  ].filter(Boolean).join(' ');
}

function reminderMeta(reminder: NotificationReminder) {
  if (reminder.unit === 'HOURS') {
    const remainingHours = reminder.remainingHours ?? 0;
    const duration = Number.isFinite(remainingHours)
      ? compactHourDuration(remainingHours)
      : null;
    if (!duration) return reminder.status === 'OVERDUE' ? 'Vencido' : 'Ahora';
    return reminder.status === 'OVERDUE'
      ? `Vencido · ${duration}`
      : `${duration} restantes`;
  }

  const remainingDays = Math.abs(Math.round(reminder.remainingDays ?? 0));
  if (remainingDays === 0) return reminder.status === 'OVERDUE' ? 'Vencido' : 'Hoy';
  const dayLabel = remainingDays === 1 ? 'día' : 'días';
  return reminder.status === 'OVERDUE'
    ? `Vencido · ${remainingDays} ${dayLabel}`
    : `${remainingDays} ${dayLabel} restantes`;
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return <section className={styles.section}><header className={styles.sectionHeading}><Text component="h2">{title}</Text>{typeof count === 'number' ? <Text className={styles.sectionCount}>{count}</Text> : null}</header>{children}</section>;
}

function ActionRow({ href, title, detail, meta, tone = 'default' }: { href: string; title: string; detail?: string; meta?: string; tone?: 'default' | 'danger' | 'warning' }) {
  return <Link href={href} className={styles.row} data-tone={tone}><span className={styles.rowCopy}><strong>{title}</strong>{detail ? <span>{detail}</span> : null}</span>{meta ? <span className={styles.rowMeta}>{meta}</span> : <IconArrowRight size={18} />}</Link>;
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <div className={styles.emptyRow}>{children}</div>;
}

export default function HomePage() {
  const role = getCurrentUserRole();
  const session = getCurrentUserSession();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [requests, setRequests] = useState<RequestDocument[]>([]);
  const [notifications, setNotifications] = useState<NotificationReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const results = await Promise.allSettled([
        api<Vehicle[]>('/vehicles'), api<Task[]>('/tasks'), api<RequestDocument[]>('/documents?status=DRAFT&take=200'), api<NotificationReminder[]>('/notifications/reminders/me'),
      ]);
      if (!mounted) return;
      const [vehicleResult, taskResult, requestResult, notificationResult] = results;
      if (vehicleResult.status === 'fulfilled') setVehicles(vehicleResult.value);
      if (taskResult.status === 'fulfilled') setTasks(taskResult.value);
      if (requestResult.status === 'fulfilled') setRequests(requestResult.value);
      if (notificationResult.status === 'fulfilled') setNotifications(notificationResult.value);
      if (results.every((result) => result.status === 'rejected')) setError('No se pudo cargar la información del inicio.');
      setLoading(false);
    };
    void load();
    return () => { mounted = false; };
  }, []);

  const pendingVehicles = useMemo<PendingVehicle[]>(() => vehicles.flatMap((vehicle) => {
    if (vehicle.active === false) return [];
    const documents: PendingVehicle[] = [];
    const soatDays = daysUntil(vehicle.soatVigencia);
    const technicalDays = daysUntil(vehicle.tecnomecanicaVigencia);
    if (soatDays !== null && soatDays <= 30) documents.push({ id: vehicle.id, plate: vehicle.plate, document: 'SOAT', days: soatDays });
    if (technicalDays !== null && technicalDays <= 30) documents.push({ id: vehicle.id, plate: vehicle.plate, document: 'Tecnomecánica', days: technicalDays });
    return documents;
  }).sort((a, b) => a.days - b.days), [vehicles]);
  const activeTasks = useMemo(
    () => tasks.filter((task) => task.status !== 'DONE' && task.status !== 'DELETED'),
    [tasks],
  );
  const myTasks = useMemo(() => session?.sub ? activeTasks.filter((task) => task.assignedToUserId === session.sub) : activeTasks, [activeTasks, session?.sub]);
  const overdue = notifications.filter((item) => item.status === 'OVERDUE');
  const due = notifications.filter((item) => item.status === 'DUE');
  const criticalDamageCount = notifications.filter((item) => /daño|falla|avería/i.test(`${item.title} ${item.message}`) && item.status !== 'UPCOMING').length;
  const roleDescription: Record<AppRole, string> = {
    ADMIN: 'Lo que requiere atención en toda la operación.', OFFICE: 'Lo que tienes pendiente por revisar, aprobar o gestionar.', DRIVER: 'Tu jornada, próximas tareas y alertas asignadas.', OPERATOR: 'Registra y reporta rápidamente desde tu equipo asignado.',
  };
  const adminAttention = [
    { label: 'Mantenimientos y alertas vencidas', value: overdue.length, href: '/notifications/deliveries', tone: 'danger' as const },
    { label: 'Documentos de vehículos por vencer', value: pendingVehicles.length, href: '/transport/vehicles', tone: 'warning' as const },
    { label: 'Solicitudes pendientes de revisión', value: requests.length, href: '/transport/requests', tone: 'warning' as const },
    { label: 'Daños abiertos críticos', value: criticalDamageCount, href: '/tasks', tone: 'danger' as const },
  ];
  const attentionTotal = adminAttention.reduce((total, item) => total + item.value, 0);
  const entityNotification = notifications.find((item) => item.entity.type === (role === 'DRIVER' ? 'VEHICLE' : 'ASSET'));

  const adminView = <div className={styles.adminGrid}>
    <Section title="Requiere atención" count={attentionTotal}>{adminAttention.map((item) => <ActionRow key={item.label} href={item.href} title={item.label} meta={String(item.value)} tone={item.tone} />)}</Section>
    <Section title="Solicitudes pendientes">{requests.length ? requests.slice(0, 4).map((request) => <ActionRow key={request.id} href={`/inventory/ledger/document/${request.id}`} title={request.consecutive || 'Solicitud sin consecutivo'} detail={request.type || 'Documento en borrador'} meta={relativeDate(request.createdAt)} />) : <EmptyRow>No hay solicitudes pendientes.</EmptyRow>}</Section>
    <Section title="Próximos vencimientos">{pendingVehicles.length ? pendingVehicles.slice(0, 4).map((vehicle) => <ActionRow key={`${vehicle.id}-${vehicle.document}`} href="/transport/vehicles" title={vehicle.plate} detail={vehicle.document} meta={vehicle.days < 0 ? `${Math.abs(vehicle.days)} días vencido` : `${vehicle.days} días`} tone={vehicle.days < 0 ? 'danger' : 'warning'} />) : <EmptyRow>No hay vencimientos en los próximos 30 días.</EmptyRow>}</Section>
    <Section title="Mis tareas">{myTasks.length ? myTasks.slice(0, 4).map((task) => <ActionRow key={task.id} href="/tasks" title={task.title} detail={task.description || undefined} meta={relativeDate(task.dueDate)} tone={task.priority === 'HIGH' ? 'warning' : 'default'} />) : <EmptyRow>No tienes tareas activas.</EmptyRow>}</Section>
  </div>;

  const officeView = <div className={styles.officeGrid}>
    <Section title="Pendiente de mi revisión" count={requests.length}><ActionRow href="/transport/requests" title="Solicitudes" meta={String(requests.length)} /><ActionRow href="/tasks" title="Tareas abiertas" meta={String(activeTasks.length)} /><ActionRow href="/transport/vehicles" title="Documentos por vencer" meta={String(pendingVehicles.length)} /></Section>
    <Section title="Requiere atención" count={overdue.length + due.length}>{notifications.length ? notifications.slice(0, 5).map((item) => <ActionRow key={item.topicId} href="/notifications/deliveries" title={item.title} detail={item.message} meta={reminderMeta(item)} tone={item.status === 'OVERDUE' ? 'danger' : 'warning'} />) : <EmptyRow>No hay alertas asignadas.</EmptyRow>}</Section>
    <Section title="Mis tareas">{myTasks.length ? myTasks.slice(0, 5).map((task) => <ActionRow key={task.id} href="/tasks" title={task.title} detail={task.description || undefined} meta={relativeDate(task.dueDate)} />) : <EmptyRow>No tienes tareas activas.</EmptyRow>}</Section>
  </div>;

  const isDriver = role === 'DRIVER';
  const fieldModuleHref = isDriver ? '/transport/requests' : '/inventory/hour-meter';
  const fieldView = <div className={styles.fieldLayout}>
    <Section title="Mi trabajo de hoy" count={myTasks.length}>{myTasks.length ? myTasks.slice(0, 5).map((task, index) => <ActionRow key={task.id} href={fieldModuleHref} title={task.title} detail={task.description || undefined} meta={index === 0 ? 'Próxima' : relativeDate(task.dueDate)} tone={task.priority === 'HIGH' ? 'warning' : 'default'} />) : <EmptyRow>No tienes tareas activas asignadas.</EmptyRow>}<Link href={isDriver ? '/transport/generate' : '/inventory/hour-meter'} className={styles.primaryAction}>{isDriver ? 'Abrir operación del día' : 'Registrar horómetro'}<IconArrowRight size={18} /></Link></Section>
    <Section title={isDriver ? 'Mi vehículo' : 'Mi equipo'}>{entityNotification ? <ActionRow href={isDriver ? '/transport/vehicles' : '/inventory/hour-meter'} title={entityNotification.entity.label} detail={entityNotification.message} meta={reminderMeta(entityNotification)} tone={entityNotification.status === 'OVERDUE' ? 'danger' : 'warning'} /> : <EmptyRow>No hay {isDriver ? 'vehículo' : 'equipo'} asociado en tus alertas actuales.</EmptyRow>}</Section>
    <Section title="Alertas" count={notifications.length}>{notifications.length ? notifications.slice(0, 5).map((item) => <ActionRow key={item.topicId} href={fieldModuleHref} title={item.title} detail={item.message} meta={reminderMeta(item)} tone={item.status === 'OVERDUE' ? 'danger' : 'warning'} />) : <EmptyRow>No tienes alertas asignadas.</EmptyRow>}</Section>
  </div>;

  return <AuthGuard allowedRoles={['ADMIN', 'OFFICE', 'DRIVER', 'OPERATOR']}><ResponsiveShell><main className={styles.canvas}><Container size="xl" py={{ base: 'lg', md: 40 }}><header className={styles.pageHeader}><div><Text component="h1">{greeting()}, {userName()}</Text><Text>{role ? roleDescription[role] : 'Tu operación de hoy.'}</Text></div><div className={styles.headerMeta}><Badge variant="light" color="gray">{role || 'SIN ROL'}</Badge><Text>{todayLabel()}</Text></div></header>{error ? <Alert color="red" variant="light" mb="lg">{error}</Alert> : null}{loading ? <Center py={80}><Loader /></Center> : role === 'ADMIN' ? adminView : role === 'OFFICE' ? officeView : fieldView}</Container></main></ResponsiveShell></AuthGuard>;
}
