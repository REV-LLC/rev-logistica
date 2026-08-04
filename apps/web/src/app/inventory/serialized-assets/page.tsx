'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Badge,
  Button,
  Container,
  FileButton,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  NumberInput,
  SimpleGrid,
} from '@mantine/core';
import {
  IconUpload,
  IconTruck,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import ChargeTypeSelect from '@/components/ChargeTypeSelect';
import UppercaseTextInput, { uppercaseInputValue } from '@/components/UppercaseTextInput';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

type AssetFamily = {
  id: string;
  code: string;
  name: string;
  subfamilies: Array<{
    id: string;
    code: string;
    name: string;
    active: boolean;
  }>;
};

type Warehouse = {
  id: string;
  name: string;
  type?: 'OWN' | 'ALLY' | string;
};

type AssetWorkflowStep = 'template' | 'commercial' | 'asset' | 'review';

type Sku = {
  id: string;
  name: string;
  assetSubfamilyId?: string | null;
  unitWeight?: number | string | null;
  price?: number | string | null;
  subrentalPrice?: number | string | null;
  replacementValue?: number | string | null;
  chargeType?: 'DAY' | 'HOUR' | null;
  minimumChargeHours?: number | string | null;
  size?: string | null;
  lengthMeters?: number | string | null;
  closedLengthMeters?: number | string | null;
  extendedLengthMeters?: number | string | null;
};

type ProviderSkuPrice = {
  skuId: string;
  providerWarehouseId: string;
  price: number;
};

type Asset = {
  id: string;
  imageFileObjectId?: string | null;
  imageUrl?: string | null;
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
  { value: 'GASOLINA', label: 'GASOLINA' },
  { value: 'DIESEL', label: 'DIESEL' },
  { value: 'ELECTRICO', label: 'ELECTRICO' },
];
const SIZE_OPTIONS = [
  { value: 'EXTRA PEQUEÑO', label: 'EXTRA PEQUEÑO' },
  { value: 'PEQUEÑO', label: 'PEQUEÑO' },
  { value: 'MEDIANO', label: 'MEDIANO' },
  { value: 'GRANDE', label: 'GRANDE' },
  { value: 'EXTRA GRANDE', label: 'EXTRA GRANDE' },
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

const toNumberInputValue = (value: number | string | null | undefined) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : '';
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : '';
  }
  return '';
};

const DECIMAL_SEPARATOR = '.';
const ALLOWED_DECIMAL_SEPARATORS = ['.', ','];

