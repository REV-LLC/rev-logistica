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
  NumberInput,
  Tooltip
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { api, ApiError } from '@/lib/api';
import InventoryItemPickerModal, {
  type InventoryItemPickerBulkItem,
  type InventoryItemPickerSerialItem,
} from '@/components/InventoryItemPickerModal';
import WarehouseSelect from '@/components/WarehouseSelect';
import { getSerialDisplayName } from '@/lib/serial-assets';

type InventoryBulk = InventoryItemPickerBulkItem;
type InventorySerial = InventoryItemPickerSerialItem;

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

type Employee = { id: string; name: string; lastName?: string | null };
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
  availableQuantity?: number;
  ownerWarehouseId?: string | null;
};

const buildBulkKey = (item: { skuId: string; ownerWarehouseId: string | null }) =>
  `${item.skuId}::${item.ownerWarehouseId ?? 'none'}`;

const getEmployeeFullName = (employee: Employee) =>
  `${employee.name} ${employee.lastName ?? ''}`.trim();

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
        if (!sourceOwnerWarehouseId) throw new Error('Select the owner warehouse to filter items.');
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
        if (!sourceWorksiteId) throw new Error('Select a source worksite');
        const data = await api<{ bulk: InventoryBulk[]; serial: InventorySerial[] }>(
          `/inventory/on-site/${sourceWorksiteId}`,
          { method: 'GET' }
        );
        setBulkItems(data.bulk);
        setSerialItems(data.serial);
      }
      setItemsModalOpen(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error loading inventory');
      }
    } finally {
      setLoadingInventory(false);
    }
  };

  useEffect(() => {
    setBulkItems([]);
    setSerialItems([]);
    if (docType === 'REMISSION') {
      setSourceWorksiteId(null);
    } else {
      setSourceOwnerWarehouseId(null);
    }
  }, [docType]);

  const addBulkItem = (item: InventoryBulk) => {
    if (item.quantity < 0) {
      setError('This item has a negative inventory alert. Adjust stock before using it in a document.');
      return false;
    }
    const bulkKey = buildBulkKey(item);
    let added = false;
    setSelectedItems((prev) => {
      const exists = prev.find((entry) => entry.type === 'bulk' && entry.bulkKey === bulkKey);
      if (exists) return prev;
      added = true;
      return [
        ...prev,
        {
          type: 'bulk',
          bulkKey,
          skuId: item.skuId,
          name: item.skuName ?? item.skuId,
          quantity: 1,
          availableQuantity: item.quantity,
          ownerWarehouseId: item.ownerWarehouseId
        }
      ];
    });
    return added;
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
          name: getSerialDisplayName(item),
          serial: item.serialOrEngine,
          ownerWarehouseId: item.ownerWarehouseId
        }
      ];
    });
  };

  const updateSelected = (index: number, updates: Partial<SelectedItem>) => {
    setSelectedItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  };

  const selectedBulkKeys = useMemo(
    () => new Set(selectedItems.filter((item) => item.type === 'bulk').map((item) => item.bulkKey)),
    [selectedItems],
  );

  const selectedSerialIds = useMemo(
    () => new Set(selectedItems.filter((item) => item.type === 'serial').map((item) => item.assetId)),
    [selectedItems],
  );

  const removeSelected = (index: number) => {
    setSelectedItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitResult(null);
    setError(null);
    try {
      if (!docDate || !consecutive || !customerId) {
        throw new Error('Complete the required fields.');
      }
      if (!selectedItems.length) {
        throw new Error('Select at least one item.');
      }
      if (
        selectedItems.some(
          (item) => item.type === 'bulk' && item.availableQuantity != null && item.availableQuantity < 0,
        )
      ) {
        throw new Error('Some items have negative inventory alerts. Adjust stock before creating the document.');
      }
      if (!customerWorksiteId) {
        throw new Error('Select the worksite.');
      }
      if (docType === 'RETURN' && !warehouseId) {
        throw new Error('Select the warehouse for the return.');
      }
      if (docType === 'REMISSION' && deliveryMode === 'WAREHOUSE' && !warehouseId) {
        throw new Error('Select the dispatch warehouse.');
      }

      const documentPayload = {
        type: docType,
        status: 'CONFIRMED',
        number: withDocPrefix(consecutive, docType),
        warehouseId: warehouseId ?? undefined,
        customerWorksiteId: customerWorksiteId || undefined,
        notes: [
          `Document date: ${docDate}`,
          docType === 'RETURN' && cutOffDate ? `Cutoff date: ${cutOffDate}` : null,
          docType === 'REMISSION' ? `Entrega: ${deliveryMode}` : null,
          deliveryMode === 'ON_SITE' && vehicleId ? `Vehicle: ${vehicleId}` : null,
          deliveryMode === 'ON_SITE' && driverId ? `Driver: ${driverId}` : null,
          deliveryMode === 'WAREHOUSE' && dispatcherId ? `Dispatcher: ${dispatcherId}` : null
        ].filter(Boolean).join(' | ')
      } as const;

      const created = await api<{ id: string }>('/documents', {
        method: 'POST',
        json: documentPayload
      });

      const movementItems = selectedItems.map((item) => {
        if (!item.ownerWarehouseId) {
          throw new Error(`Missing owner warehouse for item ${item.name}`);
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
      setItemsModalOpen(false);
      setWorksites([]);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error saving document.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main>
      <Container size="lg" py="xl">
        <Paper shadow="sm" p="xl" radius="md" withBorder>
          <Title order={2}>Dispatch / Return</Title>
          <Text c="dimmed">Enter the real document data.</Text>

          <Radio.Group
            mt="md"
            value={docType}
            onChange={(value) => setDocType(value as 'REMISSION' | 'RETURN')}
            label="Tipo"
          >
            <Group mt="xs">
              <Radio value="REMISSION" label="Dispatch" />
              <Radio value="RETURN" label="Return" />
            </Group>
          </Radio.Group>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mt="md">
            <TextInput
              label={helpLabel('Consecutive', 'Internal document number. The RM or DV prefix is added automatically when saving.', true)}
              withAsterisk={false}
              value={consecutive}
              onChange={(event) => setConsecutive(event.target.value)}
              required
            />
            <Select
              label="Legal name"
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
              placeholder="Select customer"
            />
            <TextInput
              label={helpLabel('Date', 'Dispatch or return document date.', true)}
              withAsterisk={false}
              type="date"
              value={docDate}
              onChange={(event) => setDocDate(event.target.value)}
              required
            />
            {docType === 'RETURN' && (
              <TextInput
                label="Cutoff date (optional)"
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
              label={helpLabel('Location warehouse', 'Physical warehouse where inventory is dispatched or received.')}
            />
            <Select
              label={helpLabel('Worksite', 'Destination worksite for the movement.')}
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
              placeholder={customerId ? 'Select worksite' : 'Select customer first'}
              disabled={!customerId || worksitesLoading}
            />
            {docType === 'REMISSION' && deliveryMode === 'ON_SITE' && (
              <Select
                label={helpLabel('Vehicle', 'Vehicle transporting the on-site dispatch.')}
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
                label={helpLabel('Driver', 'Person responsible for dispatch transport.')}
                value={driverId}
                onChange={(value) => setDriverId(value)}
                data={employees.map((e) => ({ value: e.id, label: getEmployeeFullName(e) }))}
                searchable
                clearable
              />
            )}
            {docType === 'REMISSION' && deliveryMode === 'WAREHOUSE' && (
              <Select
                label={helpLabel('Dispatcher', 'Employee who delivers material from warehouse.')}
                value={dispatcherId}
                onChange={(value) => setDispatcherId(value)}
                data={employees.map((e) => ({ value: e.id, label: getEmployeeFullName(e) }))}
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
                label={helpLabel('Owner', 'Owner of the inventory to dispatch. This filter does not change the location warehouse.')}
                value={sourceOwnerWarehouseId}
                onChange={(value) => setSourceOwnerWarehouseId(value)}
                data={ownerWarehouseOptions}
                searchable
                clearable
                placeholder="Select owner"
                w={320}
              />
            )}
            {sourceMode === 'on-site' && (
              <Select
                label={helpLabel('Source worksite', 'Worksite from which items will be returned to warehouse.')}
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
                placeholder={customerId ? 'Select worksite' : 'Select customer first'}
                disabled={!customerId || worksitesLoading}
              />
            )}
            <Button onClick={loadInventory} loading={loadingInventory}>
              Load items
            </Button>
          </Group>

          <Divider my="md" />
          <Text size="sm" c="dimmed">
            Load inventory and select it from the modal.
          </Text>
          <Divider my="md" />

          <Title order={4}>Seleccionados</Title>
          {!isMobile ? (
            <Table striped highlightOnHover mt="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Item</Table.Th>
                  <Table.Th>Quantity</Table.Th>
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
                        label="Quantity"
                        min={0}
                        value={item.quantity ?? 1}
                        onChange={(value) =>
                          updateSelected(index, {
                            quantity: typeof value === 'number' ? value : 1
                          })
                        }
                      />
                    ) : (
                      <Text size="sm">Quantity: 1</Text>
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
              Save and execute
            </Button>
          </Group>
        </Paper>
      </Container>

      <InventoryItemPickerModal
        opened={itemsModalOpen}
        onClose={() => setItemsModalOpen(false)}
        title="Select items"
        bulkItems={bulkItems}
        serialItems={serialItems}
        selectedBulkKeys={selectedBulkKeys}
        selectedSerialIds={selectedSerialIds}
        onAddBulk={addBulkItem}
        onAddSerial={addSerialItem}
        sourceMode={sourceMode}
      />
    </main>
  );
}
