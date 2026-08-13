'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconBox,
  IconDownload,
  IconFileDollar,
  IconListSearch,
  IconRefresh,
  IconTag,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import StatCard from '@/components/dashboard/StatCard';
import DataTableToolbar from '@/components/tables/DataTableToolbar';
import EntityDataTable from '@/components/tables/EntityDataTable';
import type { DataTableColumn } from '@/components/tables/table.types';
import { useClientTableData } from '@/components/tables/useClientTableData';
import { api, ApiError } from '@/lib/api';

type ControlType = 'BULK' | 'SERIAL';

type PriceListSku = {
  id: string;
  name: string;
  price: number | string | null;
  subrentalPrice: number | string | null;
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

type Warehouse = {
  id: string;
  name: string;
  type: 'OWN' | 'ALLY';
};

type ProviderSkuPrice = {
  providerWarehouseId: string;
  skuId: string;
  price: number;
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
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [providerWarehouseId, setProviderWarehouseId] = useState<string | null>(null);
  const [providerPrices, setProviderPrices] = useState<ProviderSkuPrice[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = async (targetControlType = controlType) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ controlType: targetControlType });
      const [response, priceResponse] = await Promise.all([
        api<PriceListSku[]>(`/skus?${params.toString()}`, { method: 'GET' }),
        api<ProviderSkuPrice[]>('/skus/provider-prices', { method: 'GET' }),
      ]);
      setItems(response);
      setProviderPrices(priceResponse);
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
    }
  };

  useEffect(() => {
    loadItems(controlType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlType]);

  useEffect(() => {
    api<Warehouse[]>('/warehouses')
      .then((rows) => setWarehouses(rows.filter((row) => row.type === 'ALLY')))
      .catch(() => setWarehouses([]));
  }, []);

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

  const providerPriceBySku = useMemo(
    () =>
      new Map(
        providerPrices
          .filter((row) => row.providerWarehouseId === providerWarehouseId)
          .map((row) => [row.skuId, row.price]),
      ),
    [providerPrices, providerWarehouseId],
  );
  const priceColumns = useMemo<DataTableColumn<PriceListSku>[]>(() => [
    {
      id: 'reference',
      header: 'Referencia',
      ariaLabel: 'referencia',
      width: '19%',
      sortValue: (item) => item.name,
      mobile: { priority: 'primary' },
      cell: (item) => (
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
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
      width: '14%',
      sortValue: (item) => item.assetFamily.name,
      mobile: { label: 'Familia', priority: 'detail' },
      cell: (item) => item.assetFamily.name,
    },
    {
      id: 'customerPrice',
      header: 'Precio cliente',
      ariaLabel: 'precio cliente',
      width: '13%',
      align: 'right',
      sortValue: (item) => toNumber(item.price),
      mobile: { label: 'Precio cliente', priority: 'detail' },
      cell: (item) => formatMoney(item.price),
    },
    {
      id: 'providerPrice',
      header: 'Costo proveedor',
      ariaLabel: 'costo proveedor',
      width: '14%',
      align: 'right',
      sortValue: (item) => providerPriceBySku.get(item.id),
      mobile: { label: 'Costo proveedor', priority: 'detail' },
      cell: (item) => formatMoney(providerPriceBySku.get(item.id)),
    },
    {
      id: 'replacementValue',
      header: 'Reposición',
      ariaLabel: 'valor de reposición',
      width: '13%',
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
  ], [providerPriceBySku]);

  const priceTable = useClientTableData({
    rows: filteredItems,
    columns: priceColumns,
    initialPageSize: 20,
  });
  const providerPricedCount = useMemo(
    () => filteredItems.filter((item) => providerPriceBySku.has(item.id)).length,
    [filteredItems, providerPriceBySku],
  );

  const inactiveCount = useMemo(
    () => filteredItems.filter((item) => !item.active).length,
    [filteredItems],
  );

  const exportCsv = () => {
    const selectedProvider = warehouses.find((warehouse) => warehouse.id === providerWarehouseId);
    const headers = ['Tipo', 'Referencia', 'Codigo', 'Familia', 'Precio cliente', 'Proveedor', 'Costo proveedor', 'Valor reposicion', 'Tipo de cobro', 'Estado'];
    const rows = filteredItems.map((item) => [
      item.controlType,
      item.name,
      item.assetFamily.code,
      item.assetFamily.name,
      toNumber(item.price) ?? '',
      selectedProvider?.name ?? '',
      providerPriceBySku.get(item.id) ?? '',
      toNumber(item.replacementValue) ?? '',
      formatChargeType(item.chargeType, item.minimumChargeHours),
      item.active ? 'Activo' : 'Inactivo',
    ]);

    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lista-precios-${controlType.toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        <PageHeaderCard
          title="Lista de precios"
          description="Compara el precio al cliente con el costo específico de cada proveedor."
          icon={<IconFileDollar size={20} />}
          iconColor="yellow"
          accentColor="rgba(217, 154, 24, 0.16)"
          aside={
            <Group gap="xs">
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
          }
        >
          <Group gap="md" align="flex-end" wrap="wrap">
            <SegmentedControl
              data={controlTypeOptions}
              value={controlType}
              onChange={(value) => setControlType(value as ControlType)}
              size="md"
            />
            <TextInput
              leftSection={<IconListSearch size={16} />}
              placeholder="Buscar por referencia, codigo o familia"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              style={{ flex: '1 1 320px' }}
            />
            <Select
              label="Proveedor"
              placeholder="Seleccionar proveedor"
              data={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))}
              value={providerWarehouseId}
              onChange={setProviderWarehouseId}
              searchable
              clearable
              style={{ minWidth: 260 }}
            />
          </Group>
        </PageHeaderCard>

        {error ? (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        ) : null}

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
          <StatCard
            label="Referencias"
            value={filteredItems.length}
            hint={`${controlType === 'BULK' ? 'Bulk' : 'Serial'} visibles`}
            icon={<IconBox size={20} />}
            color="yellow"
          />
          <StatCard
            label="Con precio cliente"
            value={pricedCount}
            hint="Precio principal registrado"
            icon={<IconTag size={20} />}
            color="green"
          />
          <StatCard
            label="Con costo proveedor"
            value={providerPricedCount}
            hint={
              providerWarehouseId
                ? inactiveCount
                  ? `${inactiveCount} inactivas en filtro`
                  : 'Costo específico registrado'
                : 'Selecciona un proveedor'
            }
            icon={<IconFileDollar size={20} />}
            color="blue"
          />
        </SimpleGrid>

        <Paper withBorder radius="md" p="md">
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

            <EntityDataTable
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
                description: 'Prueba cambiando el tipo, proveedor o búsqueda.',
              }}
            />
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