const toOptionalNumber = (value: number | string) => {
  if (value === '') return undefined;

  const normalizedValue = typeof value === 'string' ? value.replace(',', '.') : value;
  const parsed = Number(normalizedValue);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const inferBrandModelFromSkuName = (
  skuName: string,
  options: Array<{ value: string; label: string }>,
) => {
  const normalizedName = uppercaseInputValue(skuName.trim()).replace(/\s+/g, ' ');
  const brand = [...options]
    .sort((a, b) => b.value.length - a.value.length)
    .find((option) => normalizedName === option.value || normalizedName.startsWith(`${option.value} `));

  if (!brand) {
    return { brand: '', model: normalizedName };
  }

  return {
    brand: brand.value,
    model: normalizedName.slice(brand.value.length).trim(),
  };
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
  const [subfamilyId, setSubfamilyId] = useState<string | null>(null);
  const [subfamilyName, setSubfamilyName] = useState('ESTÁNDAR');

  const [skuSuggestionId, setSkuSuggestionId] = useState<string | null>(null);
  const [skuName, setSkuName] = useState('');
  const [skuBrand, setSkuBrand] = useState('');
  const [skuModel, setSkuModel] = useState('');
  const [skuYear, setSkuYear] = useState<number | ''>('');
  const [skuFuel, setSkuFuel] = useState('');
  const [skuSize, setSkuSize] = useState('');
  const [skuLengthMeters, setSkuLengthMeters] = useState<number | string>('');
  const [skuClosedLengthMeters, setSkuClosedLengthMeters] = useState<number | string>('');
  const [skuExtendedLengthMeters, setSkuExtendedLengthMeters] = useState<number | string>('');
  const [skuUnit, setSkuUnit] = useState('');
  const [skuUnitWeight, setSkuUnitWeight] = useState<number | string>('');
  const [skuPrice, setSkuPrice] = useState<number | ''>('');
  const [providerPrice, setProviderPrice] = useState<number | ''>('');
  const [providerPrices, setProviderPrices] = useState<Map<string, number>>(() => new Map());
  const [skuReplacementValue, setSkuReplacementValue] = useState<number | ''>('');
  const [skuChargeType, setSkuChargeType] = useState<'DAY' | 'HOUR'>('DAY');
  const [skuMinimumChargeHours, setSkuMinimumChargeHours] = useState<number | string>('');

  const [serialOrEngine, setSerialOrEngine] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [assetImageFile, setAssetImageFile] = useState<File | null>(null);
  const [copiedImageFileObjectId, setCopiedImageFileObjectId] = useState<string | null>(null);
  const [copiedImageLabel, setCopiedImageLabel] = useState('');
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
  const [assetWorkflowStep, setAssetWorkflowStep] = useState<AssetWorkflowStep>('template');
  const [templateAttempted, setTemplateAttempted] = useState(false);
  const [commercialAttempted, setCommercialAttempted] = useState(false);
  const [assetAttempted, setAssetAttempted] = useState(false);

  const familySelectRef = useRef<HTMLInputElement>(null);
  const familyNameRef = useRef<HTMLInputElement>(null);
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
      setSubfamilyId(null);
      setSubfamilyName('ESTÁNDAR');
    } else if (familyId) {
      const family = families.find((item) => item.id === familyId);
      const standard =
        family?.subfamilies.find((subfamily) => subfamily.code === 'ESTANDAR') ??
        family?.subfamilies[0];
      setSubfamilyId(standard?.id ?? null);
    }
  }, [families, familyId, familyMode]);

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
  useEffect(() => {
    if (!ownerWarehouseId || selectedOwnerWarehouse?.type !== 'ALLY') {
      setProviderPrices(new Map());
      setProviderPrice('');
      return;
    }

    let mounted = true;
    api<ProviderSkuPrice[]>(`/skus/provider-prices?providerWarehouseId=${ownerWarehouseId}`)
      .then((rows) => {
        if (!mounted) return;
        setProviderPrices(new Map(rows.map((row) => [row.skuId, Number(row.price)])));
      })
      .catch(() => {
        if (!mounted) return;
        setProviderPrices(new Map());
      });
    return () => {
      mounted = false;
    };
  }, [ownerWarehouseId, selectedOwnerWarehouse?.type]);
  const selectedFamily = familyId ? familyNameById.get(familyId) : null;
  const subfamilyOptions = (selectedFamily?.subfamilies ?? []).map((subfamily) => ({
    value: subfamily.id,
    label: subfamily.name,
  }));
  const selectedSubfamily = selectedFamily?.subfamilies.find(
    (subfamily) => subfamily.id === subfamilyId,
  );
  const selectedCurrentWarehouse = useMemo(
    () =>
      warehouses.find((warehouse) => warehouse.id === warehouseCurrentId) ?? null,
    [warehouseCurrentId, warehouses],
  );
  const resolvedSkuName = useMemo(() => {
    const selectedTemplate = skuSuggestionId ? skuById.get(skuSuggestionId) : null;
    if (selectedTemplate?.name?.trim()) return selectedTemplate.name.trim();

    const brandModelName = [skuBrand.trim(), skuModel.trim()].filter(Boolean).join(' ').trim();
    if (brandModelName) return brandModelName;

    const templateName = skuName.trim();
    if (templateName) return templateName;

    return (selectedFamily?.name ?? familyName.trim()).trim();
  }, [familyName, selectedFamily?.name, skuBrand, skuById, skuModel, skuName, skuSuggestionId]);
  const hasTemplateData = Boolean(resolvedSkuName && skuUnit);
  const hasCommercialData =
    skuPrice !== '' &&
    Number(skuPrice) >= 0 &&
    skuReplacementValue !== '' &&
    Number(skuReplacementValue) >= 0 &&
    (!isAlternateOwnerWarehouse || (providerPrice !== '' && Number(providerPrice) >= 0)) &&
    (skuChargeType !== 'HOUR' ||
      (skuMinimumChargeHours !== '' && Number(skuMinimumChargeHours) > 0));
  const hasAssetData =
    !isAlternateOwnerWarehouse ||
    (manualInternalNumber !== '' && Number(manualInternalNumber) > 0);
  const isWarehouseStepActive = !warehouseLocked;
  const isFamilyStepActive = warehouseLocked && !familyLocked;
  const canEditAssetDetails = warehouseLocked && familyLocked;
  const isTemplateStepActive = canEditAssetDetails && assetWorkflowStep === 'template';
  const isCommercialStepActive = canEditAssetDetails && assetWorkflowStep === 'commercial';
  const isAssetStepActive = canEditAssetDetails && assetWorkflowStep === 'asset';
  const isReviewStepActive = canEditAssetDetails && assetWorkflowStep === 'review';
  const resetForm = () => {
    setFamilyMode('existing');
    setFamilyId(null);
    setFamilyName('');
    setFamilyCode('');
    setSubfamilyId(null);
    setSubfamilyName('ESTÁNDAR');
    setSkuSuggestionId(null);
    setSkuName('');
    setSkuBrand('');
    setSkuModel('');
    setSkuYear('');
    setSkuFuel('');
    setSkuSize('');
    setSkuLengthMeters('');
    setSkuClosedLengthMeters('');
    setSkuExtendedLengthMeters('');
    setSkuUnit('');
    setSkuUnitWeight('');
    setSkuPrice('');
    setProviderPrice('');
    setProviderPrices(new Map());
    setSkuReplacementValue('');
    setSkuChargeType('DAY');
    setSkuMinimumChargeHours('');
    setSerialOrEngine('');
    setRegistrationNumber('');
    setAssetImageFile(null);
    setCopiedImageFileObjectId(null);
    setCopiedImageLabel('');
    setActive(true);
    setOwnerWarehouseId(null);
    setWarehouseCurrentId(null);
    setManualInternalNumber('');
    setWarehouseLocked(false);
    setFamilyLocked(false);
    setAssetWorkflowStep('template');
    setTemplateAttempted(false);
    setCommercialAttempted(false);
    setAssetAttempted(false);
  };

  const clearFamilyAndAssetInputs = () => {
    setFamilyId(null);
    setFamilyName('');
    setFamilyCode('');
    setSubfamilyId(null);
    setSubfamilyName('ESTÁNDAR');
    setSkuSuggestionId(null);
    setSkuName('');
    setSkuBrand('');
    setSkuModel('');
    setSkuYear('');
    setSkuFuel('');
    setSkuSize('');
    setSkuLengthMeters('');
    setSkuClosedLengthMeters('');
    setSkuExtendedLengthMeters('');
    setSkuUnit('');
    setSkuUnitWeight('');
    setSkuPrice('');
    setProviderPrice('');
    setSkuReplacementValue('');
    setSkuChargeType('DAY');
    setSkuMinimumChargeHours('');
    setSerialOrEngine('');
    setRegistrationNumber('');
    setAssetImageFile(null);
    setCopiedImageFileObjectId(null);
    setCopiedImageLabel('');
    setActive(true);
    setManualInternalNumber('');
    setFamilyLocked(false);
    setAssetWorkflowStep('template');
    setTemplateAttempted(false);
    setCommercialAttempted(false);
    setAssetAttempted(false);
  };

  const handleOwnerWarehouseChange = (value: string | null) => {
    setOwnerWarehouseId(value);
    setWarehouseCurrentId(value);
    setProviderPrice('');
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
    if (familyMode === 'existing' && !subfamilyId) {
      setValidationError('Selecciona una subfamilia.');
      return;
    }
    if (familyMode === 'new' && !familyName.trim()) {
      setValidationError('Enter the category name.', familyNameRef);
      return;
    }
    if (familyMode === 'new' && !subfamilyName.trim()) {
      setValidationError('Ingresa la subfamilia.');
      return;
    }
    setFamilyLocked(true);
    setAssetWorkflowStep('template');
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
    setSkuLengthMeters('');
    setSkuClosedLengthMeters('');
    setSkuExtendedLengthMeters('');
    setSkuUnit('');
    setSkuUnitWeight('');
    setSkuPrice('');
    setSkuReplacementValue('');
    setSkuChargeType('DAY');
    setSkuMinimumChargeHours('');
    setSerialOrEngine('');
    setAssetImageFile(null);
    setCopiedImageFileObjectId(null);
    setCopiedImageLabel('');
    setActive(true);
    setManualInternalNumber('');
    setAssetWorkflowStep('template');
    setTemplateAttempted(false);
    setCommercialAttempted(false);
    setAssetAttempted(false);
  };

  const setValidationError = (
    message: string,
    fieldRef?: React.RefObject<HTMLInputElement | null>,
  ) => {
    setError(message);
    window.requestAnimationFrame(() => fieldRef?.current?.focus());
  };

  const goToCommercialStep = () => {
    setError(null);
    setTemplateAttempted(true);
    if (!resolvedSkuName) {
      setValidationError('Ingresa marca/modelo o confirma una familia.');
      return;
    }
    if (!skuUnit) {
      setValidationError('Selecciona la unidad de medida.');
      return;
    }
    setTemplateAttempted(false);
    setAssetWorkflowStep('commercial');
  };

  const goToAssetStep = () => {
    setError(null);
    setCommercialAttempted(true);
    if (!hasCommercialData) {
      setValidationError(
        isAlternateOwnerWarehouse
          ? 'Completa precio cliente, costo proveedor, reposición y regla de cobro.'
          : 'Completa precio cliente, reposición y regla de cobro.',
      );
      return;
    }
    setCommercialAttempted(false);
    setAssetWorkflowStep('asset');
  };

  const goToReviewStep = () => {
    setError(null);
    setAssetAttempted(true);
    if (
      isAlternateOwnerWarehouse &&
      (manualInternalNumber === '' || Number(manualInternalNumber) <= 0)
    ) {
      setValidationError('Ingresa el número interno de la bodega alterna.', manualInternalNumberRef);
      return;
    }
    setAssetAttempted(false);
    setAssetWorkflowStep('review');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const parsedSkuUnitWeight = toOptionalNumber(skuUnitWeight);
    const parsedMinimumChargeHours = toOptionalNumber(skuMinimumChargeHours);

    if (!warehouseLocked) {
      setValidationError('Confirm the warehouse before saving.', ownerWarehouseRef);
      return;
    }

    if (!familyLocked) {
      setValidationError('Confirm the family before saving.', familySelectRef);
      return;
    }

    if (assetWorkflowStep !== 'review') {
      setValidationError('Avanza hasta la revisión antes de guardar el activo.');
      return;
    }

    if (familyMode === 'existing' && !familyId) {
      setValidationError(
        'Select an equipment family.',
        familySelectRef,
      );
      return;
    }
    if (familyMode === 'existing' && !subfamilyId) {
      setValidationError('Selecciona una subfamilia.');
      return;
    }

    if (familyMode === 'new' && !familyName.trim()) {
      setValidationError('Enter the category name.', familyNameRef);
      return;
    }

    if (!resolvedSkuName) {
      setValidationError('Ingresa marca/modelo o confirma una familia.');
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
      (parsedMinimumChargeHours === undefined || parsedMinimumChargeHours <= 0)
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
                name: uppercaseInputValue(familyName.trim()),
                code: familyCode.trim() ? uppercaseInputValue(familyCode.trim()) : undefined,
              },
        subfamily:
          familyMode === 'existing'
            ? { id: subfamilyId }
            : { name: uppercaseInputValue(subfamilyName.trim()) },
        sku: {
          id: skuSuggestionId || undefined,
          name: skuSuggestionId ? undefined : resolvedSkuName || undefined,
          unitWeight: parsedSkuUnitWeight,
          price: skuPrice === '' ? undefined : skuPrice,
          replacementValue:
            skuReplacementValue === '' ? undefined : skuReplacementValue,
          chargeType: skuChargeType,
          minimumChargeHours:
            skuChargeType === 'HOUR'
              ? parsedMinimumChargeHours
              : undefined,
          size: skuSize || undefined,
          lengthMeters: toOptionalNumber(skuLengthMeters),
          closedLengthMeters: toOptionalNumber(skuClosedLengthMeters),
          extendedLengthMeters: toOptionalNumber(skuExtendedLengthMeters),
        },
        asset: {
          description: resolvedSkuName || undefined,
          serialOrEngine: serialOrEngine.trim() || undefined,
          registrationNumber: registrationNumber.trim() || undefined,
          brand: skuBrand.trim() || undefined,
          model: skuModel.trim() || undefined,
          year: skuYear === '' ? undefined : skuYear,
          fuel: skuFuel || undefined,
          imageFileObjectId: assetImageFile ? undefined : copiedImageFileObjectId || undefined,
          active,
          internalNumber:
            isAlternateOwnerWarehouse && manualInternalNumber !== ''
              ? manualInternalNumber
              : undefined,
        },
        ownerWarehouseId,
        warehouseCurrentId,
        providerPrice:
          isAlternateOwnerWarehouse && providerPrice !== ''
            ? providerPrice
            : undefined,
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
                      onChange={(value) => {
                        setFamilyId(value);
                        const family = value ? familyNameById.get(value) : null;
                        const standard =
                          family?.subfamilies.find(
                            (subfamily) => subfamily.code === 'ESTANDAR',
                          ) ?? family?.subfamilies[0];
                        setSubfamilyId(standard?.id ?? null);
                        setSkuSuggestionId(null);
                      }}
                      placeholder={
                        loading ? 'Cargando...' : 'Seleccionar familia'
                      }
                      searchable
                      nothingFoundMessage="Sin resultados"
                      disabled={loading || familyLocked}
                    />
                  ) : (
                    <Group grow className="mobile-stack">
                      <UppercaseTextInput
                        ref={familyNameRef}
                        label="Nombre de familia"
                        name="familyName"
                        autoComplete="off"
                        value={familyName}
                        onChange={setFamilyName}
                        placeholder="Ejemplo: Minicargadores"
                        disabled={familyLocked}
                        required
                      />
                      <UppercaseTextInput
                        label="Codigo interno"
                        name="familyCode"
                        autoComplete="off"
                        value={familyCode}
                        onChange={setFamilyCode}
                        placeholder="Ejemplo: MCG"
                        disabled={familyLocked}
                      />
                    </Group>
                  )}

                  {familyMode === 'existing' ? (
                    <Select
                      label="Subfamilia / serie de numeración"
                      name="subfamilyId"
                      data={subfamilyOptions}
                      value={subfamilyId}
                      onChange={setSubfamilyId}
                      placeholder="Seleccionar subfamilia"
                      disabled={!familyId || familyLocked}
                      searchable
                      required
                    />
                  ) : (
                    <UppercaseTextInput
                      label="Subfamilia / serie de numeración"
                      name="subfamilyName"
                      autoComplete="off"
                      value={subfamilyName}
                      onChange={setSubfamilyName}
                      placeholder="Ejemplo: ESTÁNDAR, MINI o PEQUEÑA"
                      disabled={familyLocked}
                      required
                    />
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
                    {(selectedSubfamily || subfamilyName.trim()) ? (
                      <Badge color="cyan" variant="light">
                        {selectedSubfamily?.name ?? subfamilyName.trim()}
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
                      if (!selectedSku) {
                        setCopiedImageFileObjectId(null);
                        setCopiedImageLabel('');
                        return;
                      }
                      if (selectedSku.assetSubfamilyId) {
                        setSubfamilyId(selectedSku.assetSubfamilyId);
                      }
                      setSkuUnitWeight(toNumberInputValue(selectedSku.unitWeight));
                      setSkuUnit((current) => current || units[0] || '');
                      setSkuPrice(toNumberInputValue(selectedSku.price));
                      setProviderPrice(providerPrices.get(selectedSku.id) ?? '');
                      setSkuReplacementValue(toNumberInputValue(selectedSku.replacementValue));
                      setSkuChargeType(
                        selectedSku.chargeType === 'HOUR' ? 'HOUR' : 'DAY',
                      );
                      setSkuMinimumChargeHours(
                        selectedSku.chargeType === 'HOUR'
                          ? toNumberInputValue(selectedSku.minimumChargeHours)
                          : '',
                      );
                      const sampleAsset = (
                        referenceAssetsBySkuId.get(selectedSku.id) ?? []
                      ).find(
                        (asset) =>
                          asset.brand?.trim() ||
                          asset.model?.trim() ||
                          asset.year != null ||
                          asset.fuel?.trim() ||
                          asset.imageFileObjectId,
                      );
                      const inferred = inferBrandModelFromSkuName(selectedSku.name ?? '', brandOptions);
                      const copiedBrand = uppercaseInputValue(sampleAsset?.brand?.trim() || inferred.brand);
                      const copiedModel = uppercaseInputValue(
                        sampleAsset?.model?.trim() || (inferred.brand ? inferred.model : ''),
                      );
                      setSkuBrand(copiedBrand);
                      setSkuModel(copiedModel);
                      setSkuYear(sampleAsset?.year ?? '');
                      setSkuFuel(uppercaseInputValue(sampleAsset?.fuel?.trim() ?? ''));
                      setSkuSize(uppercaseInputValue(selectedSku.size?.trim() ?? ''));
                      setSkuLengthMeters(toNumberInputValue(selectedSku.lengthMeters));
                      setSkuClosedLengthMeters(toNumberInputValue(selectedSku.closedLengthMeters));
                      setSkuExtendedLengthMeters(toNumberInputValue(selectedSku.extendedLengthMeters));
                      setCopiedImageFileObjectId(sampleAsset?.imageFileObjectId ?? null);
                      setCopiedImageLabel(sampleAsset?.imageFileObjectId ? 'Imagen copiada de la plantilla' : '');
                      setAssetImageFile(null);
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

                  <Paper radius="md" p="sm" bg="gray.0">
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                      Referencia
                    </Text>
                    <Text size="sm" mt={4}>
                      {resolvedSkuName || 'Se genera con marca y modelo'}
                    </Text>
                  </Paper>

                  <Group grow className="mobile-stack">
                    <Autocomplete
                      label="Marca"
                      name="skuBrand"
                      value={skuBrand}
                      data={brandOptions}
                      onChange={(value) => setSkuBrand(uppercaseInputValue(value))}
                      placeholder="Selecciona o escribe una marca"
                      clearable
                    />
                    <UppercaseTextInput
                      label="Modelo"
                      name="skuModel"
                      autoComplete="off"
                      value={skuModel}
                      onChange={setSkuModel}
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
                      allowDecimal={false}
                    />
                    <Select
                      label="Combustible"
                      name="skuFuel"
                      data={FUEL_OPTIONS}
                      value={skuFuel}
                      onChange={(value) => setSkuFuel(uppercaseInputValue(value ?? ''))}
                      clearable
                    />
                    <Select
                      label="Tamaño"
                      name="skuSize"
                      data={SIZE_OPTIONS}
                      value={skuSize}
                      onChange={(value) => setSkuSize(uppercaseInputValue(value ?? ''))}
                      clearable
                    />
                    <NumberInput
                      label="Largo"
                      name="skuLengthMeters"
                      value={skuLengthMeters}
                      onChange={setSkuLengthMeters}
                      min={0}
                      decimalSeparator={DECIMAL_SEPARATOR}
                      allowedDecimalSeparators={ALLOWED_DECIMAL_SEPARATORS}
                      suffix=" m"
                    />
                    <NumberInput
                      label="Largo cerrado"
                      name="skuClosedLengthMeters"
                      value={skuClosedLengthMeters}
                      onChange={setSkuClosedLengthMeters}
                      min={0}
                      decimalSeparator={DECIMAL_SEPARATOR}
                      allowedDecimalSeparators={ALLOWED_DECIMAL_SEPARATORS}
                      suffix=" m"
                    />
                    <NumberInput
                      label="Largo extendido"
                      name="skuExtendedLengthMeters"
                      value={skuExtendedLengthMeters}
                      onChange={setSkuExtendedLengthMeters}
                      min={0}
                      decimalSeparator={DECIMAL_SEPARATOR}
                      allowedDecimalSeparators={ALLOWED_DECIMAL_SEPARATORS}
                      suffix=" m"
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
                      error={templateAttempted && !skuUnit ? 'Requerido' : null}
                      required
                    />
                    <NumberInput
                      label="Peso unitario"
                      name="skuUnitWeight"
                      autoComplete="off"
                      value={skuUnitWeight}
                      onChange={setSkuUnitWeight}
                      min={0}
                      step={0.1}
                      decimalSeparator={DECIMAL_SEPARATOR}
                      allowedDecimalSeparators={ALLOWED_DECIMAL_SEPARATORS}
                    />
                  </Group>

                  <Group justify="flex-end" className="mobile-actions">
                    <Button type="button" onClick={goToCommercialStep}>
                      Siguiente
                    </Button>
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
                      Separa lo que paga el cliente del costo que cobra el proveedor.
                    </Text>
                  </div>

                  <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
                    <NumberInput
                      label="Precio cliente"
                      name="skuPrice"
                      autoComplete="off"
                      value={skuPrice}
                      onChange={(value) =>
                        setSkuPrice(typeof value === 'number' ? value : '')
                      }
                      min={0}
                      step={1000}
                      allowDecimal={false}
                      prefix="$ "
                      thousandSeparator=","
                      error={commercialAttempted && skuPrice === '' ? 'Requerido' : null}
                      required
                    />
                    {isAlternateOwnerWarehouse ? (
                      <NumberInput
                        label="Costo proveedor"
                        description={`Costo específico de ${selectedOwnerWarehouse?.name ?? 'este proveedor'}`}
                        name="providerPrice"
                        autoComplete="off"
                        value={providerPrice}
                        onChange={(value) =>
                          setProviderPrice(typeof value === 'number' ? value : '')
                        }
                        min={0}
                        step={1000}
                        allowDecimal={false}
                        prefix="$ "
                        thousandSeparator=","
                        error={commercialAttempted && providerPrice === '' ? 'Requerido' : null}
                        required
                      />
                    ) : null}
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
                      allowDecimal={false}
                      prefix="$ "
                      thousandSeparator=","
                      error={commercialAttempted && skuReplacementValue === '' ? 'Requerido' : null}
                      required
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
                        onChange={setSkuMinimumChargeHours}
                        min={0.5}
                        step={0.5}
                        decimalSeparator={DECIMAL_SEPARATOR}
                        allowedDecimalSeparators={ALLOWED_DECIMAL_SEPARATORS}
                        suffix=" horas"
                        error={commercialAttempted && skuMinimumChargeHours === '' ? 'Requerido' : null}
                        required
                      />
                    ) : null}
                  </SimpleGrid>

                  <Group justify="flex-end" className="mobile-actions">
                    <Button type="button" onClick={goToAssetStep}>
                      Siguiente
                    </Button>
                  </Group>
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

                  <UppercaseTextInput
                    ref={serialOrEngineRef}
                    label="Serial o motor"
                    name="serialOrEngine"
                    autoComplete="off"
                    value={serialOrEngine}
                    onChange={setSerialOrEngine}
                    placeholder="Ej: A3NV16797"
                    description="Opcional. El código público y el número interno identifican el activo cuando no tiene serial."
                  />
                  <UppercaseTextInput
                    label="Numero de registro"
                    name="registrationNumber"
                    autoComplete="off"
                    value={registrationNumber}
                    onChange={setRegistrationNumber}
                    placeholder="Solo si requiere guia de movilidad"
                    description="Los activos con este campo aparecen en Guias de movilidad."
                  />
                  <Paper withBorder radius="md" p="sm" bg="gray.0">
                    <Group justify="space-between" align="center" gap="md">
                      <div>
                        <Text fw={700}>Imagen</Text>
                        <Text size="sm" c="dimmed">
                          {assetImageFile ? assetImageFile.name : copiedImageLabel || 'PNG, JPG o WEBP.'}
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
                      allowDecimal={false}
                      required
                    />
                  ) : null}
                  <Group justify="flex-end" className="mobile-actions">
                    <Button type="button" onClick={goToReviewStep}>
                      Siguiente
                    </Button>
                  </Group>
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
                <Button type="submit" loading={saving} disabled={assetWorkflowStep !== 'review'}>
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
