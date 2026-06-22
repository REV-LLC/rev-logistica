'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import LedgerTable, { LedgerItem } from '@/components/LedgerTable';
import RawJsonPanel from '@/components/RawJsonPanel';
import { Button, Container, Group, Paper, Select, Text, Title } from '@mantine/core';

const MOVEMENT_TYPES = ['OUT', 'TRANSIT', 'IN', 'ADJUST', 'ON_SITE'];

type LedgerResponse = {
  items: LedgerItem[];
  nextCursor: string | null;
};

export default function LedgerAssetPage() {
  const params = useParams<{ assetId: string }>();
  const router = useRouter();
  const assetId = params?.assetId;
  const [movementType, setMovementType] = useState('');
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const buildQuery = (cursor?: string | null) => {
    const params = new URLSearchParams();
    if (assetId) params.set('assetId', assetId);
    if (movementType) params.set('movementType', movementType);
    if (cursor) params.set('cursor', cursor);
    return params.toString();
  };

  const fetchLedger = async (options?: { append?: boolean }) => {
    if (!assetId) return;

    setLoading(true);
    setError(null);
    setUnauthorized(false);

    const cursor = options?.append ? nextCursor : null;
    const query = buildQuery(cursor);

    try {
      const response = await api<LedgerResponse>(
        `/inventory/ledger${query ? `?${query}` : ''}`,
        { method: 'GET' }
      );
      setItems((prev) => (options?.append ? [...prev, ...response.items] : response.items));
      setNextCursor(response.nextCursor);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUnauthorized(true);
        return;
      }
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error inesperado.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, movementType]);

  if (unauthorized) {
    return (
      <main>
        <Container size="md" py="xl">
          <Paper shadow="sm" p="xl" radius="md" withBorder>
            <Text c="red" fw={600}>
              No autorizado.
            </Text>
            <Button mt="md" onClick={() => router.replace('/login')}>
              Ir a login
            </Button>
          </Paper>
        </Container>
      </main>
    );
  }

  return (
    <main>
      <Container size="lg" py="xl">
        <Paper shadow="sm" p="xl" radius="md" withBorder>
          <Title order={2}>Ledger de activo</Title>
          <Text c="dimmed">Asset ID: {assetId}</Text>
          <Select
            label="Movement Type"
            mt="md"
            value={movementType}
            onChange={(value) => setMovementType(value ?? '')}
            clearable
            placeholder="Todos"
            data={MOVEMENT_TYPES.map((t) => ({ value: t, label: t }))}
          />
          {error && (
            <Text c="red" mt="sm">
              {error}
            </Text>
          )}
        </Paper>

        {items.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <LedgerTable items={items} />
          </div>
        )}

        {items.length > 0 && (
          <Group mt="md">
            <Button
              variant="light"
              disabled={!nextCursor}
              loading={loading}
              onClick={() => fetchLedger({ append: true })}
            >
              {nextCursor ? 'Cargar mas' : 'No hay mas resultados'}
            </Button>
          </Group>
        )}

        {items.length > 0 && <RawJsonPanel data={{ items, nextCursor }} />}
      </Container>
    </main>
  );
}
