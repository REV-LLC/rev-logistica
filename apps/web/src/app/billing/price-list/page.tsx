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
  Table,
  Text,
  TextInput,
  Title,
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
            <Group justify="space-between" align="center" gap="sm">
              <div>
                <Title order={3} size="h4">
                  {controlType === 'BULK' ? 'Items Bulk' : 'Items Serial'}
                </Title>
                <Text size="sm" c="dimmed">
                  {loading ? 'Cargando referencias...' : `${filteredItems.length} items encontrados`}
                </Text>
              </div>
              <Badge color={controlType === 'BULK' ? 'yellow' : 'blue'} variant="light" size="lg">
                {controlType}
              </Badge>
            </Group>

            <Table.ScrollContainer minWidth={980}>
              <Table striped highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Referencia</Table.Th>
                    <Table.Th>Codigo</Table.Th>
                    <Table.Th>Familia</Table.Th>
                    <Table.Th>Precio cliente</Table.Th>
                    <Table.Th>Costo proveedor</Table.Th>
                    <Table.Th>Valor reposicion</Table.Th>
                    <Table.Th>Tipo de cobro</Table.Th>
                    <Table.Th>Estado</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredItems.map((item) => (
                    <Table.Tr key={item.id}>
                      <Table.Td>
                        <Text fw={600}>{item.name}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color="gray" radius="sm">
                          {item.assetFamily.code}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{item.assetFamily.name}</Table.Td>
                      <Table.Td>{formatMoney(item.price)}</Table.Td>
                      <Table.Td>{formatMoney(providerPriceBySku.get(item.id))}</Table.Td>
                      <Table.Td>{formatMoney(item.replacementValue)}</Table.Td>
                      <Table.Td>{formatChargeType(item.chargeType, item.minimumChargeHours)}</Table.Td>
                      <Table.Td>
                        <Badge color={item.active ? 'green' : 'gray'} variant="light">
                          {item.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {!filteredItems.length ? (
                    <Table.Tr>
                      <Table.Td colSpan={8}>
                        <Text ta="center" c="dimmed" py="xl">
                          {loading ? 'Cargando...' : 'No hay items para este filtro.'}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : null}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
