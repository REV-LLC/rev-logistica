'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import RawJsonPanel from '@/components/RawJsonPanel';
import LedgerTable, { LedgerItem } from '@/components/LedgerTable';
import { useRouter } from 'next/navigation';
import {
  Button,
  Container,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Text,
  TextInput,
  Title
} from '@mantine/core';

const MOVEMENT_TYPES = ['OUT', 'TRANSIT', 'IN', 'ADJUST', 'ON_SITE'];

type LedgerResponse = {
  items: LedgerItem[];
  nextCursor: string | null;
};

export default function LedgerPage() {
  const router = useRouter();
  const [filters, setFilters] = useState({
    warehouseId: '',
    customerWorksiteId: '',
    movementType: '',
    skuId: '',
    assetId: '',
    from: '',
    to: ''
  });
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const buildQuery = (cursor?: string | null) => {
    const params = new URLSearchParams();
    if (filters.warehouseId) params.set('warehouseId', filters.warehouseId);
    if (filters.customerWorksiteId) params.set('customerWorksiteId', filters.customerWorksiteId);
    if (filters.movementType) params.set('movementType', filters.movementType);
    if (filters.skuId) params.set('skuId', filters.skuId);
    if (filters.assetId) params.set('assetId', filters.assetId);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (cursor) params.set('cursor', cursor);
    return params.toString();
  };

  const fetchLedger = async (options?: { append?: boolean }) => {
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
          <Title order={2}>Ledger de Inventario</Title>
          <Text c="dimmed">Explora el historial de movimientos.</Text>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mt="md">
            <TextInput
              label="Warehouse ID"
              value={filters.warehouseId}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, warehouseId: event.target.value }))
              }
              placeholder="UUID"
            />
            <TextInput
              label="Customer Worksite ID"
              value={filters.customerWorksiteId}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, customerWorksiteId: event.target.value }))
              }
              placeholder="UUID"
            />
            <Select
              label="Movement Type"
              value={filters.movementType}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, movementType: value ?? '' }))
              }
              clearable
              placeholder="Todos"
              data={MOVEMENT_TYPES.map((t) => ({ value: t, label: t }))}
            />
            <TextInput
              label="SKU ID"
              value={filters.skuId}
              onChange={(event) => setFilters((prev) => ({ ...prev, skuId: event.target.value }))}
              placeholder="UUID"
            />
            <TextInput
              label="Asset ID"
              value={filters.assetId}
              onChange={(event) => setFilters((prev) => ({ ...prev, assetId: event.target.value }))}
              placeholder="UUID"
            />
            <TextInput
              label="Desde"
              type="datetime-local"
              value={filters.from}
              onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
            />
            <TextInput
              label="Hasta"
              type="datetime-local"
              value={filters.to}
              onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
            />
          </SimpleGrid>

          <Group mt="md">
            <Button onClick={() => fetchLedger()} loading={loading}>
              Buscar
            </Button>
            <Button
              variant="light"
              onClick={() => {
                setFilters({
                  warehouseId: '',
                  customerWorksiteId: '',
                  movementType: '',
                  skuId: '',
                  assetId: '',
                  from: '',
                  to: ''
                });
                setItems([]);
                setNextCursor(null);
              }}
            >
              Limpiar
            </Button>
          </Group>

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
              {nextCursor ? 'Cargar más' : 'Sin más resultados'}
            </Button>
          </Group>
        )}

        {items.length > 0 && <RawJsonPanel data={{ items, nextCursor }} />}
      </Container>
    </main>
  );
}
