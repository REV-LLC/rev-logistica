'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  FileButton,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  NumberInput,
  SimpleGrid,
  Switch,
} from '@mantine/core';
import {
  IconUpload,
  IconTruck,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import ChargeTypeSelect from '@/components/ChargeTypeSelect';
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
  replacementValue?: number | null;
  chargeType?: 'DAY' | 'HOUR' | null;
  minimumChargeHours?: number | null;
  size?: string | null;
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

type CatalogOption = {
  groupKey: string;
  value: string;
  label: string;
  active: boolean;
};

const FUEL_OPTIONS = [
  { value: 'GASOLINA', label: 'Gasolina' },
  { value: 'DIESEL', label: 'Diesel' },
  { value: 'ELECTRICO', label: 'Electrico' },
];
const SIZE_OPTIONS = [
  { value: 'EXTRA PEQUEÑO', label: 'Extra pequeño' },
  { value: 'PEQUEÑO', label: 'Pequeño' },
  { value: 'MEDIANO', label: 'Mediano' },
  { value: 'GRANDE', label: 'Grande' },
  { value: 'EXTRA GRANDE', label: 'Extra grande' },
];
const BASE_BRAND_OPTIONS = [
  'BOBCAT',
  'BOSCH',
  'CATERPILLAR',
  'DEWALT',
  'GENIE',
  'HILTI',
  'HONDA',
  'JLG',
  'MAKITA',
  'WACKER NEUSON',
];
const getWorkflowStepClassName = (isActive: boolean) =>
  `workflow-step-card ${isActive ? 'is-active' : 'is-muted'}`;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripReferenceParts = (reference: string, parts: Array<string | number | null | undefined>) => {
  let cleaned = reference.trim();
  parts.forEach((part) => {
    const value = String(part ?? '').trim();
    if (!value) return;
    cleaned = cleaned.replace(new RegExp(`(^|\\s)${escapeRegExp(value)}(?=\\s|$)`, 'gi'), ' ');
  });
  return cleaned.replace(/\s+/g, ' ').trim();
};

export default function CreateSerializedAssetPage() {
  const router = useRouter();
  const [families, setFamilies] = useState<AssetFamily[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [catalogBrandOptions, setCatalogBrandOptions] = useState<CatalogOption[]>([]);
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
  const [skuSize, setSkuSize] = useState('');
  const [skuUnit, setSkuUnit] = useState('');
  const [skuUnitWeight, setSkuUnitWeight] = useState<number | ''>('');
  const [skuPrice, setSkuPrice] = useState<number | ''>('');
  const [skuSubrentalPrice, setSkuSubrentalPrice] = useState<number | ''>('');
  const [skuReplacementValue, setSkuReplacementValue] = useState<number | ''>('');
  const [skuChargeType, setSkuChargeType] = useState<'DAY' | 'HOUR'>('DAY');
  const [skuMinimumChargeHours, setSkuMinimumChargeHours] = useState<
    number | ''
  >('');

  const [serialOrEngine, setSerialOrEngine] = useState('');
  const [assetImageFile, setAssetImageFile] = useState<File | null>(null);
  const [active, setActive] = useState(true);

  const [ownerWarehouseId, setOwnerWarehouseId] = useState<string | null>(null);
  const [warehouseCurrentId, setWarehouseCurrentId] = useState<string | null>(
    null,
  );
  const [manualInternalNumber, setManualInternalNumber] = useState<number | ''>(
    '',
  );
  const [assets, setAssets] = useState<Asset[]>([]);
  const [warehouseLocked, setWarehouseLocked] = useState(false);
  const [familyLocked, setFamilyLocked] = useState(false);

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
        const [familyData, warehouseData, unitData, catalogBrandData] = await Promise.all([
          api<AssetFamily[]>('/asset-families?controlType=SERIAL'),
          api<Warehouse[]>('/warehouses'),
          api<string[]>('/skus/units'),
          api<CatalogOption[]>('/catalog/options?groupKey=SERIAL_ASSET_BRANDS').catch(() => []),
        ]);
        if (!mounted) return;
        setFamilies(familyData);
        setWarehouses(warehouseData);
        setUnits(unitData);
        setCatalogBrandOptions(catalogBrandData.filter((option) => option.active));
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
          setError('Error loading data');
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
  const brandOptions = useMemo(
    () => {
      const normalizedByValue = new Map<string, { value: string; label: string }>();
      const addBrand = (rawValue: string | null | undefined, rawLabel?: string | null) => {
        const value = rawValue?.trim().toUpperCase();
        if (!value) return;
        normalizedByValue.set(value, {
          value,
          label: rawLabel?.trim().toUpperCase() || value,
        });
      };
      catalogBrandOptions.forEach((option) => addBrand(option.value, option.label));
      BASE_BRAND_OPTIONS.forEach((brand) => addBrand(brand));
      const existingBrands = assets
        .map((asset) => asset.brand?.trim().toUpperCase() ?? '')
        .filter((brand) => brand.length > 0);
      existingBrands.forEach((brand) => addBrand(brand));
      return [...normalizedByValue.values()].sort((a, b) => a.label.localeCompare(b.label));
    },
    [assets, catalogBrandOptions],
  );
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
  const resolvedSkuName = useMemo(() => {
    const manualName = skuName.trim();
    if (manualName) return manualName;

    const brandModelName = [skuBrand.trim(), skuModel.trim()].filter(Boolean).join(' ').trim();
    if (brandModelName) return brandModelName;

    return (selectedFamily?.name ?? familyName.trim()).trim();
  }, [familyName, selectedFamily?.name, skuBrand, skuModel, skuName]);
  const hasTemplateData = Boolean(resolvedSkuName && skuUnit);
  const hasCommercialData =
    skuPrice !== '' &&
    Number(skuPrice) >= 0 &&
    skuSubrentalPrice !== '' &&
    Number(skuSubrentalPrice) >= 0 &&
    skuReplacementValue !== '' &&
    Number(skuReplacementValue) >= 0 &&
    (skuChargeType !== 'HOUR' ||
      (skuMinimumChargeHours !== '' && Number(skuMinimumChargeHours) > 0));
  const hasAssetData =
    Boolean(serialOrEngine.trim()) &&
    (!isAlternateOwnerWarehouse ||
      (manualInternalNumber !== '' && Number(manualInternalNumber) > 0));
  const isWarehouseStepActive = !warehouseLocked;
  const isFamilyStepActive = warehouseLocked && !familyLocked;
  const canEditAssetDetails = warehouseLocked && familyLocked;
  const isTemplateStepActive = canEditAssetDetails && !hasTemplateData;
  const isCommercialStepActive =
    canEditAssetDetails && hasTemplateData && !hasCommercialData;
  const isAssetStepActive =
    canEditAssetDetails && hasTemplateData && hasCommercialData && !hasAssetData;
  const isReviewStepActive =
    canEditAssetDetails && hasTemplateData && hasCommercialData && hasAssetData;
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
    setSkuSize('');
    setSkuUnit('');
    setSkuUnitWeight('');
    setSkuPrice('');
    setSkuSubrentalPrice('');
    setSkuReplacementValue('');
    setSkuChargeType('DAY');
    setSkuMinimumChargeHours('');
    setSerialOrEngine('');
    setAssetImageFile(null);
    setActive(true);
    setOwnerWarehouseId(null);
    setWarehouseCurrentId(null);
    setManualInternalNumber('');
    setWarehouseLocked(false);
    setFamilyLocked(false);
  };

  const clearFamilyAndAssetInputs = () => {
    setFamilyId(null);
    setFamilyName('');
    setFamilyCode('');
    setSkuSuggestionId(null);
    setSkuName('');
    setSkuBrand('');
    setSkuModel('');
    setSkuYear('');
    setSkuFuel('');
    setSkuSize('');
    setSkuUnit('');
    setSkuUnitWeight('');
    setSkuPrice('');
    setSkuSubrentalPrice('');
    setSkuReplacementValue('');
    setSkuChargeType('DAY');
    setSkuMinimumChargeHours('');
    setSerialOrEngine('');
    setAssetImageFile(null);
    setActive(true);
    setManualInternalNumber('');
    setFamilyLocked(false);
  };

  const handleOwnerWarehouseChange = (value: string | null) => {
    setOwnerWarehouseId(value);
    setWarehouseCurrentId(value);
    setWarehouseLocked(false);
    clearFamilyAndAssetInputs();
    const selected = warehouses.find((warehouse) => warehouse.id === value);
    if (selected?.type !== 'ALLY') {
      setManualInternalNumber('');
    }
  };

  const confirmWarehouseSelection = () => {
    setError(null);
    if (!ownerWarehouseId) {
      setValidationError('Select the owner warehouse.', ownerWarehouseRef);
      return;
    }
    if (!warehouseCurrentId) {
      setValidationError('Select the location warehouse.', warehouseCurrentRef);
      return;
    }
    setWarehouseLocked(true);
  };

  const unlockWarehouseSelection = () => {
    setWarehouseLocked(false);
    clearFamilyAndAssetInputs();
  };

  const confirmFamilySelection = () => {
    setError(null);
    if (!warehouseLocked) {
      setError('Confirm the warehouse first.');
      return;
    }
    if (familyMode === 'existing' && !familyId) {
      setValidationError('Select an equipment family.', familySelectRef);
      return;
    }
    if (familyMode === 'new' && !familyName.trim()) {
      setValidationError('Enter the category name.', familyNameRef);
      return;
    }
    setFamilyLocked(true);
  };

  const unlockFamilySelection = () => {
    setFamilyLocked(false);
    setSkuSuggestionId(null);
    setSkuName('');
    setSkuBrand('');
    setSkuModel('');
    setSkuYear('');
    setSkuFuel('');
    setSkuSize('');
    setSkuUnit('');
    setSkuUnitWeight('');
    setSkuPrice('');
    setSkuSubrentalPrice('');
    setSkuReplacementValue('');
    setSkuChargeType('DAY');
    setSkuMinimumChargeHours('');
    setSerialOrEngine('');
    setAssetImageFile(null);
    setActive(true);
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

    if (!warehouseLocked) {
      setValidationError('Confirm the warehouse before saving.', ownerWarehouseRef);
      return;
    }

    if (!familyLocked) {
      setValidationError('Confirm the family before saving.', familySelectRef);
      return;
    }

    if (familyMode === 'existing' && !familyId) {
      setValidationError(
        'Select an equipment family.',
        familySelectRef,
      );
      return;
    }

    if (familyMode === 'new' && !familyName.trim()) {
      setValidationError('Enter the category name.', familyNameRef);
      return;
    }

    if (!resolvedSkuName) {
      setValidationError(
        'Ingresa marca/modelo o confirma una familia.',
        skuNameRef,
      );
      return;
    }

    if (!serialOrEngine.trim()) {
      setValidationError(
        'Serial or engine number is required.',
        serialOrEngineRef,
      );
      return;
    }

    if (!ownerWarehouseId) {
      setValidationError('Select the owner warehouse.', ownerWarehouseRef);
      return;
    }

    if (!warehouseCurrentId) {
      setValidationError(
        'Select the location warehouse.',
        warehouseCurrentRef,
      );
      return;
    }

    if (
      skuChargeType === 'HOUR' &&
      (skuMinimumChargeHours === '' || skuMinimumChargeHours <= 0)
    ) {
      setValidationError(
        'Enter the minimum hourly charge.',
        skuMinimumChargeHoursRef,
      );
      return;
    }

    if (
      isAlternateOwnerWarehouse &&
      (manualInternalNumber === '' || manualInternalNumber <= 0)
    ) {
      setValidationError(
        'Enter the alternate warehouse internal number.',
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
          name: resolvedSkuName || undefined,
          unitWeight: skuUnitWeight === '' ? undefined : skuUnitWeight,
          price: skuPrice === '' ? undefined : skuPrice,
          subrentalPrice:
            skuSubrentalPrice === '' ? undefined : skuSubrentalPrice,
          replacementValue:
            skuReplacementValue === '' ? undefined : skuReplacementValue,
          chargeType: skuChargeType,
          minimumChargeHours:
            skuChargeType === 'HOUR' && skuMinimumChargeHours !== ''
              ? skuMinimumChargeHours
              : undefined,
          size: skuSize || undefined,
        },
        asset: {
          serialOrEngine: serialOrEngine.trim(),
          brand: skuBrand.trim() || undefined,
          model: skuModel.trim() || undefined,
          year: skuYear === '' ? undefined : skuYear,
          fuel: skuFuel || undefined,
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

      if (assetImageFile) {
        const formData = new FormData();
        formData.append('files', assetImageFile);
        formData.append('category', 'PHOTO');
        formData.append('displayName', 'Imagen principal');

        const upload = await api<{
          files: Array<{ id: string; storageKey: string; mimeType?: string | null }>;
        }>(`/files/entities/ASSET/${response.asset.id}`, {
          method: 'POST',
          body: formData,
        });
        const uploadedImage = upload.files.find((item) => item.mimeType?.startsWith('image/')) ?? upload.files[0];
        if (uploadedImage) {
          await api(`/assets/${response.asset.id}`, {
            method: 'PATCH',
            json: { imageFileObjectId: uploadedImage.id },
          });
        }
      }

      const resolvedFamilyName =
        familyMode === 'existing'
          ? familyNameById.get(familyId ?? '')?.name
          : familyName.trim();
      setSuccess(
        `Created: ${resolvedFamilyName ?? 'Equipment'} #${response.asset.internalNumber}`,
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
          title="Registrar equipo unico"
          description="Crea la plantilla del equipo y registra la unidad fisica con su ubicacion inicial."
          icon={<IconTruck size={20} />}
          iconColor="blue"
          accentColor="rgba(14,165,233,0.12)"
        >
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Paper
              component="button"
              type="button"
              withBorder
              radius="md"
              p="xs"
              onClick={() => router.push('/inventory/bulk-adjustments')}
              style={{
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.78)',
                textAlign: 'left',
              }}
            >
              <Group gap="sm" wrap="nowrap">
                <img
                  src="/inventory/certified-scaffold.png"
                  alt=""
                  aria-hidden="true"
                  style={{ width: 72, height: 58, borderRadius: 8, objectFit: 'cover' }}
                />
                <Stack gap={2}>
                  <Text fw={700} size="sm">Items por cantidad</Text>
                  <Text size="xs" c="dimmed">Andamio, formaleta y stock masivo</Text>
                </Stack>
              </Group>
            </Paper>
            <Paper
              component="button"
              type="button"
              withBorder
              radius="md"
              p="xs"
              style={{
                cursor: 'default',
                borderColor: 'var(--mantine-color-blue-5)',
                background: 'var(--mantine-color-blue-0)',
                textAlign: 'left',
              }}
            >
              <Group gap="sm" wrap="nowrap">
                <img
                  src="/inventory/skid-steer-loader.png"
                  alt=""
                  aria-hidden="true"
                  style={{ width: 72, height: 58, borderRadius: 8, objectFit: 'cover' }}
                />
                <Stack gap={2}>
                  <Text fw={700} size="sm">Equipos unicos</Text>
                  <Text size="xs" c="dimmed">Minicargadores y activos serializados</Text>
                </Stack>
              </Group>
            </Paper>
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
              <Paper
                withBorder
                radius="lg"
                p="md"
                className={getWorkflowStepClassName(isWarehouseStepActive)}
              >
                <Stack gap="md">
                  <Group justify="space-between" align="flex-start" className="mobile-stack">
                    <div>
                      <Text fw={700}>1. Bodega</Text>
                      <Text size="sm" c="dimmed">
                        Selecciona donde quedara ubicado inicialmente el equipo.
                      </Text>
                    </div>
                    {warehouseLocked ? (
                      <Badge color="green" variant="light">
                        Confirmada
                      </Badge>
                    ) : null}
                  </Group>

                  <Group grow className="mobile-stack">
                    <Select
                      ref={ownerWarehouseRef}
                      label="Bodega dueña"
                      name="ownerWarehouseId"
                      data={warehouseOptions}
                      value={ownerWarehouseId}
                      onChange={handleOwnerWarehouseChange}
                      disabled={warehouseLocked}
                      required
                    />
                    <Select
                      ref={warehouseCurrentRef}
                      label="Ubicacion actual"
                      name="warehouseCurrentId"
                      data={warehouseOptions}
                      value={warehouseCurrentId}
                      onChange={(value) => setWarehouseCurrentId(value)}
                      disabled={warehouseLocked}
                      required
                    />
                  </Group>

                  <Group justify="flex-end" className="mobile-actions">
                    {warehouseLocked ? (
                      <Button type="button" variant="default" onClick={unlockWarehouseSelection}>
                        Cambiar bodega
                      </Button>
                    ) : (
                      <Button type="button" onClick={confirmWarehouseSelection}>
                        Siguiente
                      </Button>
                    )}
                  </Group>
                </Stack>
              </Paper>

              <Paper
                withBorder
                radius="lg"
                p="md"
                className={getWorkflowStepClassName(isFamilyStepActive)}
              >
                <Stack gap="md">
                  <Group justify="space-between" align="flex-start" className="mobile-stack">
                    <div>
                      <Text fw={700}>2. Familia</Text>
                      <Text size="sm" c="dimmed">
                        Elige una linea del catalogo o crea una nueva.
                      </Text>
                    </div>
                    <Group gap="xs">
                      {familyLocked ? (
                        <Badge color="green" variant="light">
                          Confirmada
                        </Badge>
                      ) : null}
                      <Button
                        type="button"
                        variant="light"
                        size="xs"
                        disabled={!warehouseLocked || familyLocked}
                        onClick={() =>
                          setFamilyMode((mode) =>
                            mode === 'existing' ? 'new' : 'existing',
                          )
                        }
                      >
                        {familyMode === 'existing'
                          ? 'Crear familia'
                          : 'Usar familia existente'}
                      </Button>
                    </Group>
                  </Group>

                  {!warehouseLocked ? (
                    <Paper radius="md" p="sm" bg="gray.0">
                      <Text size="sm" c="dimmed">
                        Confirma primero la bodega.
                      </Text>
                    </Paper>
                  ) : familyMode === 'existing' ? (
                    <Select
                      ref={familySelectRef}
                      label="Familia"
                      name="familyId"
                      data={familyOptions}
                      value={familyId}
                      onChange={(value) => setFamilyId(value)}
                      placeholder={
                        loading ? 'Cargando...' : 'Seleccionar familia'
                      }
                      searchable
                      nothingFoundMessage="Sin resultados"
                      disabled={loading || familyLocked}
                    />
                  ) : (
                    <Group grow className="mobile-stack">
                      <TextInput
                        ref={familyNameRef}
                        label="Nombre de familia"
                        name="familyName"
                        autoComplete="off"
                        value={familyName}
                        onChange={(event) =>
                          setFamilyName(event.currentTarget.value)
                        }
                        placeholder="Ejemplo: Minicargadores"
                        disabled={familyLocked}
                        required
                      />
                      <TextInput
                        label="Codigo interno"
                        name="familyCode"
                        autoComplete="off"
                        value={familyCode}
                        onChange={(event) =>
                          setFamilyCode(event.currentTarget.value)
                        }
                        placeholder="Ejemplo: MCG"
                        disabled={familyLocked}
                      />
                    </Group>
                  )}

                  <Group gap="xs">
                    <Badge color={familyMode === 'existing' ? 'blue' : 'violet'} variant="light">
                      {familyMode === 'existing' ? 'Familia existente' : 'Familia nueva'}
                    </Badge>
                    {(selectedFamily || familyName.trim()) ? (
                      <Badge color="teal" variant="light">
                        {selectedFamily?.name ?? familyName.trim()}
                      </Badge>
                    ) : null}
                  </Group>

                  {warehouseLocked ? (
                    <Group justify="flex-end" className="mobile-actions">
                      {familyLocked ? (
                        <Button type="button" variant="default" onClick={unlockFamilySelection}>
                          Cambiar familia
                        </Button>
                      ) : (
                        <Button type="button" onClick={confirmFamilySelection}>
                          Confirmar familia
                        </Button>
                      )}
                    </Group>
                  ) : null}
                </Stack>
              </Paper>

              {warehouseLocked && familyLocked ? (
              <>
              <Paper
                withBorder
                radius="lg"
                p="md"
                className={getWorkflowStepClassName(isTemplateStepActive)}
              >
                <Stack gap="md">
                  <div>
                    <Text fw={700}>3. Plantilla</Text>
                    <Text size="sm" c="dimmed">
                      Reutiliza una referencia o define marca, modelo y datos base.
                    </Text>
                  </div>

                  <Select
                    label="Buscar plantilla"
                    name="skuSuggestionId"
                    data={skuOptions}
                    value={skuSuggestionId}
                    onChange={(value) => {
                      setSkuSuggestionId(value);
                      const selectedSku = value ? skuById.get(value) : undefined;
                      if (!selectedSku) return;
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
                      setSkuReplacementValue(
                        typeof selectedSku.replacementValue === 'number'
                          ? selectedSku.replacementValue
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
                      const copiedBrand = sampleAsset?.brand?.trim() ?? '';
                      const copiedModel = sampleAsset?.model?.trim() ?? '';
                      setSkuBrand(copiedBrand);
                      setSkuModel(copiedModel);
                      setSkuYear(sampleAsset?.year ?? '');
                      setSkuFuel(sampleAsset?.fuel?.trim() ?? '');
                      setSkuSize(selectedSku.size?.trim() ?? '');
                      setSkuName(stripReferenceParts(selectedSku.name ?? '', [copiedBrand, copiedModel]));
                    }}
                    placeholder={
                      loadingSkus
                        ? 'Cargando...'
                        : 'Seleccionar una plantilla similar'
                    }
                    searchable
                    clearable
                    nothingFoundMessage="Sin resultados"
                    disabled={familyMode === 'new' || loadingSkus || !familyId}
                  />

                  {familyMode === 'existing' ? (
                    <TextInput
                      ref={skuNameRef}
                      label="Referencia"
                      name="skuName"
                      autoComplete="off"
                      value={skuName}
                      onChange={(event) => setSkuName(event.currentTarget.value)}
                      placeholder="Ejemplo: Minicargador S650"
                    />
                  ) : (
                    <Paper radius="md" p="sm" bg="gray.0">
                      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                        Referencia
                      </Text>
                      <Text size="sm" mt={4}>
                        {resolvedSkuName || 'Se genera con marca y modelo'}
                      </Text>
                    </Paper>
                  )}

                  <Group grow className="mobile-stack">
                    <Select
                      label="Marca"
                      name="skuBrand"
                      value={skuBrand}
                      data={brandOptions}
                      onChange={(value) => setSkuBrand(value ?? '')}
                      placeholder="Selecciona marca"
                      searchable
                      clearable
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
                    <Select
                      label="Tamaño"
                      name="skuSize"
                      data={SIZE_OPTIONS}
                      value={skuSize}
                      onChange={(value) => setSkuSize(value ?? '')}
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
                      nothingFoundMessage="No hay unidades"
                      required
                    />
                    <NumberInput
                      label="Peso unitario"
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

              <Paper
                withBorder
                radius="lg"
                p="md"
                className={getWorkflowStepClassName(isCommercialStepActive)}
              >
                <Stack gap="md">
                  <div>
                    <Text fw={700}>4. Datos comerciales</Text>
                    <Text size="sm" c="dimmed">
                      Precio, subalquiler, reposicion y regla de cobro.
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
                      label="Precio sub alquiler"
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
                    <NumberInput
                      label="Valor reposicion"
                      name="skuReplacementValue"
                      autoComplete="off"
                      value={skuReplacementValue}
                      onChange={(value) =>
                        setSkuReplacementValue(typeof value === 'number' ? value : '')
                      }
                      min={0}
                      step={1000}
                      prefix="$ "
                      thousandSeparator=","
                    />
                    <ChargeTypeSelect
                      label="Tipo de cobro"
                      name="skuChargeType"
                      value={skuChargeType}
                      onChange={setSkuChargeType}
                    />
                    {skuChargeType === 'HOUR' ? (
                      <NumberInput
                        ref={skuMinimumChargeHoursRef}
                        label="Cobro minimo"
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

              <Paper
                withBorder
                radius="lg"
                p="md"
                className={getWorkflowStepClassName(isAssetStepActive)}
              >
                <Stack gap="md">
                  <div>
                    <Text fw={700}>5. Activo</Text>
                    <Text size="sm" c="dimmed">
                      La unidad fisica que quedara trazable.
                    </Text>
                  </div>

                  <TextInput
                    ref={serialOrEngineRef}
                    label="Serial o motor"
                    name="serialOrEngine"
                    autoComplete="off"
                    value={serialOrEngine}
                    onChange={(event) =>
                      setSerialOrEngine(event.currentTarget.value)
                    }
                    placeholder="Ej: A3NV16797"
                    required
                  />
                  <Paper withBorder radius="md" p="sm" bg="gray.0">
                    <Group justify="space-between" align="center" gap="md">
                      <div>
                        <Text fw={700}>Imagen</Text>
                        <Text size="sm" c="dimmed">
                          {assetImageFile ? assetImageFile.name : 'PNG, JPG o WEBP.'}
                        </Text>
                      </div>
                      <FileButton
                        onChange={setAssetImageFile}
                        accept="image/png,image/jpeg,image/webp"
                      >
                        {(props) => (
                          <Button {...props} variant="light" leftSection={<IconUpload size={16} />}>
                            Seleccionar archivo
                          </Button>
                        )}
                      </FileButton>
                    </Group>
                  </Paper>
                  {isAlternateOwnerWarehouse ? (
                    <NumberInput
                      ref={manualInternalNumberRef}
                      label="Numero interno (bodega alterna)"
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
                  <Switch
                    label="Activo"
                    name="active"
                    checked={active}
                    onChange={(event) => setActive(event.currentTarget.checked)}
                  />
                </Stack>
              </Paper>

              <Paper
                withBorder
                radius="lg"
                p="md"
                className={getWorkflowStepClassName(isReviewStepActive)}
              >
                <Stack gap="md">
                  <div>
                    <Text fw={700}>6. Revision</Text>
                    <Text size="sm" c="dimmed">
                      Confirma la plantilla, el activo y la ubicacion.
                    </Text>
                  </div>
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <Paper radius="md" p="sm" bg="gray.0">
                      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                        Familia y referencia
                      </Text>
                      <Text size="sm" mt={8}>
                        {(selectedFamily?.name ?? familyName.trim()) || 'Sin categoria'}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {resolvedSkuName || 'Sin referencia'}
                      </Text>
                    </Paper>
                    <Paper radius="md" p="sm" bg="gray.0">
                      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                        Serial y ubicacion
                      </Text>
                      <Text size="sm" mt={8}>
                        {serialOrEngine.trim() || 'Sin serial'}
                      </Text>
                      <Text size="sm" c="dimmed">
                        Dueño: {selectedOwnerWarehouse?.name ?? '-'}
                      </Text>
                      <Text size="sm" c="dimmed">
                        Ubicacion: {selectedCurrentWarehouse?.name ?? '-'}
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
                        Cobro diario
                      </Badge>
                    )}
                    {isAlternateOwnerWarehouse ? (
                      <Badge color="grape" variant="light">
                        Bodega alterna
                      </Badge>
                    ) : null}
                    {skuSize ? (
                      <Badge color="teal" variant="light">
                        {skuSize}
                      </Badge>
                    ) : null}
                  </Group>
                </Stack>
              </Paper>
              </>
              ) : null}

              <Group justify="flex-end" className="mobile-actions">
                <Button
                  type="button"
                  variant="default"
                  onClick={() => router.back()}
                >
                  Cancelar
                </Button>
                <Button type="submit" loading={saving}>
                  Guardar activo
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Container>
  );
}
