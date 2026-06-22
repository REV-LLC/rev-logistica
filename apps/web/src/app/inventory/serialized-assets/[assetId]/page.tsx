'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconArrowLeft, IconMapPin, IconPencil } from '@tabler/icons-react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

type AssetResponse = {
  id: string;
  publicCode: string;
  serialOrEngine: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  fuel: string | null;
  warehouseOwnerId: string;
  warehouseCurrentId: string | null;
  active: boolean;
  sku?: { id: string; name: string | null; imageUrl?: string | null } | null;
  assetFamily?: { id: string; name: string | null } | null;
  warehouseOwner?: { id: string; name: string | null } | null;
  warehouseCurrent?: { id: string; name: string | null } | null;
};

type Warehouse = {
  id: string;
  name: string;
};

type WarehouseInventoryResponse = {
  serial?: Array<{
    assetId: string;
    imageUrl?: string | null;
  }>;
};

type AssetLedgerResponse = {
  items: Array<{
    movementType?: string | null;
    customerWorksite?: {
      customer?: { name?: string | null } | null;
      worksite?: { name?: string | null } | null;
    } | null;
  }>;
};

const FUEL_OPTIONS = [
  { value: 'GASOLINA', label: 'Gasolina' },
  { value: 'DIESEL', label: 'Diesel' },
  { value: 'ELECTRICO', label: 'Electric' },
];

