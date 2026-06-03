'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Chip,
  Container,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
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
  IconArrowsTransferUp,
  IconBuildingWarehouse,
  IconChecks,
  IconClipboardList,
  IconCubePlus,
  IconForms,
  IconPlus,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import StatCard from '@/components/dashboard/StatCard';
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

type TemplateSku = {
  id: string;
  name: string;
  price: number | null;
  subrentalPrice: number | null;
  chargeType: 'DAY' | 'HOUR';
  minimumChargeHours: number | null;
  areaM2: number | null;
  unitWeight: number | null;
  assetFamily: {
    id: string;
    code: string;
    name: string;
    controlType: 'BULK' | 'SERIAL';
  };
};

type ItemType = 'FORMALETA' | 'GENERIC';
type BulkEntryMode = 'existing' | 'new';
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

const buildFormaletaSkuName = (line: FormaletaLine, xMeasure: number, yMeasure: number) => {
  const prefix = line === 'FORMALETA_SARDINEL' ? 'FORMALETA SARDINEL' : 'FORMALETA';
  return `${prefix} (${formatMeasure(xMeasure)})M x (${formatMeasure(yMeasure)})M`;
};

const normalizeWeightToKg = (value: number, unit: string) =>
  unit === 'TON' ? value * 1000 : value;

