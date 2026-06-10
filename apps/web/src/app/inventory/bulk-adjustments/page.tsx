'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
  ThemeIcon,
} from '@mantine/core';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  IconChecks,
  IconCubePlus,
  IconPlus,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import { api, ApiError } from '@/lib/api';

type Warehouse = {
  id: string;
  name: string;
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

type ItemType = 'FORMALETA' | 'GENERIC';
type WeightUnit = 'KG' | 'TON';
type ChargeType = 'DAY' | 'HOUR';
type FormaletaLine = 'FORMALETA' | 'FORMALETA_SARDINEL';

type BulkPayload = {
  family: {
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
    chargeType?: ChargeType;
    minimumChargeHours?: number;
    areaM2?: number;
  };
  ownerWarehouseId: string;
  warehouseId: string;
  quantity: number;
};

const FORMALETA_Y_OPTIONS = [0.3, 0.6, 1.2, 2.4, 3.0] as const;

const formatMeasure = (value: number) => value.toFixed(2).replace('.', ',');
const parseLocaleDecimal = (value: string) => {
  const normalized = value.trim().replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
};
const toUpperInput = (value: string) => value.toLocaleUpperCase('es-CO');

const buildFormaletaSkuName = (line: FormaletaLine, xMeasure: number, yMeasure: number) => {
  const prefix = line === 'FORMALETA_SARDINEL' ? 'FORMALETA SARDINEL' : 'FORMALETA';
  return `${prefix} (${formatMeasure(xMeasure)})M x (${formatMeasure(yMeasure)})M`;
};

const normalizeWeightToKg = (value: number, unit: string) =>
  unit === 'TON' ? value * 1000 : value;

type RequiredSkuData = {
  unitWeight: number | '';
  weightUnit: WeightUnit | '';
  price: number | '';
  subrentalPrice: number | '';
  areaM2?: number | '';
};

const isMissingPositiveNumber = (value: number | '') =>
  value === '' || Number(value) <= 0;

const hasMissingRequiredSkuData = ({
  unitWeight,
  weightUnit,
  price,
  subrentalPrice,
  areaM2,
}: RequiredSkuData, requireAreaM2: boolean) =>
  isMissingPositiveNumber(unitWeight) ||
  !weightUnit ||
  (requireAreaM2 && isMissingPositiveNumber(areaM2 ?? '')) ||
  isMissingPositiveNumber(price) ||
  isMissingPositiveNumber(subrentalPrice);

export default function AddBulkStockPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formaletaFormRef = useRef<HTMLDivElement | null>(null);
  const entrySectionRef = useRef<HTMLDivElement | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [weightUnits, setWeightUnits] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [itemType, setItemType] = useState<ItemType | null>(null);
  const [itemTypeSelection, setItemTypeSelection] = useState<string | null>(null);
  const [isItemConfigured, setIsItemConfigured] = useState(false);
  const [confirmAttempted, setConfirmAttempted] = useState(false);

  const [formaletaX, setFormaletaX] = useState<string>('0,10');
  const [formaletaY, setFormaletaY] = useState<string>(String(FORMALETA_Y_OPTIONS[0]));
  const [formaletaLine, setFormaletaLine] = useState<FormaletaLine>('FORMALETA');
  const [formaletaIsAccessory, setFormaletaIsAccessory] = useState(false);
  const [formaletaAccessoryName, setFormaletaAccessoryName] = useState('');
  const [formaletaSkuUnitWeight, setFormaletaSkuUnitWeight] = useState<number | ''>('');
  const [formaletaSkuPrice, setFormaletaSkuPrice] = useState<number | ''>('');
  const [formaletaSkuSubrentalPrice, setFormaletaSkuSubrentalPrice] = useState<number | ''>('');
  const [formaletaChargeType, setFormaletaChargeType] = useState<ChargeType>('DAY');
  const [formaletaMinimumChargeHours, setFormaletaMinimumChargeHours] = useState<number | ''>('');
  const [formaletaAreaM2, setFormaletaAreaM2] = useState<number | ''>('');
  const [formaletaWeightUnit, setFormaletaWeightUnit] = useState<WeightUnit | ''>('');

  const [genericFamilyName, setGenericFamilyName] = useState('');
  const [genericFamilyCode, setGenericFamilyCode] = useState('');
  const [genericSkuName, setGenericSkuName] = useState('');
  const [genericSkuUnitWeight, setGenericSkuUnitWeight] = useState<number | ''>('');
  const [genericSkuPrice, setGenericSkuPrice] = useState<number | ''>('');
  const [genericSkuSubrentalPrice, setGenericSkuSubrentalPrice] = useState<number | ''>('');
  const [genericChargeType, setGenericChargeType] = useState<ChargeType>('DAY');
  const [genericMinimumChargeHours, setGenericMinimumChargeHours] = useState<number | ''>('');
  const [genericWeightUnit, setGenericWeightUnit] = useState<WeightUnit | ''>('');

  const [ownerWarehouseId, setOwnerWarehouseId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number | ''>('');

  const formaletaRequiredSkuData: RequiredSkuData = {
    unitWeight: formaletaSkuUnitWeight,
    weightUnit: formaletaWeightUnit,
    price: formaletaSkuPrice,
    subrentalPrice: formaletaSkuSubrentalPrice,
    areaM2: formaletaAreaM2,
  };
  const genericRequiredSkuData: RequiredSkuData = {
    unitWeight: genericSkuUnitWeight,
    weightUnit: genericWeightUnit,
    price: genericSkuPrice,
    subrentalPrice: genericSkuSubrentalPrice,
  };
  const requiredSkuDataMissing =
    itemType === 'FORMALETA'
      ? hasMissingRequiredSkuData(formaletaRequiredSkuData, true)
      : itemType === 'GENERIC'
        ? hasMissingRequiredSkuData(genericRequiredSkuData, false)
        : false;
  const showRequiredSkuErrors = confirmAttempted;
  const confirmButtonNeedsAttention = confirmAttempted && requiredSkuDataMissing;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [warehouseData, weightUnitData] = await Promise.all([
          api<Warehouse[]>('/warehouses'),
          api<string[]>('/skus/units'),
        ]);
        if (!mounted) return;
        setWarehouses(warehouseData);
        setWeightUnits(weightUnitData);

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
    if (!warehouses.length) return;
    const ownerFromQuery = searchParams.get('ownerWarehouseId');
    const warehouseFromQuery = searchParams.get('warehouseId');
    if (ownerFromQuery && warehouses.some((warehouse) => warehouse.id === ownerFromQuery)) {
      setOwnerWarehouseId(ownerFromQuery);
      return;
    }
    if (warehouseFromQuery && warehouses.some((warehouse) => warehouse.id === warehouseFromQuery)) {
      setOwnerWarehouseId(warehouseFromQuery);
    }
  }, [searchParams, warehouses]);

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

  const warehouseOptions = warehouses.map((warehouse) => ({
    value: warehouse.id,
    label: warehouse.name,
  }));
  const typeOptions = [
    { value: 'FORMALETA', label: 'Formaleta' },
    { value: 'ANDAMIO_CERTIFICADO', label: 'Andamio certificado' },
    { value: 'ANDAMIO_CONVENCIONAL', label: 'Andamio convencional' },
    { value: 'ENCOFRADO', label: 'Encofrado' },
  ];
  const weightUnitOptions = weightUnits.map((unit) => ({ value: unit, label: unit }));
  const chargeTypeOptions = [
    { value: 'DAY', label: 'Por día' },
    { value: 'HOUR', label: 'Por hora' },
  ];
  const formaletaLineOptions = [
    { value: 'FORMALETA', label: 'Formaleta' },
    { value: 'FORMALETA_SARDINEL', label: 'Formaleta Sardinel' },
  ];
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
          familyName: 'FORMALETA',
          familyCode: 'FORMALETA',
          skuName: `${accessoryName.toUpperCase()}${suffix}`,
          skuUnitWeight:
            formaletaSkuUnitWeight === ''
              ? undefined
              : normalizeWeightToKg(Number(formaletaSkuUnitWeight), formaletaWeightUnit || 'KG'),
          skuPrice: formaletaSkuPrice === '' ? undefined : Number(formaletaSkuPrice),
          skuSubrentalPrice:
            formaletaSkuSubrentalPrice === '' ? undefined : Number(formaletaSkuSubrentalPrice),
          chargeType: formaletaChargeType,
          minimumChargeHours:
            formaletaChargeType === 'HOUR' && formaletaMinimumChargeHours !== ''
              ? Number(formaletaMinimumChargeHours)
              : undefined,
          areaM2: formaletaAreaM2 === '' ? undefined : Number(formaletaAreaM2),
        };
      }
      const xValue = parseLocaleDecimal(formaletaX);
      const yValue = Number(formaletaY);
      if (!Number.isFinite(xValue) || !yValue || xValue <= 0 || yValue <= 0) {
        return null;
      }
      return {
        familyName: 'FORMALETA',
        familyCode: 'FORMALETA',
        skuName: buildFormaletaSkuName(formaletaLine, xValue, yValue),
        skuUnitWeight:
          formaletaSkuUnitWeight === ''
            ? undefined
            : normalizeWeightToKg(Number(formaletaSkuUnitWeight), formaletaWeightUnit || 'KG'),
        skuPrice: formaletaSkuPrice === '' ? undefined : Number(formaletaSkuPrice),
        skuSubrentalPrice:
          formaletaSkuSubrentalPrice === '' ? undefined : Number(formaletaSkuSubrentalPrice),
        chargeType: formaletaChargeType,
        minimumChargeHours:
          formaletaChargeType === 'HOUR' && formaletaMinimumChargeHours !== ''
            ? Number(formaletaMinimumChargeHours)
            : undefined,
        areaM2: formaletaAreaM2 === '' ? undefined : Number(formaletaAreaM2),
      };
    }

    if (!genericFamilyName.trim() || !genericSkuName.trim()) {
      return null;
    }

    return {
      familyName: toUpperInput(genericFamilyName.trim()),
      familyCode: genericFamilyCode.trim() ? toUpperInput(genericFamilyCode.trim()) : undefined,
      skuName: toUpperInput(genericSkuName.trim()),
      skuUnitWeight:
        genericSkuUnitWeight === ''
          ? undefined
          : normalizeWeightToKg(Number(genericSkuUnitWeight), genericWeightUnit || 'KG'),
      skuPrice: genericSkuPrice === '' ? undefined : Number(genericSkuPrice),
      skuSubrentalPrice:
        genericSkuSubrentalPrice === '' ? undefined : Number(genericSkuSubrentalPrice),
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
    formaletaChargeType,
    formaletaMinimumChargeHours,
    formaletaAreaM2,
    formaletaWeightUnit,
    genericFamilyName,
    genericFamilyCode,
    genericSkuName,
    genericSkuUnitWeight,
    genericSkuPrice,
    genericSkuSubrentalPrice,
    genericChargeType,
    genericMinimumChargeHours,
    genericWeightUnit,
    itemType,
    isItemConfigured,
  ]);

  const payloadPreview = useMemo(() => {
    if (!builtItem || !ownerWarehouseId || quantity === '' || Number(quantity) <= 0) {
      return null;
    }

    const payload: BulkPayload = {
      family: {
        name: builtItem.familyName,
        code: builtItem.familyCode,
      },
      sku: {
        name: builtItem.skuName,
        unitWeight: builtItem.skuUnitWeight,
        price: builtItem.skuPrice,
        subrentalPrice: builtItem.skuSubrentalPrice,
        areaM2: builtItem.areaM2,
      },
      ownerWarehouseId,
      warehouseId: ownerWarehouseId,
      quantity: Number(quantity),
    };

    return payload;
  }, [builtItem, ownerWarehouseId, quantity]);

  const resetTypeForm = (type: ItemType) => {
    setIsItemConfigured(false);
    setConfirmAttempted(false);

    const defaultWeightUnit = (weightUnits[0] as WeightUnit | undefined) ?? '';
    if (type === 'FORMALETA') {
      setFormaletaX('0,10');
      setFormaletaY(String(FORMALETA_Y_OPTIONS[0]));
      setFormaletaLine('FORMALETA');
      setFormaletaIsAccessory(false);
      setFormaletaAccessoryName('');
      setFormaletaSkuUnitWeight('');
      setFormaletaSkuPrice('');
      setFormaletaSkuSubrentalPrice('');
      setFormaletaChargeType('DAY');
      setFormaletaMinimumChargeHours('');
      setFormaletaAreaM2('');
      setFormaletaWeightUnit(defaultWeightUnit);
      return;
    }

    setGenericFamilyName('');
    setGenericFamilyCode('');
    setGenericSkuName('');
    setGenericSkuUnitWeight('');
    setGenericSkuPrice('');
    setGenericSkuSubrentalPrice('');
    setGenericChargeType('DAY');
    setGenericMinimumChargeHours('');
    setGenericWeightUnit(defaultWeightUnit);
  };

  const clearAllInputs = () => {
    const defaultWeightUnit = (weightUnits[0] as WeightUnit | undefined) ?? '';
    setItemType(null);
    setItemTypeSelection(null);
    setIsItemConfigured(false);
    setConfirmAttempted(false);

    setFormaletaX('0,10');
    setFormaletaY(String(FORMALETA_Y_OPTIONS[0]));
    setFormaletaLine('FORMALETA');
    setFormaletaIsAccessory(false);
    setFormaletaAccessoryName('');
    setFormaletaSkuUnitWeight('');
    setFormaletaSkuPrice('');
    setFormaletaSkuSubrentalPrice('');
    setFormaletaChargeType('DAY');
    setFormaletaMinimumChargeHours('');
    setFormaletaAreaM2('');
    setFormaletaWeightUnit(defaultWeightUnit);

    setGenericFamilyName('');
    setGenericFamilyCode('');
    setGenericSkuName('');
    setGenericSkuUnitWeight('');
    setGenericSkuPrice('');
    setGenericSkuSubrentalPrice('');
    setGenericChargeType('DAY');
    setGenericMinimumChargeHours('');
    setGenericWeightUnit(defaultWeightUnit);

    setOwnerWarehouseId(null);
    setQuantity('');
  };

  const validateRequiredSkuData = ({
    unitWeight,
    weightUnit,
    price,
    subrentalPrice,
    areaM2,
  }: RequiredSkuData, requireAreaM2: boolean) => {
    if (unitWeight === '' || Number(unitWeight) <= 0) {
      setError('Ingresa el peso del producto');
      return false;
    }
    if (!weightUnit) {
      setError('Selecciona la unidad de peso');
      return false;
    }
    if (requireAreaM2 && isMissingPositiveNumber(areaM2 ?? '')) {
      setError('Ingresa el área m² del producto');
      return false;
    }
    if (price === '' || Number(price) <= 0) {
      setError('Ingresa el precio del producto');
      return false;
    }
    if (subrentalPrice === '' || Number(subrentalPrice) <= 0) {
      setError('Ingresa el precio sub alquiler del producto');
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

  const applyTypeConfiguration = () => {
    setError(null);
    setConfirmAttempted(true);

    if (!itemType) {
      setError('Selecciona un tipo de item');
      return;
    }

    if (itemType === 'FORMALETA') {
      if (formaletaIsAccessory) {
        if (!formaletaAccessoryName.trim()) {
          setError('Ingresa el nombre del accesorio');
          return;
        }
        if (!validateRequiredSkuData({
          unitWeight: formaletaSkuUnitWeight,
          weightUnit: formaletaWeightUnit,
          price: formaletaSkuPrice,
          subrentalPrice: formaletaSkuSubrentalPrice,
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
      if (!Number.isFinite(xValue) || xValue <= 0) {
        setError('Ingresa una medida X válida para formaleta');
        return;
      }
      if (!FORMALETA_Y_OPTIONS.includes(yValue as (typeof FORMALETA_Y_OPTIONS)[number])) {
        setError('La medida Y de formaleta no es válida');
        return;
      }
      if (formaletaChargeType === 'HOUR' && (formaletaMinimumChargeHours === '' || Number(formaletaMinimumChargeHours) <= 0)) {
        setError('Ingresa el mínimo de cobro por hora');
        return;
      }
      if (!validateRequiredSkuData({
        unitWeight: formaletaSkuUnitWeight,
        weightUnit: formaletaWeightUnit,
        price: formaletaSkuPrice,
        subrentalPrice: formaletaSkuSubrentalPrice,
        areaM2: formaletaAreaM2,
      }, true)) {
        return;
      }
    } else {
      if (!genericFamilyName.trim()) {
        setError('Ingresa el tipo/familia para el item genérico');
        return;
      }
      if (!genericSkuName.trim()) {
        setError('Ingresa el nombre del SKU para el item genérico');
        return;
      }
      if (genericChargeType === 'HOUR' && (genericMinimumChargeHours === '' || Number(genericMinimumChargeHours) <= 0)) {
        setError('Ingresa el mínimo de cobro por hora');
        return;
      }
      if (!validateRequiredSkuData({
        unitWeight: genericSkuUnitWeight,
        weightUnit: genericWeightUnit,
        price: genericSkuPrice,
        subrentalPrice: genericSkuSubrentalPrice,
      }, false)) {
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

    if (!itemType) {
      setError('Selecciona el producto');
      return;
    }

    if (!isItemConfigured || !builtItem) {
      setError('Selecciona o crea una plantilla antes de agregar stock');
      return;
    }

    if (!ownerWarehouseId) {
      setError('Selecciona la bodega dueña');
      return;
    }

    if (quantity === '' || Number(quantity) <= 0) {
      setError('Cantidad inválida');
      return;
    }

    setSaving(true);
    try {
      const payload: BulkPayload = {
        family: {
          name: builtItem.familyName,
          code: builtItem.familyCode,
        },
        sku: {
          name: builtItem.skuName,
          unitWeight: builtItem.skuUnitWeight,
          price: builtItem.skuPrice,
          subrentalPrice: builtItem.skuSubrentalPrice,
          chargeType: builtItem.chargeType,
          minimumChargeHours: builtItem.minimumChargeHours,
          areaM2: builtItem.areaM2,
        },
        ownerWarehouseId,
        warehouseId: ownerWarehouseId,
        quantity: Number(quantity),
      };

      const response = await api<CreateBulkResponse>('/inventory/bulk-adjustments', {
        method: 'POST',
        json: payload,
      });

      const warehouseLabel = warehouses.find((entry) => entry.id === ownerWarehouseId)?.name;
      setSuccess(`Agregado +${response.ledger.quantity} a ${builtItem.skuName} en ${warehouseLabel}`);
      clearAllInputs();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error agregando stock');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PageHeaderCard
          title="Ingresar stock por cantidad"
          description="Elige una plantilla del catálogo o crea una nueva y registra la entrada en bodega."
          icon={<IconCubePlus size={20} />}
          iconColor="green"
          accentColor="rgba(22,163,74,0.12)"
        >
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Paper
              component="button"
              type="button"
              withBorder
              radius="md"
              p="xs"
              style={{
                cursor: 'default',
                borderColor: 'var(--mantine-color-green-5)',
                background: 'var(--mantine-color-green-0)',
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
                  <Text size="xs" c="dimmed">Andamios, formaleta y stock bulk</Text>
                </Stack>
              </Group>
            </Paper>
            <Paper
              component="button"
              type="button"
              withBorder
              radius="md"
              p="xs"
              onClick={() => router.push('/inventory/serialized-assets')}
              style={{
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.78)',
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
                  <Text fw={700} size="sm">Equipos únicos</Text>
                  <Text size="xs" c="dimmed">Minicargadores y activos seriales</Text>
                </Stack>
              </Group>
            </Paper>
          </SimpleGrid>

        </PageHeaderCard>

        {error ? (
          <Alert color="red" variant="light" title="No se pudo completar la acción">
            {error}
          </Alert>
        ) : null}

        {success ? (
          <Alert color="green" variant="light" title="Movimiento registrado">
            {success}
          </Alert>
        ) : null}

        <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
          <Stack gap="lg">
            <Paper ref={entrySectionRef} withBorder radius="lg" p="md">
              <Stack gap="md">
                <div>
                  <Text fw={700}>1. Producto</Text>
                  <Text size="sm" c="dimmed">
                    Elige el tipo de producto que deseas agregar.
                  </Text>
                </div>

                <Stack gap="md">
                  <Select
                    label="Familia"
                    data={typeOptions}
                    value={itemTypeSelection}
                    onChange={(value) => {
                      setItemTypeSelection(value);
                      setIsItemConfigured(false);
                      if (!value) {
                        setItemType(null);
                        setConfirmAttempted(false);
                        return;
                      }

                      if (value === 'FORMALETA') {
                        setItemType('FORMALETA');
                        resetTypeForm('FORMALETA');
                        return;
                      }

                      setItemType('GENERIC');
                      resetTypeForm('GENERIC');
                      if (value === 'ANDAMIO_CERTIFICADO') {
                        setGenericFamilyName('ANDAMIO CERTIFICADO');
                        setGenericFamilyCode('ADCR');
                      } else if (value === 'ANDAMIO_CONVENCIONAL') {
                        setGenericFamilyName('ANDAMIO CONVENCIONAL');
                        setGenericFamilyCode('ADCV');
                      } else if (value === 'ENCOFRADO') {
                        setGenericFamilyName('ENCOFRADO');
                        setGenericFamilyCode('ENCOFRADO');
                      }
                    }}
                    placeholder={loading ? 'Cargando...' : 'Selecciona familia'}
                    disabled={loading}
                    required
                  />

                  {itemType === 'FORMALETA' ? (
                    <Paper ref={formaletaFormRef} withBorder radius="lg" p={{ base: 'md', md: 'lg' }}>
                      <Stack gap="lg">
                        <Group justify="space-between" align="flex-start">
                          <Stack gap={2}>
                            <Text fw={700}>Configuración de formaleta</Text>
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
                              description="Actívalo cuando la referencia no dependa de medidas X/Y sino de un nombre comercial."
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
                                <Text fw={600} size="sm">Referencia del accesorio</Text>
                                <Text size="xs" c="dimmed">
                                  Usa el nombre corto con el que lo identifica operación.
                                </Text>
                              </div>
                              <TextInput
                                label="Nombre o referencia"
                                value={formaletaAccessoryName}
                                onChange={(event) => {
                                  setFormaletaAccessoryName(toUpperInput(event.currentTarget.value));
                                  setIsItemConfigured(false);
                                }}
                                placeholder="Ej: CUÑA, CRUCETA"
                                required
                              />
                            </Stack>
                          </Paper>
                        ) : (
                          <Paper withBorder radius="md" p="md" bg="gray.0">
                            <Stack gap="md">
                              <div>
                                <Text fw={600} size="sm">Geometría base</Text>
                                <Text size="xs" c="dimmed">
                                  La línea y las medidas definen el nombre automático de la formaleta.
                                </Text>
                              </div>
                              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                                <Select
                                  label="Línea"
                                  data={formaletaLineOptions}
                                  value={formaletaLine}
                                  onChange={(value) => {
                                    setFormaletaLine((value as FormaletaLine | null) ?? 'FORMALETA');
                                    setIsItemConfigured(false);
                                  }}
                                  required
                                />
                                <TextInput
                                  label="Ancho X (m)"
                                  value={formaletaX}
                                  onChange={(event) => {
                                    setFormaletaX(event.currentTarget.value);
                                    setIsItemConfigured(false);
                                  }}
                                  inputMode="decimal"
                                  placeholder="0,10"
                                  required
                                />
                                <Select
                                  label="Alto Y (m)"
                                  data={FORMALETA_Y_OPTIONS.map((value) => ({
                                    value: String(value),
                                    label: formatMeasure(value),
                                  }))}
                                  value={formaletaY}
                                  onChange={(value) => {
                                    setFormaletaY(value ?? String(FORMALETA_Y_OPTIONS[0]));
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
                              <Text fw={600} size="sm">Parámetros comerciales</Text>
                              <Text size="xs" c="dimmed">
                                Peso, área, precio y precio sub alquiler son obligatorios.
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
                                nothingFoundMessage="Sin unidades"
                                error={
                                  showRequiredSkuErrors && !formaletaWeightUnit
                                    ? 'Obligatorio'
                                    : undefined
                                }
                                required
                              />
                              <NumberInput
                                label="Área m²"
                                value={formaletaAreaM2}
                                onChange={(value) =>
                                  setFormaletaAreaM2(typeof value === 'number' ? value : '')
                                }
                                min={0}
                                step={0.01}
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
                                  showRequiredSkuErrors && isMissingPositiveNumber(formaletaSkuPrice)
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
                                  showRequiredSkuErrors && isMissingPositiveNumber(formaletaSkuSubrentalPrice)
                                    ? 'Obligatorio'
                                    : undefined
                                }
                                required
                              />
                              <Select
                                label="Cobro"
                                data={chargeTypeOptions}
                                value={formaletaChargeType}
                                onChange={(value) =>
                                  setFormaletaChargeType((value as ChargeType | null) ?? 'DAY')
                                }
                              />
                              {formaletaChargeType === 'HOUR' ? (
                                <NumberInput
                                  label="Mínimo horas"
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
                          <Group grow className="mobile-stack">
                            <TextInput
                              label="Familia"
                              value={genericFamilyName}
                              onChange={(event) => {
                                setGenericFamilyName(toUpperInput(event.currentTarget.value));
                                setIsItemConfigured(false);
                              }}
                              placeholder="Ej: ANDAMIO MULTIDIRECCIONAL"
                              required
                            />
                            <TextInput
                              label="Código"
                              value={genericFamilyCode}
                              onChange={(event) => setGenericFamilyCode(toUpperInput(event.currentTarget.value))}
                              placeholder="Ej: AND-MULTI"
                            />
                          </Group>
                          <TextInput
                            label="Referencia"
                            value={genericSkuName}
                            onChange={(event) => {
                              setGenericSkuName(toUpperInput(event.currentTarget.value));
                              setIsItemConfigured(false);
                            }}
                            placeholder="Ej: VERTICAL 3.00M"
                            required
                          />
                          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
                            <NumberInput
                              label="Peso"
                              value={genericSkuUnitWeight}
                              onChange={(value) => setGenericSkuUnitWeight(typeof value === 'number' ? value : '')}
                              min={0}
                              step={0.1}
                              error={
                                showRequiredSkuErrors && isMissingPositiveNumber(genericSkuUnitWeight)
                                  ? 'Obligatorio'
                                  : undefined
                              }
                              required
                            />
                            <Select
                              label="Unidad"
                              data={weightUnitOptions}
                              value={genericWeightUnit}
                              onChange={(value) => setGenericWeightUnit((value as WeightUnit | null) ?? '')}
                              searchable
                              nothingFoundMessage="Sin unidades"
                              error={
                                showRequiredSkuErrors && !genericWeightUnit
                                  ? 'Obligatorio'
                                  : undefined
                              }
                              required
                            />
                            <NumberInput
                              label="Precio"
                              value={genericSkuPrice}
                              onChange={(value) => setGenericSkuPrice(typeof value === 'number' ? value : '')}
                              min={0}
                              step={1000}
                              error={
                                showRequiredSkuErrors && isMissingPositiveNumber(genericSkuPrice)
                                  ? 'Obligatorio'
                                  : undefined
                              }
                              required
                            />
                            <NumberInput
                              label="Precio sub alquiler"
                              value={genericSkuSubrentalPrice}
                              onChange={(value) =>
                                setGenericSkuSubrentalPrice(typeof value === 'number' ? value : '')
                              }
                              min={0}
                              step={1000}
                              error={
                                showRequiredSkuErrors && isMissingPositiveNumber(genericSkuSubrentalPrice)
                                  ? 'Obligatorio'
                                  : undefined
                              }
                              required
                            />
                            <Select
                              label="Cobro"
                              data={chargeTypeOptions}
                              value={genericChargeType}
                              onChange={(value) =>
                                setGenericChargeType((value as ChargeType | null) ?? 'DAY')
                              }
                            />
                            {genericChargeType === 'HOUR' ? (
                              <NumberInput
                                label="Mínimo horas"
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
                        Listo
                      </Badge>
                    </Group>
                  </Paper>
                ) : null}
              </Stack>
            </Paper>

            <Paper withBorder radius="lg" p="md">
              <Stack gap="md">
                <div>
                  <Text fw={700}>2. Entrada a bodega</Text>
                  <Text size="sm" c="dimmed">
                    El stock quedará ubicado inicialmente en la misma bodega dueña.
                  </Text>
                </div>

                <Select
                  label="Bodega dueña"
                  data={warehouseOptions}
                  value={ownerWarehouseId}
                  onChange={(value) => setOwnerWarehouseId(value)}
                  required
                />

                <NumberInput
                  label="Cantidad"
                  value={quantity}
                  onChange={(value) => setQuantity(typeof value === 'number' ? value : '')}
                  min={0}
                  step={1}
                  required
                />
              </Stack>
            </Paper>

            <Paper withBorder radius="lg" p="md">
              <Stack gap="md">
                <div>
                  <Text fw={700}>3. Revisión</Text>
                  <Text size="sm" c="dimmed">
                    Confirma producto, bodega y cantidad antes de guardar.
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
                        Dueña: {warehouseOptions.find((item) => item.value === ownerWarehouseId)?.label ?? '-'}
                      </Text>
                      <Text size="sm" c="dimmed">
                        Ubicación inicial: {warehouseOptions.find((item) => item.value === ownerWarehouseId)?.label ?? '-'}
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
                        Completa producto, bodega y cantidad para ver la revisión final.
                      </Text>
                    </Group>
                  </Paper>
                )}
              </Stack>
            </Paper>

            <Group justify="flex-end" className="mobile-actions">
              <Button variant="default" onClick={() => router.back()}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} loading={saving} leftSection={<IconPlus size={16} />}>
                Guardar entrada
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
