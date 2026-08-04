'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  NumberInput,
  Paper,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  IconChecks,
  IconCubePlus,
  IconArrowLeft,
  IconPlus,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import ChargeTypeSelect from '@/components/ChargeTypeSelect';
import UppercaseTextInput from '@/components/UppercaseTextInput';
import WarehouseSelect from '@/components/WarehouseSelect';
import { api, ApiError } from '@/lib/api';
import { getCurrentUserRole } from '@/lib/auth';

type Warehouse = {
  id: string;
  name: string;
  type: 'OWN' | 'ALLY';
};

type CatalogOption = {
  groupKey: string;
  value: string;
  label: string;
  active: boolean;
};

type AssetSubfamily = {
  id: string;
  assetFamilyId: string;
  code: string;
  name: string;
  active: boolean;
};

type AssetFamily = {
  id: string;
  code: string;
  name: string;
  controlType: 'BULK';
  subfamilies: AssetSubfamily[];
};

type GlobalBulkSku = {
  id: string;
  name: string;
  assetFamilyId: string;
  assetSubfamilyId: string | null;
  price: number | null;
  subrentalPrice: number | null;
  replacementValue: number | null;
  chargeType: ChargeType | null;
  minimumChargeHours: number | null;
  areaM2: number | null;
  lengthMeters: number | null;
  unitWeight: number | null;
  active: boolean;
  category: string;
  assetFamily: { id: string; code: string; name: string };
  assetSubfamily: AssetSubfamily | null;
};

type CreateBulkResponse = {
  sku: {
    id: string;
    assetFamilyId: string;
  };
  ledger: {
    id: string;
    movementType: string;
    quantity: number;
  };
};

type DeleteBulkResponse = CreateBulkResponse;

type ArchiveBulkSkuResponse = {
  sku: {
    id: string;
    name: string;
    active: boolean;
  };
  adjustments: {
    warehouseId: string;
    ownerWarehouseId: string;
    quantity: number;
  }[];
};

type ItemType = 'FORMALETA' | 'GENERIC';
type EntryMode = 'existing' | 'new';
type FlowChoice = 'bulk';
type WeightUnit = 'KG' | 'TON';
type ChargeType = 'DAY' | 'HOUR';
type FormaletaLine = 'FORMALETA' | 'FORMALETA_SARDINEL';

type ExistingBulkItem = {
  skuId: string;
  ownerWarehouseId: string;
  ownerWarehouseName: string | null;
  skuName: string | null;
  name: string | null;
  category: string | null;
  assetFamilyId: string | null;
  assetSubfamilyId?: string | null;
  price: number | null;
  subrentalPrice: number | null;
  replacementValue: number | null;
  chargeType: ChargeType | null;
  minimumChargeHours: number | null;
  areaM2: number | null;
  lengthMeters?: number | null;
  unitWeight: number | null;
  quantity: number;
};

type WarehouseInventoryResponse = {
  bulk: ExistingBulkItem[];
};

type BulkPayload = {
  family: {
    id?: string;
    code?: string;
    name?: string;
  };
  subfamily?: {
    id?: string;
    code?: string;
    name?: string;
  };
  sku: {
    id?: string;
    name?: string;
    unitWeight?: number;
    price?: number;
    subrentalPrice?: number;
    replacementValue?: number;
    chargeType?: ChargeType;
    minimumChargeHours?: number;
    areaM2?: number;
    lengthMeters?: number;
  };
  ownerWarehouseId: string;
  warehouseId: string;
  quantity: number;
};

const DEFAULT_FORMALETA_X_OPTIONS = [
  '0.10',
  '0.15',
  '0.20',
  '0.25',
  '0.30',
  '0.35',
  '0.40',
  '0.45',
  '0.50',
  '0.60',
] as const;
const DEFAULT_FORMALETA_Y_OPTIONS = [
  '0.30',
  '0.35',
  '0.50',
  '0.60',
  '0.80',
  '1.20',
  '2.40',
  '3.00',
] as const;
const DEFAULT_CERTIFIED_SCAFFOLD_PARTS = [
  'VERTICALES',
  'HORIZONTALES',
  'BASE COLLAR',
  'RUEDAS NIVELADORAS',
  'TORNILLOS NIVELADORES',
  'PLATAFORMA',
  'ESCALERA PELDAÑO',
  'ESCALERA TIPO GATO',
  'PASAMANOS PARA ESCALERA',
  'PASAMANOS HORIZONTAL',
  'TORNILLO PARA PLATINA EN U',
  'GANCHO DE SEGURIDAD',
  'DIAGONALES',
  'RODA PIE',
] as const;
const DEFAULT_CONVENTIONAL_SCAFFOLD_PARTS = [
  'NAVE',
  'TIJERAS',
  'TUERCAS',
  'RUEDAS',
  'TABLONES',
  'PLATAFORMAS',
] as const;
const DEFAULT_CONVENTIONAL_SCAFFOLD_MEASURES = ['1.00M', '1.50M'] as const;
const DEFAULT_CONVENTIONAL_SCAFFOLD_PARTS_WITH_MEASURE = [
  'NAVE',
  'TIJERAS',
];
const DEFAULT_CERTIFIED_SCAFFOLD_MEASURES = [
  '0.50M',
  '0.70M',
  '1.00M',
  '1.40M',
  '2.00M',
  '2.50M',
  '3.00M',
] as const;
const DEFAULT_CERTIFIED_SCAFFOLD_PARTS_WITHOUT_MEASURE = [
  'BASE COLLAR',
  'RUEDAS NIVELADORAS',
  'TORNILLOS NIVELADORES',
  'ESCALERA PELDAÑO',
  'ESCALERA TIPO GATO',
  'PASAMANOS PARA ESCALERA',
  'TORNILLO PARA PLATINA EN U',
  'GANCHO DE SEGURIDAD',
];

const formatMeasure = (value: number) => value.toFixed(2);
const formatMeterMeasure = (value: string) => {
  const parsed = Number(value.trim().replace(/M(?:T|TS)?$/i, '').replace(',', '.'));
  return Number.isFinite(parsed) ? `${formatMeasure(parsed)} M` : value.trim().toUpperCase();
};
const sanitizeDecimalInput = (value: string) => {
  let nextValue = '';
  let hasSeparator = false;

  for (const character of value) {
    if (/\d/.test(character)) {
      nextValue += character;
      continue;
    }

    if ((character === ',' || character === '.') && !hasSeparator) {
      nextValue += ',';
      hasSeparator = true;
    }
  }

  return nextValue;
};

const finalizeDecimalInput = (value: string) => sanitizeDecimalInput(value).replace(/,$/, '');

