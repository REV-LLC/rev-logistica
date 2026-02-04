'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Container,
  Divider,
  Group,
  Paper,
  Radio,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  NumberInput
} from '@mantine/core';
import { api, ApiError } from '@/lib/api';
import WarehouseSelect from '@/components/WarehouseSelect';

const MOVEMENT_SOURCE = [
  { value: 'warehouse', label: 'Bodega' },
  { value: 'on-site', label: 'On-site' },
  { value: 'catalog', label: 'Catálogo' }
];

type InventoryBulk = {
  skuId: string;
  skuName: string | null;
  quantity: number;
};

type InventorySerial = {
  assetId: string;
  serialOrEngine: string | null;
  description: string | null;
  quantity: number;
  skuId?: string | null;
};

type CatalogSku = {
  skuId: string;
  name: string;
  controlType: 'BULK' | 'SERIAL';
};

type CatalogAsset = {
  assetId: string;
  serialOrEngine: string | null;
  skuId: string | null;
};

type Employee = { id: string; name: string };
type Customer = { id: string; name: string };
type CustomerWorksite = {
  id: string;
  alias: string | null;
  worksite: { id: string; name: string; address: string | null };
};

type Vehicle = { id: string; plate?: string | null; name?: string | null };

type SelectedItem = {
  type: 'bulk' | 'serial';
  skuId?: string;
  assetId?: string;
  name: string;
  serial?: string | null;
  quantity?: number;
  ownerId?: string | null;
};

