'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
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
const DEFAULT_TAKE = 30;
const FILTER_OPTIONS_TAKE = 200;

type LedgerResponse = {
  items: LedgerItem[];
  nextCursor: string | null;
};

type WarehouseOption = {
  id: string;
  name: string;
};

type WorksiteOption = {
  id: string;
  alias: string | null;
  customer: {
    id: string;
    name: string;
  };
  worksite: {
    id: string;
    name: string;
  };
};

type SkuOption = {
  id: string;
  name: string;
};

type AssetOption = {
  id: string;
  serialOrEngine: string | null;
  description: string | null;
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
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [worksites, setWorksites] = useState<WorksiteOption[]>([]);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);

  const buildQuery = (cursor?: string | null) => {
    const params = new URLSearchParams();
    if (filters.warehouseId) params.set('warehouseId', filters.warehouseId);
    if (filters.customerWorksiteId) params.set('customerWorksiteId', filters.customerWorksiteId);
    if (filters.movementType) params.set('movementType', filters.movementType);
    if (filters.skuId) params.set('skuId', filters.skuId);
    if (filters.assetId) params.set('assetId', filters.assetId);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    params.set('take', String(DEFAULT_TAKE));
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

  const loadFilterOptions = async () => {
    setFiltersLoading(true);
    try {
      const [warehousesData, worksitesData, skusData, assetsData] = await Promise.all([
        api<WarehouseOption[]>('/warehouses', { method: 'GET' }),
        api<WorksiteOption[]>('/worksites', { method: 'GET' }),
        api<SkuOption[]>('/skus', { method: 'GET' }),
        api<AssetOption[]>(`/assets?take=${FILTER_OPTIONS_TAKE}`, { method: 'GET' }),
      ]);
      setWarehouses(warehousesData);
      setWorksites(worksitesData);
      setSkus(skusData);
      setAssets(assetsData);
    } catch {
      // Keep page functional even if filter catalogs fail.
      setWarehouses([]);
      setWorksites([]);
      setSkus([]);
      setAssets([]);
    } finally {
      setFiltersLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
    loadFilterOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <Title order={2}>Historial de Movimientos</Title>
          <Text c="dimmed">Consulta los movimientos de inventario por filtros.</Text>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mt="md">
            <Select
              label="Bodega"
              value={filters.warehouseId}
              onChange={(value) => setFilters((prev) => ({ ...prev, warehouseId: value ?? '' }))}
              placeholder={filtersLoading ? 'Cargando bodegas...' : 'Todas'}
              data={warehouses.map((warehouse) => ({
                value: warehouse.id,
                label: warehouse.name,
              }))}
              searchable
              clearable
            />
            <Select
              label="Obra"
              value={filters.customerWorksiteId}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, customerWorksiteId: value ?? '' }))
              }
              placeholder={filtersLoading ? 'Cargando obras...' : 'Todas'}
              data={worksites.map((row) => ({
                value: row.id,
                label: `${row.customer.name} / ${row.worksite.name}${row.alias ? ` (${row.alias})` : ''}`,
              }))}
              searchable
              clearable
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
            <Select
              label="SKU"
              value={filters.skuId}
              onChange={(value) => setFilters((prev) => ({ ...prev, skuId: value ?? '' }))}
              placeholder={filtersLoading ? 'Cargando SKUs...' : 'Todos'}
              data={skus.map((sku) => ({
                value: sku.id,
                label: sku.name,
              }))}
              searchable
              clearable
            />
            <Select
              label="Activo"
              value={filters.assetId}
              onChange={(value) => setFilters((prev) => ({ ...prev, assetId: value ?? '' }))}
              placeholder={filtersLoading ? 'Cargando activos...' : 'Todos'}
              data={assets.map((asset) => ({
                value: asset.id,
                label: asset.description || asset.serialOrEngine || asset.id,
              }))}
              searchable
              clearable
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

      </Container>
    </main>
  );
}
