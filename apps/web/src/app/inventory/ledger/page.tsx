'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import LedgerTable, { LedgerItem } from '@/components/LedgerTable';
import { useRouter } from 'next/navigation';
import {
  Alert,
  ActionIcon,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import {
  IconArrowsShuffle,
  IconChecklist,
  IconFilter,
} from '@tabler/icons-react';

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
    to: '',
  });
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
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
        { method: 'GET' },
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
        setError('Unexpected error.');
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

  const hasActiveFilters = Object.values(filters).some(Boolean);
  const activeFiltersCount = Object.values(filters).filter(Boolean).length;

  const clearFilters = () => {
    setFilters({
      warehouseId: '',
      customerWorksiteId: '',
      movementType: '',
      skuId: '',
      assetId: '',
      from: '',
      to: '',
    });
    setItems([]);
    setNextCursor(null);
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
      <Container size="xl" py="xl">
        <Stack gap="lg">
          <PageHeaderCard
            title="Historial de movimientos"
            description="Revisa entradas, salidas, movimientos en transito y ajustes de inventario con filtros combinados."
            icon={<IconArrowsShuffle size={20} />}
            iconColor="blue"
            accentColor="rgba(59,130,246,0.12)"
            aside={
              <ActionIcon
                variant={hasActiveFilters ? 'filled' : 'light'}
                color={hasActiveFilters ? 'blue' : 'gray'}
                size="lg"
                radius="xl"
                aria-label={hasActiveFilters ? `Filtros activos (${activeFiltersCount})` : 'Abrir filtros'}
                onClick={() => setFiltersOpen(true)}
              >
                <IconFilter size={18} />
              </ActionIcon>
            }
          >
            {items.length > 0 ? (
              <Stack gap="md">
                <Group justify="space-between" align="flex-start" className="mobile-stack">
                  <div>
                    <Text fw={700}>Resultados</Text>
                    <Text size="sm" c="dimmed">
                      {items.length} movimiento{items.length === 1 ? '' : 's'} cargado
                      {items.length === 1 ? '' : 's'}.
                    </Text>
                  </div>
                  {hasActiveFilters ? (
                    <Text size="sm" c="dimmed">
                      {activeFiltersCount} filtro{activeFiltersCount === 1 ? '' : 's'} activo
                      {activeFiltersCount === 1 ? '' : 's'}
                    </Text>
                  ) : null}
                </Group>
                <LedgerTable items={items} />
                <Group>
                  <Button
                    variant="light"
                    disabled={!nextCursor}
                    loading={loading}
                    onClick={() => fetchLedger({ append: true })}
                  >
                    {nextCursor ? 'Cargar mas' : 'No hay mas resultados'}
                  </Button>
                </Group>
              </Stack>
            ) : loading ? (
              <Text size="sm" c="dimmed">
                Cargando movimientos...
              </Text>
            ) : (
              <Stack align="center" gap="xs" py="md">
                <ThemeIcon color="gray" variant="light" size={40} radius="xl">
                  <IconChecklist size={20} />
                </ThemeIcon>
                <Text fw={700}>No hay movimientos para mostrar</Text>
                <Text size="sm" c="dimmed" ta="center">
                  Adjust filters or run a new search to review another part of the history.
                </Text>
              </Stack>
            )}
          </PageHeaderCard>

          {error ? (
            <Alert color="red" variant="light" title="No se pudo consultar el ledger">
              {error}
            </Alert>
          ) : null}

          <Modal
            opened={filtersOpen}
            onClose={() => setFiltersOpen(false)}
            title="Filtros de busqueda"
            size="xl"
            centered
          >
            <Stack gap="md">
              <div>
                <Text fw={700}>Adjust the query</Text>
                <Text size="sm" c="dimmed">
                  Combine location, worksite, movement type, and date range to isolate the history you need.
                </Text>
              </div>

              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                <Select
                  label="Bodega"
                  value={filters.warehouseId}
                  onChange={(value) => setFilters((prev) => ({ ...prev, warehouseId: value ?? '' }))}
                  placeholder={filtersLoading ? 'Cargando bodegas...' : 'Todos'}
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
                  placeholder={filtersLoading ? 'Cargando obras...' : 'Todos'}
                  data={worksites.map((row) => ({
                    value: row.id,
                    label: `${row.customer.name} / ${row.worksite.name}${row.alias ? ` (${row.alias})` : ''}`,
                  }))}
                  searchable
                  clearable
                />
                <Select
                  label="Movement type"
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
                  label="Asset"
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
                <div />
                <TextInput
                  label="From"
                  type="datetime-local"
                  value={filters.from}
                  onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
                />
                <TextInput
                  label="To"
                  type="datetime-local"
                  value={filters.to}
                  onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
                />
              </SimpleGrid>

              <Group justify="space-between" className="mobile-actions">
                <Button
                  variant="subtle"
                  color="gray"
                  onClick={clearFilters}
                  disabled={!hasActiveFilters}
                >
                  Limpiar filtros
                </Button>
                <Button
                  onClick={async () => {
                    await fetchLedger();
                    setFiltersOpen(false);
                  }}
                  loading={loading}
                >
                  Buscar movimientos
                </Button>
              </Group>
            </Stack>
          </Modal>

        </Stack>
      </Container>
    </main>
  );
}
