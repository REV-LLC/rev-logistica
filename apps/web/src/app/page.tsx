'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Badge,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconChecklist,
  IconClipboardList,
  IconReceipt2,
  IconTruck,
} from '@tabler/icons-react';
import AuthGuard from '@/components/AuthGuard';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import StatCard from '@/components/dashboard/StatCard';
import ResponsiveShell from '@/components/ResponsiveShell';
import { api } from '@/lib/api';
import { getCurrentUserRole, getCurrentUserSession } from '@/lib/auth';

type Vehicle = {
  id: string;
  plate: string;
  soatVigencia?: string | null;
  tecnomecanicaVigencia?: string | null;
  active?: boolean;
};

type Task = {
  id: string;
  status?: 'OPEN' | 'DOING' | 'DONE' | null;
  assignedToUserId?: string | null;
};

type RequestDocument = {
  id: string;
  status?: string | null;
};

type NotificationReminder = {
  topicId: string;
  eventType: string;
  title: string;
  message: string;
  status: 'UPCOMING' | 'DUE' | 'OVERDUE';
  unit: 'HOURS' | 'DAYS';
  remainingHours?: number;
  remainingDays?: number;
  entity: { id: string; type: 'ASSET' | 'VEHICLE'; label: string };
};

type PendingVehicle = {
  id: string;
  plate: string;
  soatDate: Date | null;
  technoDate: Date | null;
  soatDays: number | null;
  technoDays: number | null;
  minDays: number;
};

const quickLinks = [
  {
    href: '/transport/requests',
    title: 'Solicitudes',
    description: 'Arma solicitudes de despacho y devolucion con seguimiento operativo.',
    icon: <IconClipboardList size={18} />,
    color: 'blue',
  },
  {
    href: '/tasks',
    title: 'Pendientes',
    description: 'Revisa pendientes abiertos y seguimientos del equipo.',
    icon: <IconChecklist size={18} />,
    color: 'yellow',
  },
  {
    href: '/transport/vehicles',
    title: 'Vehiculos',
    description: 'Controla documentos de flota y proximos vencimientos.',
    icon: <IconTruck size={18} />,
    color: 'orange',
  },
  {
    href: '/billing/pre-invoice',
    title: 'Prefactura',
    description: 'Consolida periodos facturables por obra y cliente.',
    icon: <IconReceipt2 size={18} />,
    color: 'teal',
  },
];

const prodDisabledRoutes = ['/billing/pre-invoice'];
const isProduction = process.env.NODE_ENV === 'production';

