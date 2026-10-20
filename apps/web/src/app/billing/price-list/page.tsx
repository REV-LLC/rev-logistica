'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconBox,
  IconDownload,
  IconListSearch,
  IconRefresh,
  IconTag,
} from '@tabler/icons-react';
import EmployeePageBackground from '@/components/EmployeePageBackground';
import StatCard from '@/components/dashboard/StatCard';
import DataTableToolbar from '@/components/tables/DataTableToolbar';
import EntityDataTable from '@/components/tables/EntityDataTable';
import type { DataTableColumn } from '@/components/tables/table.types';
import { useClientTableData } from '@/components/tables/useClientTableData';
import { api, ApiError } from '@/lib/api';
import glass from '../../employees/directory.module.css';
import tableGlass from '@/components/tables/GlassDataTable.module.css';
import styles from './price-list.module.css';

type ControlType = 'BULK' | 'SERIAL';

type PriceListSku = {
  id: string;
  name: string;
  price: number | string | null;
  replacementValue: number | string | null;
  chargeType: 'DAY' | 'HOUR' | string;
  minimumChargeHours: number | string | null;
  active: boolean;
  assetFamily: {
    id: string;
    code: string;
    name: string;
    controlType: ControlType;
  };
  controlType: ControlType;
  category: string;
};

const controlTypeOptions = [
  { value: 'BULK', label: 'Bulk' },
  { value: 'SERIAL', label: 'Serial' },
];

function toNumber(value: number | string | null | undefined) {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value: number | string | null | undefined) {
  const parsed = toNumber(value);
  if (parsed == null) return '-';

  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(parsed);
}

function formatChargeType(chargeType: string, minimumChargeHours: number | string | null) {
  if (chargeType === 'HOUR') {
    const minimum = toNumber(minimumChargeHours);
    return minimum ? `Hora (min. ${minimum} h)` : 'Hora';
  }

  if (chargeType === 'DAY') return 'Dia';

  return chargeType || '-';
}

