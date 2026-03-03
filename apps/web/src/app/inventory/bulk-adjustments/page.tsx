'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Container,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useRouter, useSearchParams } from 'next/navigation';
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
  category: string;
  price: number | null;
  subrentalPrice: number | null;
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
type WeightUnit = 'KG' | 'TON';

type BulkPayload = {
  family: {
    id?: string;
    code?: string;
    name?: string;
  };
  sku: {
    id?: string;
    name?: string;
    category?: string;
    unitWeight?: number;
    price?: number;
    subrentalPrice?: number;
    areaM2?: number;
  };
  ownerWarehouseId: string;
  warehouseId: string;
  quantity: number;
};

const FORMALETA_Y_OPTIONS = [0.3, 0.6, 1.2, 2.4] as const;

const formatMeasure = (value: number) => value.toFixed(2).replace('.', ',');
const parseLocaleDecimal = (value: string) => {
  const normalized = value.trim().replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const buildFormaletaSkuName = (xMeasure: number, yMeasure: number) =>
  `FORMALETA (${formatMeasure(xMeasure)})M x (${formatMeasure(yMeasure)})M`;

const normalizeWeightToKg = (value: number, unit: string) =>
  unit === 'TON' ? value * 1000 : value;

export default function AddBulkStockPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [templateSkus, setTemplateSkus] = useState<TemplateSku[]>([]);
  const [templateSkuId, setTemplateSkuId] = useState<string | null>(null);
  const [weightUnits, setWeightUnits] = useState<string[]>([]);
  const [skuCategories, setSkuCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [itemType, setItemType] = useState<ItemType | null>(null);
  const [itemTypeSelection, setItemTypeSelection] = useState<string | null>(null);
  const [itemConfigOpen, setItemConfigOpen] = useState(false);
  const [isItemConfigured, setIsItemConfigured] = useState(false);

  const [formaletaX, setFormaletaX] = useState<string>('0,10');
  const [formaletaY, setFormaletaY] = useState<string>(String(FORMALETA_Y_OPTIONS[0]));
  const [formaletaIsAccessory, setFormaletaIsAccessory] = useState(false);
  const [formaletaAccessoryName, setFormaletaAccessoryName] = useState('');
  const [formaletaSkuUnitWeight, setFormaletaSkuUnitWeight] = useState<number | ''>('');
  const [formaletaSkuPrice, setFormaletaSkuPrice] = useState<number | ''>('');
  const [formaletaSkuSubrentalPrice, setFormaletaSkuSubrentalPrice] = useState<number | ''>('');
  const [formaletaAreaM2, setFormaletaAreaM2] = useState<number | ''>('');
  const [formaletaWeightUnit, setFormaletaWeightUnit] = useState<WeightUnit | ''>('');

  const [genericFamilyName, setGenericFamilyName] = useState('');
  const [genericFamilyCode, setGenericFamilyCode] = useState('');
  const [genericSkuName, setGenericSkuName] = useState('');
  const [genericSkuCategory, setGenericSkuCategory] = useState('');
  const [genericSkuUnitWeight, setGenericSkuUnitWeight] = useState<number | ''>('');
  const [genericSkuPrice, setGenericSkuPrice] = useState<number | ''>('');
  const [genericSkuSubrentalPrice, setGenericSkuSubrentalPrice] = useState<number | ''>('');
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
        const [warehouseData, templateSkusData, weightUnitData, categoryData] = await Promise.all([
          api<Warehouse[]>('/warehouses'),
          api<TemplateSku[]>('/skus?controlType=BULK'),
          api<string[]>('/skus/units'),
          api<string[]>('/skus/categories'),
        ]);
        if (!mounted) return;
        setWarehouses(warehouseData);
        setTemplateSkus(templateSkusData);
        setWeightUnits(weightUnitData);
        setSkuCategories(categoryData);

        const defaultWeightUnit = (weightUnitData[0] as WeightUnit | undefined) ?? '';
        const defaultGenericCategory = categoryData.find((entry) => entry !== 'FORMALETA') ?? '';

        setFormaletaWeightUnit(defaultWeightUnit);
        setGenericWeightUnit(defaultWeightUnit);
        setGenericSkuCategory(defaultGenericCategory);
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
  const categoryOptions = skuCategories.map((category) => ({ value: category, label: category }));

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
        return {
          familyName: 'FORMALETA',
          familyCode: 'FORMALETA',
          skuName: accessoryName.toUpperCase(),
          skuCategory: 'FORMALETA',
          skuUnitWeight: undefined,
          skuPrice: undefined,
          skuSubrentalPrice: undefined,
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
        skuName: buildFormaletaSkuName(xValue, yValue),
        skuCategory: 'FORMALETA',
        skuUnitWeight:
          formaletaSkuUnitWeight === ''
            ? undefined
            : normalizeWeightToKg(Number(formaletaSkuUnitWeight), formaletaWeightUnit || 'KG'),
        skuPrice: formaletaSkuPrice === '' ? undefined : Number(formaletaSkuPrice),
        skuSubrentalPrice:
          formaletaSkuSubrentalPrice === '' ? undefined : Number(formaletaSkuSubrentalPrice),
        areaM2: formaletaAreaM2 === '' ? undefined : Number(formaletaAreaM2),
      };
    }

    if (!genericFamilyName.trim() || !genericSkuName.trim() || !genericSkuCategory) {
      return null;
    }

    return {
      familyName: genericFamilyName.trim(),
      familyCode: genericFamilyCode.trim() || undefined,
      skuName: genericSkuName.trim(),
      skuCategory: genericSkuCategory,
      skuUnitWeight:
        genericSkuUnitWeight === ''
          ? undefined
          : normalizeWeightToKg(Number(genericSkuUnitWeight), genericWeightUnit || 'KG'),
      skuPrice: genericSkuPrice === '' ? undefined : Number(genericSkuPrice),
      skuSubrentalPrice:
        genericSkuSubrentalPrice === '' ? undefined : Number(genericSkuSubrentalPrice),
      areaM2: genericAreaM2 === '' ? undefined : Number(genericAreaM2),
    };
  }, [
    formaletaIsAccessory,
    formaletaAccessoryName,
    formaletaX,
    formaletaY,
    formaletaSkuUnitWeight,
    formaletaSkuPrice,
    formaletaSkuSubrentalPrice,
    formaletaAreaM2,
    formaletaWeightUnit,
    genericFamilyName,
    genericFamilyCode,
    genericSkuName,
    genericSkuCategory,
    genericSkuUnitWeight,
    genericSkuPrice,
    genericSkuSubrentalPrice,
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
        category: builtItem.skuCategory,
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
    setItemConfigOpen(false);

    const defaultWeightUnit = (weightUnits[0] as WeightUnit | undefined) ?? '';
    const defaultGenericCategory = skuCategories.find((entry) => entry !== 'FORMALETA') ?? '';

    if (type === 'FORMALETA') {
      setFormaletaX('0,10');
      setFormaletaY(String(FORMALETA_Y_OPTIONS[0]));
      setFormaletaIsAccessory(false);
      setFormaletaAccessoryName('');
      setFormaletaSkuUnitWeight('');
      setFormaletaSkuPrice('');
      setFormaletaSkuSubrentalPrice('');
      setFormaletaAreaM2('');
      setFormaletaWeightUnit(defaultWeightUnit);
      return;
    }

    setGenericFamilyName('');
    setGenericFamilyCode('');
    setGenericSkuName('');
    setGenericSkuCategory(defaultGenericCategory);
    setGenericSkuUnitWeight('');
    setGenericSkuPrice('');
    setGenericSkuSubrentalPrice('');
    setGenericAreaM2('');
    setGenericWeightUnit(defaultWeightUnit);
  };

  const clearAllInputs = () => {
    const defaultWeightUnit = (weightUnits[0] as WeightUnit | undefined) ?? '';
    const defaultGenericCategory = skuCategories.find((entry) => entry !== 'FORMALETA') ?? '';

    setItemType(null);
    setItemTypeSelection(null);
    setTemplateSkuId(null);
    setItemConfigOpen(false);
    setIsItemConfigured(false);

    setFormaletaX('0,10');
    setFormaletaY(String(FORMALETA_Y_OPTIONS[0]));
    setFormaletaIsAccessory(false);
    setFormaletaAccessoryName('');
    setFormaletaSkuUnitWeight('');
    setFormaletaSkuPrice('');
    setFormaletaSkuSubrentalPrice('');
    setFormaletaAreaM2('');
    setFormaletaWeightUnit(defaultWeightUnit);

    setGenericFamilyName('');
    setGenericFamilyCode('');
    setGenericSkuName('');
    setGenericSkuCategory(defaultGenericCategory);
    setGenericSkuUnitWeight('');
    setGenericSkuPrice('');
    setGenericSkuSubrentalPrice('');
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
        setItemConfigOpen(false);
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
    } else {
      if (!genericFamilyName.trim()) {
        setError('Ingresa el tipo/familia para el item genérico');
        return;
      }
      if (!genericSkuName.trim()) {
        setError('Ingresa el nombre del SKU para el item genérico');
        return;
      }
      if (!genericSkuCategory) {
        setError('Selecciona la categoría del SKU');
        return;
      }
      if (genericSkuUnitWeight !== '' && !genericWeightUnit) {
        setError('Selecciona unidad de peso');
        return;
      }
    }

    setIsItemConfigured(true);
    setItemConfigOpen(false);
  };

  const applyTemplate = (skuId: string | null) => {
    setTemplateSkuId(skuId);
    if (!skuId) return;
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
        setFormaletaIsAccessory(false);
        setFormaletaAccessoryName('');
        setFormaletaX(match[1].replace('.', ','));
        const yParsed = Number(match[2].replace(',', '.'));
        const nearestY = FORMALETA_Y_OPTIONS.find((value) => Math.abs(value - yParsed) < 0.0001);
        setFormaletaY(String(nearestY ?? FORMALETA_Y_OPTIONS[0]));
        setFormaletaSkuUnitWeight(template.unitWeight ?? '');
        setFormaletaSkuPrice(template.price ?? '');
        setFormaletaSkuSubrentalPrice(template.subrentalPrice ?? '');
        setFormaletaAreaM2(template.areaM2 ?? '');
      } else {
        setFormaletaIsAccessory(true);
        setFormaletaAccessoryName(skuName.toUpperCase());
        setFormaletaSkuUnitWeight('');
        setFormaletaSkuPrice('');
        setFormaletaSkuSubrentalPrice('');
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
    setGenericSkuCategory(template.category);
    setGenericSkuUnitWeight(template.unitWeight ?? '');
    setGenericSkuPrice(template.price ?? '');
    setGenericSkuSubrentalPrice(template.subrentalPrice ?? '');
    setGenericAreaM2(template.areaM2 ?? '');
    setIsItemConfigured(true);
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (!itemType) {
      setError('Selecciona el tipo de item');
      return;
    }

    if (!isItemConfigured || !builtItem) {
      setError('Configura el item antes de agregar stock');
      return;
    }

    if (!ownerWarehouseId) {
      setError('Selecciona la bodega dueña');
      return;
    }

    if (!warehouseId) {
      setError('Selecciona la bodega ubicación inicial');
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
          category: builtItem.skuCategory,
          unitWeight: builtItem.skuUnitWeight,
          price: builtItem.skuPrice,
          subrentalPrice: builtItem.skuSubrentalPrice,
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
      <Modal
        opened={itemConfigOpen}
        onClose={() => setItemConfigOpen(false)}
        title={itemType === 'FORMALETA' ? 'Configurar Formaleta' : 'Configurar item genérico'}
        centered
      >
        <Stack gap="md">
          {itemType === 'FORMALETA' ? (
            <>
              <Switch
                label="¿Accesorio de formaleta?"
                checked={formaletaIsAccessory}
                onChange={(event) => setFormaletaIsAccessory(event.currentTarget.checked)}
              />
              {formaletaIsAccessory ? (
                <TextInput
                  label="Nombre del accesorio"
                  value={formaletaAccessoryName}
                  onChange={(event) => setFormaletaAccessoryName(event.currentTarget.value)}
                  placeholder="Ej: CUÑA, CRUCETA"
                  required
                />
              ) : (
                <>
                  <TextInput
                    label="Medida X (metros)"
                    value={formaletaX}
                    onChange={(event) => setFormaletaX(event.currentTarget.value)}
                    inputMode="decimal"
                    description="Ejemplo: 0.10, 0.20, 0.50"
                    placeholder="0,10"
                    required
                  />
                  <Select
                    label="Medida Y (metros)"
                    data={FORMALETA_Y_OPTIONS.map((value) => ({
                      value: String(value),
                      label: formatMeasure(value),
                    }))}
                    value={formaletaY}
                    onChange={(value) => setFormaletaY(value ?? String(FORMALETA_Y_OPTIONS[0]))}
                    required
                  />
                  <NumberInput
                    label="Peso unidad (opcional)"
                    value={formaletaSkuUnitWeight}
                    onChange={(value) => setFormaletaSkuUnitWeight(typeof value === 'number' ? value : '')}
                    min={0}
                    step={0.1}
                  />
                  <NumberInput
                    label="Precio (opcional)"
                    value={formaletaSkuPrice}
                    onChange={(value) => setFormaletaSkuPrice(typeof value === 'number' ? value : '')}
                    min={0}
                    step={1000}
                  />
                  <NumberInput
                    label="Precio subalquiler (opcional)"
                    value={formaletaSkuSubrentalPrice}
                    onChange={(value) =>
                      setFormaletaSkuSubrentalPrice(typeof value === 'number' ? value : '')
                    }
                    min={0}
                    step={1000}
                  />
                  <NumberInput
                    label="Área m² (opcional)"
                    value={formaletaAreaM2}
                    onChange={(value) => setFormaletaAreaM2(typeof value === 'number' ? value : '')}
                    min={0}
                    step={0.01}
                  />
                  <Select
                    label="Unidad de peso"
                    data={weightUnitOptions}
                    value={formaletaWeightUnit}
                    onChange={(value) => setFormaletaWeightUnit((value as WeightUnit | null) ?? '')}
                    searchable
                    nothingFoundMessage="Sin unidades"
                  />
                </>
              )}
            </>
          ) : (
            <>
              <TextInput
                label="Tipo/Familia"
                value={genericFamilyName}
                onChange={(event) => setGenericFamilyName(event.currentTarget.value)}
                placeholder="Ej: ANDAMIO"
                required
              />
              <TextInput
                label="Código de familia (opcional)"
                value={genericFamilyCode}
                onChange={(event) => setGenericFamilyCode(event.currentTarget.value)}
              />
              <TextInput
                label="Nombre del SKU"
                value={genericSkuName}
                onChange={(event) => setGenericSkuName(event.currentTarget.value)}
                placeholder="Ej: ANDAMIO TIPO EUROPEO"
                required
              />
              <Select
                label="Categoría"
                data={categoryOptions}
                value={genericSkuCategory}
                onChange={(value) => setGenericSkuCategory(value ?? '')}
                searchable
                nothingFoundMessage="Sin categorías"
                required
              />
              <NumberInput
                label="Peso unidad (opcional)"
                value={genericSkuUnitWeight}
                onChange={(value) => setGenericSkuUnitWeight(typeof value === 'number' ? value : '')}
                min={0}
                step={0.1}
              />
              <NumberInput
                label="Precio (opcional)"
                value={genericSkuPrice}
                onChange={(value) => setGenericSkuPrice(typeof value === 'number' ? value : '')}
                min={0}
                step={1000}
              />
              <NumberInput
                label="Precio subalquiler (opcional)"
                value={genericSkuSubrentalPrice}
                onChange={(value) =>
                  setGenericSkuSubrentalPrice(typeof value === 'number' ? value : '')
                }
                min={0}
                step={1000}
              />
              <NumberInput
                label="Área m² (opcional)"
                value={genericAreaM2}
                onChange={(value) => setGenericAreaM2(typeof value === 'number' ? value : '')}
                min={0}
                step={0.01}
              />
              <Select
                label="Unidad de peso"
                data={weightUnitOptions}
                value={genericWeightUnit}
                onChange={(value) => setGenericWeightUnit((value as WeightUnit | null) ?? '')}
                searchable
                nothingFoundMessage="Sin unidades"
              />
            </>
          )}

          <Group justify="flex-end" className="mobile-actions">
            <Button variant="default" onClick={() => setItemConfigOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={applyTypeConfiguration}>Aplicar</Button>
          </Group>
        </Stack>
      </Modal>

      <Paper shadow="sm" p="xl" radius="md" withBorder>
        <Title order={2}>Agregar stock</Title>
        <Text c="dimmed" mt="xs">
          Crea items bulk por tipo y genera el JSON correcto para inventario.
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
            <Text fw={600}>Plantilla</Text>
            <Select
              label="Usar plantilla existente (opcional)"
              placeholder="Busca un item ya creado"
              searchable
              clearable
              data={templateOptions}
              value={templateSkuId}
              onChange={applyTemplate}
            />
          </Stack>

          <Stack gap="xs">
            <Text fw={600}>Tipo de item</Text>
            <Select
              label="Tipo"
              data={typeOptions}
              value={itemTypeSelection}
              onChange={(value) => {
                setItemTypeSelection(value);
                if (!value) {
                  setItemType(null);
                  return;
                }

                if (value === 'FORMALETA') {
                  setItemType('FORMALETA');
                  resetTypeForm('FORMALETA');
                  setItemConfigOpen(true);
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
                setItemConfigOpen(true);
              }}
              placeholder={loading ? 'Cargando...' : 'Selecciona un tipo'}
              disabled={loading}
              required
            />
            {builtItem ? (
              <Text size="sm" c="dimmed">
                {`Item: ${builtItem.familyName} / ${builtItem.skuName}`}
              </Text>
            ) : (
              <Text size="sm" c="dimmed">
                Configura el item para generar el JSON de creación.
              </Text>
            )}
          </Stack>

          <Divider />

          <Stack gap="xs">
            <Text fw={600}>Movimiento inicial</Text>
            <Group grow className="mobile-stack">
              <Select
                label="Bodega dueña"
                data={warehouseOptions}
                value={ownerWarehouseId}
                onChange={(value) => setOwnerWarehouseId(value)}
                required
              />
              <Select
                label="Bodega ubicación inicial"
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

          <Divider />

          <Stack gap="xs">
            <Text fw={600}>JSON generado</Text>
            <Paper withBorder p="md" radius="md" bg="gray.0" className="mobile-json-preview">
              <Text
                component="pre"
                ff="monospace"
                size="xs"
                style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {JSON.stringify(payloadPreview, null, 2)}
              </Text>
            </Paper>
          </Stack>

          <Group justify="flex-end" className="mobile-actions">
            <Button variant="default" onClick={() => router.back()}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} loading={saving}>
              Agregar stock
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Container>
  );
}
