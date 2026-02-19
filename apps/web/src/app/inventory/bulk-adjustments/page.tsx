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
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useRouter } from 'next/navigation';
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
  };
  ownerWarehouseId: string;
  warehouseId: string;
  quantity: number;
};

const ITEM_TYPE_OPTIONS = [
  { value: 'FORMALETA', label: 'Formaleta' },
  { value: 'GENERIC', label: 'Otro (genérico)' },
] as const;

const FORMALETA_Y_OPTIONS = [0.3, 0.6, 1.2, 2.4] as const;

const formatMeasure = (value: number) => value.toFixed(2).replace('.', ',');

const buildFormaletaSkuName = (xMeasure: number, yMeasure: number) =>
  `FORMALETA (${formatMeasure(xMeasure)})M x (${formatMeasure(yMeasure)})M`;

const normalizeWeightToKg = (value: number, unit: string) =>
  unit === 'TON' ? value * 1000 : value;

export default function AddBulkStockPage() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [weightUnits, setWeightUnits] = useState<string[]>([]);
  const [skuCategories, setSkuCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [itemType, setItemType] = useState<ItemType | null>(null);
  const [itemConfigOpen, setItemConfigOpen] = useState(false);
  const [isItemConfigured, setIsItemConfigured] = useState(false);

  const [formaletaX, setFormaletaX] = useState<number | ''>(0.1);
  const [formaletaY, setFormaletaY] = useState<string>(String(FORMALETA_Y_OPTIONS[0]));
  const [formaletaSkuUnitWeight, setFormaletaSkuUnitWeight] = useState<number | ''>('');
  const [formaletaWeightUnit, setFormaletaWeightUnit] = useState<WeightUnit | ''>('');

  const [genericFamilyName, setGenericFamilyName] = useState('');
  const [genericFamilyCode, setGenericFamilyCode] = useState('');
  const [genericSkuName, setGenericSkuName] = useState('');
  const [genericSkuCategory, setGenericSkuCategory] = useState('');
  const [genericSkuUnitWeight, setGenericSkuUnitWeight] = useState<number | ''>('');
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
        const [warehouseData, weightUnitData, categoryData] = await Promise.all([
          api<Warehouse[]>('/warehouses'),
          api<string[]>('/skus/units'),
          api<string[]>('/skus/categories'),
        ]);
        if (!mounted) return;
        setWarehouses(warehouseData);
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

  const warehouseOptions = warehouses.map((warehouse) => ({
    value: warehouse.id,
    label: warehouse.name,
  }));
  const weightUnitOptions = weightUnits.map((unit) => ({ value: unit, label: unit }));
  const categoryOptions = skuCategories.map((category) => ({ value: category, label: category }));

  const builtItem = useMemo(() => {
    if (!itemType || !isItemConfigured) {
      return null;
    }

    if (itemType === 'FORMALETA') {
      const xValue = Number(formaletaX);
      const yValue = Number(formaletaY);
      if (!xValue || !yValue || xValue <= 0 || yValue <= 0) {
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
    };
  }, [
    formaletaX,
    formaletaY,
    formaletaSkuUnitWeight,
    formaletaWeightUnit,
    genericFamilyName,
    genericFamilyCode,
    genericSkuName,
    genericSkuCategory,
    genericSkuUnitWeight,
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
      setFormaletaX(0.1);
      setFormaletaY(String(FORMALETA_Y_OPTIONS[0]));
      setFormaletaSkuUnitWeight('');
      setFormaletaWeightUnit(defaultWeightUnit);
      return;
    }

    setGenericFamilyName('');
    setGenericFamilyCode('');
    setGenericSkuName('');
    setGenericSkuCategory(defaultGenericCategory);
    setGenericSkuUnitWeight('');
    setGenericWeightUnit(defaultWeightUnit);
  };

  const clearAllInputs = () => {
    const defaultWeightUnit = (weightUnits[0] as WeightUnit | undefined) ?? '';
    const defaultGenericCategory = skuCategories.find((entry) => entry !== 'FORMALETA') ?? '';

    setItemType(null);
    setItemConfigOpen(false);
    setIsItemConfigured(false);

    setFormaletaX(0.1);
    setFormaletaY(String(FORMALETA_Y_OPTIONS[0]));
    setFormaletaSkuUnitWeight('');
    setFormaletaWeightUnit(defaultWeightUnit);

    setGenericFamilyName('');
    setGenericFamilyCode('');
    setGenericSkuName('');
    setGenericSkuCategory(defaultGenericCategory);
    setGenericSkuUnitWeight('');
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
      const xValue = Number(formaletaX);
      const yValue = Number(formaletaY);
      if (!xValue || xValue <= 0) {
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
              <NumberInput
                label="Medida X (metros)"
                value={formaletaX}
                onChange={(value) => setFormaletaX(typeof value === 'number' ? value : '')}
                min={0.01}
                step={0.1}
                decimalScale={2}
                fixedDecimalScale
                description="Ejemplo: 0.10, 0.20, 0.50"
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
              <Select
                label="Unidad de peso"
                data={weightUnitOptions}
                value={formaletaWeightUnit}
                onChange={(value) => setFormaletaWeightUnit((value as WeightUnit | null) ?? '')}
                searchable
                nothingFoundMessage="Sin unidades"
              />
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
        <Title order={2}>Agregar stock (Bulk)</Title>
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
            <Group justify="space-between" className="mobile-stack">
              <Text fw={600}>Tipo de item</Text>
              <Button variant="light" size="xs" onClick={() => setItemConfigOpen(true)} disabled={!itemType}>
                {isItemConfigured ? 'Editar configuración' : 'Configurar item'}
              </Button>
            </Group>
            <Select
              label="Tipo"
              data={ITEM_TYPE_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              value={itemType}
              onChange={(value) => {
                const nextType = value as ItemType | null;
                setItemType(nextType);
                if (nextType) {
                  resetTypeForm(nextType);
                  if (nextType === 'FORMALETA') {
                    setItemConfigOpen(true);
                  }
                }
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
