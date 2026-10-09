"use client";

import { Alert, Badge, Button, Stack, Text } from '@mantine/core';
import { IconExternalLink, IconMap2 } from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';

const DEFAULT_TRACCAR_WEB_URL = 'https://gps.revcontractorsllc.com';

function getPanelUrl() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_TRACCAR_WEB_URL?.trim() || DEFAULT_TRACCAR_WEB_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return url.href;
  } catch {
    return null;
  }
}

export default function VehicleTrackingPage() {
  const panelUrl = getPanelUrl();
  return (
    <Stack gap="md">
      <PageHeaderCard
        title="Seguimiento de camiones"
        description="Mapa, recorridos y reportes de la flota. Inicia sesión con tu cuenta de seguimiento."
        icon={<IconMap2 size={22} />}
        iconColor="teal"
        accentColor="rgba(18, 184, 134, 0.10)"
        aside={<Badge color="teal" variant="light">Traccar</Badge>}
      />
      {panelUrl ? (
        <>
          <iframe
            src={panelUrl}
            title="Mapa de camiones — Traccar"
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ width: '100%', height: 'calc(100dvh - 230px)', minHeight: 560, border: '1px solid var(--mantine-color-default-border)', borderRadius: 12, background: 'var(--mantine-color-body)' }}
          />
          <Button component="a" href={panelUrl} target="_blank" rel="noopener noreferrer"
            variant="subtle" color="teal" size="xs" rightSection={<IconExternalLink size={16} />}
            style={{ alignSelf: 'flex-start' }}>
            Abrir panel en otra pestaña
          </Button>
        </>
      ) : (
        <Alert color="orange" title="Panel no disponible" role="alert">
          La dirección del panel de seguimiento no está configurada correctamente. Contacta a administración.
        </Alert>
      )}
      <Text size="xs" c="dimmed">Revisa la hora del último reporte antes de coordinar un despacho.</Text>
    </Stack>
  );
}
