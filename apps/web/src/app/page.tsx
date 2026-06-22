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
  IconUsers,
  IconUserStar,
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

type Customer = {
  id: string;
  active: boolean;
};

type Employee = {
  id: string;
  active: boolean;
  user?: { id: string; active: boolean } | null;
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
    title: 'Requests',
    description: 'Build dispatch and return requests with operational tracking.',
    icon: <IconClipboardList size={18} />,
    color: 'blue',
  },
  {
    href: '/tasks',
    title: 'Tasks',
    description: 'Review open tasks and team follow-ups.',
    icon: <IconChecklist size={18} />,
    color: 'yellow',
  },
  {
    href: '/transport/vehicles',
    title: 'Vehicles',
    description: 'Track fleet documents and upcoming expirations.',
    icon: <IconTruck size={18} />,
    color: 'orange',
  },
  {
    href: '/billing/pre-invoice',
    title: 'Pre-invoice',
    description: 'Consolidate billable periods by worksite and customer.',
    icon: <IconReceipt2 size={18} />,
    color: 'teal',
  },
];

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
  return `${prefix}: ${daysLeft} days`;
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
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentRole = getCurrentUserRole();
  const session = getCurrentUserSession();

  useEffect(() => {
    let mounted = true;

    const loadDashboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const [vehiclesData, tasksData, customersData, employeesData] = await Promise.all([
          api<Vehicle[]>('/vehicles'),
          api<Task[]>('/tasks'),
          api<Customer[]>('/customers'),
          api<Employee[]>('/employees'),
        ]);

        if (!mounted) return;
        setVehicles(vehiclesData);
        setTasks(tasksData);
        setCustomers(customersData);
        setEmployees(employeesData);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Could not load dashboard');
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
    return vehicles
      .filter((vehicle) => vehicle.active !== false)
      .map((vehicle) => {
        const soatDate = parseDate(vehicle.soatVigencia);
        const technoDate = parseDate(vehicle.tecnomecanicaVigencia);
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
  }, [vehicles]);

  const dashboardMetrics = useMemo(() => {
    const criticalVehicles = pendingVehicles.filter((vehicle) => vehicle.minDays <= 7).length;
    const upcomingVehicles = pendingVehicles.filter((vehicle) => vehicle.minDays > 7 && vehicle.minDays <= 30).length;
    const activeCustomers = customers.filter((customer) => customer.active).length;
    const activeEmployees = employees.filter((employee) => employee.active).length;
    const usersWithAccess = employees.filter((employee) => employee.user?.active).length;
    const openTasks = tasks.filter((task) => task.status === 'OPEN').length;
    const doingTasks = tasks.filter((task) => task.status === 'DOING').length;

    return {
      criticalVehicles,
      upcomingVehicles,
      activeCustomers,
      activeEmployees,
      usersWithAccess,
      openTasks,
      doingTasks,
    };
  }, [customers, employees, pendingVehicles, tasks]);

  const topVehicles = pendingVehicles.slice(0, 8);
  const dashboardStatus =
    dashboardMetrics.criticalVehicles > 0
      ? {
          title: 'Immediate attention',
          description: `${dashboardMetrics.criticalVehicles} critical fleet expirations require review today.`,
          color: 'red',
        }
      : dashboardMetrics.openTasks > 0
        ? {
            title: 'Seguimiento operativo',
            description: `${dashboardMetrics.openTasks} open tasks still need attention.`,
            color: 'yellow',
          }
        : {
            title: 'Stable operation',
            description: 'No critical alerts are visible in the main view.',
            color: 'teal',
          };

  return (
    <AuthGuard allowedRoles={['ADMIN', 'OFFICE']}>
      <ResponsiveShell>
        <Container size="xl" py="xl">
          <Stack gap="lg">
            <PageHeaderCard
              title="Dashboard operativo"
              description={
                isMobile
                  ? 'Quick summary of alerts and operation.'
                  : 'Quick visibility into team, operation, and expirations that require attention.'
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
                        Session
                      </Text>
                      <Text size="sm" mt={4}>
                        {session?.email ?? 'Usuario autenticado'}
                      </Text>
                    </div>
                  ) : null}
                </Group>
                {isMobile ? (
                  <Text size="xs" c="dimmed" mt="sm">
                    Session: {session?.email ?? 'Authenticated user'}
                  </Text>
                ) : null}
              </Paper>

              {isMobile ? (
                <SimpleGrid cols={2} spacing="sm">
                  <CompactMetric
                    label="Critical"
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
                    label="Clientes"
                    value={String(dashboardMetrics.activeCustomers)}
                    hint="Activos"
                    color="teal"
                  />
                  <CompactMetric
                    label="Accesos"
                    value={String(dashboardMetrics.usersWithAccess)}
                    hint="Equipo con login"
                    color="blue"
                  />
                </SimpleGrid>
              ) : (
                <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="md">
                  <StatCard
                    label="Critical expirations"
                    value={String(dashboardMetrics.criticalVehicles)}
                    hint="SOAT or inspection in 7 days or less"
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
                    label="Clientes activos"
                    value={String(dashboardMetrics.activeCustomers)}
                    hint="Base comercial operativa"
                    color="teal"
                    icon={<IconUsers size={20} />}
                  />
                  <StatCard
                    label="Equipo con acceso"
                    value={String(dashboardMetrics.usersWithAccess)}
                    hint={`${dashboardMetrics.activeEmployees} empleados activos`}
                    color="blue"
                    icon={<IconUserStar size={20} />}
                  />
                </SimpleGrid>
              )}
            </PageHeaderCard>

            {error ? (
              <Alert color="red" variant="light" title="No se pudo cargar la home">
                {error}
              </Alert>
            ) : null}

            <SimpleGrid cols={{ base: 1, xl: 3 }} spacing="lg">
              <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }} style={{ gridColumn: 'span 2' }}>
                <Stack gap="md">
                  <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                    <div>
                      <Text fw={700}>Atajos operativos</Text>
                      <Text size="sm" c="dimmed">
                        Jump directly into the flows most used by the office.
                      </Text>
                    </div>
                    {!isMobile ? (
                      <Badge color="gray" variant="light">
                        {quickLinks.length} accesos
                      </Badge>
                    ) : null}
                  </Group>

                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={isMobile ? 'sm' : 'md'}>
                    {quickLinks.map((link) => (
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

              <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
                <Stack gap="md">
                  <div>
                    <Text fw={700}>Operation pulse</Text>
                    <Text size="sm" c="dimmed">
                      Una lectura breve de carga y cobertura actual.
                    </Text>
                  </div>

                  {isMobile ? (
                    <SimpleGrid cols={2} spacing="sm">
                      <CompactMetric
                        label="En curso"
                        value={String(dashboardMetrics.doingTasks)}
                        hint="Tasks in progress"
                        color="blue"
                      />
                      <CompactMetric
                        label="Upcoming fleet"
                        value={String(dashboardMetrics.upcomingVehicles)}
                        hint="Documentos por vencer"
                        color="orange"
                      />
                    </SimpleGrid>
                  ) : (
                    <>
                      <StatCard
                        label="En curso"
                        value={String(dashboardMetrics.doingTasks)}
                        hint="Tasks currently running"
                        color="blue"
                        icon={<IconChecklist size={20} />}
                      />
                      <StatCard
                        label="Upcoming fleet"
                        value={String(dashboardMetrics.upcomingVehicles)}
                        hint="Vehicles with documents between 8 and 30 days"
                        color="orange"
                        icon={<IconTruck size={20} />}
                      />
                    </>
                  )}
                </Stack>
              </Paper>
            </SimpleGrid>

            <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
              <Stack gap="md">
                <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                  <div>
                    <Text fw={700}>Vehicle expirations</Text>
                    <Text size="sm" c="dimmed">
                      Priority sorted by the closest date between SOAT and inspection.
                    </Text>
                  </div>
                  <Badge color={dashboardMetrics.criticalVehicles > 0 ? 'red' : 'orange'} variant="light">
                    {pendingVehicles.length} vehicles
                  </Badge>
                </Group>

                {loading ? (
                  <Center py="xl">
                    <Loader />
                  </Center>
                ) : topVehicles.length === 0 ? (
                  <Paper radius="lg" p="xl" bg="gray.0">
                    <Text fw={700}>No visible expirations.</Text>
                    <Text size="sm" c="dimmed" mt={6}>
                      When the fleet has SOAT or inspection dates, they will appear here sorted by priority.
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
                                Next expiration in {vehicle.minDays < 0 ? 'expired status' : `${vehicle.minDays} days`}
                              </Text>
                            </div>
                            <Badge color={badgeColor(vehicle.minDays)} variant="light">
                              {vehicle.minDays < 0 ? 'Expired' : `${vehicle.minDays} days`}
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
                                Inspection
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
                        <TableTh>Inspection</TableTh>
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
                              {vehicle.minDays < 0 ? 'Expired' : `${vehicle.minDays} days`}
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