export default function AddBulkStockPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [templateSkus, setTemplateSkus] = useState<TemplateSku[]>([]);
  const [templateSkuId, setTemplateSkuId] = useState<string | null>(null);
  const [weightUnits, setWeightUnits] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [bulkEntryMode, setBulkEntryMode] = useState<BulkEntryMode>('existing');
  const [itemType, setItemType] = useState<ItemType | null>(null);
  const [itemTypeSelection, setItemTypeSelection] = useState<string | null>(null);
  const [isItemConfigured, setIsItemConfigured] = useState(false);

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
  const [genericAreaM2, setGenericAreaM2] = useState<number | ''>('');
  const [genericWeightUnit, setGenericWeightUnit] = useState<WeightUnit | ''>('');

  const [ownerWarehouseId, setOwnerWarehouseId] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number | ''>('');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [warehouseData, templateSkusData, weightUnitData] = await Promise.all([
          api<Warehouse[]>('/warehouses'),
          api<TemplateSku[]>('/skus?controlType=BULK'),
          api<string[]>('/skus/units'),
        ]);
        if (!mounted) return;
        setWarehouses(warehouseData);
        setTemplateSkus(templateSkusData);
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
    }
    if (warehouseFromQuery && warehouses.some((warehouse) => warehouse.id === warehouseFromQuery)) {
      setWarehouseId(warehouseFromQuery);
    }
  }, [searchParams, warehouses]);

  const warehouseOptions = warehouses.map((warehouse) => ({
    value: warehouse.id,
    label: warehouse.name,
  }));
  const templateOptions = templateSkus.map((sku) => ({
    value: sku.id,
    label: `${sku.name} · ${sku.assetFamily.name}`,
  }));
  const typeOptions = [
    { value: 'FORMALETA', label: 'Formaleta' },
    { value: 'ANDAMIO', label: 'Andamio' },
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
          skuUnitWeight: undefined,
          skuPrice: undefined,
          skuSubrentalPrice: undefined,
          chargeType: formaletaChargeType,
          minimumChargeHours:
            formaletaChargeType === 'HOUR' && formaletaMinimumChargeHours !== ''
              ? Number(formaletaMinimumChargeHours)
              : undefined,
          areaM2: undefined,
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
      familyName: genericFamilyName.trim(),
      familyCode: genericFamilyCode.trim() || undefined,
      skuName: genericSkuName.trim(),
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
      areaM2: genericAreaM2 === '' ? undefined : Number(genericAreaM2),
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
    genericAreaM2,
    genericWeightUnit,
    itemType,
    isItemConfigured,
  ]);

  const payloadPreview = useMemo(() => {
    if (!builtItem || !ownerWarehouseId || !warehouseId || quantity === '' || Number(quantity) <= 0) {
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
      warehouseId,
      quantity: Number(quantity),
    };

    return payload;
  }, [builtItem, ownerWarehouseId, warehouseId, quantity]);

  const resetTypeForm = (type: ItemType) => {
    setIsItemConfigured(false);

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
    setGenericAreaM2('');
    setGenericWeightUnit(defaultWeightUnit);
  };

  const clearAllInputs = () => {
    const defaultWeightUnit = (weightUnits[0] as WeightUnit | undefined) ?? '';
    setItemType(null);
    setItemTypeSelection(null);
    setTemplateSkuId(null);
    setIsItemConfigured(false);

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
    setGenericAreaM2('');
    setGenericWeightUnit(defaultWeightUnit);

    setOwnerWarehouseId(null);
    setWarehouseId(null);
    setQuantity('');
  };

  const applyTypeConfiguration = () => {
    setError(null);

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
        setIsItemConfigured(true);
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
      if (formaletaSkuUnitWeight !== '' && !formaletaWeightUnit) {
        setError('Selecciona unidad de peso para formaleta');
        return;
      }
      if (formaletaChargeType === 'HOUR' && (formaletaMinimumChargeHours === '' || Number(formaletaMinimumChargeHours) <= 0)) {
        setError('Ingresa el mínimo de cobro por hora');
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
      if (genericSkuUnitWeight !== '' && !genericWeightUnit) {
        setError('Selecciona unidad de peso');
        return;
      }
      if (genericChargeType === 'HOUR' && (genericMinimumChargeHours === '' || Number(genericMinimumChargeHours) <= 0)) {
        setError('Ingresa el mínimo de cobro por hora');
        return;
      }
    }

    setIsItemConfigured(true);
  };

  const applyTemplate = (skuId: string | null) => {
    setTemplateSkuId(skuId);
    if (!skuId) {
      setItemType(null);
      setItemTypeSelection(null);
      setIsItemConfigured(false);
      return;
    }
    const template = templateSkus.find((sku) => sku.id === skuId);
    if (!template) return;

    const familyName = template.assetFamily.name.trim().toUpperCase();
    const familyCode = template.assetFamily.code.trim().toUpperCase();
    const skuName = template.name.trim();

    if (familyName === 'FORMALETA' || familyCode === 'FORMALETA') {
      setItemType('FORMALETA');
      setItemTypeSelection('FORMALETA');
      const match = skuName.match(/FORMALETA\s*\(([\d.,]+)\)M\s*X\s*\(([\d.,]+)\)M/i);
      if (match) {
        setFormaletaLine(/SARDINEL/i.test(skuName) ? 'FORMALETA_SARDINEL' : 'FORMALETA');
        setFormaletaIsAccessory(false);
        setFormaletaAccessoryName('');
        setFormaletaX(match[1].replace('.', ','));
        const yParsed = Number(match[2].replace(',', '.'));
        const nearestY = FORMALETA_Y_OPTIONS.find((value) => Math.abs(value - yParsed) < 0.0001);
        setFormaletaY(String(nearestY ?? FORMALETA_Y_OPTIONS[0]));
        setFormaletaSkuUnitWeight(template.unitWeight ?? '');
        setFormaletaSkuPrice(template.price ?? '');
        setFormaletaSkuSubrentalPrice(template.subrentalPrice ?? '');
        setFormaletaChargeType(template.chargeType ?? 'DAY');
        setFormaletaMinimumChargeHours(template.minimumChargeHours ?? '');
        setFormaletaAreaM2(template.areaM2 ?? '');
      } else {
        setFormaletaLine(/SARDINEL/i.test(skuName) ? 'FORMALETA_SARDINEL' : 'FORMALETA');
        setFormaletaIsAccessory(true);
        setFormaletaAccessoryName(
          skuName.replace(/\s+SARDINEL\s*$/i, '').toUpperCase(),
        );
        setFormaletaSkuUnitWeight('');
        setFormaletaSkuPrice('');
        setFormaletaSkuSubrentalPrice('');
        setFormaletaChargeType(template.chargeType ?? 'DAY');
        setFormaletaMinimumChargeHours(template.minimumChargeHours ?? '');
        setFormaletaAreaM2('');
      }
      setIsItemConfigured(true);
      return;
    }

    setItemType('GENERIC');
    if (familyName === 'ANDAMIO') setItemTypeSelection('ANDAMIO');
    else if (familyName === 'ENCOFRADO') setItemTypeSelection('ENCOFRADO');
    setGenericFamilyName(familyName);
    setGenericFamilyCode(familyCode);
    setGenericSkuName(skuName.toUpperCase());
    setGenericSkuUnitWeight(template.unitWeight ?? '');
    setGenericSkuPrice(template.price ?? '');
    setGenericSkuSubrentalPrice(template.subrentalPrice ?? '');
    setGenericChargeType(template.chargeType ?? 'DAY');
    setGenericMinimumChargeHours(template.minimumChargeHours ?? '');
    setGenericAreaM2(template.areaM2 ?? '');
    setIsItemConfigured(true);
  };

  const handleBulkEntryModeChange = (value: string) => {
    const nextMode = value as BulkEntryMode;
    setBulkEntryMode(nextMode);
    setError(null);
    setSuccess(null);
    setTemplateSkuId(null);
    setItemType(null);
    setItemTypeSelection(null);
    setIsItemConfigured(false);
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

    if (!warehouseId) {
      setError('Selecciona dónde queda el stock');
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
        warehouseId,
        quantity: Number(quantity),
      };

      const response = await api<CreateBulkResponse>('/inventory/bulk-adjustments', {
        method: 'POST',
        json: payload,
      });

      const warehouseLabel = warehouses.find((entry) => entry.id === warehouseId)?.name;
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
          <Group>
            <Chip.Group
              multiple={false}
              value="bulk"
              onChange={(value) => {
                if (value === 'serial') {
                  router.push('/inventory/serialized-assets');
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
              label="Catálogo"
              value={String(templateSkus.length)}
              hint="Plantillas bulk"
              color="green"
              icon={<IconClipboardList size={20} />}
            />
            <StatCard
              label="Producto"
              value={builtItem ? 'Listo' : 'Pend.'}
              hint={builtItem ? builtItem.familyName : 'Elige o crea plantilla'}
              color="blue"
              icon={<IconForms size={20} />}
            />
            <StatCard
              label="Ubicación"
              value={ownerWarehouseId && warehouseId ? 'Listo' : 'Pend.'}
              hint={ownerWarehouseId && warehouseId ? 'Bodegas definidas' : `${warehouses.length} bodegas`}
              color={ownerWarehouseId && warehouseId ? 'teal' : 'gray'}
              icon={<IconBuildingWarehouse size={20} />}
            />
            <StatCard
              label="Cantidad"
              value={payloadPreview ? String(payloadPreview.quantity) : '0'}
              hint={payloadPreview ? 'Listo para guardar' : 'Falta completar'}
              color={payloadPreview ? 'lime' : 'gray'}
              icon={<IconArrowsTransferUp size={20} />}
            />
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
            <Paper withBorder radius="lg" p="md">
              <Stack gap="md">
                <div>
                  <Text fw={700}>1. Producto</Text>
                  <Text size="sm" c="dimmed">
                    Usa una plantilla del catálogo o crea la referencia si aún no existe.
                  </Text>
                </div>

                <SegmentedControl
                  value={bulkEntryMode}
                  onChange={handleBulkEntryModeChange}
                  data={[
                    { value: 'existing', label: 'Usar plantilla' },
                    { value: 'new', label: 'Crear plantilla' },
                  ]}
                  fullWidth
                />

                {bulkEntryMode === 'existing' ? (
                  <Select
                    label="Plantilla"
                    placeholder="Busca por referencia o familia"
                    searchable
                    clearable
                    data={templateOptions}
                    value={templateSkuId}
                    onChange={applyTemplate}
                  />
                ) : (
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
                          return;
                        }

                        if (value === 'FORMALETA') {
                          setItemType('FORMALETA');
                          resetTypeForm('FORMALETA');
                          return;
                        }

                        setItemType('GENERIC');
                        resetTypeForm('GENERIC');
                        if (value === 'ANDAMIO') {
                          setGenericFamilyName('ANDAMIO');
                          setGenericFamilyCode('ANDAMIO');
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
                      <Paper radius="md" p="md" bg="gray.0">
                        <Stack gap="md">
                          <Switch
                            label="Es accesorio"
                            checked={formaletaIsAccessory}
                            onChange={(event) => {
                              setFormaletaIsAccessory(event.currentTarget.checked);
                              setIsItemConfigured(false);
                            }}
                          />
                          {formaletaIsAccessory ? (
                            <TextInput
                              label="Referencia"
                              value={formaletaAccessoryName}
                              onChange={(event) => {
                                setFormaletaAccessoryName(event.currentTarget.value);
                                setIsItemConfigured(false);
                              }}
                              placeholder="Ej: CUÑA, CRUCETA"
                              required
                            />
                          ) : (
                            <>
                              <Group grow className="mobile-stack">
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
                              </Group>
                              <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
                                <NumberInput
                                  label="Peso"
                                  value={formaletaSkuUnitWeight}
                                  onChange={(value) => setFormaletaSkuUnitWeight(typeof value === 'number' ? value : '')}
                                  min={0}
                                  step={0.1}
                                />
                                <Select
                                  label="Unidad"
                                  data={weightUnitOptions}
                                  value={formaletaWeightUnit}
                                  onChange={(value) => setFormaletaWeightUnit((value as WeightUnit | null) ?? '')}
                                  searchable
                                  nothingFoundMessage="Sin unidades"
                                />
                                <NumberInput
                                  label="Precio"
                                  value={formaletaSkuPrice}
                                  onChange={(value) => setFormaletaSkuPrice(typeof value === 'number' ? value : '')}
                                  min={0}
                                  step={1000}
                                />
                                <NumberInput
                                  label="Subalquiler"
                                  value={formaletaSkuSubrentalPrice}
                                  onChange={(value) =>
                                    setFormaletaSkuSubrentalPrice(typeof value === 'number' ? value : '')
                                  }
                                  min={0}
                                  step={1000}
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
                                <NumberInput
                                  label="Área m²"
                                  value={formaletaAreaM2}
                                  onChange={(value) => setFormaletaAreaM2(typeof value === 'number' ? value : '')}
                                  min={0}
                                  step={0.01}
                                />
                              </SimpleGrid>
                            </>
                          )}
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
                                setGenericFamilyName(event.currentTarget.value);
                                setIsItemConfigured(false);
                              }}
                              placeholder="Ej: ANDAMIO MULTIDIRECCIONAL"
                              required
                            />
                            <TextInput
                              label="Código"
                              value={genericFamilyCode}
                              onChange={(event) => setGenericFamilyCode(event.currentTarget.value)}
                              placeholder="Ej: AND-MULTI"
                            />
                          </Group>
                          <TextInput
                            label="Referencia"
                            value={genericSkuName}
                            onChange={(event) => {
                              setGenericSkuName(event.currentTarget.value);
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
                            />
                            <Select
                              label="Unidad"
                              data={weightUnitOptions}
                              value={genericWeightUnit}
                              onChange={(value) => setGenericWeightUnit((value as WeightUnit | null) ?? '')}
                              searchable
                              nothingFoundMessage="Sin unidades"
                            />
                            <NumberInput
                              label="Precio"
                              value={genericSkuPrice}
                              onChange={(value) => setGenericSkuPrice(typeof value === 'number' ? value : '')}
                              min={0}
                              step={1000}
                            />
                            <NumberInput
                              label="Subalquiler"
                              value={genericSkuSubrentalPrice}
                              onChange={(value) =>
                                setGenericSkuSubrentalPrice(typeof value === 'number' ? value : '')
                              }
                              min={0}
                              step={1000}
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
                            <NumberInput
                              label="Área m²"
                              value={genericAreaM2}
                              onChange={(value) => setGenericAreaM2(typeof value === 'number' ? value : '')}
                              min={0}
                              step={0.01}
                            />
                          </SimpleGrid>
                        </Stack>
                      </Paper>
                    ) : null}

                    {itemType ? (
                      <Group justify="space-between" className="mobile-actions">
                        <Badge color={isItemConfigured ? 'green' : 'gray'} variant="light">
                          {isItemConfigured ? 'Plantilla lista' : 'Pendiente'}
                        </Badge>
                        <Button variant="light" onClick={applyTypeConfiguration}>
                          Usar esta plantilla
                        </Button>
                      </Group>
                    ) : null}
                  </Stack>
                )}

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
                        Seleccionado
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
                    Define quién es dueño del stock, dónde queda y cuántas unidades entran.
                  </Text>
                </div>

                <Group grow className="mobile-stack">
                  <Select
                    label="Bodega dueña"
                    data={warehouseOptions}
                    value={ownerWarehouseId}
                    onChange={(value) => {
                      setOwnerWarehouseId(value);
                      setWarehouseId(value);
                    }}
                    required
                  />
                  <Select
                    label="Dónde queda"
                    data={warehouseOptions}
                    value={warehouseId}
                    onChange={(value) => setWarehouseId(value)}
                    required
                  />
                </Group>

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
                    Confirma producto, ubicación y cantidad antes de guardar.
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
                        Ubicación: {warehouseOptions.find((item) => item.value === warehouseId)?.label ?? '-'}
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
                        Completa producto, ubicación y cantidad para ver la revisión final.
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