function startOfToday() {
  const today = new Date();
  return new Date(today.toDateString());
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function daysUntil(date: Date) {
  const diffMs = date.getTime() - startOfToday().getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function badgeColor(daysLeft: number) {
  if (daysLeft < 0) return 'red';
  if (daysLeft <= 7) return 'red';
  if (daysLeft <= 30) return 'orange';
  return 'teal';
}

function formatDate(value: Date | null) {
  if (!value) return '-';
  return value.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function daysChipLabel(prefix: string, daysLeft: number | null) {
  if (daysLeft === null) return `${prefix}: sin fecha`;
  if (daysLeft < 0) return `${prefix}: vencido`;
  return `${prefix}: ${daysLeft} dias`;
}

function formatToday() {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

function CompactMetric({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint: string;
  color: string;
}) {
  return (
    <Paper withBorder radius="lg" p="sm" bg="rgba(255,255,255,0.78)">
      <Stack gap={4}>
        <Text size="xs" fw={700} c="dimmed" tt="uppercase">
          {label}
        </Text>
        <Text fw={800} size="xl" c={`${color}.7`} lh={1}>
          {value}
        </Text>
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      </Stack>
    </Paper>
  );
}

export default function HomePage() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const visibleQuickLinks = quickLinks.filter(
    (link) => !isProduction || !prodDisabledRoutes.includes(link.href)
  );
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [requests, setRequests] = useState<RequestDocument[]>([]);
  const [notifications, setNotifications] = useState<NotificationReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentRole = getCurrentUserRole();
  const session = getCurrentUserSession();
  const hasGlobalAlerts = currentRole === 'ADMIN' || currentRole === 'OFFICE';

  useEffect(() => {
    let mounted = true;

    const loadDashboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const [vehiclesData, tasksData, requestsData, remindersData] = await Promise.all([
          api<Vehicle[]>('/vehicles'),
          api<Task[]>('/tasks'),
          api<RequestDocument[]>('/documents?status=DRAFT&take=200'),
          api<NotificationReminder[]>('/notifications/reminders/me'),
        ]);

        if (!mounted) return;
        setVehicles(vehiclesData);
        setTasks(tasksData);
        setRequests(requestsData);
        setNotifications(remindersData);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'No se pudo cargar el panel');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  const pendingVehicles = useMemo<PendingVehicle[]>(() => {
    const assignedEvents = new Map<string, Set<string>>();
    notifications.filter((notification) => notification.entity.type === 'VEHICLE').forEach((notification) => {
      const events = assignedEvents.get(notification.entity.id) ?? new Set<string>();
      events.add(notification.eventType);
      assignedEvents.set(notification.entity.id, events);
    });
    return vehicles
      .filter((vehicle) => vehicle.active !== false && assignedEvents.has(vehicle.id))
      .map((vehicle) => {
        const events = assignedEvents.get(vehicle.id)!;
        const soatDate = events.has('SOAT_EXPIRY') ? parseDate(vehicle.soatVigencia) : null;
        const technoDate = events.has('TECH_INSPECTION_EXPIRY') ? parseDate(vehicle.tecnomecanicaVigencia) : null;
        const soatDays = soatDate ? daysUntil(soatDate) : null;
        const technoDays = technoDate ? daysUntil(technoDate) : null;
        const dayValues = [soatDays, technoDays].filter((value): value is number => value !== null);
        if (!dayValues.length) return null;

        return {
          id: vehicle.id,
          plate: vehicle.plate,
          soatDate,
          technoDate,
          soatDays,
          technoDays,
          minDays: Math.min(...dayValues),
        };
      })
      .filter((vehicle): vehicle is PendingVehicle => vehicle !== null)
      .sort((a, b) => a.minDays - b.minDays);
  }, [notifications, vehicles]);

  const dashboardMetrics = useMemo(() => {
    const criticalVehicles = pendingVehicles.filter((vehicle) => vehicle.minDays <= 7).length;
    const pendingRequests = requests.length;
    const openTasks = tasks.filter((task) => task.status === 'OPEN').length;
    const doingTasks = tasks.filter((task) => task.status === 'DOING').length;
    const dueNotifications = notifications.filter((reminder) => reminder.status === 'DUE').length;
    const overdueNotifications = notifications.filter((reminder) => reminder.status === 'OVERDUE').length;

    return {
      criticalVehicles,
      pendingRequests,
      openTasks,
      doingTasks,
      dueNotifications,
      overdueNotifications,
    };
  }, [notifications, pendingVehicles, requests, tasks]);

  const topVehicles = pendingVehicles.slice(0, 8);
  const dashboardStatus =
    dashboardMetrics.overdueNotifications > 0
      ? {
          title: 'Mantenimientos vencidos',
          description: `${dashboardMetrics.overdueNotifications} alertas asignadas ya están vencidas.`,
          color: 'red',
        }
      : dashboardMetrics.criticalVehicles > 0
      ? {
          title: 'Atencion inmediata',
          description: `${dashboardMetrics.criticalVehicles} vencimientos criticos de flota requieren revision hoy.`,
          color: 'red',
        }
      : dashboardMetrics.pendingRequests > 0
        ? {
            title: 'Solicitudes pendientes',
            description: `${dashboardMetrics.pendingRequests} solicitudes pendientes esperan revision o confirmacion.`,
            color: 'blue',
          }
      : dashboardMetrics.openTasks > 0
        ? {
            title: 'Seguimiento operativo',
            description: `${dashboardMetrics.openTasks} tareas abiertas todavia requieren atencion.`,
            color: 'yellow',
          }
        : {
            title: 'Operacion estable',
            description: 'No hay alertas criticas visibles en la vista principal.',
            color: 'teal',
          };

  return (
    <AuthGuard allowedRoles={['ADMIN', 'OFFICE']}>
      <ResponsiveShell>
        <Container size="xl" py="xl">
          <Stack gap="lg">
            <PageHeaderCard
              title="Panel operativo"
              description={
                isMobile
                  ? 'Resumen rapido de alertas y operacion.'
                  : 'Visibilidad rapida de solicitudes, tareas y vencimientos que requieren atencion.'
              }
              icon={<IconAlertTriangle size={20} />}
              iconColor={dashboardStatus.color}
              accentColor={
                dashboardStatus.color === 'red'
                  ? 'rgba(239,68,68,0.12)'
                  : dashboardStatus.color === 'yellow'
                    ? 'rgba(245,158,11,0.14)'
                    : 'rgba(20,184,166,0.12)'
              }
              aside={
                <Stack gap={6} align={isMobile ? 'flex-start' : 'flex-end'}>
                  <Badge variant="light" color={currentRole === 'ADMIN' ? 'red' : 'blue'} size="lg">
                    {currentRole ?? 'SIN ROL'}
                  </Badge>
                  <Text size="xs" c="dimmed" ta="right">
                    {formatToday()}
                  </Text>
                </Stack>
              }
            >
              <Paper withBorder radius="lg" p="md" bg="rgba(255,255,255,0.72)">
                <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                  <div>
                    <Text fw={700}>{dashboardStatus.title}</Text>
                    <Text size="sm" c="dimmed" mt={4}>
                      {dashboardStatus.description}
                    </Text>
                  </div>
                  {!isMobile ? (
                    <div>
                      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                        Sesion
                      </Text>
                      <Text size="sm" mt={4}>
                        {session?.email ?? 'Usuario autenticado'}
                      </Text>
                    </div>
                  ) : null}
                </Group>
                {isMobile ? (
                  <Text size="xs" c="dimmed" mt="sm">
                    Sesion: {session?.email ?? 'Usuario autenticado'}
                  </Text>
                ) : null}
              </Paper>

              {isMobile ? (
                <SimpleGrid cols={2} spacing="sm">
                  <CompactMetric
                    label="Criticos"
                    value={String(dashboardMetrics.criticalVehicles)}
                    hint="Vencimientos urgentes"
                    color="red"
                  />
                  <CompactMetric
                    label="Tareas"
                    value={String(dashboardMetrics.openTasks + dashboardMetrics.doingTasks)}
                    hint="Abiertas y en curso"
                    color="yellow"
                  />
                  <CompactMetric
                    label="Solicitudes"
                    value={String(dashboardMetrics.pendingRequests)}
                    hint="Pendientes"
                    color="teal"
                  />
                </SimpleGrid>
              ) : (
                <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="md">
                  <StatCard
                    label="Vencimientos criticos"
                    value={String(dashboardMetrics.criticalVehicles)}
                    hint="SOAT o tecnomecanica en 7 dias o menos"
                    color="red"
                    icon={<IconAlertTriangle size={20} />}
                  />
                  <StatCard
                    label="Tareas activas"
                    value={String(dashboardMetrics.openTasks + dashboardMetrics.doingTasks)}
                    hint={`${dashboardMetrics.openTasks} abiertas y ${dashboardMetrics.doingTasks} en curso`}
                    color="yellow"
                    icon={<IconChecklist size={20} />}
                  />
                  <StatCard
                    label="Solicitudes pendientes"
                    value={String(dashboardMetrics.pendingRequests)}
                    hint="Documentos en borrador por revisar"
                    color="teal"
                    icon={<IconClipboardList size={20} />}
                  />
                </SimpleGrid>
              )}
            </PageHeaderCard>

            {error ? (
              <Alert color="red" variant="light" title="No se pudo cargar el inicio">
                {error}
              </Alert>
            ) : null}

            <SimpleGrid cols={1} spacing="lg">
              <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
                <Stack gap="md">
                  <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                    <div>
                      <Text fw={700}>Atajos operativos</Text>
                      <Text size="sm" c="dimmed">
                        Entra directo a los flujos mas usados por oficina.
                      </Text>
                    </div>
                    {!isMobile ? (
                      <Badge color="gray" variant="light">
                        {visibleQuickLinks.length} accesos
                      </Badge>
                    ) : null}
                  </Group>

                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={isMobile ? 'sm' : 'md'}>
                    {visibleQuickLinks.map((link) => (
                      <Paper
                        key={link.href}
                        component={Link}
                        href={link.href}
                        withBorder
                        radius="lg"
                        p="md"
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
                          <Group gap={isMobile ? 'xs' : 'sm'} wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
                            <ThemeIcon color={link.color} variant="light" size={isMobile ? 34 : 40} radius="xl">
                              {link.icon}
                            </ThemeIcon>
                            <div style={{ minWidth: 0 }}>
                              <Text fw={700}>{link.title}</Text>
                              {!isMobile ? (
                                <Text size="sm" c="dimmed" mt={4}>
                                  {link.description}
                                </Text>
                              ) : (
                                <Text size="xs" c="dimmed" mt={2} lineClamp={2}>
                                  {link.description}
                                </Text>
                              )}
                            </div>
                          </Group>
                          <IconArrowRight size={isMobile ? 16 : 18} />
                        </Group>
                      </Paper>
                    ))}
                  </SimpleGrid>
                </Stack>
              </Paper>

            </SimpleGrid>

            <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
              <Stack gap="md">
                <Group justify="space-between" align="flex-start" wrap="wrap">
                  <div>
                    <Text fw={700}>{hasGlobalAlerts ? 'Alertas generales' : 'Mis notificaciones'}</Text>
                    <Text size="sm" c="dimmed">
                      {hasGlobalAlerts
                        ? 'Incluye todas las alertas operativas, aunque no tengan un usuario asignado.'
                        : 'Solo se muestran alertas asignadas al usuario de esta sesión.'}
                    </Text>
                  </div>
                  <Badge color={dashboardMetrics.overdueNotifications > 0 ? 'red' : 'yellow'} variant="light">
                    {dashboardMetrics.overdueNotifications + dashboardMetrics.dueNotifications} requieren atención
                  </Badge>
                </Group>
                {notifications.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    {hasGlobalAlerts ? 'No hay alertas operativas.' : 'No tienes alertas asignadas.'}
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {notifications.map((reminder) => (
                      <Paper key={reminder.topicId} withBorder radius="md" p="sm">
                        <Group justify="space-between" align="flex-start" wrap="wrap">
                          <div>
                            <Text fw={700}>{reminder.title}</Text>
                            <Text size="sm" c="dimmed">{reminder.message}</Text>
                          </div>
                          <Badge
                            color={reminder.status === 'OVERDUE' ? 'red' : reminder.status === 'DUE' ? 'yellow' : 'gray'}
                            variant="light"
                          >
                            {reminder.status === 'OVERDUE'
                              ? `Vencido por ${Math.abs(reminder.unit === 'HOURS' ? reminder.remainingHours ?? 0 : reminder.remainingDays ?? 0)} ${reminder.unit === 'HOURS' ? 'h' : 'días'}`
                              : `${reminder.unit === 'HOURS' ? reminder.remainingHours : reminder.remainingDays} ${reminder.unit === 'HOURS' ? 'h' : 'días'} restantes`}
                          </Badge>
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Paper>

            <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
              <Stack gap="md">
                <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                  <div>
                    <Text fw={700}>Vencimientos de vehiculos</Text>
                    <Text size="sm" c="dimmed">
                      Prioridad ordenada por la fecha mas cercana entre SOAT y tecnomecanica.
                    </Text>
                  </div>
                  <Badge color={dashboardMetrics.criticalVehicles > 0 ? 'red' : 'orange'} variant="light">
                    {pendingVehicles.length} vehiculos
                  </Badge>
                </Group>

                {loading ? (
                  <Center py="xl">
                    <Loader />
                  </Center>
                ) : topVehicles.length === 0 ? (
                  <Paper radius="lg" p="xl" bg="gray.0">
                    <Text fw={700}>No hay vencimientos visibles.</Text>
                    <Text size="sm" c="dimmed" mt={6}>
                      Cuando la flota tenga fechas de SOAT o tecnomecanica, apareceran aqui ordenadas por prioridad.
                    </Text>
                  </Paper>
                ) : isMobile ? (
                  <Stack gap="sm">
                    {topVehicles.map((vehicle) => (
                      <Paper key={vehicle.id} withBorder radius="lg" p="md">
                        <Stack gap="sm">
                          <Group justify="space-between" align="flex-start">
                            <div>
                              <Text fw={700} tt="uppercase">
                                {vehicle.plate}
                              </Text>
                              <Text size="sm" c="dimmed">
                                Proximo vencimiento: {vehicle.minDays < 0 ? 'vencido' : `${vehicle.minDays} dias`}
                              </Text>
                            </div>
                            <Badge color={badgeColor(vehicle.minDays)} variant="light">
                              {vehicle.minDays < 0 ? 'Vencido' : `${vehicle.minDays} dias`}
                            </Badge>
                          </Group>

                          <SimpleGrid cols={1} spacing="xs">
                            <Paper radius="md" p="sm" bg="gray.0">
                              <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                                SOAT
                              </Text>
                              <Text size="sm" mt={4}>
                                {formatDate(vehicle.soatDate)}
                              </Text>
                              <Text size="sm" c="dimmed" mt={4}>
                                {daysChipLabel('SOAT', vehicle.soatDays)}
                              </Text>
                            </Paper>
                            <Paper radius="md" p="sm" bg="gray.0">
                              <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                                Tecnomecanica
                              </Text>
                              <Text size="sm" mt={4}>
                                {formatDate(vehicle.technoDate)}
                              </Text>
                              <Text size="sm" c="dimmed" mt={4}>
                                {daysChipLabel('TECNO', vehicle.technoDays)}
                              </Text>
                            </Paper>
                          </SimpleGrid>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                ) : (
                  <Table verticalSpacing="sm" layout="fixed">
                    <TableThead>
                      <TableTr>
                        <TableTh>Placa</TableTh>
                        <TableTh>SOAT</TableTh>
                        <TableTh>Tecnomecanica</TableTh>
                        <TableTh>Prioridad</TableTh>
                      </TableTr>
                    </TableThead>
                    <TableTbody>
                      {topVehicles.map((vehicle) => (
                        <TableTr key={vehicle.id}>
                          <TableTd>
                            <Text fw={700} tt="uppercase">
                              {vehicle.plate}
                            </Text>
                          </TableTd>
                          <TableTd>
                            <Stack gap={4}>
                              <Text size="sm">{formatDate(vehicle.soatDate)}</Text>
                              <Badge color={vehicle.soatDays === null ? 'gray' : badgeColor(vehicle.soatDays)} variant="light">
                                {daysChipLabel('SOAT', vehicle.soatDays)}
                              </Badge>
                            </Stack>
                          </TableTd>
                          <TableTd>
                            <Stack gap={4}>
                              <Text size="sm">{formatDate(vehicle.technoDate)}</Text>
                              <Badge
                                color={vehicle.technoDays === null ? 'gray' : badgeColor(vehicle.technoDays)}
                                variant="light"
                              >
                                {daysChipLabel('TECNO', vehicle.technoDays)}
                              </Badge>
                            </Stack>
                          </TableTd>
                          <TableTd>
                            <Badge color={badgeColor(vehicle.minDays)} variant="light">
                              {vehicle.minDays < 0 ? 'Vencido' : `${vehicle.minDays} dias`}
                            </Badge>
                          </TableTd>
                        </TableTr>
                      ))}
                    </TableTbody>
                  </Table>
                )}

                <Group justify="flex-end">
                  <Button component={Link} href="/transport/vehicles" variant="light" rightSection={<IconArrowRight size={16} />}>
                    Ver flota completa
                  </Button>
                </Group>
              </Stack>
            </Paper>
          </Stack>
        </Container>
      </ResponsiveShell>
    </AuthGuard>
  );
}