function csvEscape(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export default function PriceListPage() {
  const [controlType, setControlType] = useState<ControlType>('BULK');
  const [items, setItems] = useState<PriceListSku[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadItems = async (targetControlType = controlType) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ controlType: targetControlType, ownOnly: 'true' });
      const response = await api<PriceListSku[]>(`/skus?${params.toString()}`, { method: 'GET' });
      setItems(response);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('No se pudo cargar la lista de precios.');
      }
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    loadItems(controlType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlType]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;

    return items.filter((item) => {
      const fields = [
        item.name,
        item.assetFamily.code,
        item.assetFamily.name,
        item.category,
        item.chargeType,
      ];
      return fields.some((field) => field?.toLowerCase().includes(term));
    });
  }, [items, search]);

  const pricedCount = useMemo(
    () => filteredItems.filter((item) => toNumber(item.price) != null).length,
    [filteredItems],
  );

  const priceColumns = useMemo<DataTableColumn<PriceListSku>[]>(() => [
    {
      id: 'reference',
      header: 'Referencia',
      ariaLabel: 'referencia',
      width: '25%',
      sortValue: (item) => item.name,
      mobile: { priority: 'primary' },
      cell: (item) => (
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div className={styles.referenceName}>
            <Text fw={600}>{item.name}</Text>
            <Badge mt={4} variant="light" color="gray" radius="sm">
              {item.assetFamily.code}
            </Badge>
          </div>
          <Badge hiddenFrom="md" color={item.active ? 'green' : 'gray'} variant="light">
            {item.active ? 'Activo' : 'Inactivo'}
          </Badge>
        </Group>
      ),
    },
    {
      id: 'family',
      header: 'Familia',
      ariaLabel: 'familia',
      width: '18%',
      sortValue: (item) => item.assetFamily.name,
      mobile: { label: 'Familia', priority: 'detail' },
      cell: (item) => item.assetFamily.name,
    },
    {
      id: 'customerPrice',
      header: 'Precio cliente',
      ariaLabel: 'precio cliente',
      width: '15%',
      align: 'right',
      sortValue: (item) => toNumber(item.price),
      mobile: { label: 'Precio cliente', priority: 'detail' },
      cell: (item) => formatMoney(item.price),
    },
    {
      id: 'replacementValue',
      header: 'Reposición',
      ariaLabel: 'valor de reposición',
      width: '15%',
      align: 'right',
      sortValue: (item) => toNumber(item.replacementValue),
      mobile: { label: 'Reposición', priority: 'detail' },
      cell: (item) => formatMoney(item.replacementValue),
    },
    {
      id: 'chargeType',
      header: 'Tipo de cobro',
      ariaLabel: 'tipo de cobro',
      width: '16%',
      sortValue: (item) => item.chargeType,
      mobile: { label: 'Tipo de cobro', priority: 'detail' },
      cell: (item) => formatChargeType(item.chargeType, item.minimumChargeHours),
    },
    {
      id: 'status',
      header: 'Estado',
      ariaLabel: 'estado',
      width: '11%',
      sortValue: (item) => item.active,
      mobile: false,
      cell: (item) => (
        <Badge color={item.active ? 'green' : 'gray'} variant="light">
          {item.active ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
  ], []);

  const priceTable = useClientTableData({
    rows: filteredItems,
    columns: priceColumns,
    initialPageSize: 20,
  });
  const exportCsv = () => {
    const headers = ['Tipo', 'Referencia', 'Codigo', 'Familia', 'Precio cliente', 'Valor reposicion', 'Tipo de cobro', 'Estado'];
    const rows = filteredItems.map((item) => [
      item.controlType,
      item.name,
      item.assetFamily.code,
      item.assetFamily.name,
      toNumber(item.price) ?? '',
      toNumber(item.replacementValue) ?? '',
      formatChargeType(item.chargeType, item.minimumChargeHours),
      item.active ? 'Activo' : 'Inactivo',
    ]);

    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lista-precios-propios-${controlType.toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Container size="xl" py="xl" className={`${glass.page} ${styles.page}`} data-page-loading={initialLoading ? 'true' : undefined}>
      <EmployeePageBackground src="/employees/rev-directory-v1.webp" mobileSrc="/employees/rev-directory-mobile-v1.webp" variant="brand" />
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
          <div>
            <Title order={1} className={glass.title}>Lista de precios</Title>
            <Text size="sm" c="dimmed">Tarifas de alquiler de equipos propios. No incluye referencias exclusivas de subalquiler.</Text>
          </div>
            <Group gap="xs" className={glass.headerActions}>
              <Button
                variant="light"
                color="gray"
                leftSection={<IconRefresh size={16} />}
                onClick={() => loadItems()}
                loading={loading}
              >
                Actualizar
              </Button>
              <Button
                variant="light"
                color="green"
                leftSection={<IconDownload size={16} />}
                onClick={exportCsv}
                disabled={!filteredItems.length}
              >
                CSV
              </Button>
            </Group>
        </Group>

        <section className={glass.surface} aria-label="Lista de precios de equipos propios">
          <Stack gap="lg">
          <Group gap="md" align="flex-end" wrap="wrap">
            <SegmentedControl
              aria-label="Tipo de inventario"
              className={styles.controlType}
              data={controlTypeOptions}
              value={controlType}
              onChange={(value) => setControlType(value as ControlType)}
              size="md"
            />
            <TextInput
              aria-label="Buscar referencias"
              leftSection={<IconListSearch size={16} />}
              placeholder="Buscar por referencia, codigo o familia"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              style={{ flex: '1 1 320px', minWidth: 0 }}
            />

          </Group>

        {error ? (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        ) : null}

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" visibleFrom="md" className={styles.metrics}>
          <StatCard
            variant="glass"
            label="Referencias"
            value={filteredItems.length}
            hint={`${controlType === 'BULK' ? 'Bulk' : 'Serial'} visibles`}
            icon={<IconBox size={20} />}
            color="yellow"
          />
          <StatCard
            variant="glass"
            label="Con precio cliente"
            value={pricedCount}
            hint="Precio principal registrado"
            icon={<IconTag size={20} />}
            color="green"
          />

        </SimpleGrid>

        <div className={tableGlass.table}>
          <Stack gap="md">
            <DataTableToolbar
              title={controlType === 'BULK' ? 'Items Bulk' : 'Items Serial'}
              description={loading ? 'Cargando referencias...' : `${filteredItems.length} items encontrados`}
              mb={0}
            >
              <Badge color={controlType === 'BULK' ? 'yellow' : 'blue'} variant="light" size="lg">
                {controlType}
              </Badge>
            </DataTableToolbar>

            {initialLoading ? <div className={glass.loadingSpace} role="status" aria-label="Cargando lista de precios" /> : <EntityDataTable
              rows={priceTable.rows}
              columns={priceColumns}
              getRowId={(item) => item.id}
              loading={loading}
              sort={priceTable.sort}
              onSortChange={priceTable.onSortChange}
              pagination={priceTable.pagination}
              onPageSizeChange={priceTable.onPageSizeChange}
              tableMinWidth={860}
              emptyState={{
                title: 'No hay referencias para mostrar',
                description: 'Prueba cambiando el tipo o búsqueda.',
              }}
            />}
          </Stack>
        </div>
          </Stack>
        </section>
      </Stack>
    </Container>
  );
}