export default function EditSerializedAssetPage() {
  const params = useParams<{ assetId: string }>();
  const router = useRouter();
  const assetId = params?.assetId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [asset, setAsset] = useState<AssetResponse | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [fuel, setFuel] = useState('');
  const [skuImageUrl, setSkuImageUrl] = useState('');
  const [warehouseCurrentId, setWarehouseCurrentId] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [editing, setEditing] = useState(false);
  const [worksiteLocationName, setWorksiteLocationName] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId) return;
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [assetData, warehouseData] = await Promise.all([
          api<AssetResponse>(`/assets/${assetId}`),
          api<Warehouse[]>('/warehouses'),
        ]);
        let resolvedWorksiteLocation: string | null = null;
        if (!assetData.warehouseCurrentId) {
          try {
            const ledgerData = await api<AssetLedgerResponse>(
              `/inventory/ledger?assetId=${encodeURIComponent(assetData.id)}&take=20`,
              { method: 'GET' },
            );
            const onSiteRow =
              ledgerData.items.find((entry) => entry.movementType === 'ON_SITE' && entry.customerWorksite) ??
              ledgerData.items.find((entry) => entry.customerWorksite);
            if (onSiteRow?.customerWorksite) {
              const customerName = onSiteRow.customerWorksite.customer?.name?.trim() ?? '';
              const worksiteName = onSiteRow.customerWorksite.worksite?.name?.trim() ?? '';
              resolvedWorksiteLocation = [customerName, worksiteName].filter(Boolean).join(' / ') || null;
            }
          } catch {
            // ignore location lookup errors
          }
        }
        let resolvedImageUrl = assetData.sku?.imageUrl ?? '';
        if (!resolvedImageUrl && assetData.warehouseOwnerId) {
          try {
            const warehouseInventory = await api<WarehouseInventoryResponse>(
              `/inventory/warehouse/${assetData.warehouseOwnerId}`,
              { method: 'GET' },
            );
            const serialRow = warehouseInventory.serial?.find((row) => row.assetId === assetData.id);
            resolvedImageUrl = serialRow?.imageUrl ?? '';
          } catch {
            // ignore fallback errors
          }
        }
        if (!mounted) return;
        setAsset(assetData);
        setWarehouses(warehouseData);
        setBrand(assetData.brand ?? '');
        setModel(assetData.model ?? '');
        setYear(assetData.year ?? '');
        setFuel(assetData.fuel ?? '');
        setSkuImageUrl(resolvedImageUrl);
        setWarehouseCurrentId(assetData.warehouseCurrentId);
        setWorksiteLocationName(resolvedWorksiteLocation);
        setActive(assetData.active);
      } catch (err) {
        if (!mounted) return;
        if (err instanceof ApiError) {
          setError(`${err.status}: ${err.message}`);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Error cargando equipo');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [assetId]);

  const warehouseOptions = useMemo(
    () => warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name })),
    [warehouses],
  );

  const autoDescription = useMemo(() => {
    const parts = [asset?.sku?.name, brand.trim(), model.trim()].filter(Boolean);
    return parts.length ? parts.join(' ') : '-';
  }, [asset?.sku?.name, brand, model]);
  const fuelLabel = useMemo(
    () => ((FUEL_OPTIONS.find((option) => option.value === fuel)?.label ?? fuel) || '-'),
    [fuel],
  );
  const warehouseCurrentName = useMemo(
    () => warehouses.find((warehouse) => warehouse.id === warehouseCurrentId)?.name ?? '-',
    [warehouses, warehouseCurrentId],
  );
  const locationBadge = useMemo(() => {
    if (!asset) {
      return { color: 'gray' as const, label: '-' };
    }
    if (!warehouseCurrentId) {
      return {
        color: 'red' as const,
        label: worksiteLocationName ?? 'En obra',
      };
    }
    const currentName =
      warehouses.find((warehouse) => warehouse.id === warehouseCurrentId)?.name ??
      asset.warehouseCurrent?.name ??
      'Bodega';
    if (warehouseCurrentId === asset.warehouseOwnerId) {
      return { color: 'blue' as const, label: currentName };
    }
    return { color: 'red' as const, label: currentName };
  }, [asset, warehouseCurrentId, warehouses, worksiteLocationName]);

  const handleSave = async () => {
    if (!assetId || !warehouseCurrentId) {
      setError('Current warehouse is required');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await Promise.all([
        api(`/assets/${assetId}`, {
          method: 'PATCH',
          json: {
            brand: brand.trim() || null,
            model: model.trim() || null,
            year: year === '' ? null : year,
            fuel: fuel || null,
            warehouseCurrentId,
            active,
          },
        }),
        asset?.sku?.id
          ? api(`/skus/${asset.sku.id}`, {
              method: 'PATCH',
              json: {
                imageUrl: skuImageUrl.trim() || undefined,
              },
            })
          : Promise.resolve(null),
      ]);
      setSuccess('Equipment updated');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error actualizando equipo');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container size="md" py="xl">
      <ActionIcon variant="light" size="lg" mb="sm" aria-label="Volver" onClick={() => router.back()}>
        <IconArrowLeft size={18} />
      </ActionIcon>
      <Paper withBorder shadow="sm" p="xl" radius="md">
        <Group justify="space-between" align="flex-start" mb="md" className="mobile-stack">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flex: 1 }}>
            <div>
              <Title order={2}>Ficha del equipo</Title>
              <Text c="dimmed" size="sm">
                Informacion y estado del equipo serializado.
              </Text>
            </div>

            <Badge
              variant="light"
              color={locationBadge.color}
              radius="xl"
              leftSection={<IconMapPin size={14} />}
            >
              Ubicacion: {locationBadge.label}
            </Badge>
          </div>
          {asset ? (
            <ActionIcon
              variant={editing ? 'filled' : 'light'}
              color={editing ? 'blue' : 'gray'}
              aria-label={editing ? 'Cerrar edicion' : 'Editar equipo'}
              onClick={() => setEditing((prev) => !prev)}
            >
              <IconPencil size={16} />
            </ActionIcon>
          ) : null}
        </Group>

        {loading ? (
          <Text c="dimmed">Cargando...</Text>
        ) : null}

        {error ? (
          <Text c="red" mb="sm">
            {error}
          </Text>
        ) : null}

        {success ? (
          <Text c="green" mb="sm">
            {success}
          </Text>
        ) : null}

        {asset ? (
          <Stack gap="md">
            <Paper withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
              <div
                style={{
                  height: 240,
                  background: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderBottom: '1px solid var(--mantine-color-gray-3)',
                }}
              >
                {skuImageUrl?.trim() ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={skuImageUrl}
                    alt={autoDescription}
                    style={{ width: '30%', height: '100%', objectFit: 'contain', background: '#fff' }}
                  />
                ) : (
                  <Text c="dimmed">Sin imagen</Text>
                )}

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <Text size="sm"><strong>Descripcion:</strong> {autoDescription}</Text>
                <Text size="sm"><strong>Serial/Motor:</strong> {asset.serialOrEngine || '-'}</Text>
                <Text size="sm"><strong>Dueño:</strong> {asset.warehouseOwner?.name ?? '-'}</Text>
                <Text size="sm"><strong>Codigo publico:</strong> {asset.publicCode ?? '-'}</Text>
                <Text size="sm"><strong>Modelo:</strong> {model || '-'}</Text>
                <Text size="sm"><strong>Año:</strong> {year === '' ? '-' : String(year)}</Text>
                <Text size="sm"><strong>Combustible:</strong> {fuelLabel}</Text>
              </SimpleGrid>
              
              </div>
              <Group justify="space-between" px="md" py="sm">
                <Text fw={700}>{autoDescription}</Text>
                <Badge color={active ? 'green' : 'gray'} variant="light">
                  {active ? 'Activo' : 'Inactivo'}
                </Badge>
              </Group>
            </Paper>
          </Stack>
        ) : null}
      </Paper>
    </Container>
  );
}
