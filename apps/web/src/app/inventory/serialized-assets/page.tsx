'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
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
  ThemeIcon,
  Title,
  NumberInput,
  SimpleGrid,
  Switch,
} from '@mantine/core';
import {
  IconBuildingWarehouse,
  IconChecklist,
  IconCubePlus,
  IconHash,
  IconMapPin,
  IconTruck,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import StatCard from '@/components/dashboard/StatCard';
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
  const [skuMinimumChargeHours, setSkuMinimumChargeHours] = useState<
    number | ''
  >('');

  const [serialOrEngine, setSerialOrEngine] = useState('');
  const [imageFileObjectId, setImageFileObjectId] = useState('');
  const [active, setActive] = useState(true);

  const [ownerWarehouseId, setOwnerWarehouseId] = useState<string | null>(null);
  const [warehouseCurrentId, setWarehouseCurrentId] = useState<string | null>(
    null,
  );
  const [manualInternalNumber, setManualInternalNumber] = useState<number | ''>(
    '',
  );
  const [assets, setAssets] = useState<Asset[]>([]);

  const familySelectRef = useRef<HTMLInputElement>(null);
  const familyNameRef = useRef<HTMLInputElement>(null);
  const skuNameRef = useRef<HTMLInputElement>(null);
  const serialOrEngineRef = useRef<HTMLInputElement>(null);
  const ownerWarehouseRef = useRef<HTMLInputElement>(null);
  const warehouseCurrentRef = useRef<HTMLInputElement>(null);
  const skuMinimumChargeHoursRef = useRef<HTMLInputElement>(null);
  const manualInternalNumberRef = useRef<HTMLInputElement>(null);

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
    () =>
      warehouses.find((warehouse) => warehouse.id === ownerWarehouseId) ?? null,
    [ownerWarehouseId, warehouses],
  );
  const isAlternateOwnerWarehouse = selectedOwnerWarehouse?.type === 'ALLY';
  const selectedFamily = familyId ? familyNameById.get(familyId) : null;
  const selectedCurrentWarehouse = useMemo(
    () =>
      warehouses.find((warehouse) => warehouse.id === warehouseCurrentId) ?? null,
    [warehouseCurrentId, warehouses],
  );
  const serialReady =
    Boolean(serialOrEngine.trim()) &&
    Boolean(ownerWarehouseId) &&
    Boolean(warehouseCurrentId);

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

  const setValidationError = (
    message: string,
    fieldRef?: React.RefObject<HTMLInputElement | null>,
  ) => {
    setError(message);
    window.requestAnimationFrame(() => fieldRef?.current?.focus());
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (familyMode === 'existing' && !familyId) {
      setValidationError(
        'Selecciona una categoría de equipo.',
        familySelectRef,
      );
      return;
    }

    if (familyMode === 'new' && !familyName.trim()) {
      setValidationError('Ingresa el nombre de la categoría.', familyNameRef);
      return;
    }

    if (!skuName.trim() && !skuBrand.trim() && !skuModel.trim()) {
      setValidationError(
        'Ingresa el nombre de la referencia o al menos marca/modelo.',
        skuNameRef,
      );
      return;
    }

    if (!serialOrEngine.trim()) {
      setValidationError(
        'El serial o motor es obligatorio.',
        serialOrEngineRef,
      );
      return;
    }

    if (!ownerWarehouseId) {
      setValidationError('Selecciona la bodega dueña.', ownerWarehouseRef);
      return;
    }

    if (!warehouseCurrentId) {
      setValidationError(
        'Selecciona la bodega de ubicación.',
        warehouseCurrentRef,
      );
      return;
    }

    if (
      skuChargeType === 'HOUR' &&
      (skuMinimumChargeHours === '' || skuMinimumChargeHours <= 0)
    ) {
      setValidationError(
        'Ingresa el mínimo de cobro por hora.',
        skuMinimumChargeHoursRef,
      );
      return;
    }

    if (
      isAlternateOwnerWarehouse &&
      (manualInternalNumber === '' || manualInternalNumber <= 0)
    ) {
      setValidationError(
        'Ingresa el número interno de la bodega alterna.',
        manualInternalNumberRef,
      );
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
        sku: {
          name: skuName.trim() || undefined,
          unitWeight: skuUnitWeight === '' ? undefined : skuUnitWeight,
          price: skuPrice === '' ? undefined : skuPrice,
          subrentalPrice:
            skuSubrentalPrice === '' ? undefined : skuSubrentalPrice,
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

      const response = await api<CreateSerializedResponse>(
        '/inventory/serialized-assets',
        {
          method: 'POST',
          json: payload,
        },
      );

      const resolvedFamilyName =
        familyMode === 'existing'
          ? familyNameById.get(familyId ?? '')?.name
          : familyName.trim();
      setSuccess(
        `Creado: ${resolvedFamilyName ?? 'Equipo'} #${response.asset.internalNumber}`,
      );
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
      <Stack gap="lg">
        <PageHeaderCard
          title="Registrar equipo único"
          description="Crea un activo serializado, define su referencia comercial y déjalo listo en inventario."
          icon={<IconTruck size={20} />}
          iconColor="blue"
          accentColor="rgba(14,165,233,0.12)"
        >
          <Group>
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
                <Chip value="bulk">Items por cantidad</Chip>
                <Chip value="serial">Equipos únicos</Chip>
              </Group>
            </Chip.Group>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="md">
            <StatCard
              label="Categorías"
              value={String(families.length)}
              hint="Familias serializadas disponibles"
              color="blue"
              icon={<IconChecklist size={20} />}
            />
            <StatCard
              label="Referencias"
              value={String(skus.length)}
              hint={familyMode === 'existing' ? 'Sugerencias para la familia elegida' : 'Se llenan al elegir una familia'}
              color="cyan"
              icon={<IconCubePlus size={20} />}
            />
            <StatCard
              label="Bodegas"
              value={String(warehouses.length)}
              hint="Dueña y ubicación inicial"
              color="grape"
              icon={<IconBuildingWarehouse size={20} />}
            />
            <StatCard
              label="Registro"
              value={serialReady ? 'Listo' : 'Pend.'}
              hint={serialReady ? 'Serial y bodegas completas' : 'Faltan datos clave'}
              color={serialReady ? 'teal' : 'gray'}
              icon={<IconHash size={20} />}
            />
          </SimpleGrid>
        </PageHeaderCard>

        {error ? (
          <Alert color="red" variant="light" title="No se pudo completar el registro" role="alert">
            {error}
          </Alert>
        ) : null}

        {success ? (
          <Alert color="green" variant="light" title="Equipo registrado" role="status" aria-live="polite">
            {success}
          </Alert>
        ) : null}

        <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
          <form onSubmit={handleSubmit}>
            <Stack gap="lg">
              <Paper withBorder radius="lg" p="md">
                <Stack gap="md">
                  <Group justify="space-between" className="mobile-stack">
                    <div>
                      <Text fw={700}>1. Categoría del equipo</Text>
                      <Text size="sm" c="dimmed">
                        La categoría agrupa equipos parecidos, por ejemplo cargadores o compresores.
                      </Text>
                    </div>
                    <Button
                      type="button"
                      variant="light"
                      size="xs"
                      onClick={() =>
                        setFamilyMode((mode) =>
                          mode === 'existing' ? 'new' : 'existing',
                        )
                      }
                    >
                      {familyMode === 'existing'
                        ? 'No existe, crear categoría'
                        : 'Usar categoría existente'}
                    </Button>
                  </Group>

                  {familyMode === 'existing' ? (
                    <Select
                      ref={familySelectRef}
                      label="Categoría"
                      name="familyId"
                      data={familyOptions}
                      value={familyId}
                      onChange={(value) => setFamilyId(value)}
                      placeholder={
                        loading ? 'Cargando…' : 'Selecciona una categoría'
                      }
                      searchable
                      nothingFoundMessage="Sin resultados"
                      disabled={loading}
                    />
                  ) : (
                    <Group grow className="mobile-stack">
                      <TextInput
                        ref={familyNameRef}
                        label="Nombre de la categoría"
                        name="familyName"
                        autoComplete="off"
                        value={familyName}
                        onChange={(event) =>
                          setFamilyName(event.currentTarget.value)
                        }
                        placeholder="Ej: Cargadores"
                        required
                      />
                      <TextInput
                        label="Código interno"
                        name="familyCode"
                        autoComplete="off"
                        value={familyCode}
                        onChange={(event) =>
                          setFamilyCode(event.currentTarget.value)
                        }
                        placeholder="Ej: CGD"
                      />
                    </Group>
                  )}

                  <Group gap="xs">
                    <Badge color={familyMode === 'existing' ? 'blue' : 'violet'} variant="light">
                      {familyMode === 'existing' ? 'Categoría existente' : 'Nueva categoría'}
                    </Badge>
                    {(selectedFamily || familyName.trim()) ? (
                      <Badge color="teal" variant="light">
                        {selectedFamily?.name ?? familyName.trim()}
                      </Badge>
                    ) : null}
                  </Group>
                </Stack>
              </Paper>

              <Paper withBorder radius="lg" p="md">
                <Stack gap="md">
                  <div>
                    <Text fw={700}>2. Referencia del equipo</Text>
                    <Text size="sm" c="dimmed">
                      Define la referencia comercial y los atributos base del equipo.
                    </Text>
                  </div>

                  <Select
                    label="Sugerencias de referencia"
                    name="skuSuggestionId"
                    data={skuOptions}
                    value={skuSuggestionId}
                    onChange={(value) => {
                      setSkuSuggestionId(value);
                      const selectedSku = value ? skuById.get(value) : undefined;
                      if (!selectedSku) return;
                      setSkuName(selectedSku.name ?? '');
                      setSkuUnitWeight(
                        typeof selectedSku.unitWeight === 'number'
                          ? selectedSku.unitWeight
                          : '',
                      );
                      setSkuPrice(
                        typeof selectedSku.price === 'number'
                          ? selectedSku.price
                          : '',
                      );
                      setSkuSubrentalPrice(
                        typeof selectedSku.subrentalPrice === 'number'
                          ? selectedSku.subrentalPrice
                          : '',
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
                      const sampleAsset = (
                        referenceAssetsBySkuId.get(selectedSku.id) ?? []
                      ).find(
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
                    placeholder={
                      loadingSkus
                        ? 'Cargando…'
                        : 'Selecciona una referencia parecida'
                    }
                    searchable
                    clearable
                    nothingFoundMessage="Sin resultados"
                    disabled={familyMode === 'new' || loadingSkus || !familyId}
                  />

                  <TextInput
                    ref={skuNameRef}
                    label="Nombre de la referencia"
                    name="skuName"
                    autoComplete="off"
                    value={skuName}
                    onChange={(event) => setSkuName(event.currentTarget.value)}
                    placeholder="Ej: Mini cargador S650"
                  />

                  <Group grow className="mobile-stack">
                    <TextInput
                      label="Marca"
                      name="skuBrand"
                      autoComplete="off"
                      value={skuBrand}
                      onChange={(event) => setSkuBrand(event.currentTarget.value)}
                    />
                    <TextInput
                      label="Modelo"
                      name="skuModel"
                      autoComplete="off"
                      value={skuModel}
                      onChange={(event) => setSkuModel(event.currentTarget.value)}
                    />
                  </Group>

                  <Group grow className="mobile-stack">
                    <NumberInput
                      label="Año"
                      name="skuYear"
                      autoComplete="off"
                      value={skuYear}
                      onChange={(value) =>
                        setSkuYear(typeof value === 'number' ? value : '')
                      }
                      min={1900}
                      max={2100}
                    />
                    <Select
                      label="Combustible"
                      name="skuFuel"
                      data={FUEL_OPTIONS}
                      value={skuFuel}
                      onChange={(value) => setSkuFuel(value ?? '')}
                      clearable
                    />
                  </Group>

                  <Group grow className="mobile-stack">
                    <Select
                      label="Unidad de medida"
                      name="skuUnit"
                      data={unitOptions}
                      value={skuUnit}
                      onChange={(value) => setSkuUnit(value ?? '')}
                      searchable
                      nothingFoundMessage="Sin unidades"
                      required
                    />
                    <NumberInput
                      label="Peso por unidad"
                      name="skuUnitWeight"
                      autoComplete="off"
                      value={skuUnitWeight}
                      onChange={(value) =>
                        setSkuUnitWeight(typeof value === 'number' ? value : '')
                      }
                      min={0}
                      step={0.1}
                    />
                  </Group>
                </Stack>
              </Paper>

              <Paper withBorder radius="lg" p="md">
                <Stack gap="md">
                  <div>
                    <Text fw={700}>3. Tarifas y cobro</Text>
                    <Text size="sm" c="dimmed">
                      Configura el comportamiento comercial del equipo para alquiler o subalquiler.
                    </Text>
                  </div>

                  <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
                    <NumberInput
                      label="Precio"
                      name="skuPrice"
                      autoComplete="off"
                      value={skuPrice}
                      onChange={(value) =>
                        setSkuPrice(typeof value === 'number' ? value : '')
                      }
                      min={0}
                      step={1000}
                      prefix="$ "
                      thousandSeparator=","
                    />
                    <NumberInput
                      label="Precio subalquiler"
                      name="skuSubrentalPrice"
                      autoComplete="off"
                      value={skuSubrentalPrice}
                      onChange={(value) =>
                        setSkuSubrentalPrice(typeof value === 'number' ? value : '')
                      }
                      min={0}
                      step={1000}
                      prefix="$ "
                      thousandSeparator=","
                    />
                    <Select
                      label="Tipo de cobro"
                      name="skuChargeType"
                      data={CHARGE_TYPE_OPTIONS}
                      value={skuChargeType}
                      onChange={(value) =>
                        setSkuChargeType((value as 'DAY' | 'HOUR' | null) ?? 'DAY')
                      }
                    />
                    {skuChargeType === 'HOUR' ? (
                      <NumberInput
                        ref={skuMinimumChargeHoursRef}
                        label="Mínimo de cobro"
                        name="skuMinimumChargeHours"
                        autoComplete="off"
                        value={skuMinimumChargeHours}
                        onChange={(value) =>
                          setSkuMinimumChargeHours(
                            typeof value === 'number' ? value : '',
                          )
                        }
                        min={0.5}
                        step={0.5}
                        suffix=" horas"
                      />
                    ) : null}
                  </SimpleGrid>
                </Stack>
              </Paper>

              <Paper withBorder radius="lg" p="md">
                <Stack gap="md">
                  <div>
                    <Text fw={700}>4. Identificación del equipo</Text>
                    <Text size="sm" c="dimmed">
                      Datos únicos del activo para que quede trazable dentro del sistema.
                    </Text>
                  </div>

                  <TextInput
                    ref={serialOrEngineRef}
                    label="Serial / motor"
                    name="serialOrEngine"
                    autoComplete="off"
                    value={serialOrEngine}
                    onChange={(event) =>
                      setSerialOrEngine(event.currentTarget.value)
                    }
                    placeholder="Ej: A3NV16797"
                    required
                  />
                  <TextInput
                    label="Imagen (ID interno, opcional)"
                    name="imageFileObjectId"
                    autoComplete="off"
                    value={imageFileObjectId}
                    onChange={(event) =>
                      setImageFileObjectId(event.currentTarget.value)
                    }
                  />
                  {isAlternateOwnerWarehouse ? (
                    <NumberInput
                      ref={manualInternalNumberRef}
                      label="Número interno (bodega alterna)"
                      name="manualInternalNumber"
                      autoComplete="off"
                      value={manualInternalNumber}
                      onChange={(value) =>
                        setManualInternalNumber(
                          typeof value === 'number' ? value : '',
                        )
                      }
                      min={1}
                      required
                    />
                  ) : null}
                </Stack>
              </Paper>

              <Paper withBorder radius="lg" p="md">
                <Stack gap="md">
                  <div>
                    <Text fw={700}>5. Propiedad y ubicación inicial</Text>
                    <Text size="sm" c="dimmed">
                      Define la bodega dueña del activo y dónde quedará ubicado al registrarlo.
                    </Text>
                  </div>

                  <Group grow className="mobile-stack">
                    <Select
                      ref={ownerWarehouseRef}
                      label="Bodega dueña"
                      name="ownerWarehouseId"
                      data={warehouseOptions}
                      value={ownerWarehouseId}
                      onChange={(value) => {
                        setOwnerWarehouseId(value);
                        setWarehouseCurrentId(value);
                        const selected = warehouses.find(
                          (warehouse) => warehouse.id === value,
                        );
                        if (selected?.type !== 'ALLY') {
                          setManualInternalNumber('');
                        }
                      }}
                      required
                    />
                    <Select
                      ref={warehouseCurrentRef}
                      label="Bodega de ubicación"
                      name="warehouseCurrentId"
                      data={warehouseOptions}
                      value={warehouseCurrentId}
                      onChange={(value) => setWarehouseCurrentId(value)}
                      required
                    />
                  </Group>
                  <Switch
                    label="Activo"
                    name="active"
                    checked={active}
                    onChange={(event) => setActive(event.currentTarget.checked)}
                  />
                </Stack>
              </Paper>

              <Paper withBorder radius="lg" p="md">
                <Stack gap="md">
                  <div>
                    <Text fw={700}>Resumen de registro</Text>
                    <Text size="sm" c="dimmed">
                      Vista rápida de lo que se va a crear.
                    </Text>
                  </div>
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <Paper radius="md" p="sm" bg="gray.0">
                      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                        Familia y referencia
                      </Text>
                      <Text size="sm" mt={8}>
                        {(selectedFamily?.name ?? familyName.trim()) || 'Sin categoría'}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {skuName.trim() || 'Sin referencia'}
                      </Text>
                    </Paper>
                    <Paper radius="md" p="sm" bg="gray.0">
                      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                        Serial y ubicación
                      </Text>
                      <Text size="sm" mt={8}>
                        {serialOrEngine.trim() || 'Sin serial'}
                      </Text>
                      <Text size="sm" c="dimmed">
                        Dueña: {selectedOwnerWarehouse?.name ?? '-'}
                      </Text>
                      <Text size="sm" c="dimmed">
                        Ubicación: {selectedCurrentWarehouse?.name ?? '-'}
                      </Text>
                    </Paper>
                  </SimpleGrid>
                  <Group gap="xs">
                    <Badge color={active ? 'green' : 'gray'} variant="light">
                      {active ? 'Activo' : 'Inactivo'}
                    </Badge>
                    {skuChargeType === 'HOUR' ? (
                      <Badge color="orange" variant="light">
                        Cobro por hora
                      </Badge>
                    ) : (
                      <Badge color="blue" variant="light">
                        Cobro por día
                      </Badge>
                    )}
                    {isAlternateOwnerWarehouse ? (
                      <Badge color="grape" variant="light">
                        Bodega alterna
                      </Badge>
                    ) : null}
                  </Group>
                </Stack>
              </Paper>

              <Group justify="flex-end" className="mobile-actions">
                <Button
                  type="button"
                  variant="default"
                  onClick={() => router.back()}
                >
                  Cancelar
                </Button>
                <Button type="submit" loading={saving}>
                  Guardar equipo
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Container>
  );
}
