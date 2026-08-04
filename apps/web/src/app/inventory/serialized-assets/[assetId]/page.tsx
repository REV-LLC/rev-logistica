'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Container,
  Group,
  Paper,
  Stack,
  Tabs,
  Text,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconBarcode,
  IconBuildingWarehouse,
  IconEngine,
  IconFileText,
  IconInfoCircle,
  IconMapPin,
  IconPencil,
  IconTool,
} from '@tabler/icons-react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import FileAttachmentsPanel from '@/components/FileAttachmentsPanel';
import MaintenancePanel from '@/components/maintenance/MaintenancePanel';
import { getSerialDisplayName } from '@/lib/serial-assets';
import AssetDetailsPanel from '@/components/serialized-assets/AssetDetailsPanel';
import AssetMovementSummary from '@/components/serialized-assets/AssetMovementSummary';
import SerializedAssetEditForm from '@/components/serialized-assets/SerializedAssetEditForm';
import SerializedAssetHero from '@/components/serialized-assets/SerializedAssetHero';

type AssetResponse = {
  id: string;
  publicCode: string;
  serialOrEngine: string | null;
  registrationNumber: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  fuel: string | null;
  warehouseOwnerId: string;
  warehouseCurrentId: string | null;
  imageFileObjectId?: string | null;
  imageUrl?: string | null;
  active: boolean;
  sku?: {
    id: string;
    name: string | null;
    imageUrl?: string | null;
    price?: number | string | null;
    subrentalPrice?: number | string | null;
    replacementValue?: number | string | null;
    chargeType?: 'DAY' | 'HOUR' | string | null;
    minimumChargeHours?: number | string | null;
    size?: string | null;
    areaM2?: number | string | null;
    unitWeight?: number | string | null;
  } | null;
  assetFamily?: { id: string; name: string | null } | null;
  warehouseOwner?: { id: string; name: string | null } | null;
  warehouseCurrent?: { id: string; name: string | null } | null;
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
  { value: 'GASOLINA', label: 'GASOLINA' },
  { value: 'DIESEL', label: 'DIESEL' },
  { value: 'ELECTRICO', label: 'ELECTRICO' },
];
const EMPTY_VALUE = 'N/A';
const displayValue = (value: string | number | null | undefined) => {
  if (value == null) return EMPTY_VALUE;
  const normalized = String(value).trim();
  return normalized || EMPTY_VALUE;
};

const toNumber = (value: number | string | null | undefined) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatCurrency = (value: number | string | null | undefined) => {
  const parsed = toNumber(value);
  if (parsed == null) return EMPTY_VALUE;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(parsed);
};

