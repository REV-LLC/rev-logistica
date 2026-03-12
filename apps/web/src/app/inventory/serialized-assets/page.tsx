'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Chip,
  Container,
  Divider,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  NumberInput,
  Switch,
} from '@mantine/core';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

type AssetFamily = {
  id: string;
  code: string;
  name: string;
};

type Warehouse = {
  id: string;
  name: string;
  type?: 'OWN' | 'ALLY' | string;
};

type Sku = {
  id: string;
  name: string;
  unitWeight?: number | null;
  price?: number | null;
  subrentalPrice?: number | null;
  chargeType?: 'DAY' | 'HOUR' | null;
  minimumChargeHours?: number | null;
};

type Asset = {
  id: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  fuel?: string | null;
  sku?: {
    id: string;
    name: string;
  } | null;
};

type CreateSerializedResponse = {
  asset: {
    id: string;
    internalNumber: number;
    assetFamilyId: string;
    skuId: string;
    warehouseOwnerId: string;
    warehouseCurrentId: string;
  };
  ledger: {
    id: string;
    movementType: string;
    quantity: number;
  };
};

const FUEL_OPTIONS = [
  { value: 'GASOLINA', label: 'Gasolina' },
  { value: 'DIESEL', label: 'Diesel' },
  { value: 'ELECTRICO', label: 'Eléctrico' },
];
const CHARGE_TYPE_OPTIONS = [
  { value: 'DAY', label: 'Por día' },
  { value: 'HOUR', label: 'Por hora' },
];

