'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Stack, Text } from '@mantine/core';
import { IconBell, IconBellOff } from '@tabler/icons-react';
import { api } from '@/lib/api';
import { getCurrentUserRole, getCurrentUserSession } from '@/lib/auth';

type DraftDocument = {
  id: string;
  type: 'REMISSION' | 'RETURN' | string;
  consecutive: string | null;
  creator?: {
    name: string | null;
    email: string | null;
    role?: string | null;
  } | null;
};

type PermissionState = NotificationPermission | 'unsupported';

const ENABLED_STORAGE_KEY = 'rev:office-draft-browser-notifications:v1';
const SEEN_STORAGE_KEY = 'rev:office-draft-browser-notifications:seen:v1';
const POLL_INTERVAL_MS = 20_000;
const MAX_SEEN_DOCUMENTS = 250;

function readSeenIds(storageKey: string) {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

function saveSeenIds(storageKey: string, ids: Iterable<string>) {
  window.localStorage.setItem(
    storageKey,
    JSON.stringify([...ids].slice(-MAX_SEEN_DOCUMENTS)),
  );
}

function documentKind(type: string) {
  return type === 'RETURN' ? 'DV' : 'RM';
}

export default function OfficeDraftBrowserNotifications() {
  const role = useMemo(() => getCurrentUserRole(), []);
  const userId = useMemo(() => getCurrentUserSession()?.sub ?? 'office', []);
  const enabledStorageKey = `${ENABLED_STORAGE_KEY}:${userId}`;
  const seenStorageKey = `${SEEN_STORAGE_KEY}:${userId}`;
  const [permission, setPermission] = useState<PermissionState>('unsupported');
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef(false);

  const loadDriverDrafts = useCallback(async () => {
    const documents = await api<DraftDocument[]>('/documents?status=DRAFT&take=100', {
      method: 'GET',
      redirectOnAuthError: false,
    });
    return documents.filter(
      (document) =>
        (document.type === 'REMISSION' || document.type === 'RETURN') &&
        document.creator?.role === 'DRIVER',
    );
  }, []);

  const seedCurrentDrafts = useCallback(async () => {
    const drafts = await loadDriverDrafts();
    saveSeenIds(seenStorageKey, drafts.map((document) => document.id));
  }, [loadDriverDrafts, seenStorageKey]);

  const checkForDrafts = useCallback(async () => {
    if (pollingRef.current || Notification.permission !== 'granted') return;
    pollingRef.current = true;
    try {
      const drafts = await loadDriverDrafts();
      const seenIds = readSeenIds(seenStorageKey);
      if (seenIds.size === 0) {
        saveSeenIds(seenStorageKey, drafts.map((document) => document.id));
        return;
      }

      const unseenDrafts = drafts.filter((document) => !seenIds.has(document.id));
      drafts.forEach((document) => seenIds.add(document.id));
      saveSeenIds(seenStorageKey, seenIds);

      unseenDrafts.reverse().forEach((document) => {
        const kind = documentKind(document.type);
        const creator = document.creator?.name?.trim() || document.creator?.email || 'Un conductor';
        const notification = new Notification(`Nueva solicitud de ${kind}`, {
          body: `${creator} hizo una solicitud de ${kind}${document.consecutive ? ` · ${document.consecutive}` : ''}.`,
          icon: '/fiesta.svg',
          tag: `draft-document-${document.id}`,
        });
        notification.onclick = () => {
          window.focus();
          window.location.assign(`/inventory/ledger/document/${document.id}`);
          notification.close();
        };
      });
    } catch {
      // A transient polling failure should not interrupt the user's work.
    } finally {
      pollingRef.current = false;
    }
  }, [loadDriverDrafts, seenStorageKey]);

  useEffect(() => {
    if (role !== 'OFFICE' || typeof Notification === 'undefined') return;
    setPermission(Notification.permission);
    setEnabled(
      Notification.permission === 'granted' &&
      window.localStorage.getItem(enabledStorageKey) === '1',
    );
  }, [enabledStorageKey, role]);

  useEffect(() => {
    if (role !== 'OFFICE' || !enabled || permission !== 'granted') return;
    void checkForDrafts();
    const interval = window.setInterval(() => void checkForDrafts(), POLL_INTERVAL_MS);
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkForDrafts();
    };
    document.addEventListener('visibilitychange', checkWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', checkWhenVisible);
    };
  }, [checkForDrafts, enabled, permission, role]);

  if (role !== 'OFFICE' || permission === 'unsupported') return null;

  const enableNotifications = async () => {
    setError(null);
    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);
    if (nextPermission !== 'granted') {
      setError('El navegador no autorizó las notificaciones.');
      return;
    }
    try {
      await seedCurrentDrafts();
      window.localStorage.setItem(enabledStorageKey, '1');
      setEnabled(true);
      new Notification('Avisos de solicitudes activados', {
        body: 'Te avisaremos cuando un conductor cree una RM o DV.',
        icon: '/fiesta.svg',
        tag: 'draft-notifications-enabled',
      });
    } catch {
      setError('No se pudieron activar los avisos. Intenta nuevamente.');
    }
  };

  const disableNotifications = () => {
    window.localStorage.removeItem(enabledStorageKey);
    setEnabled(false);
  };

  return (
    <Stack gap={4}>
      <Button
        type="button"
        size="xs"
        variant="light"
        color={enabled ? 'green' : permission === 'denied' ? 'red' : 'blue'}
        leftSection={enabled ? <IconBell size={15} /> : <IconBellOff size={15} />}
        onClick={enabled ? disableNotifications : enableNotifications}
        disabled={permission === 'denied'}
        fullWidth
        styles={{ inner: { justifyContent: 'flex-start' } }}
      >
        {enabled
          ? 'Avisos de solicitudes activos'
          : permission === 'denied'
            ? 'Notificaciones bloqueadas'
            : 'Activar avisos de solicitudes'}
      </Button>
      {error ? <Text size="xs" c="red">{error}</Text> : null}
    </Stack>
  );
}
