'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Group, SegmentedControl, Stack, Text, ThemeIcon } from '@mantine/core';
import {
  IconArrowRight,
  IconClock,
  IconTruck,
} from '@tabler/icons-react';
import ResponsiveShell from '@/components/ResponsiveShell';
import styles from './home-preview.module.css';

type Role = 'admin' | 'office' | 'driver' | 'operator';

function getDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 5 || hour >= 19) return 'Buenas noches';
  if (hour < 12) return 'Buenos días';
  return 'Buenas tardes';
}

const attention = [
  ['Mantenimiento vencido', '2'],
  ['Documentos de vehículos por vencer', '3'],
  ['Solicitudes pendientes de revisión', '2'],
  ['Daños abiertos críticos', '1'],
];

const requests = [
  ['Remisión #1048', 'Obra Cervino', 'Hace 2 h'],
  ['Devolución #1044', 'Celsia', 'Ayer'],
  ['Recepción proveedor', 'JCB 1CX', 'Ayer'],
];

const expirations = [
  ['KLM-482', 'SOAT', '5 días'],
  ['REV-042', 'Mantenimiento', '12 h vencido'],
  ['JQP-719', 'Tecnomecánica', '10 días'],
];

function Section({ title, count, children }: { title: string; count?: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <Group justify="space-between" align="center" className={styles.sectionHeading}>
        <Text component="h2">{title}</Text>
        {count ? <Text className={styles.sectionCount}>{count}</Text> : null}
      </Group>
      {children}
    </section>
  );
}

function ActionRow({ title, detail, meta, tone = 'default' }: { title: string; detail?: string; meta?: string; tone?: 'default' | 'danger' | 'warning' }) {
  return (
    <button type="button" className={styles.row} data-tone={tone}>
      <span className={styles.rowCopy}><strong>{title}</strong>{detail ? <span>{detail}</span> : null}</span>
      {meta ? <span className={styles.rowMeta}>{meta}</span> : <IconArrowRight size={18} />}
    </button>
  );
}

function AdminHome() {
  return (
    <div className={styles.adminGrid}>
      <Section title="Requiere atención" count="8">
        <div className={styles.exceptionList}>
          {attention.map(([label, value], index) => (
            <button type="button" className={styles.exception} key={label}>
              <span><i data-level={index < 2 ? 'critical' : 'warning'} />{label}</span>
              <strong>{value}</strong>
              <IconArrowRight size={17} />
            </button>
          ))}
        </div>
      </Section>
      <Section title="Solicitudes pendientes">
        {requests.map(([title, detail, meta]) => <ActionRow key={title} title={title} detail={detail} meta={meta} />)}
      </Section>
      <Section title="Próximos vencimientos">
        {expirations.map(([title, detail, meta], index) => <ActionRow key={title} title={title} detail={detail} meta={meta} tone={index === 1 ? 'danger' : 'warning'} />)}
      </Section>
      <Section title="Mis tareas">
        <ActionRow title="Revisar devolución Cervino" meta="Hoy" />
        <ActionRow title="Aprobar orden de mantenimiento" meta="Hoy" />
        <ActionRow title="Confirmar documentación proveedor" meta="Mañana" />
      </Section>
    </div>
  );
}

function OfficeHome() {
  return (
    <div className={styles.officeGrid}>
      <Section title="Pendiente de mi revisión" count="12">
        {['Solicitudes|6', 'Remisiones|3', 'Devoluciones|2', 'Recepciones proveedor|1'].map((item) => {
          const [title, meta] = item.split('|');
          return <ActionRow key={title} title={title} meta={meta} />;
        })}
      </Section>
      <Section title="Requiere atención">
        <ActionRow title="Documento incompleto" detail="Remisión #1051 · Falta confirmación de entrega" tone="danger" />
        <ActionRow title="Vehículo KLM-482" detail="SOAT vence en 5 días" tone="warning" />
        <ActionRow title="Equipo REV-042" detail="Mantenimiento vencido" tone="danger" />
      </Section>
      <Section title="Mis tareas">
        <ActionRow title="Preparar remisión Cervino" meta="Hoy" />
        <ActionRow title="Confirmar devolución Celsia" meta="Hoy" />
        <ActionRow title="Revisar documentación de JCB" meta="Mañana" />
      </Section>
    </div>
  );
}

