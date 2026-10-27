'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { useDebouncedValue } from '@mantine/hooks';
import type { LedgerItem } from '@/components/LedgerTable';
import DataTableToolbar from '@/components/tables/DataTableToolbar';
import {
  groupLedgerItemsByDocument,
  type LedgerDocumentGroup,
} from '@/components/LedgerDocumentTable';
import { api, ApiError } from '@/lib/api';
import { buildLedgerQuery, buildLedgerLocation, readLedgerLocation, createInitialLedgerFilters, ledgerCustomerOptions, ledgerWorksiteOptions, type LedgerDateRange, type LedgerFilters as Filters, type LedgerWorksiteOption as WorksiteOption } from '@/lib/ledger-filters';
import styles from './ledger.module.css';
import glass from '../../employees/directory.module.css';

const MOVEMENT_TYPES = ['OUT', 'TRANSIT', 'IN', 'ADJUST', 'ON_SITE'];
const FILTER_OPTIONS_TAKE = 200;

type LedgerResponse = { items: LedgerItem[]; nextCursor: string | null };
type WarehouseOption = { id: string; name: string };
type SkuOption = { id: string; name: string };
type AssetOption = { id: string; serialOrEngine: string | null; description: string | null };

function dateInputDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 16);
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

function worksiteSummary(group: LedgerDocumentGroup) {
  return Array.from(new Set(group.items.flatMap(item => {
    const location = item.customerWorksite ?? item.document?.customerWorksite;
    return location ? [[location.customer?.name, location.worksite?.name].filter(Boolean).join(' / ')] : [];
  }))).join(' · ');
}

function requester(group: LedgerDocumentGroup) {
  const creator = group.items[0]?.document?.creator;
  if (creator?.employee) return `${creator.employee.name} ${creator.employee.lastName ?? ''}`.trim();
  return creator?.email ?? group.items[0]?.creator?.employee?.name ?? group.items[0]?.creator?.email ?? 'Sin responsable';
}

function formattedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

