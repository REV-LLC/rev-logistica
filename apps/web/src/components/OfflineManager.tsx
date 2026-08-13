'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Group, Modal, Paper, Stack, Text } from '@mantine/core';
import {
  listOfflineOperations,
  OFFLINE_QUEUE_EVENT,
  OfflineOperation,
  retryOfflineOperation,
  syncOfflineOperations,
} from '@/lib/offline-queue';

export default function OfflineManager() {
  const [online, setOnline] = useState(true);
  const [opened, setOpened] = useState(false);
  const [operations, setOperations] = useState<OfflineOperation[]>([]);

  const refresh = useCallback(async () => {
    setOnline(navigator.onLine);
    setOperations(await listOfflineOperations());
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    const handleOnline = () => {
      refresh();
      syncOfflineOperations().then(refresh);
    };
    const handleOffline = () => refresh();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(OFFLINE_QUEUE_EVENT, refresh);
    refresh();
    if (navigator.onLine) syncOfflineOperations().then(refresh);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(OFFLINE_QUEUE_EVENT, refresh);
    };
  }, [refresh]);

  const pendingCount = operations.filter((item) => item.status !== 'completed').length;
  const color = !online ? 'orange' : pendingCount ? 'yellow' : 'green';
  const label = !online ? 'Sin conexión' : pendingCount ? `${pendingCount} pendiente(s)` : 'En línea';

  return (
    <>
      <Badge
        component="button"
        type="button"
        color={color}
        variant="filled"
        onClick={() => setOpened(true)}
        style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 3000, cursor: 'pointer' }}
      >
        {label}
      </Badge>
      <Modal opened={opened} onClose={() => setOpened(false)} title="Sincronización offline">
        <Stack>
          <Text size="sm" c="dimmed">
            Los documentos pendientes permanecen en este dispositivo hasta que el servidor los confirme.
          </Text>
          {operations.length === 0 ? <Text size="sm">No hay operaciones guardadas.</Text> : null}
          {operations.slice().reverse().map((operation) => (
            <Paper key={operation.id} withBorder p="sm">
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text size="sm" fw={600}>{operation.label}</Text>
                  <Text size="xs" c="dimmed">
                    {new Date(operation.createdAt).toLocaleString('es-CO')} · {operation.status}
                  </Text>
                  {operation.error ? <Text size="xs" c="red">{operation.error}</Text> : null}
                </div>
                {operation.status === 'failed' || operation.status === 'conflict' ? (
                  <Button size="compact-xs" variant="light" onClick={() => retryOfflineOperation(operation.id).then(refresh)}>
                    Reintentar
                  </Button>
                ) : null}
              </Group>
            </Paper>
          ))}
          <Button disabled={!online || pendingCount === 0} onClick={() => syncOfflineOperations().then(refresh)}>
            Sincronizar ahora
          </Button>
        </Stack>
      </Modal>
    </>
  );
}
