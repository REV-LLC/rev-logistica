'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tabs,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { api, ApiError } from '@/lib/api';
import RawJsonPanel from '@/components/RawJsonPanel';

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
  category?: string | null;
  unit: string;
  controlType: 'BULK' | 'SERIAL';
  imageUrl?: string | null;
  assetFamilyId?: string | null;
  unitWeight?: number | null;
  active: boolean;
  createdAt: string;
};

type Asset = {
  id: string;
  serialOrEngine: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  skuId: string;
  assetFamilyId: string;
  internalNumber: number;
  warehouseOwnerId: string;
  warehouseCurrentId?: string | null;
  ownerId?: string | null;
  weight?: number | string | null;
  active: boolean;
  createdAt: string;
  sku?: {
    id: string;
    name: string;
    controlType: 'BULK' | 'SERIAL';
  } | null;
  assetFamily?: AssetFamily | null;
  warehouseOwner?: Warehouse | null;
  warehouseCurrent?: Warehouse | null;
};

type SkuForm = {
  name: string;
  category: string;
  unit: string;
  controlType: 'BULK' | 'SERIAL';
  imageUrl: string;
  assetFamilyId: string | null;
  unitWeight: number | '';
  active: boolean;
};

type AssetForm = {
  skuId: string;
  warehouseOwnerId: string;
  warehouseCurrentId: string | null;
  serialOrEngine: string;
  description: string;
  brand: string;
  model: string;
  active: boolean;
};

const emptySkuForm: SkuForm = {
  name: '',
  category: '',
  unit: '',
  controlType: 'BULK',
  imageUrl: '',
  assetFamilyId: null,
  unitWeight: '',
  active: true,
};

const emptyAssetForm: AssetForm = {
  skuId: '',
  warehouseOwnerId: '',
  warehouseCurrentId: null,
  serialOrEngine: '',
  description: '',
  brand: '',
  model: '',
  active: true,
};

