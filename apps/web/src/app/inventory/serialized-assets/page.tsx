'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
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
};

type Sku = {
  id: string;
  name: string;
  unit: string;
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

  const [skuMode, setSkuMode] = useState<'existing' | 'new'>('existing');
  const [skuId, setSkuId] = useState<string | null>(null);
  const [skuName, setSkuName] = useState('');
  const [skuBrand, setSkuBrand] = useState('');
  const [skuModel, setSkuModel] = useState('');
  const [skuYear, setSkuYear] = useState<number | ''>('');
  const [skuFuel, setSkuFuel] = useState('');
  const [skuUnit, setSkuUnit] = useState('');
  const [skuUnitWeight, setSkuUnitWeight] = useState<number | ''>('');

  const [serialOrEngine, setSerialOrEngine] = useState('');
  const [description, setDescription] = useState('');
  const [imageFileObjectId, setImageFileObjectId] = useState('');
  const [active, setActive] = useState(true);

  const [ownerWarehouseId, setOwnerWarehouseId] = useState<string | null>(null);
  const [warehouseCurrentId, setWarehouseCurrentId] = useState<string | null>(null);

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
    if (familyMode === 'existing') {
      loadSkus();
    } else {
      setSkus([]);
    }
    return () => {
      mounted = false;
    };
  }, [familyId, familyMode]);

  useEffect(() => {
    if (familyMode === 'new') {
      setSkuMode('new');
      setSkuId(null);
      setSkus([]);
    }
  }, [familyMode]);

  const familyOptions = families.map((family) => ({
    value: family.id,
    label: `${family.name} (${family.code})`,
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

  const familyNameById = useMemo(() => {
    const map = new Map<string, AssetFamily>();
    families.forEach((family) => map.set(family.id, family));
    return map;
  }, [families]);

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (familyMode === 'existing' && !familyId) {
      setError('Selecciona un tipo de equipo');
      return;
    }

    if (familyMode === 'new' && !familyName.trim()) {
      setError('Ingresa el nombre del tipo de equipo');
      return;
    }

    if (skuMode === 'existing' && !skuId) {
      setError('Selecciona un modelo');
      return;
    }

    if (skuMode === 'new') {
      if (!skuName.trim() && !skuBrand.trim() && !skuModel.trim()) {
        setError('Ingresa el nombre del modelo o al menos marca/modelo');
        return;
      }
      if (!skuUnit) {
        setError('Selecciona la unidad del modelo');
        return;
      }
    }

    if (!serialOrEngine.trim()) {
      setError('Serial o motor es obligatorio');
      return;
    }

    if (!ownerWarehouseId) {
      setError('Selecciona la bodega dueña');
      return;
    }

    if (!warehouseCurrentId) {
      setError('Selecciona la bodega de custodia');
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
          skuMode === 'existing'
            ? { id: skuId, unit: skuUnit || 'UNIT' }
            : {
                name: skuName.trim() || undefined,
                brand: skuBrand.trim() || undefined,
                model: skuModel.trim() || undefined,
                year: skuYear === '' ? undefined : skuYear,
                fuel: skuFuel.trim() || undefined,
                unit: skuUnit,
                unitWeight: skuUnitWeight === '' ? undefined : skuUnitWeight,
              },
        asset: {
          serialOrEngine: serialOrEngine.trim(),
          description: description.trim() || undefined,
          imageFileObjectId: imageFileObjectId.trim() || undefined,
          active,
        },
        ownerWarehouseId,
        warehouseCurrentId,
      };

      const response = await api<CreateSerializedResponse>('/inventory/serialized-assets', {
        method: 'POST',
        json: payload,
      });

      const familyName =
        familyMode === 'existing'
          ? familyNameById.get(familyId ?? '')?.name
          : familyName.trim();
      setSuccess(`Creado: ${familyName ?? 'Equipo'} #${response.asset.internalNumber}`);
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
        <Title order={2}>Crear equipo (Serial)</Title>
        <Text c="dimmed" mt="xs">
          Alta inicial de maquinaria única con ajuste de inventario.
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
            <Group justify="space-between">
              <Text fw={600}>Tipo de equipo</Text>
              <Button
                variant="light"
                size="xs"
                onClick={() =>
                  setFamilyMode((mode) => (mode === 'existing' ? 'new' : 'existing'))
                }
              >
                {familyMode === 'existing' ? 'Crear nuevo tipo' : 'Usar tipo existente'}
              </Button>
            </Group>
            {familyMode === 'existing' ? (
              <Select
                label="Tipo (AssetFamily)"
                data={familyOptions}
                value={familyId}
                onChange={(value) => setFamilyId(value)}
                placeholder={loading ? 'Cargando...' : 'Selecciona un tipo'}
                searchable
                nothingFoundMessage="Sin resultados"
                disabled={loading}
              />
            ) : (
              <Group grow>
                <TextInput
                  label="Nombre del tipo"
                  value={familyName}
                  onChange={(event) => setFamilyName(event.currentTarget.value)}
                  required
                />
                <TextInput
                  label="Código (opcional)"
                  value={familyCode}
                  onChange={(event) => setFamilyCode(event.currentTarget.value)}
                />
              </Group>
            )}
          </Stack>

          <Divider />

          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={600}>Modelo</Text>
              <Button
                variant="light"
                size="xs"
                onClick={() => setSkuMode((mode) => (mode === 'existing' ? 'new' : 'existing'))}
                disabled={familyMode === 'new'}
              >
                {skuMode === 'existing' ? 'Crear modelo nuevo' : 'Usar modelo existente'}
              </Button>
            </Group>
            {skuMode === 'existing' ? (
              <Select
                label="Modelo (SKU)"
                data={skuOptions}
                value={skuId}
                onChange={(value) => {
                  setSkuId(value);
                  setSkuUnit(skuById.get(value ?? '')?.unit ?? '');
                }}
                placeholder={loadingSkus ? 'Cargando...' : 'Selecciona un modelo'}
                searchable
                nothingFoundMessage="Sin resultados"
                disabled={familyMode === 'new' || loadingSkus || !familyId}
              />
            ) : (
              <Stack>
                <TextInput
                  label="Nombre del modelo"
                  value={skuName}
                  onChange={(event) => setSkuName(event.currentTarget.value)}
                  placeholder="Ej: Bomag BW120 2019"
                />
                <Group grow>
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
                <Group grow>
                  <NumberInput
                    label="Año"
                    value={skuYear}
                    onChange={(value) =>
                      setSkuYear(typeof value === 'number' ? value : '')
                    }
                    min={1900}
                    max={2100}
                  />
                  <TextInput
                    label="Combustible"
                    value={skuFuel}
                    onChange={(event) => setSkuFuel(event.currentTarget.value)}
                  />
                </Group>
                <Group grow>
                  <Select
                    label="Unidad"
                    data={unitOptions}
                    value={skuUnit}
                    onChange={(value) => setSkuUnit(value ?? '')}
                    searchable
                    nothingFoundMessage="Sin unidades"
                    required
                  />
                  <NumberInput
                    label="Peso unidad"
                    value={skuUnitWeight}
                    onChange={(value) =>
                      setSkuUnitWeight(typeof value === 'number' ? value : '')
                    }
                    min={0}
                    step={0.1}
                  />
                </Group>
              </Stack>
            )}
          </Stack>

          <Divider />

          <Stack gap="xs">
            <Text fw={600}>Identificación del equipo</Text>
            <TextInput
              label="Serial o motor"
              value={serialOrEngine}
              onChange={(event) => setSerialOrEngine(event.currentTarget.value)}
              required
            />
            <TextInput
              label="Descripción"
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
            <TextInput
              label="Imagen (FileObject ID)"
              value={imageFileObjectId}
              onChange={(event) => setImageFileObjectId(event.currentTarget.value)}
            />
          </Stack>

          <Divider />

          <Stack gap="xs">
            <Text fw={600}>Ownership y ubicación inicial</Text>
            <Group grow>
              <Select
                label="Bodega dueña"
                data={warehouseOptions}
                value={ownerWarehouseId}
                onChange={(value) => setOwnerWarehouseId(value)}
                required
              />
              <Select
                label="Bodega actual"
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

          <Group justify="flex-end">
            <Button variant="default" onClick={() => router.back()}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} loading={saving}>
              Crear equipo
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Container>
  );
}
