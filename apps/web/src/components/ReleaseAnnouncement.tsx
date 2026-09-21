'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Group, Modal, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { api } from '@/lib/api';
import { getTokenPayload } from '@/lib/auth';

type Announcement = { id: string; title: string; paragraphs: string[] };

export default function ReleaseAnnouncement() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const acknowledged = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    const userId = getTokenPayload()?.sub;
    if (!userId) return;
    let checking = false;
    async function check() {
      if (checking || savingRef.current || document.visibilityState === 'hidden') return;
      checking = true;
      try {
        const response = await fetch('/api/release-announcement', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const current: Announcement | null = await response.json();
        if (!current) {
          if (!controller.signal.aborted) setAnnouncement(null);
          return;
        }
        const status = await api<{ acknowledged: boolean }>(`/auth/releases/${current.id}`, {
          signal: controller.signal, redirectOnAuthError: false,
        });
        if (!controller.signal.aborted && getTokenPayload()?.sub === userId && !savingRef.current) {
          setAnnouncement(status.acknowledged || acknowledged.current.has(current.id) ? null : current);
        }
      } catch {
        // An unavailable announcement service must not interrupt the user's work.
        // Retry on focus or the next interval.
      } finally {
        checking = false;
      }
    }
    void check();
    const interval = window.setInterval(() => void check(), 5 * 60 * 1000);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  async function dismiss() {
    if (!announcement || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await api(`/auth/releases/${announcement.id}/acknowledge`, { method: 'POST', redirectOnAuthError: false });
      acknowledged.current.add(announcement.id);
      setAnnouncement(null);
    } catch {
      setError('No pudimos guardar la confirmación. Intenta nuevamente.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <Modal opened={Boolean(announcement)} onClose={() => void dismiss()} centered size="lg" radius="lg"
    title={<Group gap="sm"><ThemeIcon variant="light" radius="xl" size="lg"><IconSparkles size={22} /></ThemeIcon><Text fw={700}>Actualización</Text></Group>}
    closeButtonProps={{ 'aria-label': 'Cerrar actualización', disabled: saving }} closeOnClickOutside={false} closeOnEscape={!saving}>
    {announcement ? <Stack gap="lg" pt="xs">
      <div><Badge variant="light" mb="sm">Novedades de REV</Badge><Title order={2} size="h3">{announcement.title}</Title></div>
      <Stack gap="sm">{announcement.paragraphs.map((paragraph, index) => <Text key={index} style={{ whiteSpace: 'pre-line' }}>{paragraph}</Text>)}</Stack>
      {error ? <Alert color="red" role="alert">{error}</Alert> : null}
      <Group justify="flex-end"><Button onClick={() => void dismiss()} loading={saving}>Entendido</Button></Group>
    </Stack> : null}
  </Modal>;
}