export default function RemisionDevolucionPage() {
  const router = useRouter();
  const [docType, setDocType] = useState<'REMISSION' | 'RETURN'>('REMISSION');
  const [consecutive, setConsecutive] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [docDate, setDocDate] = useState('');
  const [cutOffDate, setCutOffDate] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'WAREHOUSE' | 'ON_SITE'>('WAREHOUSE');
  const [customerWorksiteId, setCustomerWorksiteId] = useState('');
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [dispatcherId, setDispatcherId] = useState<string | null>(null);

  const [sourceMode, setSourceMode] = useState('warehouse');
  const [sourceWarehouseId, setSourceWarehouseId] = useState<string | null>(null);
  const [sourceWorksiteId, setSourceWorksiteId] = useState('');

  const [bulkItems, setBulkItems] = useState<InventoryBulk[]>([]);
  const [serialItems, setSerialItems] = useState<InventorySerial[]>([]);
  const [catalogSkus, setCatalogSkus] = useState<CatalogSku[]>([]);
  const [catalogAssets, setCatalogAssets] = useState<CatalogAsset[]>([]);

  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [bulkSelect, setBulkSelect] = useState<string | null>(null);
  const [serialSelect, setSerialSelect] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [worksites, setWorksites] = useState<CustomerWorksite[]>([]);
  const [worksitesLoading, setWorksitesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [emps, vehs] = await Promise.all([
          api<Employee[]>('/employees', { method: 'GET' }),
          api<Vehicle[]>('/vehicles', { method: 'GET' })
        ]);
      if (!mounted) return;
      setEmployees(emps);
      setVehicles(vehs);
    } catch (err) {
      if (!mounted) return;
    }
  };
  load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadCustomers = async () => {
      try {
        const data = await api<Customer[]>('/customers', { method: 'GET' });
        if (!mounted) return;
        setCustomers(data);
      } catch {
        if (!mounted) return;
      }
    };
    loadCustomers();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadWorksites = async () => {
      if (!customerId) {
        setWorksites([]);
        return;
      }
      setWorksitesLoading(true);
      try {
        const data = await api<CustomerWorksite[]>(
          `/customers/${customerId}/worksites`,
          { method: 'GET' }
        );
        if (!mounted) return;
        setWorksites(data);
      } catch {
        if (!mounted) return;
      } finally {
        if (mounted) setWorksitesLoading(false);
      }
    };
    loadWorksites();
    return () => {
      mounted = false;
    };
  }, [customerId]);

  const loadInventory = async () => {
    setLoadingInventory(true);
    setError(null);
    try {
      if (sourceMode === 'warehouse') {
        if (!sourceWarehouseId) throw new Error('Selecciona una bodega');
        const data = await api<{ bulk: InventoryBulk[]; serial: InventorySerial[] }>(
          `/inventory/warehouse/${sourceWarehouseId}`,
          { method: 'GET' }
        );
        setBulkItems(data.bulk);
        setSerialItems(data.serial);
      } else if (sourceMode === 'on-site') {
        if (!sourceWorksiteId) throw new Error('Ingresa un on-site');
        const data = await api<{ bulk: InventoryBulk[]; serial: InventorySerial[] }>(
          `/inventory/on-site/${sourceWorksiteId}`,
          { method: 'GET' }
        );
        setBulkItems(data.bulk);
        setSerialItems(data.serial);
      } else {
        const data = await api<{ skus: CatalogSku[]; assets: CatalogAsset[] }>(
          '/catalog/items',
          { method: 'GET' }
        );
        setCatalogSkus(data.skus);
        setCatalogAssets(data.assets);
        setBulkItems(
          data.skus
            .filter((sku) => sku.controlType === 'BULK')
            .map((sku) => ({ skuId: sku.skuId, skuName: sku.name, quantity: 0 }))
        );
        setSerialItems(
          data.assets.map((asset) => ({
            assetId: asset.assetId,
            serialOrEngine: asset.serialOrEngine,
            description: null,
            quantity: 1,
            skuId: asset.skuId
          }))
        );
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error cargando inventario');
      }
    } finally {
      setLoadingInventory(false);
    }
  };

  useEffect(() => {
    setBulkItems([]);
    setSerialItems([]);
    setCatalogSkus([]);
    setCatalogAssets([]);
    setBulkSelect(null);
    setSerialSelect(null);
  }, [sourceMode]);

  const addBulkItem = (item: InventoryBulk) => {
    setSelectedItems((prev) => {
      const exists = prev.find((entry) => entry.skuId === item.skuId && entry.type === 'bulk');
      if (exists) return prev;
      return [
        ...prev,
        {
          type: 'bulk',
          skuId: item.skuId,
          name: item.skuName ?? item.skuId,
          quantity: 1,
          ownerId: null
        }
      ];
    });
  };

  const addSerialItem = (item: InventorySerial) => {
    setSelectedItems((prev) => {
      const exists = prev.find((entry) => entry.assetId === item.assetId && entry.type === 'serial');
      if (exists) return prev;
      return [
        ...prev,
        {
          type: 'serial',
          assetId: item.assetId,
          name: item.description ?? item.serialOrEngine ?? item.assetId,
          serial: item.serialOrEngine,
          ownerId: null
        }
      ];
    });
  };

  const updateSelected = (index: number, updates: Partial<SelectedItem>) => {
    setSelectedItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  };

  const removeSelected = (index: number) => {
    setSelectedItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitResult(null);
    setError(null);
    try {
      if (!docDate || !consecutive || !customerId) {
        throw new Error('Completa los campos obligatorios.');
      }
      if (!businessName) {
        throw new Error('Selecciona una razón social válida.');
      }
      if (!selectedItems.length) {
        throw new Error('Selecciona al menos un item.');
      }

      const payload = {
        type: docType,
        consecutive,
        businessName,
        customerId,
        docDate,
        cutOffDate: docType === 'RETURN' && cutOffDate ? cutOffDate : null,
        warehouseId: warehouseId ?? null,
        customerWorksiteId: customerWorksiteId || null,
        deliveryMode: docType === 'REMISSION' ? deliveryMode : null,
        vehicleId: deliveryMode === 'ON_SITE' ? vehicleId : null,
        driverId: deliveryMode === 'ON_SITE' ? driverId : null,
        dispatcherId: deliveryMode === 'WAREHOUSE' ? dispatcherId : null,
        items: selectedItems.map((item) => ({
          skuId: item.type === 'bulk' ? item.skuId : null,
          assetId: item.type === 'serial' ? item.assetId : null,
          quantity: item.type === 'bulk' ? item.quantity : 1,
          ownerId: item.ownerId ?? null
        }))
      } as const;

      const created = await api<{ id: string }>('/documents', {
        method: 'POST',
        json: payload
      });

      const movementItems = selectedItems.map((item) =>
        item.type === 'bulk'
          ? { skuId: item.skuId, quantity: item.quantity }
          : { assetId: item.assetId }
      );

      if (docType === 'REMISSION') {
        if (deliveryMode === 'WAREHOUSE') {
          await api('/inventory/out', {
            method: 'POST',
            json: {
              warehouseId,
              customerWorksiteId,
              items: movementItems,
              documentId: created.id
            }
          });
        } else {
          await api('/inventory/on-site', {
            method: 'POST',
            json: {
              customerWorksiteId,
              items: movementItems,
              documentId: created.id
            }
          });
        }
      } else {
        await api('/inventory/in', {
          method: 'POST',
          json: {
            warehouseId,
            customerWorksiteId,
            items: movementItems,
            documentId: created.id
          }
        });
      }

      setSubmitResult(`Documento creado y movimiento registrado (${created.id}).`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al guardar documento.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main>
      <Container size="lg" py="xl">
        <Paper shadow="sm" p="xl" radius="md" withBorder>
          <Title order={2}>Remisión / Devolución</Title>
          <Text c="dimmed">Ingresa los datos del documento real.</Text>

          <Radio.Group
            mt="md"
            value={docType}
            onChange={(value) => setDocType(value as 'REMISSION' | 'RETURN')}
            label="Tipo"
          >
            <Group mt="xs">
              <Radio value="REMISSION" label="Remisión" />
              <Radio value="RETURN" label="Devolución" />
            </Group>
          </Radio.Group>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mt="md">
            <TextInput
              label="Consecutivo"
              value={consecutive}
              onChange={(event) => setConsecutive(event.target.value)}
              required
            />
            <Select
              label="Razón social"
              value={customerId}
              onChange={(value) => {
                setCustomerId(value);
                const found = customers.find((customer) => customer.id === value);
                setBusinessName(found?.name ?? '');
                setCustomerWorksiteId('');
              }}
              data={customers.map((customer) => ({
                value: customer.id,
                label: customer.name
              }))}
              searchable
              clearable
              required
              placeholder="Selecciona cliente"
            />
            <TextInput
              label="Fecha"
              type="date"
              value={docDate}
              onChange={(event) => setDocDate(event.target.value)}
              required
            />
            {docType === 'RETURN' && (
              <TextInput
                label="Fecha de corte (opcional)"
                type="date"
                value={cutOffDate}
                onChange={(event) => setCutOffDate(event.target.value)}
              />
            )}
          </SimpleGrid>

          {docType === 'REMISSION' && (
            <Radio.Group
              mt="md"
              value={deliveryMode}
              onChange={(value) => setDeliveryMode(value as 'WAREHOUSE' | 'ON_SITE')}
              label="Entrega"
            >
              <Group mt="xs">
                <Radio value="WAREHOUSE" label="Despacho en bodega" />
                <Radio value="ON_SITE" label="Entrega on-site" />
              </Group>
            </Radio.Group>
          )}

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mt="md">
            <WarehouseSelect value={warehouseId} onChange={setWarehouseId} />
            <Select
              label="Obra (worksite)"
              value={customerWorksiteId}
              onChange={(value) => setCustomerWorksiteId(value ?? '')}
              data={worksites.map((item) => ({
                value: item.id,
                label: item.alias
                  ? `${item.alias} · ${item.worksite.name}`
                  : item.worksite.name
              }))}
              searchable
              clearable
              placeholder={customerId ? 'Selecciona obra' : 'Selecciona cliente primero'}
              disabled={!customerId || worksitesLoading}
            />
            {docType === 'REMISSION' && deliveryMode === 'ON_SITE' && (
              <Select
                label="Vehículo"
                value={vehicleId}
                onChange={(value) => setVehicleId(value)}
                data={vehicles.map((v) => ({
                  value: v.id,
                  label: v.plate ? `${v.plate} ${v.name ?? ''}`.trim() : v.name ?? v.id
                }))}
                searchable
                clearable
              />
            )}
            {docType === 'REMISSION' && deliveryMode === 'ON_SITE' && (
              <Select
                label="Conductor"
                value={driverId}
                onChange={(value) => setDriverId(value)}
                data={employees.map((e) => ({ value: e.id, label: e.name }))}
                searchable
                clearable
              />
            )}
            {docType === 'REMISSION' && deliveryMode === 'WAREHOUSE' && (
              <Select
                label="Despachador"
                value={dispatcherId}
                onChange={(value) => setDispatcherId(value)}
                data={employees.map((e) => ({ value: e.id, label: e.name }))}
                searchable
                clearable
              />
            )}
          </SimpleGrid>
        </Paper>

        <Paper shadow="sm" p="xl" radius="md" withBorder mt="lg">
          <Title order={4}>Items del documento</Title>
          <Text c="dimmed">Busca y agrega; la tabla se llena abajo.</Text>

          <Group mt="md" align="flex-end" wrap="wrap">
            <Select
              label="Origen"
              value={sourceMode}
              onChange={(value) => setSourceMode(value ?? 'warehouse')}
              data={MOVEMENT_SOURCE}
            />
            {sourceMode === 'warehouse' && (
              <div style={{ minWidth: 260 }}>
                <WarehouseSelect value={sourceWarehouseId} onChange={setSourceWarehouseId} />
              </div>
            )}
            {sourceMode === 'on-site' && (
              <TextInput
                label="On-site ID"
                value={sourceWorksiteId}
                onChange={(event) => setSourceWorksiteId(event.target.value)}
              />
            )}
            <Button onClick={loadInventory} loading={loadingInventory}>
              Cargar items
            </Button>
          </Group>

          <Divider my="md" />

          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Select
                label="Agregar BULK"
                placeholder={bulkItems.length ? 'Busca por nombre o SKU' : 'Cargar items primero'}
                searchable
                clearable
                value={bulkSelect}
                onChange={(value) => {
                  const found = bulkItems.find((item) => item.skuId === value);
                  if (found) {
                    addBulkItem(found);
                    setBulkSelect(null);
                  } else {
                    setBulkSelect(value);
                  }
                }}
                data={bulkItems.map((item) => ({
                  value: item.skuId,
                  label: `${item.skuName ?? 'SKU'} · ${item.quantity}`
                }))}
              />
              <Select
                label="Agregar SERIAL"
                placeholder={serialItems.length ? 'Busca por serial o asset' : 'Cargar items primero'}
                searchable
                clearable
                value={serialSelect}
                onChange={(value) => {
                  const found = serialItems.find((item) => item.assetId === value);
                  if (found) {
                    addSerialItem(found);
                    setSerialSelect(null);
                  } else {
                    setSerialSelect(value);
                  }
                }}
                data={serialItems.map((item) => ({
                  value: item.assetId,
                  label: `${item.serialOrEngine ?? item.assetId} · ${item.description ?? ''}`.trim()
                }))}
              />
            </SimpleGrid>
          </Stack>
          <Divider my="md" />

          <Title order={4}>Seleccionados</Title>
          <Table striped highlightOnHover mt="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Item</Table.Th>
                <Table.Th>Cantidad</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {selectedItems.map((item, index) => (
                <Table.Tr key={`${item.type}-${item.skuId ?? item.assetId}-${index}`}>
                  <Table.Td>
                    <Text fw={600}>{item.name}</Text>
                    {item.serial && (
                      <Text size="xs" c="dimmed">
                        {item.serial}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {item.type === 'bulk' ? (
                      <NumberInput
                        min={0}
                        value={item.quantity ?? 1}
                        onChange={(value) =>
                          updateSelected(index, {
                            quantity: typeof value === 'number' ? value : 1
                          })
                        }
                      />
                    ) : (
                      <Text>1</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Button variant="subtle" color="red" onClick={() => removeSelected(index)}>
                      Quitar
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          {error && (
            <Text c="red" mt="sm">
              {error}
            </Text>
          )}
          {submitResult && (
            <Text c="green" mt="sm">
              {submitResult}
            </Text>
          )}

          <Group mt="md">
            <Button onClick={handleSubmit} loading={submitting}>
              Guardar y ejecutar
            </Button>
          </Group>
        </Paper>
      </Container>
    </main>
  );
}
