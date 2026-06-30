'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Container,
  FileButton,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconBarcode,
  IconBuildingWarehouse,
  IconCheck,
  IconEngine,
  IconMapPin,
  IconPencil,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
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
  imageFileObjectId?: string | null;
  imageUrl?: string | null;
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
  { value: 'ELECTRICO', label: 'Electrico' },
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
        let resolvedImageUrl = assetData.imageUrl ?? assetData.sku?.imageUrl ?? '';
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
  const detailCards = useMemo(
    () => [
      {
        label: 'Serial / motor',
        value: asset?.serialOrEngine || '-',
        icon: <IconEngine size={18} />,
      },
      {
        label: 'Codigo publico',
        value: asset?.publicCode || '-',
        icon: <IconBarcode size={18} />,
      },
      {
        label: 'Bodega dueña',
        value: asset?.warehouseOwner?.name ?? '-',
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
        model: model.trim() || null,
        year: year === '' ? null : year,
        fuel: fuel || null,
        warehouseCurrentId: warehouseCurrentId ?? undefined,
        imageFileObjectId: assetImageFileObjectId ?? undefined,
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

  return (
    <Container size="lg" py="xl">
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
          <Paper
            withBorder
            shadow="sm"
            radius="xl"
            p={{ base: 'md', md: 'xl' }}
            style={{
              overflow: 'hidden',
              background:
                'linear-gradient(135deg, rgba(248,250,252,0.98) 0%, rgba(255,255,255,1) 55%, rgba(236,253,245,0.65) 100%)',
            }}
          >
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" verticalSpacing="xl">
              <Paper
                radius="xl"
                p="lg"
                style={{
                  minHeight: 320,
                  background: '#fff',
                  border: '1px solid var(--mantine-color-gray-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {assetImageUrl?.trim() ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={assetImageUrl}
                    alt={autoDescription}
                    style={{
                      width: '100%',
                      maxWidth: 360,
                      height: 260,
                      objectFit: 'contain',
                      background: '#fff',
                    }}
                  />
                ) : (
                  <Stack align="center" gap="xs">
                    <ThemeIcon color="gray" variant="light" size={56} radius="xl">
                      <IconEngine size={28} />
                    </ThemeIcon>
                    <Text c="dimmed">Sin imagen</Text>
                  </Stack>
                )}
              </Paper>

              <Stack gap="md" justify="space-between">
                <div>
                  <Group gap="xs" mb="sm" wrap="wrap">
                    <Badge color={active ? 'green' : 'gray'} variant="light" radius="xl">
                      {active ? 'Activo' : 'Inactivo'}
                    </Badge>
                    <Badge color={locationBadge.color} variant="light" radius="xl" leftSection={<IconMapPin size={14} />}>
                      {locationBadge.label}
                    </Badge>
                  </Group>
                  <Title order={2}>{autoDescription}</Title>
                  <Text c="dimmed" mt={6}>
                    Ficha operativa del equipo serializado.
                  </Text>
                </div>

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  {detailCards.map((item) => (
                    <Paper key={item.label} withBorder radius="lg" p="md" bg="white">
                      <Group gap="sm" align="flex-start" wrap="nowrap">
                        <ThemeIcon color="blue" variant="light" radius="xl" size={34}>
                          {item.icon}
                        </ThemeIcon>
                        <div style={{ minWidth: 0 }}>
                          <Text size="xs" c="dimmed" fw={800} tt="uppercase">
                            {item.label}
                          </Text>
                          <Text size="sm" fw={700} style={{ overflowWrap: 'anywhere' }}>
                            {item.value}
                          </Text>
                        </div>
                      </Group>
                    </Paper>
                  ))}
                </SimpleGrid>
              </Stack>
            </SimpleGrid>
          </Paper>

          <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
            <Group justify="space-between" align="center" mb="md">
              <div>
                <Text fw={800}>Datos del equipo</Text>
                <Text size="sm" c="dimmed">
                  Informacion tecnica y comercial visible para operacion.
                </Text>
              </div>
              {editing ? (
                <Badge color="blue" variant="light">
                  Editando
                </Badge>
              ) : null}
            </Group>

            {editing ? (
              <Stack gap="md">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <TextInput label="Marca" value={brand} onChange={(event) => setBrand(event.currentTarget.value)} />
                  <TextInput label="Modelo" value={model} onChange={(event) => setModel(event.currentTarget.value)} />
                  <NumberInput
                    label="Año"
                    value={year}
                    min={1900}
                    max={new Date().getFullYear() + 1}
                    onChange={(value) => setYear(typeof value === 'number' ? value : '')}
                  />
                  <Select
                    label="Combustible"
                    value={fuel || null}
                    onChange={(value) => setFuel(value ?? '')}
                    data={FUEL_OPTIONS}
                    clearable
                  />
                  <Select
                    label="Ubicacion en bodega"
                    value={warehouseCurrentId}
                    onChange={setWarehouseCurrentId}
                    data={warehouseOptions}
                    placeholder={worksiteLocationName ?? 'Equipo en obra'}
                    clearable
                  />
                </SimpleGrid>
                <Paper withBorder radius="lg" p="md" bg="gray.0">
                  <Group justify="space-between" align="center" gap="md">
                    <div>
                      <Text fw={800}>Imagen del equipo</Text>
                      <Text size="sm" c="dimmed">
                        PNG, JPG o WEBP.
                      </Text>
                    </div>
                    <FileButton onChange={handleImageUpload} accept="image/png,image/jpeg,image/webp">
                      {(props) => (
                        <Button {...props} leftSection={<IconUpload size={16} />} loading={imageUploading}>
                          Subir imagen
                        </Button>
                      )}
                    </FileButton>
                  </Group>
                </Paper>
                <Switch
                  label="Equipo activo"
                  checked={active}
                  onChange={(event) => setActive(event.currentTarget.checked)}
                />
                <Group justify="flex-end">
                  <Button
                    variant="default"
                    leftSection={<IconX size={16} />}
                    onClick={() => {
                      setBrand(asset.brand ?? '');
                      setModel(asset.model ?? '');
                      setYear(asset.year ?? '');
                      setFuel(asset.fuel ?? '');
                      setAssetImageFileObjectId(asset.imageFileObjectId ?? null);
                      setAssetImageUrl(asset.imageUrl ?? asset.sku?.imageUrl ?? '');
                      setWarehouseCurrentId(asset.warehouseCurrentId);
                      setActive(asset.active);
                      setEditing(false);
                      setError(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button leftSection={<IconCheck size={16} />} onClick={handleSave} loading={saving}>
                    Guardar cambios
                  </Button>
                </Group>
              </Stack>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
                <Paper withBorder radius="lg" p="md">
                  <Text size="xs" c="dimmed" fw={800} tt="uppercase">
                    Marca
                  </Text>
                  <Text fw={700}>{brand || '-'}</Text>
                </Paper>
                <Paper withBorder radius="lg" p="md">
                  <Text size="xs" c="dimmed" fw={800} tt="uppercase">
                    Modelo
                  </Text>
                  <Text fw={700}>{model || '-'}</Text>
                </Paper>
                <Paper withBorder radius="lg" p="md">
                  <Text size="xs" c="dimmed" fw={800} tt="uppercase">
                    Año
                  </Text>
                  <Text fw={700}>{year === '' ? '-' : String(year)}</Text>
                </Paper>
                <Paper withBorder radius="lg" p="md">
                  <Text size="xs" c="dimmed" fw={800} tt="uppercase">
                    Combustible
                  </Text>
                  <Text fw={700}>{fuelLabel}</Text>
                </Paper>
                <Paper withBorder radius="lg" p="md">
                  <Text size="xs" c="dimmed" fw={800} tt="uppercase">
                    Familia
                  </Text>
                  <Text fw={700}>{asset.assetFamily?.name ?? '-'}</Text>
                </Paper>
                <Paper withBorder radius="lg" p="md">
                  <Text size="xs" c="dimmed" fw={800} tt="uppercase">
                    Estado
                  </Text>
                  <Text fw={700}>{active ? 'Activo' : 'Inactivo'}</Text>
                </Paper>
              </SimpleGrid>
            )}
          </Paper>

          <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
            <Text fw={800} mb={4}>
              Movimiento reciente
            </Text>
            <Text size="sm" c="dimmed">
              {worksiteLocationName
                ? `Ultima ubicacion en obra: ${worksiteLocationName}.`
                : warehouseCurrentId
                  ? `Actualmente en ${warehouseCurrentName}.`
                  : 'Sin movimiento reciente disponible.'}
            </Text>
          </Paper>
        </Stack>
      ) : null}
    </Container>
  );
}