const formatDecimal = (value: number | string | null | undefined, suffix = '') => {
  const parsed = toNumber(value);
  if (parsed == null) return EMPTY_VALUE;
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(parsed)}${suffix}`;
};

const formatCharge = (
  chargeType?: string | null,
  minimumChargeHours?: number | string | null,
) => {
  const normalized = chargeType?.toUpperCase();
  if (normalized === 'HOUR') {
    const minimum = formatDecimal(minimumChargeHours, ' H');
    return minimum === EMPTY_VALUE ? 'HORA' : `HORA (MIN ${minimum})`;
  }
  if (normalized === 'DAY') return 'DIA';
  return EMPTY_VALUE;
};

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
  const [providerPrice, setProviderPrice] = useState<number | null>(null);

  const [brand, setBrand] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [fuel, setFuel] = useState('');
  const [assetImageUrl, setAssetImageUrl] = useState('');
  const [assetImageFileObjectId, setAssetImageFileObjectId] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
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
        const ownerWarehouse = warehouseData.find(
          (warehouse) => warehouse.id === assetData.warehouseOwnerId,
        );
        let resolvedProviderPrice: number | null = null;
        if (ownerWarehouse?.type === 'ALLY' && assetData.sku?.id) {
          const params = new URLSearchParams({
            providerWarehouseId: ownerWarehouse.id,
            skuId: assetData.sku.id,
          });
          const rows = await api<ProviderSkuPrice[]>(
            `/skus/provider-prices?${params.toString()}`,
          );
          resolvedProviderPrice = rows[0] ? Number(rows[0].price) : null;
        }
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
        const resolvedImageUrl = assetData.imageUrl ?? assetData.sku?.imageUrl ?? '';
        if (!mounted) return;
        setAsset(assetData);
        setWarehouses(warehouseData);
        setProviderPrice(resolvedProviderPrice);
        setBrand(assetData.brand ?? '');
        setRegistrationNumber(assetData.registrationNumber ?? '');
        setModel(assetData.model ?? '');
        setYear(assetData.year ?? '');
        setFuel(assetData.fuel ?? '');
        setAssetImageUrl(resolvedImageUrl);
        setAssetImageFileObjectId(assetData.imageFileObjectId ?? null);
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
    if (!asset) return EMPTY_VALUE;
    return getSerialDisplayName({
      assetId: asset.id,
      skuName: asset.sku?.name,
      brand,
      model,
      serialOrEngine: asset.serialOrEngine,
    });
  }, [asset, brand, model]);
  const fuelLabel = useMemo(
    () => displayValue(FUEL_OPTIONS.find((option) => option.value === fuel)?.label ?? fuel),
    [fuel],
  );
  const warehouseCurrentName = useMemo(
    () => displayValue(warehouses.find((warehouse) => warehouse.id === warehouseCurrentId)?.name),
    [warehouses, warehouseCurrentId],
  );
  const locationBadge = useMemo(() => {
    if (!asset) {
      return { color: 'gray' as const, label: EMPTY_VALUE };
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
  const detailCards = useMemo(
    () => [
      {
        label: 'Serial / motor',
        value: displayValue(asset?.serialOrEngine),
        icon: <IconEngine size={18} />,
      },
      {
        label: 'Codigo publico',
        value: displayValue(asset?.publicCode),
        icon: <IconBarcode size={18} />,
      },
      {
        label: 'Bodega dueña',
        value: displayValue(asset?.warehouseOwner?.name),
        icon: <IconBuildingWarehouse size={18} />,
      },
      {
        label: 'Ubicacion actual',
        value: warehouseCurrentId ? warehouseCurrentName : worksiteLocationName ?? 'En obra',
        icon: <IconMapPin size={18} />,
      },
    ],
    [asset, warehouseCurrentId, warehouseCurrentName, worksiteLocationName],
  );
  const readOnlySections = useMemo(
    () => [
      {
        title: 'Identificacion',
        fields: [
          { label: 'Referencia / plantilla', value: displayValue(asset?.sku?.name) },
          { label: 'Familia', value: displayValue(asset?.assetFamily?.name) },
          { label: 'Estado', value: active ? 'Activo' : 'Inactivo' },
          { label: 'Numero de registro', value: displayValue(registrationNumber) },
        ],
      },
      {
        title: 'Datos tecnicos',
        fields: [
          { label: 'Marca', value: displayValue(brand) },
          { label: 'Modelo', value: displayValue(model) },
          { label: 'Año', value: year === '' ? EMPTY_VALUE : String(year) },
          { label: 'Combustible', value: fuelLabel },
          { label: 'Tamaño', value: displayValue(asset?.sku?.size) },
          { label: 'Area', value: formatDecimal(asset?.sku?.areaM2, ' M²') },
          { label: 'Peso unitario', value: formatDecimal(asset?.sku?.unitWeight, ' KG') },
        ],
      },
      {
        title: 'Valores comerciales',
        fields: [
          { label: 'Precio cliente', value: formatCurrency(asset?.sku?.price) },
          ...(providerPrice != null
            ? [{ label: 'Costo proveedor', value: formatCurrency(providerPrice) }]
            : []),
          { label: 'Valor reposicion', value: formatCurrency(asset?.sku?.replacementValue) },
          {
            label: 'Tipo de cobro',
            value: formatCharge(asset?.sku?.chargeType, asset?.sku?.minimumChargeHours),
          },
        ],
      },
    ],
    [active, asset, brand, fuelLabel, model, providerPrice, registrationNumber, year],
  );

  const handleSave = async () => {
    if (!assetId || !asset) {
      setError('No se encontro el equipo para actualizar.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        brand: brand.trim() || null,
        registrationNumber: registrationNumber.trim() || null,
        model: model.trim() || null,
        year: year === '' ? null : year,
        fuel: fuel || null,
        warehouseCurrentId,
        imageFileObjectId: assetImageFileObjectId,
        active,
      };
      const updatedAsset = await api<AssetResponse>(`/assets/${assetId}`, {
        method: 'PATCH',
        json: payload,
      });
      setAsset((current) => (current ? { ...current, ...updatedAsset } : updatedAsset));
      setSuccess('Equipo actualizado.');
      setEditing(false);
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

  const handleImageUpload = async (file: File | null) => {
    if (!file || !assetId) return;
    setImageUploading(true);
    setError(null);
    setSuccess(null);
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        throw new Error('Solo se permiten imagenes PNG, JPG o WEBP.');
      }
      const formData = new FormData();
      formData.append('files', file);
      formData.append('category', 'PHOTO');
      formData.append('displayName', 'Imagen principal');

      const upload = await api<{
        files: Array<{ id: string; storageKey: string; mimeType?: string | null }>;
      }>(`/files/entities/ASSET/${assetId}`, {
        method: 'POST',
        body: formData,
      });
      const uploadedImage = upload.files.find((item) => item.mimeType?.startsWith('image/')) ?? upload.files[0];
      if (!uploadedImage) {
        throw new Error('No se recibio la imagen cargada.');
      }
      const updatedAsset = await api<AssetResponse>(`/assets/${assetId}`, {
        method: 'PATCH',
        json: { imageFileObjectId: uploadedImage.id },
      });
      setAsset((current) =>
        current
          ? { ...current, ...updatedAsset, imageFileObjectId: uploadedImage.id, imageUrl: uploadedImage.storageKey }
          : { ...updatedAsset, imageFileObjectId: uploadedImage.id, imageUrl: uploadedImage.storageKey },
      );
      setAssetImageFileObjectId(uploadedImage.id);
      setAssetImageUrl(uploadedImage.storageKey);
      setSuccess('Imagen cargada.');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error cargando imagen');
      }
    } finally {
      setImageUploading(false);
    }
  };

  const handleCancelEdit = () => {
    if (!asset) return;
    setBrand(asset.brand ?? '');
    setRegistrationNumber(asset.registrationNumber ?? '');
    setModel(asset.model ?? '');
    setYear(asset.year ?? '');
    setFuel(asset.fuel ?? '');
    setAssetImageFileObjectId(asset.imageFileObjectId ?? null);
    setAssetImageUrl(asset.imageUrl ?? asset.sku?.imageUrl ?? '');
    setWarehouseCurrentId(asset.warehouseCurrentId);
    setActive(asset.active);
    setEditing(false);
    setError(null);
  };

  return (
    <Container size="xl" py="xl">
      <Group mb="md" justify="space-between" align="center">
        <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={18} />} onClick={() => router.back()}>
          Volver
        </Button>
        {asset ? (
          <ActionIcon
            variant={editing ? 'filled' : 'light'}
            color={editing ? 'blue' : 'gray'}
            size="lg"
            aria-label={editing ? 'Cerrar edicion' : 'Editar equipo'}
            onClick={() => {
              setSuccess(null);
              setError(null);
              setEditing((prev) => !prev);
            }}
          >
            <IconPencil size={18} />
          </ActionIcon>
        ) : null}
      </Group>

      {loading ? (
        <Paper withBorder radius="xl" p="xl">
          <Text c="dimmed">Cargando equipo...</Text>
        </Paper>
      ) : null}

      {error ? (
        <Alert color="red" variant="light" mb="md">
          {error}
        </Alert>
      ) : null}

      {success ? (
        <Alert color="green" variant="light" mb="md">
          {success}
        </Alert>
      ) : null}

      {asset ? (
        <Stack gap="lg">
          <SerializedAssetHero
            active={active}
            description={autoDescription}
            facts={detailCards}
            imageUrl={assetImageUrl}
            location={locationBadge}
          />

          <Tabs defaultValue="details" keepMounted={false}>
            <Tabs.List mb="lg">
              <Tabs.Tab value="details" leftSection={<IconInfoCircle size={17} />}>
                Informacion
              </Tabs.Tab>
              <Tabs.Tab value="documents" leftSection={<IconFileText size={17} />}>
                Documentos
              </Tabs.Tab>
              <Tabs.Tab value="maintenance" leftSection={<IconTool size={17} />}>
                Mantenimiento
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="details">
              <Stack gap="lg">
                {editing ? (
                  <SerializedAssetEditForm
                    active={active}
                    brand={brand}
                    fuel={fuel}
                    fuelOptions={FUEL_OPTIONS}
                    imageUploading={imageUploading}
                    model={model}
                    registrationNumber={registrationNumber}
                    onActiveChange={setActive}
                    onBrandChange={setBrand}
                    onCancel={handleCancelEdit}
                    onFuelChange={setFuel}
                    onImageUpload={handleImageUpload}
                    onModelChange={setModel}
                    onRegistrationNumberChange={setRegistrationNumber}
                    onSave={handleSave}
                    onWarehouseChange={setWarehouseCurrentId}
                    onYearChange={setYear}
                    saving={saving}
                    warehouseCurrentId={warehouseCurrentId}
                    warehouseOptions={warehouseOptions}
                    worksiteLocationName={worksiteLocationName}
                    year={year}
                  />
                ) : (
                  <AssetDetailsPanel sections={readOnlySections} />
                )}

                <AssetMovementSummary
                  warehouseCurrentId={warehouseCurrentId}
                  warehouseCurrentName={warehouseCurrentName}
                  worksiteLocationName={worksiteLocationName}
                />
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="documents">
              <Paper withBorder radius="xl" p={{ base: 'md', md: 'xl' }}>
                <FileAttachmentsPanel entityType="ASSET" entityId={asset.id} title="Documentos del equipo" />
              </Paper>
            </Tabs.Panel>

            <Tabs.Panel value="maintenance">
              <MaintenancePanel
                subject={{ type: 'ASSET', id: asset.id, label: asset.publicCode }}
              />
            </Tabs.Panel>
          </Tabs>
        </Stack>
      ) : null}
    </Container>
  );
}
