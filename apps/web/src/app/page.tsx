'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  AppShell,
  Badge,
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
  Title,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import AuthGuard from '@/components/AuthGuard';
import Nav from '@/components/Nav';
import { api } from '@/lib/api';

type Vehicle = {
  id: string;
  plate: string;
  soatVigencia?: string | null;
  tecnomecanicaVigencia?: string | null;
  active?: boolean;
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
  if (daysLeft <= 30) return 'red';
  return 'teal';
}

function formatDate(value: Date | null) {
  if (!value) return '-';
  return value.toLocaleDateString('es-CO');
}

function daysChipLabel(prefix: string, daysLeft: number | null) {
  if (daysLeft === null) return `- ${prefix}`;
  return `${daysLeft} ${prefix}`;
}

export default function HomePage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadVehicles = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api<Vehicle[]>('/vehicles');
        if (mounted) setVehicles(data);
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar vehículos');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadVehicles();
    return () => {
      mounted = false;
    };
  }, []);

  const pendingVehicles = useMemo<PendingVehicle[]>(() => {
    return vehicles
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

  const criticalCount = pendingVehicles.filter((vehicle) => vehicle.minDays <= 7).length;

  const rows = pendingVehicles.map((vehicle) => (
    <TableTr key={vehicle.id}>
      <TableTd>
        <Text fw={600} tt="uppercase">
          {vehicle.plate}
        </Text>
      </TableTd>
      <TableTd>
        <Text>{formatDate(vehicle.soatDate)}</Text>
      </TableTd>
      <TableTd>
        <Text>{formatDate(vehicle.technoDate)}</Text>
      </TableTd>
      <TableTd style={{ minWidth: 260 }}>
        <Group gap="xs">
          <Badge
            color={vehicle.soatDays === null ? 'gray' : badgeColor(vehicle.soatDays)}
            variant={vehicle.soatDays !== null && vehicle.soatDays <= 30 ? 'filled' : 'light'}
            styles={
              vehicle.soatDays !== null && vehicle.soatDays <= 30
                ? {
                    root: {
                      backgroundColor: 'var(--mantine-color-red-2)',
                      color: 'var(--mantine-color-red-9)',
                      paddingInline: '0.5rem',
                      paddingBlock: '0.5rem',
                    },
                    label: {
                      lineHeight: 1.2,
                    },
                  }
                : {
                    root: {
                      paddingInline: '0.5rem',
                      paddingBlock: '0.5rem',
                    },
                    label: {
                      lineHeight: 1.2,
                    },
                  }
            }
          >
            <Text
              span
              c={vehicle.soatDays !== null && vehicle.soatDays <= 30 ? 'red.6' : 'dark'}
              size="xs"
              fw={700}
            >
              {daysChipLabel('DÍAS PARA SOAT', vehicle.soatDays)}
            </Text>
          </Badge>
          <Badge
            color={vehicle.technoDays === null ? 'gray' : badgeColor(vehicle.technoDays)}
            variant={vehicle.technoDays !== null && vehicle.technoDays <= 30 ? 'filled' : 'light'}
            styles={
              vehicle.technoDays !== null && vehicle.technoDays <= 30
                ? {
                    root: {
                      backgroundColor: 'var(--mantine-color-red-2)',
                      color: 'var(--mantine-color-red-9)',
                      paddingInline: '0.5rem',
                      paddingBlock: '0.5rem',
                    },
                    label: {
                      lineHeight: 1.2,
                    },
                  }
                : {
                    root: {
                      paddingInline: '0.5rem',
                      paddingBlock: '0.5rem',
                    },
                    label: {
                      lineHeight: 1.2,
                    },
                  }
            }
          >
            <Text
              span
              c={vehicle.technoDays !== null && vehicle.technoDays <= 30 ? 'red.6' : 'dark'}
              size="xs"
              fw={700}
            >
              {daysChipLabel('DÍAS PARA TECNO', vehicle.technoDays)}
            </Text>
          </Badge>
        </Group>
      </TableTd>
    </TableTr>
  ));

  return (
    <AuthGuard>
      <AppShell navbar={{ width: 260, breakpoint: 'sm' }} padding="md">
        <AppShell.Navbar withBorder>
          <Nav />
        </AppShell.Navbar>
        <AppShell.Main>
          <Container size="xl" py="xl">
            <Stack gap="xl">
              <div>
                <Title order={2}>DASHBOARD</Title>
                <Text c="dimmed">RESUMEN GENERAL Y ALERTAS OPERATIVAS.</Text>
              </div>

              {error && (
                <Text c="red" fw={500}>
                  {error.toUpperCase()}
                </Text>
              )}

              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                <Paper shadow="sm" p="lg" radius="md" withBorder>
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text fw={600}>PENDIENTES</Text>
                      <Text c="dimmed" size="sm">
                        TAREAS Y SEGUIMIENTOS POR ATENDER.
                      </Text>
                    </div>
                    <Group gap="xs">
                      <Badge color="teal" variant="light">
                        {pendingVehicles.length} PENDIENTES
                      </Badge>
                      <ActionIcon
                        component="a"
                        href="/tasks"
                        variant="light"
                        color="teal"
                        aria-label="IR A TAREAS"
                      >
                        <IconPlus size={16} stroke={2.5} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  <Text mt="md" size="sm">
                    PRIORIZA LO URGENTE Y MANTÉN LA OPERACIÓN AL DÍA.
                  </Text>
                </Paper>

                <Paper shadow="sm" p="lg" radius="md" withBorder>
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text fw={600}>ALERTAS</Text>
                      <Text c="dimmed" size="sm">
                        VENCIMIENTOS Y PENDIENTES CRÍTICOS.
                      </Text>
                    </div>
                    <Badge color={criticalCount ? 'red' : 'teal'} variant="light">
                      {criticalCount} CRÍTICAS
                    </Badge>
                  </Group>
                  <Text mt="md" size="sm">
                    AUTOMATIZAREMOS ALERTAS PARA SEGUROS, REVISIONES Y NOVEDADES DE FLOTA.
                  </Text>
                </Paper>
              </SimpleGrid>

              <Paper shadow="sm" p="lg" radius="md" withBorder>
                <Group justify="space-between" mb="md">
                  <div>
                    <Text fw={600}>VENCIMIENTOS</Text>
                    <Text c="dimmed" size="sm">
                      VEHÍCULOS CON VENCIMIENTOS PRÓXIMOS DE SOAT Y TECNOMECÁNICA.
                    </Text>
                  </div>
                  <Badge color="orange" variant="light">
                    {pendingVehicles.length} VEHÍCULOS
                  </Badge>
                </Group>

                {loading ? (
                  <Center py="xl">
                    <Loader />
                  </Center>
                ) : (
                  <Table withTableBorder={false} verticalSpacing="sm" layout="fixed">
                    <TableThead>
                      <TableTr>
                        <TableTh style={{ width: '25%' }}>PLACA</TableTh>
                        <TableTh style={{ width: '25%' }}>SOAT</TableTh>
                        <TableTh style={{ width: '25%' }}>TECNOMECÁNICA</TableTh>
                        <TableTh style={{ width: '25%' }}>DÍAS</TableTh>
                      </TableTr>
                    </TableThead>
                    <TableTbody>{rows}</TableTbody>
                  </Table>
                )}
              </Paper>
            </Stack>
          </Container>
        </AppShell.Main>
      </AppShell>
    </AuthGuard>
  );
}