export default function LedgerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locationQuery = searchParams.toString();
  const locationState = useMemo(() => readLedgerLocation(new URLSearchParams(locationQuery)), [locationQuery]);
  // Text changes must not recreate filters and bypass the search debounce.
  const filterQuery = buildLedgerQuery(locationState.filters, '');
  const filters = useMemo(() => readLedgerLocation(new URLSearchParams(filterQuery)).filters, [filterQuery]);
  const { search, dateRange } = locationState;
  const [draftFilters, setDraftFilters] = useState<Filters>(filters);
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filterOptionsError, setFilterOptionsError] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [worksites, setWorksites] = useState<WorksiteOption[]>([]);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const latestRequest = useRef(0);

  const fetchLedger = useCallback(async (cursor?: string | null) => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(null);
    setUnauthorized(false);
    try {
      const response = await api<LedgerResponse>(`/inventory/ledger?${buildLedgerQuery(filters, debouncedSearch, cursor)}`, { method: 'GET' });
      if (requestId !== latestRequest.current) return;
      setItems((current) => (cursor ? [...current, ...response.items] : response.items));
      setNextCursor(response.nextCursor);
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUnauthorized(true);
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo consultar el historial.');
      }
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [filters, debouncedSearch]);

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void fetchLedger();
    return () => { latestRequest.current += 1; };
  }, [fetchLedger]);

  useEffect(() => {
    let active = true;
    const load = async <T,>(path: string, setRows: (rows: T[]) => void) => {
      try {
        const rows = await api<T[]>(path);
        if (active) setRows(rows);
      } catch {
        if (active) setFilterOptionsError(true);
      }
    };
    void Promise.all([
      load('/warehouses', setWarehouses),
      load('/worksites', setWorksites),
      load('/skus', setSkus),
      load(`/assets?take=${FILTER_OPTIONS_TAKE}`, setAssets),
    ]).finally(() => { if (active) setFiltersLoading(false); });
    return () => { active = false; };
  }, []);

  const visibleGroups = useMemo(() => groupLedgerItemsByDocument(items), [items]);
  const visibleMovements = visibleGroups.reduce((total, group) => total + group.items.length, 0);

  const customerOptions = useMemo(() => ledgerCustomerOptions(worksites), [worksites]);
  const worksiteOptions = useMemo(() => ledgerWorksiteOptions(worksites, filters.customerId), [worksites, filters.customerId]);

  const updateAndFetch = (next: Filters, nextSearch = search, nextRange: LedgerDateRange = dateRange) => {
    // Next's native history integration updates useSearchParams without a page
    // transition or an extra Back entry for every filter change/keystroke.
    window.history.replaceState(null, '', buildLedgerLocation(next, nextSearch, nextRange));
  };

  const handleDateRange = (value: string | null) => {
    const nextValue = value ?? 'all';
    if (nextValue === 'custom') return;
    const next = { ...filters, from: nextValue === 'all' ? '' : dateInputDaysAgo(Number(nextValue)), to: '' };
    updateAndFetch(next, search, nextValue as LedgerDateRange);
  };

  const clearFilters = () => {
    const next = createInitialLedgerFilters();
    updateAndFetch(next, '', 'all');
  };

  if (unauthorized) {
    return <main><Container size="md" py="xl"><Text c="red" fw={600}>No autorizado.</Text><Button mt="md" onClick={() => router.replace('/login')}>Ir a login</Button></Container></main>;
  }

  return (
    <main className={`${glass.page} ${styles.page}`}>
      <Container size="xl" py={{ base: 'lg', md: 40 }}>
        <header className={styles.header}>
          <Text component="h1">Historial de movimientos</Text>
          <Text>Revisa entradas, salidas, movimientos en tránsito y ajustes de inventario.</Text>
        </header>

        <section className={glass.surface} aria-label="Consulta de movimientos">
        <div className={styles.filterRail}>
          <DataTableToolbar mb={0} controlsStyle={{ flex: '1 1 100%', alignItems: 'flex-end' }}>
          <TextInput
            label="Buscar"
            aria-label="Buscar cliente, obra, documento o equipo"
            placeholder="Buscar cliente, obra, documento o equipo"
            maxLength={200}
            value={search}
            onChange={(event) => updateAndFetch(filters, event.currentTarget.value)}
            leftSection={<IconSearch size={17} />}
            className={styles.search}
            style={{ flex: '1 1 240px' }}
          />
          <Select
            label="Movimiento"
            aria-label="Filtrar por movimiento"
            value={filters.movementType || 'ALL'}
            onChange={(value) => updateAndFetch({ ...filters, movementType: value === 'ALL' ? '' : value ?? '' })}
            data={[{ value: 'ALL', label: 'Todos los movimientos' }, ...MOVEMENT_TYPES.map((value) => ({ value, label: value === 'OUT' ? 'Salida' : value === 'IN' ? 'Entrada' : value === 'TRANSIT' ? 'En tránsito' : value === 'ON_SITE' ? 'En obra' : 'Ajuste' }))]}
            allowDeselect={false}
            style={{ flex: '1 1 150px' }}
          />
          <Select
            label="Fecha"
            aria-label="Rango de fechas"
            value={dateRange}
            onChange={handleDateRange}
            data={[{ value: '7', label: 'Últimos 7 días' }, { value: '30', label: 'Últimos 30 días' }, { value: '90', label: 'Últimos 90 días' }, { value: 'all', label: 'Todo el historial' }, ...(dateRange === 'custom' ? [{ value: 'custom', label: 'Fechas personalizadas', disabled: true }] : [])]}
            allowDeselect={false}
            style={{ flex: '1 1 145px' }}
          />
          <Button variant="subtle" color="gray" leftSection={<IconFilter size={16} />} onClick={() => { setDraftFilters(filters); setFiltersOpen(true); }}>Más filtros</Button>
          <Button variant="subtle" color="gray" onClick={clearFilters}>Limpiar</Button>
          </DataTableToolbar>
          <SimpleGrid cols={{ base: 1, sm: 3 }} mt="md">
            <Select label="Cliente" placeholder={filtersLoading ? 'Cargando...' : 'Todos los clientes'}
              value={filters.customerId || null} data={customerOptions} searchable clearable disabled={filtersLoading}
              nothingFoundMessage="No se encontraron clientes"
              onChange={(value) => updateAndFetch({ ...filters, customerId: value ?? '', customerWorksiteId: '' })} />
            <Select label="Obra" placeholder={filtersLoading ? 'Cargando...' : 'Todas las obras'}
              value={filters.customerWorksiteId || null} data={worksiteOptions} searchable clearable disabled={filtersLoading}
              nothingFoundMessage="No se encontraron obras"
              onChange={(value) => updateAndFetch({ ...filters, customerWorksiteId: value ?? '', customerId: value ? worksites.find(row => row.id === value)?.customer.id ?? '' : filters.customerId })} />
            <Select label="Bodega" placeholder={filtersLoading ? 'Cargando...' : 'Todas las bodegas'}
              value={filters.warehouseId || null} data={warehouses.map(row => ({ value: row.id, label: row.name }))} searchable clearable disabled={filtersLoading}
              nothingFoundMessage="No se encontraron bodegas"
              onChange={(value) => updateAndFetch({ ...filters, warehouseId: value ?? '' })} />
          </SimpleGrid>
        </div>

        {filterOptionsError ? <Alert color="yellow" mt="md">No se pudieron cargar los filtros. Puedes buscar por nombre o recargar la página.</Alert> : null}
        {error ? <Alert color="red" variant="light" title="No se pudo consultar el historial" mb="lg">{error}</Alert> : null}

        <Group justify="space-between" className={styles.resultsBar}>
          <Text>{visibleGroups.length} documento{visibleGroups.length === 1 ? '' : 's'} · {visibleMovements} movimiento{visibleMovements === 1 ? '' : 's'}</Text>
          <Text>Orden: más recientes <IconChevronDown size={14} /></Text>
        </Group>

        <div className={styles.tableWrap} aria-busy={loading}>
          <div className={styles.tableHeader}>
            <span>Documento</span><span>Movimiento</span><span>Ítems</span><span>Cliente / obra · Ubicación</span><span>Solicitado por</span><span>Fecha</span><span />
          </div>
          {visibleGroups.map((group) => {
            const href = group.documentId ? `/inventory/ledger/document/${group.documentId}` : '#';
            const worksite = worksiteSummary(group);
            const location = locationSummary(group);
            return (
              <Link key={group.key} href={href} className={styles.tableRow} aria-label={`Abrir documento ${group.reference}`}>
                <strong>{group.reference}</strong>
                <span className={styles.movement}>
                  {movementSummary(group).split(' / ').map((label) => (
                    <Badge key={label} color={movementColor(label)} variant="light" size="sm">{label}</Badge>
                  ))}
                </span>
                <span>{itemsSummary(group)}</span>
                <span className={styles.worksite}>{worksite || location}{worksite && location !== worksite ? <small>{location}</small> : null}</span>
                <span>{requester(group)}</span>
                <span>{formattedDate(group.items[0].effectiveAt)}</span>
                <IconArrowRight size={17} />
              </Link>
            );
          })}
          {!loading && visibleGroups.length === 0 ? <div className={styles.empty}><strong>No hay movimientos para mostrar</strong><span>Prueba otra búsqueda o cambia los filtros.</span></div> : null}
        </div>

        <Button variant="subtle" className={styles.loadMore} disabled={!nextCursor || search !== debouncedSearch} loading={loading} onClick={() => fetchLedger(nextCursor)}>
          {nextCursor ? 'Cargar más movimientos' : loading ? 'Cargando movimientos' : 'No hay más resultados'}
        </Button>

        </section>

        <Modal opened={filtersOpen} onClose={() => setFiltersOpen(false)} title="Más filtros" size="lg" centered>
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Select label="SKU" value={draftFilters.skuId} onChange={(value) => setDraftFilters((current) => ({ ...current, skuId: value ?? '' }))} data={skus.map((row) => ({ value: row.id, label: row.name }))} searchable clearable placeholder={filtersLoading ? 'Cargando...' : 'Todos'} />
              <Select label="Equipo" value={draftFilters.assetId} onChange={(value) => setDraftFilters((current) => ({ ...current, assetId: value ?? '' }))} data={assets.map((row) => ({ value: row.id, label: row.description || row.serialOrEngine || row.id }))} searchable clearable placeholder={filtersLoading ? 'Cargando...' : 'Todos'} />
              <TextInput label="Desde" type="datetime-local" value={draftFilters.from} onChange={(event) => { const value = event.currentTarget.value; setDraftFilters((current) => ({ ...current, from: value })); }} />
              <TextInput label="Hasta" type="datetime-local" value={draftFilters.to} onChange={(event) => { const value = event.currentTarget.value; setDraftFilters((current) => ({ ...current, to: value })); }} />
            </SimpleGrid>
            <Group justify="space-between">
              <Button variant="subtle" color="gray" onClick={() => { setDraftFilters(createInitialLedgerFilters()); clearFilters(); }}>Limpiar filtros</Button>
              <Button onClick={() => { updateAndFetch(draftFilters, search, draftFilters.from !== filters.from || draftFilters.to !== filters.to ? 'custom' : dateRange); setFiltersOpen(false); }} loading={loading}>Aplicar filtros</Button>
            </Group>
          </Stack>
        </Modal>
      </Container>
    </main>
  );
}
