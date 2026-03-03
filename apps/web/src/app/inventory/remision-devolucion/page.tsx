'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Container,
  Divider,
  Group,
  Modal,
  Paper,
  Radio,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  NumberInput,
  Tooltip
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { api, ApiError } from '@/lib/api';
import WarehouseSelect from '@/components/WarehouseSelect';

type InventoryBulk = {
  skuId: string;
  skuName: string | null;
  ownerWarehouseId: string | null;
  ownerWarehouseName?: string | null;
  quantity: number;
};

type InventorySerial = {
  assetId: string;
  serialOrEngine: string | null;
  description: string | null;
  skuName?: string | null;
  brand?: string | null;
  model?: string | null;
  internalNumber?: number | null;
  quantity: number;
  skuId?: string | null;
  ownerWarehouseId: string | null;
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
type Warehouse = { id: string; name: string };

type SelectedItem = {
  type: 'bulk' | 'serial';
  bulkKey?: string;
  skuId?: string;
  assetId?: string;
  name: string;
  serial?: string | null;
  quantity?: number;
  ownerWarehouseId?: string | null;
};

const buildBulkKey = (item: { skuId: string; ownerWarehouseId: string | null }) =>
  `${item.skuId}::${item.ownerWarehouseId ?? 'none'}`;

const buildSerialDisplayName = (item: InventorySerial) => {
  const parts = [item.skuName, item.brand, item.model]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const base = parts.length ? parts.join(' ') : item.description ?? item.serialOrEngine ?? item.assetId;
  const internal = item.internalNumber != null ? ` #${item.internalNumber}` : '';
  return `${base}${internal}`.trim();
};

const helpLabel = (label: string, help: string, required = false) => (
  <Group gap={6} align="center">
    <Text span>{label}</Text>
    {required ? (
      <Text span c="red" fw={700}>
        *
      </Text>
    ) : null}
    <Tooltip label={help} multiline w={280} withArrow>
      <Text span c="dimmed" fw={700} style={{ cursor: 'help' }}>
        ?
      </Text>
    </Tooltip>
  </Group>
);

function withDocPrefix(value: string, docType: 'REMISSION' | 'RETURN') {
  const prefix = docType === 'REMISSION' ? 'RM' : 'DV';
  const cleaned = value.trim().replace(/^(RM|DV)[\s\-_]*/i, '');
  return `${prefix}${cleaned}`;
}

export default function RemisionDevolucionPage() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const router = useRouter();
  const [docType, setDocType] = useState<'REMISSION' | 'RETURN'>('REMISSION');
  const [consecutive, setConsecutive] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [docDate, setDocDate] = useState('');
  const [cutOffDate, setCutOffDate] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'WAREHOUSE' | 'ON_SITE'>('WAREHOUSE');
  const [customerWorksiteId, setCustomerWorksiteId] = useState('');
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [dispatcherId, setDispatcherId] = useState<string | null>(null);

  const [sourceOwnerWarehouseId, setSourceOwnerWarehouseId] = useState<string | null>(null);
  const [sourceWorksiteId, setSourceWorksiteId] = useState<string | null>(null);

  const [bulkItems, setBulkItems] = useState<InventoryBulk[]>([]);
  const [serialItems, setSerialItems] = useState<InventorySerial[]>([]);

  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [bulkSelect, setBulkSelect] = useState<string | null>(null);
  const [serialSelect, setSerialSelect] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [worksites, setWorksites] = useState<CustomerWorksite[]>([]);
  const [worksitesLoading, setWorksitesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [itemsModalOpen, setItemsModalOpen] = useState(false);
  const sourceMode: 'warehouse' | 'on-site' = docType === 'REMISSION' ? 'warehouse' : 'on-site';
  const ownerWarehouseOptions = warehouses.map((warehouse) => ({
    value: warehouse.id,
    label: warehouse.name,
  }));

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [emps, vehs, whs] = await Promise.all([
          api<Employee[]>('/employees', { method: 'GET' }),
          api<Vehicle[]>('/vehicles', { method: 'GET' }),
          api<Warehouse[]>('/warehouses', { method: 'GET' }),
        ]);
        if (!mounted) return;
        setEmployees(emps);
        setVehicles(vehs);
        setWarehouses(whs);
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
        if (!sourceOwnerWarehouseId) throw new Error('Selecciona la bodega dueña para filtrar items.');
        const data = await api<{ bulk: InventoryBulk[]; serial: InventorySerial[] }>(
          `/inventory/warehouse/${sourceOwnerWarehouseId}`,
          { method: 'GET' }
        );
        setBulkItems(
          data.bulk.filter((item) => item.ownerWarehouseId === sourceOwnerWarehouseId),
        );
        setSerialItems(
          data.serial.filter((item) => item.ownerWarehouseId === sourceOwnerWarehouseId),
        );
      } else if (sourceMode === 'on-site') {
        if (!sourceWorksiteId) throw new Error('Selecciona una obra origen');
        const data = await api<{ bulk: InventoryBulk[]; serial: InventorySerial[] }>(
          `/inventory/on-site/${sourceWorksiteId}`,
          { method: 'GET' }
        );
        setBulkItems(data.bulk);
        setSerialItems(data.serial);
      }
      if (isMobile) {
        setItemsModalOpen(true);
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
    setBulkSelect(null);
    setSerialSelect(null);
    if (docType === 'REMISSION') {
      setSourceWorksiteId(null);
    } else {
      setSourceOwnerWarehouseId(null);
    }
  }, [docType]);

  const addBulkItem = (item: InventoryBulk) => {
    const bulkKey = buildBulkKey(item);
    setSelectedItems((prev) => {
      const exists = prev.find((entry) => entry.type === 'bulk' && entry.bulkKey === bulkKey);
      if (exists) return prev;
      return [
        ...prev,
        {
          type: 'bulk',
          bulkKey,
          skuId: item.skuId,
          name: item.skuName ?? item.skuId,
          quantity: 1,
          ownerWarehouseId: item.ownerWarehouseId
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
          name: buildSerialDisplayName(item),
          serial: item.serialOrEngine,
          ownerWarehouseId: item.ownerWarehouseId
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
      if (!selectedItems.length) {
        throw new Error('Selecciona al menos un item.');
      }
      if (!customerWorksiteId) {
        throw new Error('Selecciona la obra (worksite).');
      }
      if (docType === 'RETURN' && !warehouseId) {
        throw new Error('Selecciona la bodega para la devolución.');
      }
      if (docType === 'REMISSION' && deliveryMode === 'WAREHOUSE' && !warehouseId) {
        throw new Error('Selecciona la bodega de despacho.');
      }

      const documentPayload = {
        type: docType,
        status: 'CONFIRMED',
        number: withDocPrefix(consecutive, docType),
        warehouseId: warehouseId ?? undefined,
        customerWorksiteId: customerWorksiteId || undefined,
        notes: [
          `Fecha doc: ${docDate}`,
          docType === 'RETURN' && cutOffDate ? `Fecha corte: ${cutOffDate}` : null,
          docType === 'REMISSION' ? `Entrega: ${deliveryMode}` : null,
          deliveryMode === 'ON_SITE' && vehicleId ? `Vehículo: ${vehicleId}` : null,
          deliveryMode === 'ON_SITE' && driverId ? `Conductor: ${driverId}` : null,
          deliveryMode === 'WAREHOUSE' && dispatcherId ? `Despachador: ${dispatcherId}` : null
        ].filter(Boolean).join(' | ')
      } as const;

      const created = await api<{ id: string }>('/documents', {
        method: 'POST',
        json: documentPayload
      });

      const movementItems = selectedItems.map((item) => {
        if (!item.ownerWarehouseId) {
          throw new Error(`Falta bodega dueña para item ${item.name}`);
        }
        return item.type === 'bulk'
          ? {
              skuId: item.skuId,
              quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
              ownerWarehouseId: item.ownerWarehouseId
            }
          : {
              assetId: item.assetId,
              ownerWarehouseId: item.ownerWarehouseId
            };
      });

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
      setConsecutive('');
      setCustomerId(null);
      setDocDate('');
      setCutOffDate('');
      setDeliveryMode('WAREHOUSE');
      setCustomerWorksiteId('');
      setWarehouseId(null);
      setVehicleId(null);
      setDriverId(null);
      setDispatcherId(null);
      setSourceOwnerWarehouseId(null);
      setSourceWorksiteId(null);
      setBulkItems([]);
      setSerialItems([]);
      setSelectedItems([]);
      setBulkSelect(null);
      setSerialSelect(null);
      setItemsModalOpen(false);
      setWorksites([]);
      router.refresh();
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
              label={helpLabel('Consecutivo', 'Número interno del documento. El prefijo RM o DV se agrega automáticamente al guardar.', true)}
              withAsterisk={false}
              value={consecutive}
              onChange={(event) => setConsecutive(event.target.value)}
              required
            />
            <Select
              label="Razón social"
              value={customerId}
              onChange={(value) => {
                setCustomerId(value);
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
              label={helpLabel('Fecha', 'Fecha del documento de remisión o devolución.', true)}
              withAsterisk={false}
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
            <WarehouseSelect
              value={warehouseId}
              onChange={setWarehouseId}
              label={helpLabel('Bodega de ubicación', 'Bodega física desde donde se despacha o recibe el inventario.')}
            />
            <Select
              label={helpLabel('Obra', 'Obra destino del movimiento.')}
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
                label={helpLabel('Vehículo', 'Vehículo que transporta la remisión on-site.')}
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
                label={helpLabel('Conductor', 'Persona responsable del transporte de la remisión.')}
                value={driverId}
                onChange={(value) => setDriverId(value)}
                data={employees.map((e) => ({ value: e.id, label: e.name }))}
                searchable
                clearable
              />
            )}
            {docType === 'REMISSION' && deliveryMode === 'WAREHOUSE' && (
              <Select
                label={helpLabel('Despachador', 'Empleado que entrega el material desde bodega.')}
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
            {sourceMode === 'warehouse' && (
              <Select
                label={helpLabel('Dueño/a', 'Dueño del inventario a despachar. Este filtro no cambia la bodega de ubicación.')}
                value={sourceOwnerWarehouseId}
                onChange={(value) => setSourceOwnerWarehouseId(value)}
                data={ownerWarehouseOptions}
                searchable
                clearable
                placeholder="Selecciona dueño/a"
                w={320}
              />
            )}
            {sourceMode === 'on-site' && (
              <Select
                label={helpLabel('Obra origen', 'Obra desde donde se devolverán los items a bodega.')}
                value={sourceWorksiteId}
                onChange={(value) => setSourceWorksiteId(value)}
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
            )}
            <Button onClick={loadInventory} loading={loadingInventory}>
              Cargar items
            </Button>
          </Group>

          <Divider my="md" />

          {!isMobile ? (
            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <Select
                  label={helpLabel('Agregar stock (masivo)', 'Items por cantidad, por ejemplo formaletas o consumibles.')}
                  placeholder={bulkItems.length ? 'Busca por nombre o SKU' : 'Cargar items primero'}
                  searchable
                  clearable
                  value={bulkSelect}
                  onChange={(value) => {
                    const found = bulkItems.find((item) => buildBulkKey(item) === value);
                    if (found) {
                      addBulkItem(found);
                      setBulkSelect(null);
                    } else {
                      setBulkSelect(value);
                    }
                  }}
                  data={bulkItems.map((item) => ({
                    value: buildBulkKey(item),
                    label: `${item.skuName ?? 'SKU'} · ${item.quantity} · ${item.ownerWarehouseName ?? 'Sin bodega dueña'}`
                  }))}
                />
                <Select
                  label={helpLabel('Agregar equipo (serial)', 'Equipos únicos identificados por serial o motor.')}
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
                    label: buildSerialDisplayName(item)
                  }))}
                />
              </SimpleGrid>
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              Pulsa "Cargar items" para abrir el selector de items.
            </Text>
          )}
          <Divider my="md" />

          <Title order={4}>Seleccionados</Title>
          {!isMobile ? (
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
          ) : (
            <Stack mt="md" gap="sm">
              {selectedItems.map((item, index) => (
                <Paper
                  key={`${item.type}-${item.bulkKey ?? item.skuId ?? item.assetId}-${index}`}
                  withBorder
                  radius="md"
                  p="sm"
                >
                  <Stack gap="xs">
                    <div>
                      <Text fw={600}>{item.name}</Text>
                      {item.serial && (
                        <Text size="xs" c="dimmed">
                          {item.serial}
                        </Text>
                      )}
                    </div>
                    {item.type === 'bulk' ? (
                      <NumberInput
                        label="Cantidad"
                        min={0}
                        value={item.quantity ?? 1}
                        onChange={(value) =>
                          updateSelected(index, {
                            quantity: typeof value === 'number' ? value : 1
                          })
                        }
                      />
                    ) : (
                      <Text size="sm">Cantidad: 1</Text>
                    )}
                    <Button variant="light" color="red" onClick={() => removeSelected(index)}>
                      Quitar
                    </Button>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}

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

      <Modal
        opened={itemsModalOpen}
        onClose={() => setItemsModalOpen(false)}
        title="Seleccionar items"
        centered
      >
        <Stack gap="md">
          <Select
            label={helpLabel('Agregar stock (masivo)', 'Items por cantidad, por ejemplo formaletas o consumibles.')}
            placeholder={bulkItems.length ? 'Busca por nombre o SKU' : 'Cargar items primero'}
            searchable
            clearable
            value={bulkSelect}
            onChange={(value) => {
              const found = bulkItems.find((item) => buildBulkKey(item) === value);
              if (found) {
                addBulkItem(found);
                setBulkSelect(null);
              } else {
                setBulkSelect(value);
              }
            }}
            data={bulkItems.map((item) => ({
              value: buildBulkKey(item),
              label: `${item.skuName ?? 'SKU'} · ${item.quantity} · ${item.ownerWarehouseName ?? 'Sin bodega dueña'}`
            }))}
          />
          <Select
            label={helpLabel('Agregar equipo (serial)', 'Equipos únicos identificados por serial o motor.')}
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
              label: buildSerialDisplayName(item)
            }))}
          />
          <Group justify="flex-end" className="mobile-actions">
            <Button variant="default" onClick={() => setItemsModalOpen(false)}>
              Cerrar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </main>
  );
}
