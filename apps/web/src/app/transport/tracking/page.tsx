"use client";

import { Alert, Badge, Button, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconExternalLink, IconMap2, IconRoute, IconReportAnalytics } from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';

const DEFAULT_TRACCAR_WEB_URL = 'https://traccar-production-260b.up.railway.app';

function getPanelUrl() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_TRACCAR_WEB_URL?.trim() || DEFAULT_TRACCAR_WEB_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return url.href;
  } catch {
    return null;
  }
}

const features = [
  { icon: IconMap2, title: 'Mapa de la flota', description: 'Consulta la ubicación, el estado y la hora del último reporte de cada camión.' },
  { icon: IconRoute, title: 'Recorridos', description: 'Revisa los trayectos y las paradas de los vehículos por fecha.' },
  { icon: IconReportAnalytics, title: 'Reportes', description: 'Usa los reportes y las herramientas de seguimiento de Traccar.' },
];

export default function VehicleTrackingPage() {
  const panelUrl = getPanelUrl();
  return (
    <Stack gap="lg">
      <PageHeaderCard
        title="Seguimiento de camiones"
        description="Ubicaciones y recorridos de la flota."
        icon={<IconMap2 size={22} />}
        iconColor="teal"
        accentColor="rgba(18, 184, 134, 0.10)"
        aside={<Badge color="teal" variant="light">Traccar</Badge>}
      />
      <Paper withBorder radius="xl" p={{ base: 'lg', md: 'xl' }}>
        <Stack gap="md">
          <Title order={3}>Panel de seguimiento</Title>
          <Text c="dimmed">Abre el panel original de Traccar en una nueva pestaña. Inicia sesión con tu cuenta de seguimiento para consultar los camiones.</Text>
          {panelUrl ? (
            <Group>
              <Button component="a" href={panelUrl} target="_blank" rel="noopener noreferrer"
                size="md" color="teal" rightSection={<IconExternalLink size={18} />}>
                Abrir mapa de camiones
              </Button>
            </Group>
          ) : (
            <Alert color="orange" title="Panel no disponible" role="alert">
              La dirección del panel de seguimiento no está configurada correctamente. Contacta a administración.
            </Alert>
          )}
          <Text size="sm" c="dimmed">El seguimiento continúa cuando la pantalla de la tablet está apagada. Revisa la hora del último reporte antes de coordinar un despacho.</Text>
        </Stack>
      </Paper>
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        {features.map(({ icon: Icon, title, description }) => (
          <Paper key={title} withBorder radius="lg" p="lg">
            <Stack gap="sm">
              <ThemeIcon color="teal" variant="light" size={36} radius="md"><Icon size={20} /></ThemeIcon>
              <Text fw={700}>{title}</Text>
              <Text size="sm" c="dimmed">{description}</Text>
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