export default function EquiposPage() {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [serialSkus, setSerialSkus] = useState<Sku[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetFamilies, setAssetFamilies] = useState<AssetFamily[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [skuUnits, setSkuUnits] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'skus' | 'assets'>('skus');

  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [editingSku, setEditingSku] = useState<Sku | null>(null);
  const [skuForm, setSkuForm] = useState<SkuForm>(emptySkuForm);
  const [skuSaving, setSkuSaving] = useState(false);

  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [assetForm, setAssetForm] = useState<AssetForm>(emptyAssetForm);
  const [assetSaving, setAssetSaving] = useState(false);

  const serialSkuMap = useMemo(() => {
    const map = new Map<string, Sku>();
    serialSkus.forEach((sku) => map.set(sku.id, sku));
    return map;
  }, [serialSkus]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [bulkSkuData, serialSkuData, assetData, familyData, warehouseData, unitData] =
        await Promise.all([
          api<Sku[]>('/skus?controlType=BULK'),
          api<Sku[]>('/skus?controlType=SERIAL'),
        api<Asset[]>('/assets'),
        api<AssetFamily[]>('/asset-families'),
        api<Warehouse[]>('/warehouses'),
        api<string[]>('/skus/units'),
      ]);
      setSkus(bulkSkuData);
      setSerialSkus(serialSkuData);
      setAssets(assetData);
      setAssetFamilies(familyData);
      setWarehouses(warehouseData);
      setSkuUnits(unitData);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error cargando equipos');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openNewSku = () => {
    setEditingSku(null);
    setSkuForm(emptySkuForm);
    setSkuModalOpen(true);
  };

  const openEditSku = (sku: Sku) => {
    setEditingSku(sku);
    setSkuForm({
      name: sku.name ?? '',
      category: sku.category ?? '',
      unit: sku.unit ?? '',
          controlType: sku.controlType ?? 'BULK',
      imageUrl: sku.imageUrl ?? '',
      assetFamilyId: sku.assetFamilyId ?? null,
      unitWeight: sku.unitWeight ?? '',
      active: sku.active,
    });
    setSkuModalOpen(true);
  };

  const saveSku = async () => {
    if (!skuForm.name.trim() || !skuForm.unit.trim()) {
      setError('Nombre y unidad son obligatorios');
      return;
    }
    setSkuSaving(true);
    setError(null);
    try {
      const payload = {
        name: skuForm.name.trim(),
        category: skuForm.category.trim() || undefined,
        unit: skuForm.unit.trim(),
        controlType: skuForm.controlType,
        imageUrl: skuForm.imageUrl.trim() || undefined,
        assetFamilyId: skuForm.assetFamilyId ?? undefined,
        unitWeight: skuForm.unitWeight === '' ? undefined : skuForm.unitWeight,
        active: skuForm.active,
      };

      if (editingSku) {
        await api(`/skus/${editingSku.id}`, { method: 'PATCH', json: payload });
      } else {
        await api('/skus', { method: 'POST', json: payload });
      }
      await loadData();
      setSkuModalOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error guardando SKU');
      }
    } finally {
      setSkuSaving(false);
    }
  };

  const deleteSku = async (sku: Sku) => {
    if (!window.confirm(`Eliminar SKU ${sku.name}?`)) return;
    setError(null);
    try {
      await api(`/skus/${sku.id}`, { method: 'DELETE' });
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error eliminando SKU');
      }
    }
  };

  const openNewAsset = () => {
    setEditingAsset(null);
    setAssetForm(emptyAssetForm);
    setAssetModalOpen(true);
  };

  const openEditAsset = (asset: Asset) => {
    setEditingAsset(asset);
    setAssetForm({
      skuId: asset.skuId ?? '',
      warehouseOwnerId: asset.warehouseOwnerId ?? '',
      warehouseCurrentId: asset.warehouseCurrentId ?? null,
      serialOrEngine: asset.serialOrEngine ?? '',
      description: asset.description ?? '',
      brand: asset.brand ?? '',
      model: asset.model ?? '',
      active: asset.active,
    });
    setAssetModalOpen(true);
  };

  const saveAsset = async () => {
    if (!assetForm.skuId || !assetForm.warehouseOwnerId) {
      setError('SKU y bodega dueña son obligatorios');
      return;
    }
    setAssetSaving(true);
    setError(null);
    try {
      const payload = editingAsset
        ? {
            description: assetForm.description.trim() || undefined,
            brand: assetForm.brand.trim() || undefined,
            model: assetForm.model.trim() || undefined,
            warehouseCurrentId: assetForm.warehouseCurrentId ?? undefined,
            active: assetForm.active,
          }
        : {
            skuId: assetForm.skuId,
            warehouseOwnerId: assetForm.warehouseOwnerId,
            warehouseCurrentId: assetForm.warehouseCurrentId ?? undefined,
            serialOrEngine: assetForm.serialOrEngine.trim() || undefined,
            description: assetForm.description.trim() || undefined,
            brand: assetForm.brand.trim() || undefined,
            model: assetForm.model.trim() || undefined,
            active: assetForm.active,
          };

      if (editingAsset) {
        await api(`/assets/${editingAsset.id}`, { method: 'PATCH', json: payload });
      } else {
        await api('/assets', { method: 'POST', json: payload });
      }
      await loadData();
      setAssetModalOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error guardando equipo único');
      }
    } finally {
      setAssetSaving(false);
    }
  };

  const deleteAsset = async (asset: Asset) => {
    if (!window.confirm(`Eliminar equipo único ${asset.serialOrEngine}?`)) return;
    setError(null);
    try {
      await api(`/assets/${asset.id}`, { method: 'DELETE' });
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error eliminando equipo único');
      }
    }
  };

  const skuOptions = skus.map((sku) => ({ value: sku.id, label: `${sku.name} (${sku.unit})` }));
  const serialSkuOptions = serialSkus.map((sku) => ({
    value: sku.id,
    label: `${sku.name} (${sku.unit})`,
  }));
  const familyOptions = assetFamilies.map((family) => ({
    value: family.id,
    label: `${family.code} - ${family.name}`,
  }));
  const warehouseOptions = warehouses.map((warehouse) => ({
    value: warehouse.id,
    label: warehouse.name,
  }));
  const unitOptions = skuUnits.map((unit) => ({ value: unit, label: unit }));

  return (
    <Container size="xl" py="xl">
      <Paper shadow="sm" p="xl" radius="md" withBorder>
        <Group justify="space-between" align="center" mb="md">
          <Title order={2}>Equipos</Title>
          <Group>
            {tab === 'skus' ? (
              <Button leftSection={<IconPlus size={16} />} onClick={openNewSku}>
                Nuevo SKU
              </Button>
            ) : (
              <Button leftSection={<IconPlus size={16} />} onClick={openNewAsset}>
                Nuevo equipo único
              </Button>
            )}
          </Group>
        </Group>

        {error && (
          <Text c="red" mb="md">
            {error}
          </Text>
        )}

        {loading ? (
          <Center py="xl">
            <Loader />
          </Center>
        ) : (
          <Tabs value={tab} onChange={(value) => setTab((value as 'skus' | 'assets') ?? 'skus')}>
            <Tabs.List>
              <Tabs.Tab value="skus">SKUs</Tabs.Tab>
              <Tabs.Tab value="assets">Equipos únicos</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="skus" pt="md">
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Nombre</Table.Th>
                    <Table.Th>Unidad</Table.Th>
                    <Table.Th>Peso</Table.Th>
                    <Table.Th>Categoría</Table.Th>
                    <Table.Th>Activo</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {skus.map((sku) => (
                    <Table.Tr key={sku.id}>
                      <Table.Td>{sku.name}</Table.Td>
                      <Table.Td>{sku.unit}</Table.Td>
                      <Table.Td>{sku.unitWeight ?? '-'}</Table.Td>
                      <Table.Td>{sku.category ?? '-'}</Table.Td>
                      <Table.Td>{sku.active ? 'Sí' : 'No'}</Table.Td>
                      <Table.Td>
                        <Group gap="xs" justify="flex-end">
                          <Button size="xs" variant="light" onClick={() => openEditSku(sku)}>
                            Editar
                          </Button>
                          <ActionIcon
                            color="red"
                            variant="light"
                            aria-label="Eliminar SKU"
                            onClick={() => deleteSku(sku)}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {!skus.length && (
                    <Table.Tr>
                      <Table.Td colSpan={6}>
                        <Text c="dimmed" ta="center">
                          Sin SKUs registrados.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Tabs.Panel>

            <Tabs.Panel value="assets" pt="md">
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Serial</Table.Th>
                    <Table.Th>SKU</Table.Th>
                    <Table.Th>Descripción</Table.Th>
                    <Table.Th>Marca</Table.Th>
                    <Table.Th>Modelo</Table.Th>
                    <Table.Th>Peso</Table.Th>
                    <Table.Th>Bodega dueña</Table.Th>
                    <Table.Th>Bodega actual</Table.Th>
                    <Table.Th>Activo</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {assets.map((asset) => (
                    <Table.Tr key={asset.id}>
                      <Table.Td>{asset.serialOrEngine}</Table.Td>
                      <Table.Td>
                        {asset.sku?.name ?? serialSkuMap.get(asset.skuId)?.name ?? asset.skuId}
                      </Table.Td>
                      <Table.Td>{asset.description ?? '-'}</Table.Td>
                      <Table.Td>{asset.brand ?? '-'}</Table.Td>
                      <Table.Td>{asset.model ?? '-'}</Table.Td>
                      <Table.Td>{asset.weight ?? '-'}</Table.Td>
                      <Table.Td>{asset.warehouseOwner?.name ?? '-'}</Table.Td>
                      <Table.Td>{asset.warehouseCurrent?.name ?? '-'}</Table.Td>
                      <Table.Td>{asset.active ? 'Sí' : 'No'}</Table.Td>
                      <Table.Td>
                        <Group gap="xs" justify="flex-end">
                          <Button size="xs" variant="light" onClick={() => openEditAsset(asset)}>
                            Editar
                          </Button>
                          <ActionIcon
                            color="red"
                            variant="light"
                            aria-label="Eliminar equipo único"
                            onClick={() => deleteAsset(asset)}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                {!assets.length && (
                  <Table.Tr>
                      <Table.Td colSpan={10}>
                      <Text c="dimmed" ta="center">
                          Sin equipos únicos registrados.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                </Table.Tbody>
              </Table>
            </Tabs.Panel>
          </Tabs>
        )}
      </Paper>

      <Modal
        opened={skuModalOpen}
        onClose={() => setSkuModalOpen(false)}
        title={editingSku ? 'Editar SKU' : 'Nuevo SKU'}
        size="lg"
      >
        <Stack>
          <TextInput
            label="Nombre"
            value={skuForm.name}
            onChange={(event) => setSkuForm({ ...skuForm, name: event.currentTarget.value })}
            required
          />
          <Group grow>
            <Select
              label="Control"
              data={[
                { value: 'BULK', label: 'Bulk' },
                { value: 'SERIAL', label: 'Serial' },
              ]}
              value={skuForm.controlType}
              onChange={(value) =>
                setSkuForm({ ...skuForm, controlType: (value as 'BULK' | 'SERIAL') ?? 'BULK' })
              }
            />
            <Select
              label="Unidad"
              data={unitOptions}
              value={skuForm.unit}
              onChange={(value) => setSkuForm({ ...skuForm, unit: value ?? '' })}
              required
              searchable
              nothingFoundMessage="Sin unidades"
            />
          </Group>
          <Group grow>
            <TextInput
              label="Categoría"
              value={skuForm.category}
              onChange={(event) => setSkuForm({ ...skuForm, category: event.currentTarget.value })}
            />
            <NumberInput
              label="Peso unidad"
              value={skuForm.unitWeight}
              onChange={(value) =>
                setSkuForm({ ...skuForm, unitWeight: typeof value === 'number' ? value : '' })
              }
              min={0}
              step={0.1}
            />
          </Group>
          <TextInput
            label="Imagen (URL)"
            value={skuForm.imageUrl}
            onChange={(event) => setSkuForm({ ...skuForm, imageUrl: event.currentTarget.value })}
          />
          <Select
            label="Familia de equipo"
            data={familyOptions}
            value={skuForm.assetFamilyId}
            onChange={(value) => setSkuForm({ ...skuForm, assetFamilyId: value })}
            placeholder="Sin familia"
            clearable
          />
          <Switch
            label="Activo"
            checked={skuForm.active}
            onChange={(event) => setSkuForm({ ...skuForm, active: event.currentTarget.checked })}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setSkuModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveSku} loading={skuSaving}>
              Guardar
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={assetModalOpen}
        onClose={() => setAssetModalOpen(false)}
        title={editingAsset ? 'Editar equipo único' : 'Nuevo equipo único'}
        size="lg"
      >
        <Stack>
          <Select
            label="SKU (serial)"
            data={serialSkuOptions}
            value={assetForm.skuId}
            onChange={(value) => setAssetForm({ ...assetForm, skuId: value ?? '' })}
            disabled={!!editingAsset}
            required
          />
          <Group grow>
            <Select
              label="Bodega dueña"
              data={warehouseOptions}
              value={assetForm.warehouseOwnerId}
              onChange={(value) => setAssetForm({ ...assetForm, warehouseOwnerId: value ?? '' })}
              disabled={!!editingAsset}
              required
            />
            <Select
              label="Bodega actual"
              data={warehouseOptions}
              value={assetForm.warehouseCurrentId}
              onChange={(value) => setAssetForm({ ...assetForm, warehouseCurrentId: value })}
              clearable
            />
          </Group>
          {!editingAsset && (
            <TextInput
              label="Serial (opcional)"
              value={assetForm.serialOrEngine}
              onChange={(event) =>
                setAssetForm({ ...assetForm, serialOrEngine: event.currentTarget.value })
              }
              placeholder="Se genera automáticamente si se deja vacío"
            />
          )}
          <Group grow>
            <TextInput
              label="Marca"
              value={assetForm.brand}
              onChange={(event) => setAssetForm({ ...assetForm, brand: event.currentTarget.value })}
            />
            <TextInput
              label="Modelo"
              value={assetForm.model}
              onChange={(event) => setAssetForm({ ...assetForm, model: event.currentTarget.value })}
            />
          </Group>
          <TextInput
            label="Descripción"
            value={assetForm.description}
            onChange={(event) =>
              setAssetForm({ ...assetForm, description: event.currentTarget.value })
            }
          />
          <Switch
            label="Activo"
            checked={assetForm.active}
            onChange={(event) => setAssetForm({ ...assetForm, active: event.currentTarget.checked })}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAssetModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveAsset} loading={assetSaving}>
              Guardar
            </Button>
          </Group>
        </Stack>
      </Modal>

      <RawJsonPanel data={{ skus, assets, assetFamilies, warehouses }} />
    </Container>
  );
}