const parseLocaleDecimal = (value: number | string) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }

  const normalized = value.trim().replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
};
const toUpperInput = (value: string) => value.toLocaleUpperCase('es-CO');
const normalizeBulkReference = (name: string, lengthMeters?: number) => {
  const normalized = toUpperInput(name.trim()).replace(/\s+/g, ' ');
  const suffix = normalized.match(
    /(?:\(\s*)?(\d+(?:[.,]\d+)?)\s*(?:M|MT|MTS|METRO|METROS)(?:\s*\))?\s*$/i,
  );
  const parsedSuffix = suffix ? Number(suffix[1].replace(',', '.')) : undefined;
  const resolvedLength = lengthMeters ?? parsedSuffix;
  const baseName = suffix
    ? normalized.slice(0, suffix.index).trim().replace(/[(-]+\s*$/, '').trim()
    : normalized;
  return {
    name:
      resolvedLength && Number.isFinite(resolvedLength) && resolvedLength > 0
        ? `${baseName} (${resolvedLength.toFixed(2)} M)`
        : normalized,
    lengthMeters:
      resolvedLength && Number.isFinite(resolvedLength) && resolvedLength > 0
        ? resolvedLength
        : undefined,
  };
};
const bulkReferenceKey = (name: string, lengthMeters?: number) =>
  normalizeBulkReference(name, lengthMeters)
    .name.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const buildFormaletaSkuName = (line: FormaletaLine, xMeasure: number, yMeasure: number) => {
  const prefix = line === 'FORMALETA_SARDINEL' ? 'FORMALETA SARDINEL' : 'FORMALETA';
  return `${prefix} (${formatMeasure(xMeasure)} M X ${formatMeasure(yMeasure)} M)`;
};

const normalizeWeightToKg = (value: number, unit: string) =>
  unit === 'TON' ? value * 1000 : value;

type RequiredSkuData = {
  unitWeight: number | '';
  weightUnit: WeightUnit | '';
  price: number | '';
  subrentalPrice: number | '';
  replacementValue: number | '';
  areaM2?: number | string;
};

const isMissingPositiveNumber = (value: number | string) => {
  if (value === '') {
    return true;
  }

  const parsed = parseLocaleDecimal(value);
  return !Number.isFinite(parsed) || parsed <= 0;
};

const isMissingNonNegativeNumber = (value: number | string) => {
  if (value === '') {
    return true;
  }

  const parsed = parseLocaleDecimal(value);
  return !Number.isFinite(parsed) || parsed < 0;
};

const hasMissingRequiredSkuData = ({
  unitWeight,
  weightUnit,
  price,
  subrentalPrice,
  replacementValue,
  areaM2,
}: RequiredSkuData, requireAreaM2: boolean) =>
  isMissingPositiveNumber(unitWeight) ||
  !weightUnit ||
  (requireAreaM2 && isMissingPositiveNumber(areaM2 ?? '')) ||
  isMissingNonNegativeNumber(price) ||
  isMissingNonNegativeNumber(subrentalPrice) ||
  isMissingNonNegativeNumber(replacementValue);

const getWorkflowStepClassName = (isActive: boolean) =>
  `workflow-step-card ${isActive ? 'is-active' : 'is-muted'}`;

export default function AddBulkStockPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formaletaFormRef = useRef<HTMLDivElement | null>(null);
  const entrySectionRef = useRef<HTMLDivElement | null>(null);
  const isEmbedded = searchParams.get('embed') === '1';
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [bulkFamilies, setBulkFamilies] = useState<AssetFamily[]>([]);
  const [globalBulkSkus, setGlobalBulkSkus] = useState<GlobalBulkSku[]>([]);
  const [weightUnits, setWeightUnits] = useState<string[]>([]);
  const [catalogOptions, setCatalogOptions] = useState<CatalogOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [entryMode, setEntryMode] = useState<EntryMode>('existing');
  const [existingItems, setExistingItems] = useState<ExistingBulkItem[]>([]);
  const [existingItemsLoading, setExistingItemsLoading] = useState(false);
  const [existingSkuId, setExistingSkuId] = useState<string | null>(null);

  const [itemType, setItemType] = useState<ItemType | null>(null);
  const [itemTypeSelection, setItemTypeSelection] = useState<string | null>(null);
  const [isItemConfigured, setIsItemConfigured] = useState(false);
  const [confirmAttempted, setConfirmAttempted] = useState(false);

  const [formaletaX, setFormaletaX] = useState<string>(DEFAULT_FORMALETA_X_OPTIONS[0]);
  const [formaletaY, setFormaletaY] = useState<string>(DEFAULT_FORMALETA_Y_OPTIONS[0]);
  const [formaletaLine, setFormaletaLine] = useState<FormaletaLine>('FORMALETA');
  const [formaletaIsAccessory, setFormaletaIsAccessory] = useState(false);
  const [formaletaAccessoryName, setFormaletaAccessoryName] = useState('');
  const [formaletaSkuUnitWeight, setFormaletaSkuUnitWeight] = useState<number | ''>('');
  const [formaletaSkuPrice, setFormaletaSkuPrice] = useState<number | ''>('');
  const [formaletaSkuSubrentalPrice, setFormaletaSkuSubrentalPrice] = useState<number | ''>('');
  const [formaletaSkuReplacementValue, setFormaletaSkuReplacementValue] = useState<number | ''>('');
  const [formaletaChargeType, setFormaletaChargeType] = useState<ChargeType>('DAY');
  const [formaletaMinimumChargeHours, setFormaletaMinimumChargeHours] = useState<number | ''>('');
  const [formaletaAreaM2, setFormaletaAreaM2] = useState<number | string>('');
  const [formaletaWeightUnit, setFormaletaWeightUnit] = useState<WeightUnit | ''>('');

  const [genericSkuName, setGenericSkuName] = useState('');
  const [genericLengthMeters, setGenericLengthMeters] = useState<number | ''>('');
  const [genericCompatibilityLb, setGenericCompatibilityLb] = useState<string | null>(null);
  const [selectedSubfamilyId, setSelectedSubfamilyId] = useState<string | null>(null);
  const [newSubfamilyName, setNewSubfamilyName] = useState('');
  const [creatingSubfamily, setCreatingSubfamily] = useState(false);
  const [certifiedScaffoldMeasure, setCertifiedScaffoldMeasure] = useState('');
  const [genericSkuUnitWeight, setGenericSkuUnitWeight] = useState<number | ''>('');
  const [genericSkuPrice, setGenericSkuPrice] = useState<number | ''>('');
  const [genericSkuSubrentalPrice, setGenericSkuSubrentalPrice] = useState<number | ''>('');
  const [genericSkuReplacementValue, setGenericSkuReplacementValue] = useState<number | ''>('');
  const [genericChargeType, setGenericChargeType] = useState<ChargeType>('DAY');
  const [genericMinimumChargeHours, setGenericMinimumChargeHours] = useState<number | ''>('');
  const [genericWeightUnit, setGenericWeightUnit] = useState<WeightUnit | ''>('');

  const [ownerWarehouseId, setOwnerWarehouseId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number | ''>('');
  const [warehouseLocked, setWarehouseLocked] = useState(false);
  const [modeLocked, setModeLocked] = useState(false);
  const [flowChoice, setFlowChoice] = useState<FlowChoice | null>(
    searchParams.get('flow') === 'bulk' || searchParams.get('warehouseId') ? 'bulk' : null,
  );
  const [flowLeaving, setFlowLeaving] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteQuantity, setDeleteQuantity] = useState<number | ''>('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [archivePassword, setArchivePassword] = useState('');
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const currentUserRole = getCurrentUserRole();
  const isOfficeRole = currentUserRole === 'OFFICE';
  const isAdminRole = currentUserRole === 'ADMIN';

  const formaletaRequiredSkuData: RequiredSkuData = {
    unitWeight: formaletaSkuUnitWeight,
    weightUnit: formaletaWeightUnit,
    price: formaletaSkuPrice,
    subrentalPrice: formaletaSkuSubrentalPrice,
    replacementValue: formaletaSkuReplacementValue,
    areaM2: formaletaAreaM2,
  };
  const requiredSkuDataMissing =
    itemType === 'FORMALETA'
      ? hasMissingRequiredSkuData(formaletaRequiredSkuData, true)
      : false;
  const showRequiredSkuErrors = confirmAttempted;
  const confirmButtonNeedsAttention = confirmAttempted && requiredSkuDataMissing;
  const selectedExistingItem = useMemo(
    () => existingItems.find((item) => item.skuId === existingSkuId) ?? null,
    [existingItems, existingSkuId],
  );

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [warehouseData, weightUnitData, catalogData, familyData, skuData] = await Promise.all([
          api<Warehouse[]>('/warehouses'),
          api<string[]>('/skus/units'),
          api<CatalogOption[]>('/catalog/options').catch(() => []),
          api<AssetFamily[]>('/asset-families?controlType=BULK'),
          api<GlobalBulkSku[]>('/skus?controlType=BULK'),
        ]);
        if (!mounted) return;
        setWarehouses(warehouseData);
        setWeightUnits(weightUnitData);
        setCatalogOptions(catalogData.filter((option) => option.active));
        setBulkFamilies(familyData);
        setGlobalBulkSkus(skuData.filter((sku) => sku.active));

        const defaultWeightUnit = (weightUnitData[0] as WeightUnit | undefined) ?? '';

        setFormaletaWeightUnit(defaultWeightUnit);
        setGenericWeightUnit(defaultWeightUnit);
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
    if (!warehouses.length) return;
    const ownerFromQuery = searchParams.get('ownerWarehouseId');
    const warehouseFromQuery = searchParams.get('warehouseId');
    const requestedWarehouseId =
      [ownerFromQuery, warehouseFromQuery].find(
        (candidate) =>
          candidate && warehouses.some((warehouse) => warehouse.id === candidate),
      ) ?? null;
    const shouldOpenOperationStep =
      searchParams.get('flow') === 'bulk' || searchParams.get('step') === 'operation';

    if (requestedWarehouseId) {
      setOwnerWarehouseId(requestedWarehouseId);
      if (shouldOpenOperationStep) {
        setFlowChoice('bulk');
        setWarehouseLocked(true);
        setModeLocked(false);
      }
      return;
    }

    const ownWarehouse = warehouses.find((warehouse) => warehouse.type === 'OWN');
    if (ownWarehouse) {
      setOwnerWarehouseId((current) => current ?? ownWarehouse.id);
    }
  }, [searchParams, warehouses]);

  useEffect(() => {
    if (entryMode !== 'existing' || !ownerWarehouseId || !warehouseLocked || !modeLocked) {
      setExistingItems([]);
      setExistingSkuId(null);
      setExistingItemsLoading(false);
      return;
    }

    let mounted = true;
    setExistingItemsLoading(true);
    setError(null);

    api<WarehouseInventoryResponse>(`/inventory/warehouse/${ownerWarehouseId}`)
      .then((data) => {
        if (!mounted) return;
        const quantityBySku = new Map(
          (data.bulk ?? [])
            .filter((item) => item.ownerWarehouseId === ownerWarehouseId)
            .map((item) => [item.skuId, Number(item.quantity)]),
        );
        const selectedWarehouse = warehouses.find((item) => item.id === ownerWarehouseId);
        const bulkItems: ExistingBulkItem[] = globalBulkSkus
          .map((sku) => ({
            skuId: sku.id,
            ownerWarehouseId,
            ownerWarehouseName: selectedWarehouse?.name ?? null,
            skuName: sku.name,
            name: sku.name,
            category: sku.category,
            assetFamilyId: sku.assetFamilyId,
            assetSubfamilyId: sku.assetSubfamilyId,
            price: sku.price == null ? null : Number(sku.price),
            subrentalPrice: sku.subrentalPrice == null ? null : Number(sku.subrentalPrice),
            replacementValue: sku.replacementValue == null ? null : Number(sku.replacementValue),
            chargeType: sku.chargeType,
            minimumChargeHours: sku.minimumChargeHours == null ? null : Number(sku.minimumChargeHours),
            areaM2: sku.areaM2 == null ? null : Number(sku.areaM2),
            lengthMeters: sku.lengthMeters == null ? null : Number(sku.lengthMeters),
            unitWeight: sku.unitWeight == null ? null : Number(sku.unitWeight),
            quantity: quantityBySku.get(sku.id) ?? 0,
          }))
          .sort((a, b) => (a.skuName ?? a.name ?? '').localeCompare(b.skuName ?? b.name ?? ''));
        setExistingItems(bulkItems);
        setExistingSkuId((current) =>
          current && bulkItems.some((item) => item.skuId === current) ? current : null,
        );
      })
      .catch((err) => {
        if (!mounted) return;
        if (err instanceof ApiError) {
          setError(`${err.status}: ${err.message}`);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Error loading inventory');
        }
      })
      .finally(() => {
        if (mounted) setExistingItemsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [entryMode, globalBulkSkus, modeLocked, ownerWarehouseId, warehouseLocked, warehouses]);

  useEffect(() => {
    if (itemType !== 'FORMALETA') return;

    const frame = window.requestAnimationFrame(() => {
      formaletaFormRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [itemType]);

  const preferredOwnerWarehouseId = useMemo(() => {
    const requestedWarehouseId =
      [searchParams.get('ownerWarehouseId'), searchParams.get('warehouseId')].find(
        (candidate) =>
          candidate && warehouses.some((warehouse) => warehouse.id === candidate),
      ) ?? null;
    if (requestedWarehouseId) {
      return requestedWarehouseId;
    }
    return warehouses.find((warehouse) => warehouse.type === 'OWN')?.id ?? null;
  }, [searchParams, warehouses]);
  const warehouseOptions = useMemo(
    () =>
      [...warehouses]
        .sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name, 'es');
          return a.type === 'OWN' ? -1 : 1;
        })
        .map((warehouse) => ({
          value: warehouse.id,
          label: warehouse.name,
        })),
    [warehouses],
  );
  const existingItemOptions = existingItems.map((item) => ({
    value: item.skuId,
    label: `${item.skuName ?? item.name ?? item.skuId} · ${item.category ?? 'Sin familia'} · ${item.quantity}`,
  }));
  const catalogGroupOptions = (groupKey: string, fallback: readonly string[]) => {
    const options = catalogOptions
      .filter((option) => option.groupKey === groupKey)
      .map((option) => ({ value: option.value, label: option.label }));

    return options.length ? options : fallback.map((value) => ({ value, label: value }));
  };
  const catalogGroupValues = (groupKey: string, fallback: readonly string[]) =>
    catalogGroupOptions(groupKey, fallback).map((option) => option.value);
  const typeOptions = bulkFamilies.map((family) => ({ value: family.id, label: family.name }));
  const selectedFamily = bulkFamilies.find((family) => family.id === itemTypeSelection) ?? null;
  const selectedFamilyCode = selectedFamily?.code.toUpperCase() ?? '';
  const selectedFamilyKey = toUpperInput(selectedFamily?.name ?? '').replace(/\s+/g, '_');
  const subfamilyOptions = (selectedFamily?.subfamilies ?? []).map((subfamily) => ({
    value: subfamily.id,
    label: subfamily.name,
  }));
  const weightUnitOptions = weightUnits.map((unit) => ({ value: unit, label: unit }));
  const formaletaLineOptions = catalogGroupOptions('BULK_FORMWORK_LINES', [
    'FORMALETA',
    'FORMALETA_SARDINEL',
  ]);
  const formaletaXOptions = catalogGroupOptions('BULK_FORMWORK_WIDTHS', DEFAULT_FORMALETA_X_OPTIONS);
  const formaletaYOptions = catalogGroupOptions('BULK_FORMWORK_HEIGHTS', DEFAULT_FORMALETA_Y_OPTIONS);
  const certifiedScaffoldPartOptions = catalogGroupOptions(
    'BULK_CERTIFIED_SCAFFOLD_PARTS',
    DEFAULT_CERTIFIED_SCAFFOLD_PARTS,
  );
  const conventionalScaffoldPartOptions = catalogGroupOptions(
    'BULK_CONVENTIONAL_SCAFFOLD_PARTS',
    DEFAULT_CONVENTIONAL_SCAFFOLD_PARTS,
  );
  const conventionalScaffoldMeasureOptions = catalogGroupOptions(
    'BULK_CONVENTIONAL_SCAFFOLD_MEASURES',
    DEFAULT_CONVENTIONAL_SCAFFOLD_MEASURES,
  ).map((option) => ({ ...option, label: formatMeterMeasure(option.value) }));
  const certifiedScaffoldMeasureOptions = catalogGroupOptions(
    'BULK_CERTIFIED_SCAFFOLD_MEASURES',
    DEFAULT_CERTIFIED_SCAFFOLD_MEASURES,
  ).map((option) => ({ ...option, label: formatMeterMeasure(option.value) }));
  const certifiedScaffoldPartsWithoutMeasure = new Set(
    catalogGroupValues('BULK_CERTIFIED_SCAFFOLD_WITHOUT_MEASURE', DEFAULT_CERTIFIED_SCAFFOLD_PARTS_WITHOUT_MEASURE),
  );
  const conventionalScaffoldPartsWithMeasure = new Set(
    catalogGroupValues('BULK_CONVENTIONAL_SCAFFOLD_WITH_MEASURE', DEFAULT_CONVENTIONAL_SCAFFOLD_PARTS_WITH_MEASURE),
  );
  const isCertifiedScaffold =
    selectedFamilyCode === 'ANDAMIO_CERTIFICADO' || selectedFamilyKey === 'ANDAMIO_CERTIFICADO';
  const isConventionalScaffold =
    selectedFamilyCode === 'ANDAMIO_CONVENCIONAL' || selectedFamilyKey === 'ANDAMIO_CONVENCIONAL';
  const certifiedScaffoldNeedsMeasure =
    isCertifiedScaffold &&
    !!genericSkuName &&
    !certifiedScaffoldPartsWithoutMeasure.has(genericSkuName);
  const conventionalScaffoldNeedsMeasure =
    isConventionalScaffold &&
    !!genericSkuName &&
    conventionalScaffoldPartsWithMeasure.has(genericSkuName);
  const formaletaDraftName = useMemo(() => {
    if (formaletaIsAccessory) {
      const accessoryName = formaletaAccessoryName.trim();
      if (!accessoryName) {
        return null;
      }
      const suffix = formaletaLine === 'FORMALETA_SARDINEL' ? ' SARDINEL' : '';
      return `${accessoryName.toUpperCase()}${suffix}`;
    }

    const xValue = parseLocaleDecimal(formaletaX);
    const yValue = Number(formaletaY);
    if (!Number.isFinite(xValue) || !yValue || xValue <= 0 || yValue <= 0) {
      return null;
    }

    return buildFormaletaSkuName(formaletaLine, xValue, yValue);
  }, [formaletaAccessoryName, formaletaIsAccessory, formaletaLine, formaletaX, formaletaY]);
  const builtItem = useMemo(() => {
    if (!itemType || !isItemConfigured) {
      return null;
    }

    if (itemType === 'FORMALETA') {
      if (formaletaIsAccessory) {
        const accessoryName = formaletaAccessoryName.trim();
        if (!accessoryName) {
          return null;
        }
        const suffix = formaletaLine === 'FORMALETA_SARDINEL' ? ' SARDINEL' : '';
        return {
          familyId: selectedFamily?.id,
          familyName: 'FORMALETA',
          familyCode: 'FORMALETA',
          subfamilyId: selectedSubfamilyId ?? undefined,
          reusesExistingSku: false,
          skuName: `${accessoryName.toUpperCase()}${suffix}`,
          skuUnitWeight:
            formaletaSkuUnitWeight === ''
              ? undefined
              : normalizeWeightToKg(Number(formaletaSkuUnitWeight), formaletaWeightUnit || 'KG'),
          skuPrice: formaletaSkuPrice === '' ? undefined : Number(formaletaSkuPrice),
          skuSubrentalPrice:
            formaletaSkuSubrentalPrice === '' ? undefined : Number(formaletaSkuSubrentalPrice),
          skuReplacementValue:
            formaletaSkuReplacementValue === '' ? undefined : Number(formaletaSkuReplacementValue),
          chargeType: formaletaChargeType,
          minimumChargeHours:
            formaletaChargeType === 'HOUR' && formaletaMinimumChargeHours !== ''
              ? Number(formaletaMinimumChargeHours)
              : undefined,
          areaM2: formaletaAreaM2 === '' ? undefined : parseLocaleDecimal(formaletaAreaM2),
        };
      }
      const xValue = parseLocaleDecimal(formaletaX);
      const yValue = Number(formaletaY);
      if (!Number.isFinite(xValue) || !yValue || xValue <= 0 || yValue <= 0) {
        return null;
      }
      return {
        familyId: selectedFamily?.id,
        familyName: 'FORMALETA',
        familyCode: 'FORMALETA',
        subfamilyId: selectedSubfamilyId ?? undefined,
        reusesExistingSku: false,
        skuName: buildFormaletaSkuName(formaletaLine, xValue, yValue),
        skuUnitWeight:
          formaletaSkuUnitWeight === ''
            ? undefined
            : normalizeWeightToKg(Number(formaletaSkuUnitWeight), formaletaWeightUnit || 'KG'),
        skuPrice: formaletaSkuPrice === '' ? undefined : Number(formaletaSkuPrice),
        skuSubrentalPrice:
          formaletaSkuSubrentalPrice === '' ? undefined : Number(formaletaSkuSubrentalPrice),
        skuReplacementValue:
          formaletaSkuReplacementValue === '' ? undefined : Number(formaletaSkuReplacementValue),
        chargeType: formaletaChargeType,
        minimumChargeHours:
          formaletaChargeType === 'HOUR' && formaletaMinimumChargeHours !== ''
            ? Number(formaletaMinimumChargeHours)
            : undefined,
        areaM2: formaletaAreaM2 === '' ? undefined : parseLocaleDecimal(formaletaAreaM2),
      };
    }

    if (!selectedFamily || !genericSkuName.trim()) {
      return null;
    }
    const legacyResolvedName =
      certifiedScaffoldNeedsMeasure && certifiedScaffoldMeasure
        ? `${genericSkuName.trim()} (${formatMeterMeasure(certifiedScaffoldMeasure)})`
        : conventionalScaffoldNeedsMeasure && certifiedScaffoldMeasure
          ? `${genericSkuName.trim()} (${formatMeterMeasure(certifiedScaffoldMeasure)})`
        : genericSkuName.trim();
    const compatibleReferenceName = genericCompatibilityLb
      ? `${legacyResolvedName} (${genericCompatibilityLb} LB)`
      : legacyResolvedName;
    const normalizedReference = normalizeBulkReference(
      compatibleReferenceName,
      genericLengthMeters === '' ? undefined : Number(genericLengthMeters),
    );
    const existingCanonicalSku = globalBulkSkus.find(
      (sku) =>
        sku.assetFamilyId === selectedFamily.id &&
        bulkReferenceKey(
          sku.name,
          sku.lengthMeters == null ? undefined : Number(sku.lengthMeters),
        ) === bulkReferenceKey(normalizedReference.name, normalizedReference.lengthMeters),
    );

    return {
      familyId: selectedFamily.id,
      familyName: selectedFamily.name,
      familyCode: selectedFamily.code,
      subfamilyId: existingCanonicalSku?.assetSubfamilyId ?? selectedSubfamilyId ?? undefined,
      skuId: existingCanonicalSku?.id,
      reusesExistingSku: Boolean(existingCanonicalSku),
      skuName: normalizedReference.name,
      lengthMeters: normalizedReference.lengthMeters,
      skuUnitWeight:
        genericSkuUnitWeight === ''
          ? undefined
          : normalizeWeightToKg(Number(genericSkuUnitWeight), genericWeightUnit || 'KG'),
      skuPrice: genericSkuPrice === '' ? undefined : Number(genericSkuPrice),
      skuSubrentalPrice:
        genericSkuSubrentalPrice === '' ? undefined : Number(genericSkuSubrentalPrice),
      skuReplacementValue:
        genericSkuReplacementValue === '' ? undefined : Number(genericSkuReplacementValue),
      chargeType: genericChargeType,
      minimumChargeHours:
        genericChargeType === 'HOUR' && genericMinimumChargeHours !== ''
          ? Number(genericMinimumChargeHours)
          : undefined,
      areaM2: undefined,
    };
  }, [
    formaletaIsAccessory,
    formaletaAccessoryName,
    formaletaX,
    formaletaY,
    formaletaLine,
    formaletaSkuUnitWeight,
    formaletaSkuPrice,
    formaletaSkuSubrentalPrice,
    formaletaSkuReplacementValue,
    formaletaChargeType,
    formaletaMinimumChargeHours,
    formaletaAreaM2,
    formaletaWeightUnit,
    genericSkuName,
    genericLengthMeters,
    genericCompatibilityLb,
    certifiedScaffoldMeasure,
    certifiedScaffoldNeedsMeasure,
    conventionalScaffoldNeedsMeasure,
    genericSkuUnitWeight,
    genericSkuPrice,
    genericSkuSubrentalPrice,
    genericSkuReplacementValue,
    genericChargeType,
    genericMinimumChargeHours,
    genericWeightUnit,
    selectedFamily,
    selectedSubfamilyId,
    globalBulkSkus,
    itemType,
    isItemConfigured,
  ]);

  const payloadPreview = useMemo(() => {
    if (!ownerWarehouseId || quantity === '' || Number(quantity) <= 0) {
      return null;
    }

    if (entryMode === 'existing') {
      if (!selectedExistingItem?.assetFamilyId) {
        return null;
      }

      return {
        family: {
          id: selectedExistingItem.assetFamilyId,
          name: selectedExistingItem.category ?? undefined,
        },
        sku: {
          id: selectedExistingItem.skuId,
          name: selectedExistingItem.skuName ?? selectedExistingItem.name ?? selectedExistingItem.skuId,
        },
        ownerWarehouseId,
        warehouseId: ownerWarehouseId,
        quantity: Number(quantity),
      };
    }

    if (!builtItem) {
      return null;
    }

    const payload: BulkPayload = {
      family: {
        id: builtItem.familyId,
        name: builtItem.familyName,
        code: builtItem.familyCode,
      },
      subfamily: builtItem.subfamilyId ? { id: builtItem.subfamilyId } : undefined,
      sku: {
        id: builtItem.skuId,
        name: builtItem.skuName,
        unitWeight: builtItem.skuUnitWeight,
        price: builtItem.skuPrice,
        subrentalPrice: builtItem.skuSubrentalPrice,
        replacementValue: builtItem.skuReplacementValue,
        areaM2: builtItem.areaM2,
        lengthMeters: builtItem.lengthMeters,
      },
      ownerWarehouseId,
      warehouseId: ownerWarehouseId,
      quantity: Number(quantity),
    };

    return payload;
  }, [builtItem, entryMode, ownerWarehouseId, quantity, selectedExistingItem]);

  const productReady =
    modeLocked &&
    (entryMode === 'existing' ? Boolean(selectedExistingItem) : isItemConfigured);
  const isWarehouseStepActive = !warehouseLocked;
  const isOperationStepActive = warehouseLocked && !productReady;
  const isQuantityStepActive = productReady && !payloadPreview;
  const isReviewStepActive = Boolean(payloadPreview);

  const resetTypeForm = (type: ItemType) => {
    setIsItemConfigured(false);
    setConfirmAttempted(false);

    const defaultWeightUnit = (weightUnits[0] as WeightUnit | undefined) ?? '';
    if (type === 'FORMALETA') {
      setFormaletaX(formaletaXOptions[0]?.value ?? DEFAULT_FORMALETA_X_OPTIONS[0]);
      setFormaletaY(formaletaYOptions[0]?.value ?? DEFAULT_FORMALETA_Y_OPTIONS[0]);
      setFormaletaLine('FORMALETA');
      setFormaletaIsAccessory(false);
      setFormaletaAccessoryName('');
      setFormaletaSkuUnitWeight('');
      setFormaletaSkuPrice('');
      setFormaletaSkuSubrentalPrice('');
      setFormaletaSkuReplacementValue('');
      setFormaletaChargeType('DAY');
      setFormaletaMinimumChargeHours('');
      setFormaletaAreaM2('');
      setFormaletaWeightUnit(defaultWeightUnit);
      return;
    }

    setGenericSkuName('');
    setGenericLengthMeters('');
    setGenericCompatibilityLb(null);
    setSelectedSubfamilyId(null);
    setNewSubfamilyName('');
    setCertifiedScaffoldMeasure('');
    setGenericSkuUnitWeight('');
    setGenericSkuPrice('');
    setGenericSkuSubrentalPrice('');
    setGenericSkuReplacementValue('');
    setGenericChargeType('DAY');
    setGenericMinimumChargeHours('');
    setGenericWeightUnit(defaultWeightUnit);
  };

  const clearAllInputs = () => {
    const defaultWeightUnit = (weightUnits[0] as WeightUnit | undefined) ?? '';
    setEntryMode('existing');
    setExistingSkuId(null);
    setWarehouseLocked(false);
    setModeLocked(false);
    setItemType(null);
    setItemTypeSelection(null);
    setIsItemConfigured(false);
    setConfirmAttempted(false);

    setFormaletaX(formaletaXOptions[0]?.value ?? DEFAULT_FORMALETA_X_OPTIONS[0]);
    setFormaletaY(formaletaYOptions[0]?.value ?? DEFAULT_FORMALETA_Y_OPTIONS[0]);
    setFormaletaLine('FORMALETA');
    setFormaletaIsAccessory(false);
    setFormaletaAccessoryName('');
    setFormaletaSkuUnitWeight('');
    setFormaletaSkuPrice('');
    setFormaletaSkuSubrentalPrice('');
    setFormaletaSkuReplacementValue('');
    setFormaletaChargeType('DAY');
    setFormaletaMinimumChargeHours('');
    setFormaletaAreaM2('');
    setFormaletaWeightUnit(defaultWeightUnit);

    setGenericSkuName('');
    setGenericLengthMeters('');
    setGenericCompatibilityLb(null);
    setSelectedSubfamilyId(null);
    setNewSubfamilyName('');
    setCertifiedScaffoldMeasure('');
    setGenericSkuUnitWeight('');
    setGenericSkuPrice('');
    setGenericSkuSubrentalPrice('');
    setGenericSkuReplacementValue('');
    setGenericChargeType('DAY');
    setGenericMinimumChargeHours('');
    setGenericWeightUnit(defaultWeightUnit);

    setOwnerWarehouseId(preferredOwnerWarehouseId);
    setQuantity('');
  };

  const handleEntryModeChange = (mode: EntryMode) => {
    setEntryMode(mode);
    setError(null);
    setSuccess(null);
    setConfirmAttempted(false);
    setModeLocked(false);
    setExistingSkuId(null);
    setQuantity('');
    if (mode === 'existing') {
      setItemType(null);
      setItemTypeSelection(null);
      setIsItemConfigured(false);
    }
  };

  const handleWarehouseChange = (value: string | null) => {
    setOwnerWarehouseId(value);
    setWarehouseLocked(false);
    setModeLocked(false);
    setExistingSkuId(null);
    setItemType(null);
    setItemTypeSelection(null);
    setIsItemConfigured(false);
    setConfirmAttempted(false);
    setQuantity('');
    setError(null);
    setSuccess(null);
  };

  const confirmWarehouseSelection = () => {
    setError(null);
    if (!ownerWarehouseId) {
      setError('Select the owner warehouse');
      return;
    }
    setWarehouseLocked(true);
    setModeLocked(false);
    setExistingSkuId(null);
    setQuantity('');
  };

  const unlockWarehouseSelection = () => {
    setWarehouseLocked(false);
    setModeLocked(false);
    setExistingSkuId(null);
    setItemType(null);
    setItemTypeSelection(null);
    setIsItemConfigured(false);
    setConfirmAttempted(false);
    setQuantity('');
  };

  const confirmEntryModeSelection = () => {
    setError(null);
    if (!warehouseLocked) {
      setError('Confirm the warehouse first');
      return;
    }
    setModeLocked(true);
    setExistingSkuId(null);
    setItemType(null);
    setItemTypeSelection(null);
    setIsItemConfigured(false);
    setConfirmAttempted(false);
    setQuantity('');
  };

  const unlockEntryModeSelection = () => {
    setModeLocked(false);
    setExistingSkuId(null);
    setItemType(null);
    setItemTypeSelection(null);
    setIsItemConfigured(false);
    setConfirmAttempted(false);
    setQuantity('');
  };

  const validateRequiredSkuData = ({
    unitWeight,
    weightUnit,
    price,
    subrentalPrice,
    replacementValue,
    areaM2,
  }: RequiredSkuData, requireAreaM2: boolean) => {
    if (unitWeight === '' || Number(unitWeight) <= 0) {
      setError('Enter the product weight');
      return false;
    }
    if (!weightUnit) {
      setError('Select the weight unit');
      return false;
    }
    if (requireAreaM2 && isMissingPositiveNumber(areaM2 ?? '')) {
      setError('Enter the product area in m²');
      return false;
    }
    if (
      price === '' ||
      !Number.isFinite(Number(price)) ||
      Number(price) < 0
    ) {
      setError('Enter the product price');
      return false;
    }
    if (
      subrentalPrice === '' ||
      !Number.isFinite(Number(subrentalPrice)) ||
      Number(subrentalPrice) < 0
    ) {
      setError('Enter the product subrental price');
      return false;
    }
    if (
      replacementValue === '' ||
      !Number.isFinite(Number(replacementValue)) ||
      Number(replacementValue) < 0
    ) {
      setError('Enter the replacement value');
      return false;
    }

    return true;
  };

  const scrollToEntrySection = () => {
    window.requestAnimationFrame(() => {
      entrySectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  };

  const createSubfamily = async () => {
    if (!selectedFamily || !newSubfamilyName.trim()) return;
    const normalizedName = toUpperInput(newSubfamilyName.trim());
    if (!window.confirm(`¿Crear la subfamilia ${normalizedName} en ${selectedFamily.name}?`)) {
      return;
    }

    setCreatingSubfamily(true);
    setError(null);
    try {
      const created = await api<AssetSubfamily>(
        `/asset-families/${selectedFamily.id}/subfamilies`,
        { method: 'POST', json: { name: normalizedName } },
      );
      setBulkFamilies((families) =>
        families.map((family) =>
          family.id === selectedFamily.id
            ? {
                ...family,
                subfamilies: [...family.subfamilies, created].sort((a, b) =>
                  a.name.localeCompare(b.name, 'es'),
                ),
              }
            : family,
        ),
      );
      setSelectedSubfamilyId(created.id);
      setNewSubfamilyName('');
    } catch (err) {
      setError(err instanceof ApiError ? `${err.status}: ${err.message}` : 'No se pudo crear la subfamilia');
    } finally {
      setCreatingSubfamily(false);
    }
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDeleteQuantity('');
    setDeletePassword('');
    setDeleteError(null);
  };

  const openDeleteModal = () => {
    setDeleteQuantity('');
    setDeletePassword('');
    setDeleteError(null);
    setDeleteModalOpen(true);
  };

  const closeArchiveModal = () => {
    setArchiveModalOpen(false);
    setArchivePassword('');
    setArchiveError(null);
  };

  const openArchiveModal = () => {
    setArchivePassword('');
    setArchiveError(null);
    setArchiveModalOpen(true);
  };

  const chooseFlow = (choice: FlowChoice | 'yellow-machinery') => {
    setFlowLeaving(true);
    window.setTimeout(() => {
      if (choice === 'yellow-machinery') {
        router.push('/inventory/serialized-assets');
        return;
      }

      setFlowChoice(choice);
      setFlowLeaving(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 260);
  };

  const returnToFlowSelection = () => {
    if (isEmbedded) return;
    setFlowChoice(null);
    setFlowLeaving(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    if (isEmbedded) {
      window.parent.postMessage({ type: 'bulk-stock-cancelled' }, window.location.origin);
      return;
    }
    router.back();
  };

  const applyTypeConfiguration = () => {
    setError(null);
    setConfirmAttempted(true);

    if (!itemType) {
      setError('Select an item type');
      return;
    }

    if (itemType === 'FORMALETA') {
      if (formaletaIsAccessory) {
        if (!formaletaAccessoryName.trim()) {
          setError('Enter the accessory name');
          return;
        }
        if (!validateRequiredSkuData({
          unitWeight: formaletaSkuUnitWeight,
          weightUnit: formaletaWeightUnit,
          price: formaletaSkuPrice,
          subrentalPrice: formaletaSkuSubrentalPrice,
          replacementValue: formaletaSkuReplacementValue,
          areaM2: formaletaAreaM2,
        }, true)) {
          return;
        }
        setConfirmAttempted(false);
        setIsItemConfigured(true);
        scrollToEntrySection();
        return;
      }
      const xValue = parseLocaleDecimal(formaletaX);
      const yValue = Number(formaletaY);
      if (!formaletaXOptions.some((option) => Number(option.value) === xValue)) {
        setError('The X formwork measurement is invalid');
        return;
      }
      if (!formaletaYOptions.some((option) => Number(option.value) === yValue)) {
        setError('The Y formwork measurement is invalid');
        return;
      }
      if (formaletaChargeType === 'HOUR' && (formaletaMinimumChargeHours === '' || Number(formaletaMinimumChargeHours) <= 0)) {
        setError('Enter the minimum hourly charge');
        return;
      }
      if (!validateRequiredSkuData({
        unitWeight: formaletaSkuUnitWeight,
        weightUnit: formaletaWeightUnit,
        price: formaletaSkuPrice,
        subrentalPrice: formaletaSkuSubrentalPrice,
        replacementValue: formaletaSkuReplacementValue,
        areaM2: formaletaAreaM2,
      }, true)) {
        return;
      }
    } else {
      if (!selectedFamily) {
        setError('Selecciona una familia');
        return;
      }
      if (!genericSkuName.trim()) {
        setError('Enter the SKU name for the generic item');
        return;
      }
      if (certifiedScaffoldNeedsMeasure && !certifiedScaffoldMeasure) {
        setError('Select the piece measurement');
        return;
      }
      if (conventionalScaffoldNeedsMeasure && !certifiedScaffoldMeasure) {
        setError('Select the piece measurement');
        return;
      }
      if (genericChargeType === 'HOUR' && (genericMinimumChargeHours === '' || Number(genericMinimumChargeHours) <= 0)) {
        setError('Enter the minimum hourly charge');
        return;
      }
    }

    setConfirmAttempted(false);
    setIsItemConfigured(true);
    scrollToEntrySection();
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (!ownerWarehouseId) {
      setError('Select the owner warehouse');
      return;
    }

    if (!warehouseLocked) {
      setError('Confirm the warehouse before saving');
      return;
    }

    if (!modeLocked) {
      setError('Confirma si vas a sumar a existente o crear item nuevo');
      return;
    }

    if (entryMode === 'existing' && !selectedExistingItem) {
      setError('Select the existing item');
      return;
    }

    if (entryMode === 'new') {
      if (!itemType) {
        setError('Select the product');
        return;
      }

      if (!isItemConfigured || !builtItem) {
        setError('Confirm the product before adding stock');
        return;
      }
    }

    if (quantity === '' || Number(quantity) <= 0) {
      setError('Invalid quantity');
      return;
    }

    setSaving(true);
    try {
      const payload: BulkPayload =
        entryMode === 'existing' && selectedExistingItem
          ? {
              family: {
                id: selectedExistingItem.assetFamilyId ?? undefined,
              },
              sku: {
                id: selectedExistingItem.skuId,
              },
              ownerWarehouseId,
              warehouseId: ownerWarehouseId,
              quantity: Number(quantity),
            }
          : {
              family: {
                id: builtItem?.familyId,
                name: builtItem?.familyName,
                code: builtItem?.familyCode,
              },
              subfamily: builtItem?.subfamilyId ? { id: builtItem.subfamilyId } : undefined,
              sku: {
                id: builtItem?.skuId,
                name: builtItem?.skuName,
                unitWeight: builtItem?.skuUnitWeight,
                price: builtItem?.skuPrice,
                subrentalPrice: builtItem?.skuSubrentalPrice,
                replacementValue: builtItem?.skuReplacementValue,
                chargeType: builtItem?.chargeType,
                minimumChargeHours: builtItem?.minimumChargeHours,
                areaM2: builtItem?.areaM2,
                lengthMeters: builtItem?.lengthMeters,
              },
              ownerWarehouseId,
              warehouseId: ownerWarehouseId,
              quantity: Number(quantity),
            };

      const response = await api<CreateBulkResponse>('/inventory/bulk-adjustments', {
        method: 'POST',
        json: payload,
      });
      api<GlobalBulkSku[]>('/skus?controlType=BULK')
        .then((items) => setGlobalBulkSkus(items.filter((sku) => sku.active)))
        .catch(() => undefined);

      const warehouseLabel = warehouses.find((entry) => entry.id === ownerWarehouseId)?.name;
      const skuName =
        entryMode === 'existing'
          ? selectedExistingItem?.skuName ?? selectedExistingItem?.name ?? selectedExistingItem?.skuId
          : builtItem?.skuName;
      setSuccess(`Agregado +${response.ledger.quantity} a ${skuName} en ${warehouseLabel}`);
      if (isEmbedded) {
        window.parent.postMessage(
          {
            type: 'bulk-stock-added',
            warehouseId: ownerWarehouseId,
            skuId: response.sku.id,
            quantity: response.ledger.quantity,
          },
          window.location.origin,
        );
      }
      clearAllInputs();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error adding stock');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStock = async () => {
    setDeleteError(null);

    if (!isOfficeRole) {
      setDeleteError('Solo el rol office puede eliminar stock.');
      return;
    }

    if (!selectedExistingItem || !ownerWarehouseId) {
      setDeleteError('Selecciona primero un item existente.');
      return;
    }

    if (deleteQuantity === '' || Number(deleteQuantity) <= 0) {
      setDeleteError('Ingresa una cantidad valida.');
      return;
    }

    if (Number(deleteQuantity) > selectedExistingItem.quantity) {
      setDeleteError(`La cantidad supera el stock actual (${selectedExistingItem.quantity}).`);
      return;
    }

    if (!deletePassword.trim()) {
      setDeleteError('Ingresa tu contraseña.');
      return;
    }

    setDeleteLoading(true);
    try {
      const response = await api<DeleteBulkResponse>('/inventory/bulk-adjustments/delete', {
        method: 'POST',
        json: {
          skuId: selectedExistingItem.skuId,
          ownerWarehouseId,
          warehouseId: ownerWarehouseId,
          quantity: Number(deleteQuantity),
          password: deletePassword,
        },
        redirectOnAuthError: false,
      });

      const skuName = selectedExistingItem.skuName ?? selectedExistingItem.name ?? selectedExistingItem.skuId;
      setSuccess(`Eliminado ${Math.abs(response.ledger.quantity)} de ${skuName}.`);
      setExistingItems((items) =>
        items
          .map((item) =>
            item.skuId === selectedExistingItem.skuId
              ? { ...item, quantity: item.quantity - Number(deleteQuantity) }
              : item,
          )
          .filter((item) => item.quantity !== 0),
      );
      closeDeleteModal();
      if (selectedExistingItem.quantity - Number(deleteQuantity) <= 0) {
        setExistingSkuId(null);
      }
      setQuantity('');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setDeleteError(err.message);
      } else {
        setDeleteError('Error eliminando stock.');
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleArchiveSku = async () => {
    setArchiveError(null);

    if (!isAdminRole) {
      setArchiveError('Solo admin puede archivar referencias.');
      return;
    }

    if (!selectedExistingItem) {
      setArchiveError('Selecciona primero una referencia.');
      return;
    }

    if (!archivePassword.trim()) {
      setArchiveError('Ingresa tu contraseña.');
      return;
    }

    setArchiveLoading(true);
    try {
      const response = await api<ArchiveBulkSkuResponse>('/inventory/bulk-skus/archive', {
        method: 'POST',
        json: {
          skuId: selectedExistingItem.skuId,
          password: archivePassword,
        },
        redirectOnAuthError: false,
      });

      const skuName = response.sku.name || selectedExistingItem.skuName || selectedExistingItem.skuId;
      const adjusted = response.adjustments.reduce((sum, item) => sum + Math.abs(item.quantity), 0);
      setSuccess(
        adjusted > 0
          ? `Referencia archivada: ${skuName}. Se registro ajuste por ${adjusted}.`
          : `Referencia archivada: ${skuName}.`,
      );
      setExistingItems((items) => items.filter((item) => item.skuId !== selectedExistingItem.skuId));
      setExistingSkuId(null);
      closeArchiveModal();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setArchiveError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setArchiveError(err.message);
      } else {
        setArchiveError('Error archivando referencia.');
      }
    } finally {
      setArchiveLoading(false);
    }
  };

  return (
    <Container
      size="lg"
      py={isEmbedded ? 'md' : flowChoice ? 'xl' : 0}
      className={!flowChoice ? 'bulk-flow-page-center' : undefined}
    >
      <Stack gap="lg">
        {flowChoice && !isEmbedded ? (
          <Group justify="flex-start">
            <Button
              variant="subtle"
              color="gray"
              leftSection={<IconArrowLeft size={16} />}
              onClick={returnToFlowSelection}
            >
              Change type
            </Button>
          </Group>
        ) : null}

        <PageHeaderCard
          title={flowChoice ? 'Enter quantity stock' : 'Agregar inventario'}
          description={
            flowChoice
              ? 'Choose a catalog template or create a new one and register the warehouse entry.'
              : 'The selection opens the right form for the inventory type.'
          }
          icon={<IconCubePlus size={20} />}
          iconColor="green"
          accentColor="rgba(22,163,74,0.12)"
        >
          {!flowChoice ? (
            <Stack className={`bulk-flow-gateway${flowLeaving ? ' is-leaving' : ''}`} gap="xl">
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                <Paper
                  component="button"
                  type="button"
                  withBorder
                  radius="lg"
                  p={0}
                  className="bulk-flow-card"
                  onClick={() => chooseFlow('bulk')}
                >
                  <img
                    src="/inventory/certified-scaffold-cutout.svg"
                    alt=""
                    aria-hidden="true"
                    className="bulk-flow-card-image"
                  />
                  <Stack gap="sm" p="md">
                    <Group justify="space-between" align="center">
                      <Text fw={800} size="lg">Item por cantidad</Text>
                      <Badge color="green" variant="light">Stock masivo</Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                      Formaleta, andamio certificado, apuntalamiento y referencias controladas por unidades.
                    </Text>
                    <Text className="bulk-flow-card-action" c="green" fw={700}>
                      Continuar
                    </Text>
                  </Stack>
                </Paper>

                <Paper
                  component="button"
                  type="button"
                  withBorder
                  radius="lg"
                  p={0}
                  className="bulk-flow-card bulk-flow-card-yellow"
                  onClick={() => chooseFlow('yellow-machinery')}
                >
                  <img
                    src="/inventory/skid-steer-loader-cutout.svg"
                    alt=""
                    aria-hidden="true"
                    className="bulk-flow-card-image"
                  />
                  <Stack gap="sm" p="md">
                    <Group justify="space-between" align="center">
                      <Text fw={800} size="lg">Maquinaria amarilla</Text>
                      <Badge color="yellow" variant="light">Equipos unicos</Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                      Minicargadores, equipos serializados y activos que se administran individualmente.
                    </Text>
                    <Text className="bulk-flow-card-action" c="yellow" fw={700}>
                      Continuar
                    </Text>
                  </Stack>
                </Paper>
              </SimpleGrid>
            </Stack>
          ) : null}

        {flowChoice ? (
          <Stack gap="lg" className="bulk-flow-form">
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
                      Selecciona donde quedara ubicado inicialmente el stock.
                    </Text>
                  </div>
                  {warehouseLocked ? (
                    <Badge color="green" variant="light">
                      Confirmada
                    </Badge>
                  ) : null}
                </Group>

                <WarehouseSelect
                  label="Bodega dueña"
                  warehouses={warehouses}
                  value={ownerWarehouseId}
                  onChange={handleWarehouseChange}
                  placeholder={loading ? 'Cargando...' : 'Seleccionar bodega'}
                  loading={loading}
                  disabled={warehouseLocked}
                  required
                />

                <Group justify="flex-end" className="mobile-actions">
                  {warehouseLocked ? (
                    <Button variant="default" onClick={unlockWarehouseSelection}>
                      Cambiar bodega
                    </Button>
                  ) : (
                    <Button onClick={confirmWarehouseSelection}>
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
              className={getWorkflowStepClassName(isOperationStepActive)}
            >
              <Stack gap="md">
                <Group justify="space-between" align="flex-start" className="mobile-stack">
                  <div>
                    <Text fw={700}>2. Operacion</Text>
                    <Text size="sm" c="dimmed">
                      Elige si vas a sumar a un item existente o crear uno nuevo.
                    </Text>
                  </div>
                  {modeLocked ? (
                    <Badge color="green" variant="light">
                      Confirmada
                    </Badge>
                  ) : null}
                </Group>

                {!warehouseLocked ? (
                  <Paper radius="md" p="sm" bg="gray.0">
                    <Text size="sm" c="dimmed">
                      Confirma primero la bodega.
                    </Text>
                  </Paper>
                ) : null}

                {warehouseLocked ? (
                  <>
                <div>
                  <Text fw={700}>Tipo de entrada</Text>
                  <Text size="sm" c="dimmed">
                    Esta seleccion queda bloqueada despues de continuar.
                  </Text>
                </div>

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <Paper
                    component="button"
                    type="button"
                    withBorder
                    radius="md"
                    p="md"
                    onClick={() => handleEntryModeChange('existing')}
                    disabled={modeLocked}
                    style={{
                      cursor: modeLocked ? 'default' : 'pointer',
                      borderColor: entryMode === 'existing' ? 'var(--mantine-color-green-5)' : undefined,
                      background: entryMode === 'existing' ? 'var(--mantine-color-green-0)' : 'white',
                      textAlign: 'left',
                    }}
                  >
                    <Stack gap={4}>
                      <Text fw={700}>Sumar a existente</Text>
                      <Text size="sm" c="dimmed">Usa un item ya creado en inventario.</Text>
                    </Stack>
                  </Paper>
                  <Paper
                    component="button"
                    type="button"
                    withBorder
                    radius="md"
                    p="md"
                    onClick={() => handleEntryModeChange('new')}
                    disabled={modeLocked}
                    style={{
                      cursor: modeLocked ? 'default' : 'pointer',
                      borderColor: entryMode === 'new' ? 'var(--mantine-color-blue-5)' : undefined,
                      background: entryMode === 'new' ? 'var(--mantine-color-blue-0)' : 'white',
                      textAlign: 'left',
                    }}
                  >
                    <Stack gap={4}>
                      <Text fw={700}>Crear item nuevo</Text>
                      <Text size="sm" c="dimmed">Crea la plantilla y registra stock.</Text>
                    </Stack>
                  </Paper>
                </SimpleGrid>

                <Group justify="flex-end" className="mobile-actions">
                  {modeLocked ? (
                    <Button variant="default" onClick={unlockEntryModeSelection}>
                      Cambiar seleccion
                    </Button>
                  ) : (
                    <Button onClick={confirmEntryModeSelection}>
                      Confirmar seleccion
                    </Button>
                  )}
                </Group>
                  </>
                ) : null}

                {warehouseLocked && modeLocked && entryMode === 'existing' ? (
                  <Stack gap="md">
                    <Select
                      label="Item existente"
                      data={existingItemOptions}
                      value={existingSkuId}
                      onChange={(value) => {
                        setExistingSkuId(value);
                        if (value) scrollToEntrySection();
                      }}
                      placeholder={
                        !ownerWarehouseId
                          ? 'Selecciona primero una bodega'
                          : existingItemsLoading
                            ? 'Cargando inventario...'
                            : 'Seleccionar item'
                      }
                      disabled={!ownerWarehouseId || existingItemsLoading}
                      searchable
                      nothingFoundMessage="No hay referencias en el catálogo"
                      required
                    />

                    {selectedExistingItem ? (
                      <Paper radius="md" p="sm" bg="green.0">
                        <Group justify="space-between" align="center">
                          <Stack gap={2}>
                            <Text size="sm" fw={700}>
                              {selectedExistingItem.skuName ?? selectedExistingItem.name}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {selectedExistingItem.category ?? 'Sin familia'} · Actual: {selectedExistingItem.quantity}
                            </Text>
                          </Stack>
                          <Badge color="green" variant="light">
                            Listo
                          </Badge>
                        </Group>
                        {isOfficeRole || isAdminRole ? (
                          <Group justify="flex-end" mt="sm">
                            {isOfficeRole ? (
                              <Button
                                type="button"
                                color="red"
                                variant="light"
                                size="xs"
                                onClick={openDeleteModal}
                              >
                                Eliminar stock
                              </Button>
                            ) : null}
                            {isAdminRole ? (
                              <Button
                                type="button"
                                color="red"
                                variant="outline"
                                size="xs"
                                onClick={openArchiveModal}
                              >
                                Archivar referencia
                              </Button>
                            ) : null}
                          </Group>
                        ) : null}
                      </Paper>
                    ) : null}
                  </Stack>
                ) : null}

                {warehouseLocked && modeLocked && entryMode === 'new' ? (
                <Stack gap="md">
                  <Select
                    label="Familia"
                    data={typeOptions}
                    value={itemTypeSelection}
                    onChange={(value) => {
                      setItemTypeSelection(value);
                      setSelectedSubfamilyId(null);
                      setNewSubfamilyName('');
                      setIsItemConfigured(false);
                      if (!value) {
                        setItemType(null);
                        setConfirmAttempted(false);
                        return;
                      }

                      const family = bulkFamilies.find((entry) => entry.id === value);
                      if (!family) return;
                      const familyKey = toUpperInput(family.name).replace(/\s+/g, '_');

                      if (family.code === 'FORMALETA' || familyKey === 'FORMALETA') {
                        setItemType('FORMALETA');
                        resetTypeForm('FORMALETA');
                        return;
                      }

                      setItemType('GENERIC');
                      resetTypeForm('GENERIC');
                    }}
                    placeholder={loading ? 'Cargando...' : 'Seleccionar familia'}
                    disabled={loading}
                    required
                  />

                  {selectedFamily ? (
                    <Paper withBorder radius="md" p="sm">
                      <Stack gap="sm">
                        <Select
                          label="Subfamilia (opcional)"
                          data={subfamilyOptions}
                          value={selectedSubfamilyId}
                          onChange={(value) => {
                            setSelectedSubfamilyId(value);
                            setIsItemConfigured(false);
                          }}
                          placeholder="Sin subfamilia"
                          searchable
                          clearable
                          nothingFoundMessage="No hay subfamilias"
                        />
                        <Group align="flex-end" wrap="wrap">
                          <UppercaseTextInput
                            label="Crear subfamilia"
                            value={newSubfamilyName}
                            onChange={setNewSubfamilyName}
                            placeholder="Ej: ACCESORIOS"
                            style={{ flex: 1, minWidth: 220 }}
                          />
                          <Button
                            type="button"
                            variant="light"
                            leftSection={<IconPlus size={16} />}
                            loading={creatingSubfamily}
                            disabled={!newSubfamilyName.trim()}
                            onClick={createSubfamily}
                          >
                            Crear y seleccionar
                          </Button>
                        </Group>
                      </Stack>
                    </Paper>
                  ) : null}

                  {itemType === 'FORMALETA' ? (
                    <Paper ref={formaletaFormRef} withBorder radius="lg" p={{ base: 'md', md: 'lg' }}>
                      <Stack gap="lg">
                        <Group justify="space-between" align="flex-start">
                          <Stack gap={2}>
                            <Text fw={700}>Configuracion de formaleta</Text>
                            <Text size="sm" c="dimmed">
                              Define si vas a registrar un panel principal o un accesorio y completa
                              la ficha base antes de crear la plantilla.
                            </Text>
                          </Stack>
                          <Badge
                            color={formaletaIsAccessory ? 'orange' : 'blue'}
                            variant="light"
                            radius="sm"
                          >
                            {formaletaIsAccessory ? 'Accesorio' : 'Panel principal'}
                          </Badge>
                        </Group>

                        <Paper
                          withBorder
                          radius="md"
                          p="md"
                          bg={formaletaIsAccessory ? 'orange.0' : 'blue.0'}
                        >
                          <Stack gap="xs">
                            <Switch
                              label="Registrar como accesorio"
                              description="Activalo cuando la referencia no depende de medidas X/Y sino de un nombre comercial."
                              checked={formaletaIsAccessory}
                              onChange={(event) => {
                                setFormaletaIsAccessory(event.currentTarget.checked);
                                setIsItemConfigured(false);
                              }}
                            />
                          </Stack>
                        </Paper>

                        {formaletaIsAccessory ? (
                          <Paper withBorder radius="md" p="md" bg="gray.0">
                            <Stack gap="sm">
                              <div>
                                <Text fw={600} size="sm">Referencia de accesorio</Text>
                                <Text size="xs" c="dimmed">
                                  Usa el nombre corto que operaciones usa para identificarlo.
                                </Text>
                              </div>
                              <UppercaseTextInput
                                label="Nombre o referencia"
                                value={formaletaAccessoryName}
                                onChange={(value) => {
                                  setFormaletaAccessoryName(value);
                                  setIsItemConfigured(false);
                                }}
                                placeholder="Ejemplo: CUÑA, RIOSTRA"
                                required
                              />
                            </Stack>
                          </Paper>
                        ) : (
                          <Paper withBorder radius="md" p="md" bg="gray.0">
                            <Stack gap="md">
                              <div>
                                <Text fw={600} size="sm">Geometria base</Text>
                                <Text size="xs" c="dimmed">
                                  La linea y las medidas definen el nombre automatico de la formaleta.
                                </Text>
                              </div>
                              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                                <Select
                                  label="Linea"
                                  data={formaletaLineOptions}
                                  value={formaletaLine}
                                  onChange={(value) => {
                                    setFormaletaLine((value as FormaletaLine | null) ?? 'FORMALETA');
                                    setIsItemConfigured(false);
                                  }}
                                  required
                                />
                                <Select
                                  label="Ancho X (m)"
                                  data={formaletaXOptions.map((option) => ({
                                    value: option.value,
                                    label: formatMeasure(Number(option.value)),
                                  }))}
                                  value={formaletaX}
                                  onChange={(value) => {
                                    setFormaletaX(
                                      value
                                        ?? formaletaXOptions[0]?.value
                                        ?? DEFAULT_FORMALETA_X_OPTIONS[0],
                                    );
                                    setIsItemConfigured(false);
                                  }}
                                  required
                                />
                                <Select
                                  label="Alto Y (m)"
                                  data={formaletaYOptions.map((option) => ({
                                    value: option.value,
                                    label: formatMeasure(Number(option.value)),
                                  }))}
                                  value={formaletaY}
                                  onChange={(value) => {
                                    setFormaletaY(value ?? formaletaYOptions[0]?.value ?? DEFAULT_FORMALETA_Y_OPTIONS[0]);
                                    setIsItemConfigured(false);
                                  }}
                                  required
                                />
                              </SimpleGrid>
                            </Stack>
                          </Paper>
                        )}

                        <Paper withBorder radius="md" p="md" bg="gray.0">
                          <Stack gap="md">
                            <div>
                              <Text fw={600} size="sm">Commercial parameters</Text>
                              <Text size="xs" c="dimmed">
                                Peso, area, precio, subalquiler y valor reposicion son obligatorios.
                              </Text>
                            </div>
                            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                              <NumberInput
                                label="Peso"
                                value={formaletaSkuUnitWeight}
                                onChange={(value) =>
                                  setFormaletaSkuUnitWeight(typeof value === 'number' ? value : '')
                                }
                                min={0}
                                step={0.1}
                                error={
                                  showRequiredSkuErrors && isMissingPositiveNumber(formaletaSkuUnitWeight)
                                    ? 'Obligatorio'
                                    : undefined
                                }
                                required
                              />
                              <Select
                                label="Unidad"
                                data={weightUnitOptions}
                                value={formaletaWeightUnit}
                                onChange={(value) =>
                                  setFormaletaWeightUnit((value as WeightUnit | null) ?? '')
                                }
                                searchable
                                nothingFoundMessage="No hay unidades"
                                error={
                                  showRequiredSkuErrors && !formaletaWeightUnit
                                    ? 'Obligatorio'
                                    : undefined
                                }
                                required
                              />
                              <TextInput
                                label="Area m²"
                                value={formaletaAreaM2}
                                onChange={(event) => {
                                  setFormaletaAreaM2(sanitizeDecimalInput(event.currentTarget.value));
                                  setIsItemConfigured(false);
                                }}
                                onBlur={() =>
                                  setFormaletaAreaM2((value) => finalizeDecimalInput(String(value)))
                                }
                                inputMode="decimal"
                                placeholder="Ej: 2,50"
                                error={
                                  showRequiredSkuErrors && isMissingPositiveNumber(formaletaAreaM2)
                                    ? 'Obligatorio'
                                    : undefined
                                }
                                required
                              />
                              <NumberInput
                                label="Precio"
                                value={formaletaSkuPrice}
                                onChange={(value) =>
                                  setFormaletaSkuPrice(typeof value === 'number' ? value : '')
                                }
                                min={0}
                              step={1000}
                              error={
                                showRequiredSkuErrors && isMissingNonNegativeNumber(formaletaSkuPrice)
                                  ? 'Obligatorio'
                                  : undefined
                              }
                                required
                              />
                              <NumberInput
                                label="Precio sub alquiler"
                                value={formaletaSkuSubrentalPrice}
                                onChange={(value) =>
                                  setFormaletaSkuSubrentalPrice(typeof value === 'number' ? value : '')
                                }
                                min={0}
                              step={1000}
                              error={
                                showRequiredSkuErrors && isMissingNonNegativeNumber(formaletaSkuSubrentalPrice)
                                  ? 'Obligatorio'
                                  : undefined
                              }
                                required
                              />
                              <NumberInput
                                label="Valor reposicion"
                                value={formaletaSkuReplacementValue}
                                onChange={(value) =>
                                  setFormaletaSkuReplacementValue(typeof value === 'number' ? value : '')
                                }
                                min={0}
                                step={1000}
                                error={
                                  showRequiredSkuErrors && isMissingNonNegativeNumber(formaletaSkuReplacementValue)
                                    ? 'Obligatorio'
                                    : undefined
                                }
                                required
                              />
                              <ChargeTypeSelect
                                value={formaletaChargeType}
                                onChange={setFormaletaChargeType}
                              />
                              {formaletaChargeType === 'HOUR' ? (
                                <NumberInput
                                  label="Horas minimas"
                                  value={formaletaMinimumChargeHours}
                                  onChange={(value) =>
                                    setFormaletaMinimumChargeHours(typeof value === 'number' ? value : '')
                                  }
                                  min={0.5}
                                  step={0.5}
                                />
                              ) : null}
                            </SimpleGrid>
                          </Stack>
                        </Paper>

                        <Paper
                          withBorder
                          radius="md"
                          p="md"
                          bg={formaletaDraftName ? 'green.0' : 'gray.0'}
                        >
                          <Stack gap={4}>
                            <Text fw={600} size="sm">Vista previa de la referencia</Text>
                            <Text size="sm" c={formaletaDraftName ? undefined : 'dimmed'}>
                              {formaletaDraftName ?? 'Completa los datos base para generar el nombre de la plantilla.'}
                            </Text>
                          </Stack>
                        </Paper>
                      </Stack>
                    </Paper>
                  ) : null}

                  {itemType === 'GENERIC' ? (
                      <Paper radius="md" p="md" bg="gray.0">
                        <Stack gap="md">
                          {isCertifiedScaffold ? (
                            <>
                              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                                <Select
                                  label="Referencia"
                                  data={certifiedScaffoldPartOptions}
                                  value={genericSkuName || null}
                                  onChange={(value) => {
                                    setGenericSkuName(value ?? '');
                                    if (!value || certifiedScaffoldPartsWithoutMeasure.has(value)) {
                                      setCertifiedScaffoldMeasure('');
                                    }
                                    setIsItemConfigured(false);
                                  }}
                                  placeholder="Seleccionar pieza"
                                  searchable
                                  required
                                />
                                {certifiedScaffoldNeedsMeasure ? (
                                  <Select
                                    label="Medida"
                                    data={certifiedScaffoldMeasureOptions}
                                    value={certifiedScaffoldMeasure || null}
                                    onChange={(value) => {
                                      setCertifiedScaffoldMeasure(value ?? '');
                                      setIsItemConfigured(false);
                                    }}
                                    placeholder="Seleccionar medida"
                                    searchable
                                    required
                                  />
                                ) : null}
                              </SimpleGrid>
                              <Paper
                                radius="md"
                                p="sm"
                                bg={
                                  genericSkuName && (!certifiedScaffoldNeedsMeasure || certifiedScaffoldMeasure)
                                    ? 'green.0'
                                    : 'gray.0'
                                }
                              >
                                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                                  SKU final
                                </Text>
                                <Text size="sm" mt={4}>
                                  {genericSkuName && certifiedScaffoldNeedsMeasure && certifiedScaffoldMeasure
                                    ? `${genericSkuName} (${certifiedScaffoldMeasure})`
                                    : genericSkuName && !certifiedScaffoldNeedsMeasure
                                      ? genericSkuName
                                      : certifiedScaffoldNeedsMeasure
                                        ? 'Selecciona referencia y medida.'
                                        : 'Selecciona referencia.'}
                                </Text>
                              </Paper>
                            </>
                          ) : isConventionalScaffold ? (
                            <>
                              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                                <Select
                                  label="Referencia"
                                  data={conventionalScaffoldPartOptions}
                                  value={genericSkuName || null}
                                  onChange={(value) => {
                                    setGenericSkuName(value ?? '');
                                    setCertifiedScaffoldMeasure('');
                                    setIsItemConfigured(false);
                                  }}
                                  placeholder="Seleccionar pieza"
                                  searchable
                                  required
                                />
                                {conventionalScaffoldNeedsMeasure ? (
                                  <Select
                                    label="Medida"
                                    data={conventionalScaffoldMeasureOptions}
                                    value={certifiedScaffoldMeasure || null}
                                    onChange={(value) => {
                                      setCertifiedScaffoldMeasure(value ?? '');
                                      setIsItemConfigured(false);
                                    }}
                                    placeholder="Seleccionar medida"
                                    searchable
                                    required
                                  />
                                ) : null}
                              </SimpleGrid>
                              <Paper
                                radius="md"
                                p="sm"
                                bg={
                                  genericSkuName && (!conventionalScaffoldNeedsMeasure || certifiedScaffoldMeasure)
                                    ? 'green.0'
                                    : 'gray.0'
                                }
                              >
                                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                                  SKU final
                                </Text>
                                <Text size="sm" mt={4}>
                                  {genericSkuName && conventionalScaffoldNeedsMeasure && certifiedScaffoldMeasure
                                    ? `${genericSkuName} (${certifiedScaffoldMeasure})`
                                    : genericSkuName && !conventionalScaffoldNeedsMeasure
                                      ? genericSkuName
                                      : conventionalScaffoldNeedsMeasure
                                        ? 'Selecciona referencia y medida.'
                                        : 'Selecciona referencia.'}
                                </Text>
                              </Paper>
                            </>
                          ) : (
                            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                              <UppercaseTextInput
                                label="Referencia"
                                value={genericSkuName}
                                onChange={(value) => {
                                  setGenericSkuName(value);
                                  setIsItemConfigured(false);
                                }}
                                placeholder="Ej: PUNTA APT"
                                required
                              />
                              <NumberInput
                                label="Longitud (m) (opcional)"
                                value={genericLengthMeters}
                                onChange={(value) => {
                                  setGenericLengthMeters(typeof value === 'number' ? value : '');
                                  setIsItemConfigured(false);
                                }}
                                min={0.01}
                                decimalScale={2}
                                decimalSeparator=","
                                placeholder="Ej: 30,00"
                              />
                              <Select
                                label="Compatibilidad (opcional)"
                                data={['20', '30', '40', '60', '90'].map((value) => ({
                                  value,
                                  label: `${value} LB`,
                                }))}
                                value={genericCompatibilityLb}
                                onChange={(value) => {
                                  setGenericCompatibilityLb(value);
                                  setIsItemConfigured(false);
                                }}
                                placeholder="Sin compatibilidad"
                                clearable
                              />
                            </SimpleGrid>
                          )}
                          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
                            <NumberInput
                              label="Peso (opcional)"
                              value={genericSkuUnitWeight}
                              onChange={(value) => setGenericSkuUnitWeight(typeof value === 'number' ? value : '')}
                              min={0}
                              step={0.1}
                            />
                            <Select
                              label="Unidad de peso (opcional)"
                              data={weightUnitOptions}
                              value={genericWeightUnit}
                              onChange={(value) => setGenericWeightUnit((value as WeightUnit | null) ?? '')}
                              searchable
                              nothingFoundMessage="No hay unidades"
                            />
                            <NumberInput
                              label="Precio (opcional)"
                              value={genericSkuPrice}
                              onChange={(value) => setGenericSkuPrice(typeof value === 'number' ? value : '')}
                              min={0}
                              step={1000}
                            />
                            <NumberInput
                              label="Precio sub alquiler (opcional)"
                              value={genericSkuSubrentalPrice}
                              onChange={(value) =>
                                setGenericSkuSubrentalPrice(typeof value === 'number' ? value : '')
                              }
                              min={0}
                              step={1000}
                            />
                            <NumberInput
                              label="Valor reposicion (opcional)"
                              value={genericSkuReplacementValue}
                              onChange={(value) =>
                                setGenericSkuReplacementValue(typeof value === 'number' ? value : '')
                              }
                              min={0}
                              step={1000}
                            />
                            <ChargeTypeSelect
                              value={genericChargeType}
                              onChange={setGenericChargeType}
                            />
                            {genericChargeType === 'HOUR' ? (
                              <NumberInput
                                label="Horas minimas"
                                value={genericMinimumChargeHours}
                                onChange={(value) =>
                                  setGenericMinimumChargeHours(typeof value === 'number' ? value : '')
                                }
                                min={0.5}
                                step={0.5}
                              />
                            ) : null}
                          </SimpleGrid>
                        </Stack>
                      </Paper>
                  ) : null}

                  {itemType ? (
                    <Group justify="space-between" className="mobile-actions">
                      <Badge color={isItemConfigured ? 'green' : 'gray'} variant="light">
                        {isItemConfigured ? 'Producto confirmado' : 'Sin confirmar'}
                      </Badge>
                      <Button
                        variant={confirmButtonNeedsAttention ? 'filled' : 'light'}
                        color={confirmButtonNeedsAttention ? 'red' : undefined}
                        onClick={applyTypeConfiguration}
                      >
                        Confirmar producto
                      </Button>
                    </Group>
                  ) : null}
                </Stack>
                ) : null}

                {builtItem ? (
                  <Paper radius="md" p="sm" bg="green.0">
                    <Group justify="space-between" align="center">
                      <Stack gap={2}>
                        <Text size="sm" fw={700}>
                          {builtItem.skuName}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {builtItem.familyName}{builtItem.familyCode ? ` · ${builtItem.familyCode}` : ''}
                        </Text>
                      </Stack>
                      <Badge color="green" variant="light">
                        {builtItem.reusesExistingSku ? 'Referencia existente' : 'Nueva referencia'}
                      </Badge>
                    </Group>
                  </Paper>
                ) : null}
              </Stack>
            </Paper>

            <Paper
              ref={entrySectionRef}
              withBorder
              radius="lg"
              p="md"
              className={getWorkflowStepClassName(isQuantityStepActive)}
            >
              <Stack gap="md">
                <div>
                  <Text fw={700}>3. Cantidad</Text>
                  <Text size="sm" c="dimmed">
                    {entryMode === 'existing'
                      ? 'La entrada se suma al item seleccionado en su bodega dueña.'
                      : 'El stock quedara ubicado inicialmente en la misma bodega dueña.'}
                  </Text>
                </div>

                {warehouseLocked && modeLocked ? (
                  <NumberInput
                    label="Cantidad"
                    value={quantity}
                    onChange={(value) => setQuantity(typeof value === 'number' ? value : '')}
                    min={0}
                    step={1}
                    required
                  />
                ) : (
                  <Paper radius="md" p="sm" bg="gray.0">
                    <Text size="sm" c="dimmed">
                      Confirma bodega y operacion para ingresar cantidad.
                    </Text>
                  </Paper>
                )}
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
                  <Text fw={700}>4. Revision</Text>
                  <Text size="sm" c="dimmed">
                    Revisa el movimiento antes de ejecutar.
                  </Text>
                </div>

                {payloadPreview ? (
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <Paper radius="md" p="sm" bg="gray.0">
                      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                        Familia / SKU
                      </Text>
                      <Text size="sm" mt={8}>
                        {payloadPreview.family.name}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {payloadPreview.sku.name}
                      </Text>
                    </Paper>
                    <Paper radius="md" p="sm" bg="gray.0">
                      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                        Movimiento
                      </Text>
                      <Text size="sm" mt={8}>
                        Cantidad: {payloadPreview.quantity}
                      </Text>
                      <Text size="sm" c="dimmed">
                        Dueño: {warehouseOptions.find((item) => item.value === ownerWarehouseId)?.label ?? '-'}
                      </Text>
                      <Text size="sm" c="dimmed">
                        Ubicacion inicial: {warehouseOptions.find((item) => item.value === ownerWarehouseId)?.label ?? '-'}
                      </Text>
                    </Paper>
                  </SimpleGrid>
                ) : (
                  <Paper radius="md" p="sm" bg="gray.0">
                    <Group gap="xs" wrap="nowrap">
                      <ThemeIcon color="gray" variant="light" size={30} radius="xl">
                        <IconChecks size={16} />
                      </ThemeIcon>
                      <Text size="sm" c="dimmed">
                        Completa producto, bodega y cantidad para ver la revision final.
                      </Text>
                    </Group>
                  </Paper>
                )}
              </Stack>
            </Paper>

            <Group justify="flex-end" className="mobile-actions">
              <Button variant="default" onClick={handleCancel}>
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                loading={saving}
                disabled={!payloadPreview}
                leftSection={<IconPlus size={16} />}
              >
                Ejecutar entrada
              </Button>
            </Group>
          </Stack>
        ) : null}
        </PageHeaderCard>

        <Modal
          opened={deleteModalOpen}
          onClose={closeDeleteModal}
          title="Eliminar stock"
          centered
        >
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Esta accion registra un ajuste negativo. Confirma tu contraseña de office antes de eliminar stock.
            </Text>
            {selectedExistingItem ? (
              <Paper radius="md" p="sm" bg="gray.0">
                <Text size="sm" fw={700}>
                  {selectedExistingItem.skuName ?? selectedExistingItem.name}
                </Text>
                <Text size="xs" c="dimmed">
                  Stock actual: {selectedExistingItem.quantity}
                </Text>
              </Paper>
            ) : null}
            <NumberInput
              label="Cantidad a eliminar"
              value={deleteQuantity}
              onChange={(value) => setDeleteQuantity(typeof value === 'number' ? value : '')}
              min={0}
              max={selectedExistingItem?.quantity ?? undefined}
              step={1}
              required
            />
            <PasswordInput
              label="Contraseña"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.currentTarget.value)}
              required
            />
            {deleteError ? (
              <Alert color="red" variant="light">
                {deleteError}
              </Alert>
            ) : null}
            <Group justify="flex-end">
              <Button variant="default" onClick={closeDeleteModal}>
                Cancelar
              </Button>
              <Button color="red" onClick={handleDeleteStock} loading={deleteLoading}>
                Eliminar
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Modal
          opened={archiveModalOpen}
          onClose={closeArchiveModal}
          title="Archivar referencia"
          centered
        >
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              La referencia quedara inactiva y no se podra volver a seleccionar. Si tiene stock, se registra un ajuste para dejarla en cero.
            </Text>
            {selectedExistingItem ? (
              <Paper radius="md" p="sm" bg="gray.0">
                <Text size="sm" fw={700}>
                  {selectedExistingItem.skuName ?? selectedExistingItem.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {selectedExistingItem.category ?? 'Sin familia'} · Stock actual: {selectedExistingItem.quantity}
                </Text>
              </Paper>
            ) : null}
            <PasswordInput
              label="Contraseña admin"
              value={archivePassword}
              onChange={(event) => setArchivePassword(event.currentTarget.value)}
              required
            />
            {archiveError ? (
              <Alert color="red" variant="light">
                {archiveError}
              </Alert>
            ) : null}
            <Group justify="flex-end">
              <Button variant="default" onClick={closeArchiveModal}>
                Cancelar
              </Button>
              <Button color="red" onClick={handleArchiveSku} loading={archiveLoading}>
                Archivar
              </Button>
            </Group>
          </Stack>
        </Modal>

        {error ? (
          <Alert color="red" variant="light" title="No se pudo completar la accion">
            {error}
          </Alert>
        ) : null}

        {success ? (
          <Alert color="green" variant="light" title="Movement registered">
            {success}
          </Alert>
        ) : null}
      </Stack>
    </Container>
  );
}