function DriverHome() {
  return (
    <div className={styles.fieldLayout}>
      <Section title="Hoy">
        <article className={styles.nextTask}>
          <div className={styles.time}><IconClock size={18} /><strong>08:00 AM</strong><span>Próxima tarea</span></div>
          <div className={styles.taskCopy}><h3>Entregar Bobcat S650</h3><p>Obra Cervino · Vehículo KLM-482</p></div>
          <Button size="lg" color="dark" rightSection={<IconArrowRight size={18} />}>Iniciar tarea</Button>
        </article>
        <ActionRow title="11:30 AM · Recoger Vibro REV-018" detail="Obra Celsia" />
      </Section>
      <Section title="Mi vehículo">
        <div className={styles.assetHeader}><ThemeIcon variant="light" size={48}><IconTruck /></ThemeIcon><div><h3>KLM-482</h3><p>Ford F-350</p></div></div>
        <div className={styles.assetFacts}><span>SOAT <strong>38 días</strong></span><span>Tecnomecánica <strong>74 días</strong></span></div>
        <ActionRow title="Reporte abierto" detail="Luz trasera derecha" tone="warning" />
      </Section>
      <Section title="Alertas">
        <ActionRow title="Nueva tarea asignada" />
        <ActionRow title="Cambio de horario — Cervino" />
        <ActionRow title="Documento próximo a vencer" tone="warning" />
      </Section>
    </div>
  );
}

function OperatorHome() {
  return (
    <div className={styles.fieldLayout}>
      <section className={styles.machineHero}>
        <Text className={styles.eyebrow}>Mi equipo</Text>
        <Group justify="space-between" align="flex-end">
          <div><h2>LiuGong CLG766A</h2><p>REV-001</p></div>
          <div className={styles.meter}><span>Horómetro actual</span><strong>2.590 h</strong></div>
        </Group>
      </section>
      <Section title="Registro rápido">
        <ActionRow title="Registrar horómetro" detail="Última lectura: 2.590 h · hace 2 días" />
        <ActionRow title="Guías de movilidad" detail="Registrar entrada o salida del equipo" />
        <ActionRow title="Reportar un daño" detail="Falla, fotografía y descripción" tone="warning" />
      </Section>
      <Section title="Estado del equipo">
        <div className={styles.assetFacts}><span>Próximo mantenimiento <strong>3.000 h</strong></span><span>Restan <strong>410 h</strong></span></div>
        <ActionRow title="Fuga hidráulica" detail="Reportado 16 ago · En revisión" tone="danger" />
      </Section>
      <Section title="Mis tareas">
        <ActionRow title="Inspección visual diaria" meta="Hoy" />
        <ActionRow title="Registrar horómetro al finalizar turno" meta="Hoy" />
      </Section>
    </div>
  );
}

const roleMeta: Record<Role, { name: string; userName: string; description: string }> = {
  admin: { name: 'Admin', userName: 'Samuel', description: 'Lo que requiere atención en toda la operación.' },
  office: { name: 'Office', userName: 'Laura', description: 'Lo que tienes pendiente por revisar, aprobar o gestionar.' },
  driver: { name: 'Driver', userName: 'Carlos', description: 'Tu jornada, próxima tarea y vehículo asignado.' },
  operator: { name: 'Operator', userName: 'Andrés', description: 'Registra y reporta rápidamente desde tu equipo asignado.' },
};

function DesignLabHomeContent() {
  const [role, setRole] = useState<Role>('admin');
  const [dayGreeting, setDayGreeting] = useState('Hola');
  const meta = roleMeta[role];

  useEffect(() => {
    const updateGreeting = () => setDayGreeting(getDayGreeting());
    updateGreeting();
    const interval = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <ResponsiveShell>
      <main className={styles.canvas}>
        <header className={styles.header}>
          <div className={styles.greeting}>
            <div><Text component="h1">{dayGreeting}, {meta.userName}</Text><Text>{meta.description}</Text></div>
          </div>
          <div className={styles.headerAside}>
            <Badge variant="light" color="gray">Preview sin autenticación</Badge>
            <Text>Martes, 18 de agosto</Text>
          </div>
        </header>

        <div className={styles.roleBar}>
          <Text size="xs" fw={700} tt="uppercase">Vista por rol</Text>
          <SegmentedControl
            value={role}
            onChange={(value) => setRole(value as Role)}
            data={(Object.keys(roleMeta) as Role[]).map((key) => ({ label: roleMeta[key].name, value: key }))}
          />
        </div>

        {role === 'admin' ? <AdminHome /> : null}
        {role === 'office' ? <OfficeHome /> : null}
        {role === 'driver' ? <DriverHome /> : null}
        {role === 'operator' ? <OperatorHome /> : null}
      </main>
    </ResponsiveShell>
  );
}

export default function DesignLabHomePage() {
  return (
    <Suspense fallback={null}>
      <DesignLabHomeContent />
    </Suspense>
  );
}
