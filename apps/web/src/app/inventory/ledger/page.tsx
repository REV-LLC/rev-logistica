'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconArrowRight, IconChevronDown, IconFilter, IconSearch } from '@tabler/icons-react';
import type { LedgerItem } from '@/components/LedgerTable';
import DataTableToolbar from '@/components/tables/DataTableToolbar';
import {
  groupLedgerItemsByDocument,
  type LedgerDocumentGroup,
} from '@/components/LedgerDocumentTable';
import { api, ApiError } from '@/lib/api';
import styles from './ledger.module.css';

const MOVEMENT_TYPES = ['OUT', 'TRANSIT', 'IN', 'ADJUST', 'ON_SITE'];
const DEFAULT_TAKE = 30;
const FILTER_OPTIONS_TAKE = 200;

type Filters = {
  warehouseId: string;
  customerWorksiteId: string;
  movementType: string;
  skuId: string;
  assetId: string;
  from: string;
  to: string;
};

type LedgerResponse = { items: LedgerItem[]; nextCursor: string | null };
type WarehouseOption = { id: string; name: string };
type WorksiteOption = {
  id: string;
  alias: string | null;
  customer: { id: string; name: string };
  worksite: { id: string; name: string };
};
type SkuOption = { id: string; name: string };
type AssetOption = { id: string; serialOrEngine: string | null; description: string | null };

function dateInputDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 16);
}

function createInitialFilters(): Filters {
  return {
    warehouseId: '',
    customerWorksiteId: '',
    movementType: '',
    skuId: '',
    assetId: '',
    from: dateInputDaysAgo(30),
    to: '',
  };
}

function buildQuery(filters: Filters, cursor?: string | null) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  params.set('take', String(DEFAULT_TAKE));
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

function movementLabel(item: LedgerItem) {
  if (item.movementType === 'ADJUST') return item.assetId && item.quantity > 0 ? 'CREACIÓN' : 'AJUSTE';
  if (item.movementType === 'OUT') return 'SALIDA';
  if (item.movementType === 'IN') return 'ENTRADA';
  if (item.movementType === 'TRANSIT') return 'EN TRÁNSITO';
  if (item.movementType === 'ON_SITE') return 'EN OBRA';
  return item.movementType;
}

function movementSummary(group: LedgerDocumentGroup) {
  return Array.from(new Set(group.items.map(movementLabel))).join(' / ');
}

function movementColor(label: string) {
  if (label === 'ENTRADA') return 'green';
  if (label === 'SALIDA') return 'blue';
  if (label === 'EN TRÁNSITO') return 'yellow';
  if (label === 'EN OBRA') return 'teal';
  if (label === 'CREACIÓN') return 'violet';
  return 'gray';
}

function itemName(item: LedgerItem) {
  return item.asset?.description ?? item.sku?.name ?? item.asset?.sku?.name ?? item.skuId ?? 'Ítem';
}

function itemsSummary(group: LedgerDocumentGroup) {
  const names = Array.from(new Set(group.items.map(itemName)));
  const visible = names.slice(0, 2).join(', ');
  return `${group.items.length} · ${visible}${names.length > 2 ? ` +${names.length - 2}` : ''}`;
}

function locationName(item: LedgerItem) {
  if (item.warehouse) return item.warehouse.name;
  if (item.customerWorksite) {
    return `${item.customerWorksite.customer?.name ?? 'Cliente'} / ${item.customerWorksite.worksite?.name ?? 'Obra'}`;
  }
  return 'Sin ubicación';
}

function locationSummary(group: LedgerDocumentGroup) {
  const locations = Array.from(new Set(group.items.map(locationName)));
  return locations.length > 1 ? locations.join(' → ') : locations[0];
}

function requester(group: LedgerDocumentGroup) {
  const creator = group.items[0]?.document?.creator;
  if (creator?.employee) return `${creator.employee.name} ${creator.employee.lastName ?? ''}`.trim();
  return creator?.email ?? group.items[0]?.creator?.employee?.name ?? group.items[0]?.creator?.email ?? 'Sin responsable';
}

function formattedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function searchableText(group: LedgerDocumentGroup) {
  return [
    group.reference,
    group.documentType,
    movementSummary(group),
    locationSummary(group),
    requester(group),
    ...group.items.flatMap((item) => [itemName(item), item.asset?.serialOrEngine, item.skuId, item.assetId]),
  ].filter(Boolean).join(' ').toLocaleLowerCase('es');
}