export default function CreateSerializedAssetPage() {
  const router = useRouter();
  const [families, setFamilies] = useState<AssetFamily[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [loadingSkus, setLoadingSkus] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [familyMode, setFamilyMode] = useState<'existing' | 'new'>('existing');
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [familyName, setFamilyName] = useState('');
  const [familyCode, setFamilyCode] = useState('');

  const [skuSuggestionId, setSkuSuggestionId] = useState<string | null>(null);
  const [skuName, setSkuName] = useState('');
  const [skuBrand, setSkuBrand] = useState('');
  const [skuModel, setSkuModel] = useState('');
  const [skuYear, setSkuYear] = useState<number | ''>('');
  const [skuFuel, setSkuFuel] = useState('');
  const [skuUnit, setSkuUnit] = useState('');
  const [skuUnitWeight, setSkuUnitWeight] = useState<number | ''>('');
  const [skuPrice, setSkuPrice] = useState<number | ''>('');
  const [skuSubrentalPrice, setSkuSubrentalPrice] = useState<number | ''>('');
  const [skuChargeType, setSkuChargeType] = useState<'DAY' | 'HOUR'>('DAY');
  const [skuMinimumChargeHours, setSkuMinimumChargeHours] = useState<number | ''>('');

  const [serialOrEngine, setSerialOrEngine] = useState('');
  const [imageFileObjectId, setImageFileObjectId] = useState('');
  const [active, setActive] = useState(true);

  const [ownerWarehouseId, setOwnerWarehouseId] = useState<string | null>(null);
  const [warehouseCurrentId, setWarehouseCurrentId] = useState<string | null>(null);
  const [manualInternalNumber, setManualInternalNumber] = useState<number | ''>('');
  const [assets, setAssets] = useState<Asset[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [familyData, warehouseData, unitData] = await Promise.all([
          api<AssetFamily[]>('/asset-families?controlType=SERIAL'),
          api<Warehouse[]>('/warehouses'),
          api<string[]>('/skus/units'),
        ]);
        if (!mounted) return;
        setFamilies(familyData);
        setWarehouses(warehouseData);
        setUnits(unitData);
        const assetsData = await api<Asset[]>('/assets?take=500');
        if (!mounted) return;
        setAssets(assetsData);
      } catch (err) {
        if (!mounted) return;
        if (err instanceof ApiError) {
          setError(`${err.status}: ${err.message}`);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Error cargando datos');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadSkus = async () => {
      if (!familyId) {
        setSkus([]);
        return;
      }
      setLoadingSkus(true);
      try {
        const data = await api<Sku[]>(`/skus?assetFamilyId=${familyId}`);
        if (!mounted) return;
        setSkus(data);
      } catch {
        if (!mounted) return;
      } finally {
        if (mounted) setLoadingSkus(false);
      }
    };
    if (familyMode === 'existing') loadSkus();
    else setSkus([]);
    return () => {
      mounted = false;
    };
  }, [familyId, familyMode]);

  useEffect(() => {
    if (familyMode === 'new') {
      setSkuSuggestionId(null);
      setSkus([]);
    }
  }, [familyMode]);

  const familyOptions = families.map((family) => ({
    value: family.id,
    label: family.name,
  }));
  const warehouseOptions = warehouses.map((warehouse) => ({
    value: warehouse.id,
    label: warehouse.name,
  }));
  const unitOptions = units.map((unit) => ({ value: unit, label: unit }));
  const skuOptions = skus.map((sku) => ({ value: sku.id, label: sku.name }));
  const skuById = useMemo(() => {
    const map = new Map<string, Sku>();
    skus.forEach((sku) => map.set(sku.id, sku));
    return map;
  }, [skus]);
  const referenceAssetsBySkuId = useMemo(() => {
    const map = new Map<string, Asset[]>();
    assets.forEach((asset) => {
      const skuId = asset.sku?.id;
      if (!skuId) return;
      const current = map.get(skuId) ?? [];
      current.push(asset);
      map.set(skuId, current);
    });
    return map;
  }, [assets]);

  const familyNameById = useMemo(() => {
    const map = new Map<string, AssetFamily>();
    families.forEach((family) => map.set(family.id, family));
    return map;
  }, [families]);
  const selectedOwnerWarehouse = useMemo(
    () => warehouses.find((warehouse) => warehouse.id === ownerWarehouseId) ?? null,
    [ownerWarehouseId, warehouses],
  );
  const isAlternateOwnerWarehouse = selectedOwnerWarehouse?.type === 'ALLY';

  const resetForm = () => {
    setFamilyMode('existing');
    setFamilyId(null);
    setFamilyName('');
    setFamilyCode('');
    setSkuSuggestionId(null);
    setSkuName('');
    setSkuBrand('');
    setSkuModel('');
    setSkuYear('');
    setSkuFuel('');
    setSkuUnit('');
    setSkuUnitWeight('');
    setSkuPrice('');
    setSkuSubrentalPrice('');
    setSkuChargeType('DAY');
    setSkuMinimumChargeHours('');
    setSerialOrEngine('');
    setImageFileObjectId('');
    setActive(true);
    setOwnerWarehouseId(null);
    setWarehouseCurrentId(null);
    setManualInternalNumber('');
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (familyMode === 'existing' && !familyId) {
      setError('Selecciona una categoría de equipo.');
      return;
    }

    if (familyMode === 'new' && !familyName.trim()) {
      setError('Ingresa el nombre de la categoría.');
      return;
    }

    if (!skuName.trim() && !skuBrand.trim() && !skuModel.trim()) {
      setError('Ingresa el nombre de la referencia o al menos marca/modelo.');
      return;
    }

    if (!serialOrEngine.trim()) {
      setError('El serial o motor es obligatorio.');
      return;
    }

    if (!ownerWarehouseId) {
      setError('Selecciona la bodega dueña.');
      return;
    }

    if (!warehouseCurrentId) {
      setError('Selecciona la bodega de ubicación.');
      return;
    }

    if (skuChargeType === 'HOUR' && (skuMinimumChargeHours === '' || skuMinimumChargeHours <= 0)) {
      setError('Ingresa el mínimo de cobro por hora.');
      return;
    }

    if (isAlternateOwnerWarehouse && (manualInternalNumber === '' || manualInternalNumber <= 0)) {
      setError('Ingresa el número interno de la bodega alterna.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        family:
          familyMode === 'existing'
            ? { id: familyId }
            : {
                name: familyName.trim(),
                code: familyCode.trim() || undefined,
              },
        sku:
          {
            name: skuName.trim() || undefined,
            unitWeight: skuUnitWeight === '' ? undefined : skuUnitWeight,
            price: skuPrice === '' ? undefined : skuPrice,
            subrentalPrice: skuSubrentalPrice === '' ? undefined : skuSubrentalPrice,
            chargeType: skuChargeType,
            minimumChargeHours:
              skuChargeType === 'HOUR' && skuMinimumChargeHours !== ''
                ? skuMinimumChargeHours
                : undefined,
          },
        asset: {
          serialOrEngine: serialOrEngine.trim(),
          brand: skuBrand.trim() || undefined,
          model: skuModel.trim() || undefined,
          year: skuYear === '' ? undefined : skuYear,
          fuel: skuFuel || undefined,
          imageFileObjectId: imageFileObjectId.trim() || undefined,
          active,
          internalNumber:
            isAlternateOwnerWarehouse && manualInternalNumber !== ''
              ? manualInternalNumber
              : undefined,
        },
        ownerWarehouseId,
        warehouseCurrentId,
      };

      const response = await api<CreateSerializedResponse>('/inventory/serialized-assets', {
        method: 'POST',
        json: payload,
      });

      const resolvedFamilyName =
        familyMode === 'existing'
          ? familyNameById.get(familyId ?? '')?.name
          : familyName.trim();
      setSuccess(`Creado: ${resolvedFamilyName ?? 'Equipo'} #${response.asset.internalNumber}`);
      resetForm();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error creando equipo');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container size="lg" py="xl">
      <Paper shadow="sm" p="xl" radius="md" withBorder>
        <Group mb="md">
          <Chip.Group
            multiple={false}
            value="serial"
            onChange={(value) => {
              if (value === 'bulk') {
                router.push('/inventory/bulk-adjustments');
              }
            }}
          >
            <Group gap="xs">
              <Chip value="bulk">Stock masivo</Chip>
              <Chip value="serial">Equipo serial</Chip>
            </Group>
          </Chip.Group>
        </Group>

        <Title order={2}>Registrar equipo</Title>
        <Text c="dimmed" mt="xs">
          Registra un equipo único y déjalo listo en inventario.
        </Text>

        {error && (
          <Text c="red" mt="md">
            {error}
          </Text>
        )}

        {success && (
          <Text c="green" mt="md">
            {success}
          </Text>
        )}

        <Stack mt="xl" gap="lg">
          <Stack gap="xs">
            <Group justify="space-between" className="mobile-stack">
              <Text fw={600}>Categoría del equipo</Text>
              <Button
                variant="light"
                size="xs"
                onClick={() =>
                  setFamilyMode((mode) => (mode === 'existing' ? 'new' : 'existing'))
                }
              >
                {familyMode === 'existing' ? 'No existe, crear categoría' : 'Usar categoría existente'}
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              La categoría agrupa equipos parecidos (ej: Cargadores, Compresores, Andamios).
            </Text>
            {familyMode === 'existing' ? (
              <Select
                label="Categoría"
                data={familyOptions}
                value={familyId}
                onChange={(value) => setFamilyId(value)}
                placeholder={loading ? 'Cargando...' : 'Selecciona una categoría'}
                searchable
                nothingFoundMessage="Sin resultados"
                disabled={loading}
              />
            ) : (
              <Group grow className="mobile-stack">
                <TextInput
                  label="Nombre de la categoría"
                  value={familyName}
                  onChange={(event) => setFamilyName(event.currentTarget.value)}
                  placeholder="Ej: Cargadores"
                  required
                />
                <TextInput
                  label="Código interno (opcional)"
                  value={familyCode}
                  onChange={(event) => setFamilyCode(event.currentTarget.value)}
                  placeholder="Ej: CGD"
                />
              </Group>
            )}
          </Stack>

          <Divider />

          <Stack gap="xs">
            <Group justify="space-between" className="mobile-stack">
              <Text fw={600}>Referencia del equipo</Text>
            </Group>
            <Text size="xs" c="dimmed">
              Puedes escribirla manualmente o elegir una sugerencia para autollenar datos.
            </Text>
            <Stack>
              <Select
                label="Sugerencias de referencia (opcional)"
                data={skuOptions}
                value={skuSuggestionId}
                onChange={(value) => {
                  setSkuSuggestionId(value);
                  const selectedSku = value ? skuById.get(value) : undefined;
                  if (!selectedSku) return;
                  setSkuName(selectedSku.name ?? '');
                  setSkuUnitWeight(
                    typeof selectedSku.unitWeight === 'number' ? selectedSku.unitWeight : '',
                  );
                  setSkuPrice(typeof selectedSku.price === 'number' ? selectedSku.price : '');
                  setSkuSubrentalPrice(
                    typeof selectedSku.subrentalPrice === 'number' ? selectedSku.subrentalPrice : '',
                  );
                  setSkuChargeType(
                    selectedSku.chargeType === 'HOUR' ? 'HOUR' : 'DAY',
                  );
                  setSkuMinimumChargeHours(
                    selectedSku.chargeType === 'HOUR' &&
                      typeof selectedSku.minimumChargeHours === 'number'
                      ? selectedSku.minimumChargeHours
                      : '',
                  );
                  const sampleAsset = (referenceAssetsBySkuId.get(selectedSku.id) ?? []).find(
                    (asset) =>
                      asset.brand?.trim() ||
                      asset.model?.trim() ||
                      asset.year != null ||
                      asset.fuel?.trim(),
                  );
                  if (!sampleAsset) return;
                  setSkuBrand(sampleAsset.brand?.trim() ?? '');
                  setSkuModel(sampleAsset.model?.trim() ?? '');
                  setSkuYear(sampleAsset.year ?? '');
                  setSkuFuel(sampleAsset.fuel?.trim() ?? '');
                }}
                placeholder={loadingSkus ? 'Cargando...' : 'Selecciona una referencia parecida'}
                searchable
                clearable
                nothingFoundMessage="Sin resultados"
                disabled={familyMode === 'new' || loadingSkus || !familyId}
              />
              <TextInput
                label="Nombre de la referencia"
                value={skuName}
                onChange={(event) => setSkuName(event.currentTarget.value)}
                placeholder="Ej: Mini cargador S650"
              />
              <Group grow className="mobile-stack">
                <TextInput
                  label="Marca"
                  value={skuBrand}
                  onChange={(event) => setSkuBrand(event.currentTarget.value)}
                />
                <TextInput
                  label="Modelo"
                  value={skuModel}
                  onChange={(event) => setSkuModel(event.currentTarget.value)}
                />
              </Group>
              <Group grow className="mobile-stack">
                <NumberInput
                  label="Año"
                  value={skuYear}
                  onChange={(value) =>
                    setSkuYear(typeof value === 'number' ? value : '')
                  }
                  min={1900}
                  max={2100}
                />
                <Select
                  label="Combustible"
                  data={FUEL_OPTIONS}
                  value={skuFuel}
                  onChange={(value) => setSkuFuel(value ?? '')}
                  clearable
                />
              </Group>
              <Group grow className="mobile-stack">
                <Select
                  label="Unidad de medida"
                  data={unitOptions}
                  value={skuUnit}
                  onChange={(value) => setSkuUnit(value ?? '')}
                  searchable
                  nothingFoundMessage="Sin unidades"
                  required
                />
                <NumberInput
                  label="Peso por unidad"
                  value={skuUnitWeight}
                  onChange={(value) =>
                    setSkuUnitWeight(typeof value === 'number' ? value : '')
                  }
                  min={0}
                  step={0.1}
                />
                <NumberInput
                  label="Precio subalquiler"
                  value={skuSubrentalPrice}
                  onChange={(value) =>
                    setSkuSubrentalPrice(typeof value === 'number' ? value : '')
                  }
                  min={0}
                  step={1000}
                />
                <NumberInput
                  label="Precio"
                  value={skuPrice}
                  onChange={(value) =>
                    setSkuPrice(typeof value === 'number' ? value : '')
                  }
                  min={0}
                  step={1000}
                />
                <Select
                  label="Tipo de cobro"
                  data={CHARGE_TYPE_OPTIONS}
                  value={skuChargeType}
                  onChange={(value) =>
                    setSkuChargeType((value as 'DAY' | 'HOUR' | null) ?? 'DAY')
                  }
                />
                {skuChargeType === 'HOUR' ? (
                  <NumberInput
                    label="Mínimo de cobro (horas)"
                    value={skuMinimumChargeHours}
                    onChange={(value) =>
                      setSkuMinimumChargeHours(typeof value === 'number' ? value : '')
                    }
                    min={0.5}
                    step={0.5}
                  />
                ) : null}
              </Group>
            </Stack>
          </Stack>

          <Divider />

          <Stack gap="xs">
            <Text fw={600}>Identificación del equipo</Text>
            <TextInput
              label="Serial / motor"
              value={serialOrEngine}
              onChange={(event) => setSerialOrEngine(event.currentTarget.value)}
              placeholder="Ej: A3NV16797"
              required
            />
            <TextInput
              label="Imagen (ID interno, opcional)"
              value={imageFileObjectId}
              onChange={(event) => setImageFileObjectId(event.currentTarget.value)}
            />
            {isAlternateOwnerWarehouse ? (
              <NumberInput
                label="Número interno (bodega alterna)"
                value={manualInternalNumber}
                onChange={(value) =>
                  setManualInternalNumber(typeof value === 'number' ? value : '')
                }
                min={1}
                required
              />
            ) : null}
          </Stack>

          <Divider />

          <Stack gap="xs">
            <Text fw={600}>Propiedad y ubicación inicial</Text>
            <Group grow className="mobile-stack">
              <Select
                label="Bodega dueña"
                data={warehouseOptions}
                value={ownerWarehouseId}
                onChange={(value) => {
                  setOwnerWarehouseId(value);
                  setWarehouseCurrentId(value);
                  const selected = warehouses.find((warehouse) => warehouse.id === value);
                  if (selected?.type !== 'ALLY') {
                    setManualInternalNumber('');
                  }
                }}
                required
              />
              <Select
                label="Bodega de ubicación"
                data={warehouseOptions}
                value={warehouseCurrentId}
                onChange={(value) => setWarehouseCurrentId(value)}
                required
              />
            </Group>
            <Switch
              label="Activo"
              checked={active}
              onChange={(event) => setActive(event.currentTarget.checked)}
            />
          </Stack>

          <Group justify="flex-end" className="mobile-actions">
            <Button variant="default" onClick={() => router.back()}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} loading={saving}>
              Guardar equipo
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Container>
  );
}
