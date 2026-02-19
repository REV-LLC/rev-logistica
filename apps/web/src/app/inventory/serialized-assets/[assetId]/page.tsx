'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Container,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
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

const FUEL_OPTIONS = [
  { value: 'GASOLINA', label: 'Gasolina' },
  { value: 'DIESEL', label: 'Diesel' },
  { value: 'ELECTRICO', label: 'Eléctrico' },
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
        if (!mounted) return;
        setAsset(assetData);
        setWarehouses(warehouseData);
        setBrand(assetData.brand ?? '');
        setModel(assetData.model ?? '');
        setYear(assetData.year ?? '');
        setFuel(assetData.fuel ?? '');
        setSkuImageUrl(assetData.sku?.imageUrl ?? '');
        setWarehouseCurrentId(assetData.warehouseCurrentId ?? assetData.warehouseOwnerId);
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

  const handleSave = async () => {
    if (!assetId || !warehouseCurrentId) {
      setError('Bodega actual es obligatoria');
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
      setSuccess('Equipo actualizado');
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
      <Paper withBorder shadow="sm" p="xl" radius="md">
        <Group justify="space-between" align="flex-start" mb="md" className="mobile-stack">
          <div>
            <Title order={2}>Editar Equipo</Title>
            <Text c="dimmed" size="sm">
              Solo aplica para equipos seriales.
            </Text>
          </div>
          <Button variant="light" onClick={() => router.back()}>
            Volver
          </Button>
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
            <TextInput label="Serial/Motor" value={asset.serialOrEngine} readOnly />
            <Group grow className="mobile-stack">
              <TextInput label="Tipo" value={asset.assetFamily?.name ?? '-'} readOnly />
              <TextInput label="Modelo SKU" value={asset.sku?.name ?? '-'} readOnly />
            </Group>
            <TextInput label="Descripción automática" value={autoDescription} readOnly />
            <TextInput
              label="URL imagen (modelo)"
              placeholder="https://..."
              value={skuImageUrl}
              onChange={(event) => setSkuImageUrl(event.currentTarget.value)}
            />

            <Group grow className="mobile-stack">
              <TextInput
                label="Marca"
                value={brand}
                onChange={(event) => setBrand(event.currentTarget.value)}
              />
              <TextInput
                label="Modelo"
                value={model}
                onChange={(event) => setModel(event.currentTarget.value)}
              />
            </Group>

            <Group grow className="mobile-stack">
              <NumberInput
                label="Año"
                value={year}
                onChange={(value) => setYear(typeof value === 'number' ? value : '')}
                min={1900}
                max={2100}
              />
              <Select
                label="Combustible"
                data={FUEL_OPTIONS}
                value={fuel}
                onChange={(value) => setFuel(value ?? '')}
                clearable
              />
            </Group>

            <Select
              label="Bodega actual"
              data={warehouseOptions}
              value={warehouseCurrentId}
              onChange={(value) => setWarehouseCurrentId(value)}
              searchable
              nothingFoundMessage="Sin resultados"
            />

            <Switch
              checked={active}
              onChange={(event) => setActive(event.currentTarget.checked)}
              label={active ? 'Activo' : 'Inactivo'}
            />

            <Group justify="flex-end">
              <Button loading={saving} onClick={handleSave}>
                Guardar cambios
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Paper>
    </Container>
  );
}