export default function LedgerPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(createInitialFilters);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('30');
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [worksites, setWorksites] = useState<WorksiteOption[]>([]);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);

  const fetchLedger = async (options?: { append?: boolean; filtersOverride?: Filters }) => {
    const activeFilters = options?.filtersOverride ?? filters;
    setLoading(true);
    setError(null);
    setUnauthorized(false);
    try {
      const cursor = options?.append ? nextCursor : null;
      const response = await api<LedgerResponse>(`/inventory/ledger?${buildQuery(activeFilters, cursor)}`, { method: 'GET' });
      setItems((current) => (options?.append ? [...current, ...response.items] : response.items));
      setNextCursor(response.nextCursor);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUnauthorized(true);
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo consultar el historial.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialFilters = createInitialFilters();
    setFilters(initialFilters);
    void fetchLedger({ filtersOverride: initialFilters });
    void Promise.all([
      api<WarehouseOption[]>('/warehouses'),
      api<WorksiteOption[]>('/worksites'),
      api<SkuOption[]>('/skus'),
      api<AssetOption[]>(`/assets?take=${FILTER_OPTIONS_TAKE}`),
    ]).then(([warehouseRows, worksiteRows, skuRows, assetRows]) => {
      setWarehouses(warehouseRows);
      setWorksites(worksiteRows);
      setSkus(skuRows);
      setAssets(assetRows);
    }).catch(() => undefined).finally(() => setFiltersLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => groupLedgerItemsByDocument(items), [items]);
  const visibleGroups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    return query ? groups.filter((group) => searchableText(group).includes(query)) : groups;
  }, [groups, search]);
  const visibleMovements = visibleGroups.reduce((total, group) => total + group.items.length, 0);

  const locationValue = filters.warehouseId
    ? `warehouse:${filters.warehouseId}`
    : filters.customerWorksiteId
      ? `worksite:${filters.customerWorksiteId}`
      : '';

  const updateAndFetch = (next: Filters) => {
    setFilters(next);
    setItems([]);
    setNextCursor(null);
    void fetchLedger({ filtersOverride: next });
  };

  const handleDateRange = (value: string | null) => {
    const nextValue = value ?? 'all';
    setDateRange(nextValue);
    const next = { ...filters, from: nextValue === 'all' ? '' : dateInputDaysAgo(Number(nextValue)), to: '' };
    updateAndFetch(next);
  };

  const clearFilters = () => {
    const next: Filters = { warehouseId: '', customerWorksiteId: '', movementType: '', skuId: '', assetId: '', from: '', to: '' };
    setDateRange('all');
    setSearch('');
    updateAndFetch(next);
  };

  if (unauthorized) {
    return <main><Container size="md" py="xl"><Text c="red" fw={600}>No autorizado.</Text><Button mt="md" onClick={() => router.replace('/login')}>Ir a login</Button></Container></main>;
  }

  return (
    <main className={styles.page}>
      <Container size="xl" py={{ base: 'lg', md: 40 }}>
        <header className={styles.header}>
          <Text component="h1">Historial de movimientos</Text>
          <Text>Revisa entradas, salidas, movimientos en tránsito y ajustes de inventario.</Text>
        </header>

        <div className={styles.filterRail}>
          <DataTableToolbar mb={0} controlsStyle={{ flex: '1 1 100%' }}>
          <TextInput
            aria-label="Buscar documento, ítem o serial"
            placeholder="Buscar documento, ítem o serial"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            leftSection={<IconSearch size={17} />}
            className={styles.search}
            style={{ flex: '1 1 240px' }}
          />
          <Select
            aria-label="Filtrar por movimiento"
            value={filters.movementType || 'ALL'}
            onChange={(value) => updateAndFetch({ ...filters, movementType: value === 'ALL' ? '' : value ?? '' })}
            data={[{ value: 'ALL', label: 'Todos los movimientos' }, ...MOVEMENT_TYPES.map((value) => ({ value, label: value === 'OUT' ? 'Salida' : value === 'IN' ? 'Entrada' : value === 'TRANSIT' ? 'En tránsito' : value === 'ON_SITE' ? 'En obra' : 'Ajuste' }))]}
            allowDeselect={false}
            style={{ flex: '1 1 150px' }}
          />
          <Select
            aria-label="Filtrar por ubicación"
            value={locationValue || 'ALL'}
            onChange={(value) => {
              const [kind, id] = (value === 'ALL' ? '' : value ?? '').split(':');
              updateAndFetch({ ...filters, warehouseId: kind === 'warehouse' ? id : '', customerWorksiteId: kind === 'worksite' ? id : '' });
            }}
            data={[
              { value: 'ALL', label: 'Todas las ubicaciones' },
              ...warehouses.map((row) => ({ value: `warehouse:${row.id}`, label: row.name })),
              ...worksites.map((row) => ({ value: `worksite:${row.id}`, label: row.alias || `${row.customer.name} / ${row.worksite.name}` })),
            ]}
            searchable
            allowDeselect={false}
            style={{ flex: '1 1 170px' }}
          />
          <Select
            aria-label="Rango de fechas"
            value={dateRange}
            onChange={handleDateRange}
            data={[{ value: '7', label: 'Últimos 7 días' }, { value: '30', label: 'Últimos 30 días' }, { value: '90', label: 'Últimos 90 días' }, { value: 'all', label: 'Todo el historial' }]}
            allowDeselect={false}
            style={{ flex: '1 1 145px' }}
          />
          <Button variant="subtle" color="gray" leftSection={<IconFilter size={16} />} onClick={() => setFiltersOpen(true)}>Más filtros</Button>
          </DataTableToolbar>
        </div>

        {error ? <Alert color="red" variant="light" title="No se pudo consultar el historial" mb="lg">{error}</Alert> : null}

        <Group justify="space-between" className={styles.resultsBar}>
          <Text>{visibleGroups.length} documento{visibleGroups.length === 1 ? '' : 's'} · {visibleMovements} movimiento{visibleMovements === 1 ? '' : 's'}</Text>
          <Text>Orden: más recientes <IconChevronDown size={14} /></Text>
        </Group>

        <div className={styles.tableWrap} aria-busy={loading}>
          <div className={styles.tableHeader}>
            <span>Documento</span><span>Movimiento</span><span>Ítems</span><span>Ubicación</span><span>Solicitado por</span><span>Fecha</span><span />
          </div>
          {visibleGroups.map((group) => {
            const href = group.documentId ? `/inventory/ledger/document/${group.documentId}` : '#';
            return (
              <Link key={group.key} href={href} className={styles.tableRow} aria-label={`Abrir documento ${group.reference}`}>
                <strong>{group.reference}</strong>
                <span className={styles.movement}>
                  {movementSummary(group).split(' / ').map((label) => (
                    <Badge key={label} color={movementColor(label)} variant="light" size="sm">{label}</Badge>
                  ))}
                </span>
                <span>{itemsSummary(group)}</span>
                <span>{locationSummary(group)}</span>
                <span>{requester(group)}</span>
                <span>{formattedDate(group.items[0].createdAt)}</span>
                <IconArrowRight size={17} />
              </Link>
            );
          })}
          {!loading && visibleGroups.length === 0 ? <div className={styles.empty}><strong>No hay movimientos para mostrar</strong><span>Prueba otra búsqueda o cambia los filtros.</span></div> : null}
        </div>

        <Button variant="subtle" className={styles.loadMore} disabled={!nextCursor} loading={loading} onClick={() => fetchLedger({ append: true })}>
          {nextCursor ? 'Cargar más movimientos' : loading ? 'Cargando movimientos' : 'No hay más resultados'}
        </Button>

        <Modal opened={filtersOpen} onClose={() => setFiltersOpen(false)} title="Más filtros" size="lg" centered>
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Select label="SKU" value={filters.skuId} onChange={(value) => setFilters((current) => ({ ...current, skuId: value ?? '' }))} data={skus.map((row) => ({ value: row.id, label: row.name }))} searchable clearable placeholder={filtersLoading ? 'Cargando...' : 'Todos'} />
              <Select label="Equipo" value={filters.assetId} onChange={(value) => setFilters((current) => ({ ...current, assetId: value ?? '' }))} data={assets.map((row) => ({ value: row.id, label: row.description || row.serialOrEngine || row.id }))} searchable clearable placeholder={filtersLoading ? 'Cargando...' : 'Todos'} />
              <TextInput label="Desde" type="datetime-local" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.currentTarget.value }))} />
              <TextInput label="Hasta" type="datetime-local" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.currentTarget.value }))} />
            </SimpleGrid>
            <Group justify="space-between">
              <Button variant="subtle" color="gray" onClick={clearFilters}>Limpiar filtros</Button>
              <Button onClick={() => { updateAndFetch(filters); setFiltersOpen(false); }} loading={loading}>Aplicar filtros</Button>
            </Group>
          </Stack>
        </Modal>
      </Container>
    </main>
  );
}
