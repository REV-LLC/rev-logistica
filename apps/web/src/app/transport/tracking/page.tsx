"use client";

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Alert, Badge, Button, Loader, Stack, Text } from '@mantine/core';
import { IconExternalLink, IconMap2 } from '@tabler/icons-react';
import KnownPlaces from '@/components/tracking/KnownPlaces';
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
  const [session, setSession] = useState<{ sessionUrl: string; expiresAt: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [mapVersion, setMapVersion] = useState(0);
  const expiresAt = useRef(0);

  useEffect(() => {
    if (!panelUrl) return;
    let active = true;
    let refreshing = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    setReady(false);
    setError(false);
    setSession(null);
    const refresh = async () => {
      if (refreshing || !active) return;
      refreshing = true;
      try {
        const result = await api<{ sessionUrl: string; panelUrl: string; expiresAt: string }>('/tracking/session', {
          method: 'POST', signal: controller.signal, cache: 'no-store',
        });
        if (!active) return;
        const url = new URL(result.sessionUrl);
        const deadline = Date.parse(result.expiresAt);
        if (result.panelUrl !== panelUrl || url.origin !== new URL(panelUrl).origin || url.pathname !== '/api/session' || !url.searchParams.get('token') || deadline <= Date.now()) throw new Error('Invalid tracking session');
        if (expiresAt.current && expiresAt.current <= Date.now()) {
          setReady(false);
          setMapVersion((version) => version + 1);
        }
        expiresAt.current = deadline;
        setSession({ sessionUrl: result.sessionUrl, expiresAt: result.expiresAt });
        clearTimeout(timer);
        timer = setTimeout(refresh, Math.min(120_000, Math.max(5000, (deadline - Date.now()) / 2)));
      } catch {
        if (active) { setSession(null); setReady(false); setError(true); }
      } finally { refreshing = false; }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    void refresh();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [panelUrl, attempt]);
  return (
    <Stack gap="md">
      <PageHeaderCard
        title="Seguimiento de camiones"
        description="Mapa, recorridos y reportes de la flota."
        icon={<IconMap2 size={22} />}
        iconColor="teal"
        accentColor="rgba(18, 184, 134, 0.10)"
        aside={<Badge color="teal" variant="light">Traccar</Badge>}
      />
      {panelUrl ? (
        <>
          {error ? (
            <Alert color="orange" title="No fue posible abrir el mapa">
              <Stack gap="sm">
                <Text size="sm">Intenta nuevamente. Si tu sesión venció, inicia sesión en REV.</Text>
                <Button size="xs" variant="light" onClick={() => setAttempt((value) => value + 1)}>Reintentar</Button>
              </Stack>
            </Alert>
          ) : !ready ? <Stack align="center" p="xl"><Loader color="teal" /><Text size="sm">Abriendo mapa…</Text></Stack> : null}
          {session && (
            <iframe key={session.sessionUrl} src={session.sessionUrl} title="Conexión segura al seguimiento"
              referrerPolicy="no-referrer" hidden onLoad={() => setReady(true)} />
          )}
          {ready && !error && <KnownPlaces onSaved={() => setMapVersion((version) => version + 1)} />}
          {ready && !error && <iframe
            key={mapVersion}
            src={panelUrl}
            title="Mapa de camiones — Traccar"
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ width: '100%', height: 'calc(100dvh - 230px)', minHeight: 560, border: '1px solid var(--mantine-color-default-border)', borderRadius: 12, background: 'var(--mantine-color-body)' }}
          />}
          {ready && !error && <Button component="a" href={panelUrl} target="_blank" rel="noopener noreferrer"
            variant="subtle" color="teal" size="xs" rightSection={<IconExternalLink size={16} />}
            style={{ alignSelf: 'flex-start' }}>
            Abrir panel en otra pestaña
          </Button>}
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
