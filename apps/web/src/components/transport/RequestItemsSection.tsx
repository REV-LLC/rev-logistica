'use client';
import WarehouseSelect from '@/components/WarehouseSelect';
import {
  Badge,
  Button,
  Divider,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import type { Dispatch, JSX, SetStateAction } from 'react';
import { normalizeQuantityInput } from './request-formatting';
import {
  Customer,
  Employee,
  GenerateStep,
  ProviderRemissionRequirements,
  SelectedItem,
  SkuOption,
  Warehouse,
} from './request-types';
import { helpLabel } from './RequestHelpLabel';

type Props = {
  sourceMode: 'warehouse' | 'on-site';
  setGenerateStep: Dispatch<SetStateAction<GenerateStep>>;
  renderGenerateError: () => JSX.Element | null;
  selectedCustomer: Customer | null;
  selectedWorksiteLabel: string;
  docDate: string;
  docType: 'REMISSION' | 'RETURN';
  deliveryMode: 'WAREHOUSE' | 'ON_SITE';
  selectedDriver: Employee | null;
  selectedDispatcher: Employee | null;
  sourceOwnerWarehouseId: string | null;
  setSourceOwnerWarehouseId: Dispatch<SetStateAction<string | null>>;
  warehouses: Warehouse[];
  setCreationProviderRequirements: Dispatch<
    SetStateAction<ProviderRemissionRequirements | null>
  >;
  isMobile: boolean;
  useManualWarehouseCapture: boolean;
  canDecide: boolean;
  loadInventory: (openSelector?: boolean) => Promise<void>;
  loadingInventory: boolean;
  freeTagInput: string;
  setFreeTagInput: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string | null>>;
  freeInternalNumber: number | '';
  setFreeInternalNumber: Dispatch<SetStateAction<number | ''>>;
  addFreeItem: () => void;
  selectedItems: SelectedItem[];
  isTabletOrMobile: boolean;
  renderDamageFields: (item: SelectedItem, index: number) => JSX.Element | null;
  renderAdminItemFields: (
    item: SelectedItem,
    index: number,
  ) => JSX.Element | null;
  updateSelected: (index: number, updates: Partial<SelectedItem>) => void;
  canResolveInline: boolean;
  skuOptions: SkuOption[];
  resolveFreeItemToSku: (index: number, skuId: string | null) => void;
  removeSelected: (selectionId: string) => void;
  goToSignStep: () => Promise<void>;
  checkingProviderRemissions: boolean;
};

export default function RequestItemsSection({
  sourceMode,
  setGenerateStep,
  renderGenerateError,
  selectedCustomer,
  selectedWorksiteLabel,
  docDate,
  docType,
  deliveryMode,
  selectedDriver,
  selectedDispatcher,
  sourceOwnerWarehouseId,
  setSourceOwnerWarehouseId,
  warehouses,
  setCreationProviderRequirements,
  isMobile,
  useManualWarehouseCapture,
  canDecide,
  loadInventory,
  loadingInventory,
  freeTagInput,
  setFreeTagInput,
  setError,
  freeInternalNumber,
  setFreeInternalNumber,
  addFreeItem,
  selectedItems,
  isTabletOrMobile,
  renderDamageFields,
  renderAdminItemFields,
  updateSelected,
  canResolveInline,
  skuOptions,
  resolveFreeItemToSku,
  removeSelected,
  goToSignStep,
  checkingProviderRemissions,
}: Props) {
  return (
    <Paper
      shadow="sm"
      p={{ base: 'md', md: 'xl' }}
      radius="xl"
      withBorder
      mt="lg"
    >
      <Group justify="space-between" align="center" mb="sm">
        <div>
          <Group gap="xs" mb={4}>
            <Badge color="teal" variant="light">
              Paso 2
            </Badge>
            <Badge
              color={sourceMode === 'warehouse' ? 'blue' : 'orange'}
              variant="light"
            >
              {sourceMode === 'warehouse' ? 'Desde bodega' : 'Desde obra'}
            </Badge>
          </Group>
          <Title order={4}>Items del documento</Title>
          <Text size="sm" c="dimmed">
            Agrega equipos, cantidades y condiciones para construir el
            documento.
          </Text>
        </div>
        <Button
          variant="light"
          color="gray"
          onClick={() => setGenerateStep('info')}
        >
          Volver a info
        </Button>
      </Group>
      {renderGenerateError()}
      <Paper withBorder radius="lg" p="md" bg="teal.0" mb="md">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
          <div>
            <Text size="xs" fw={800} c="dimmed" tt="uppercase">
              Cliente
            </Text>
            <Text size="sm" fw={700}>
              {selectedCustomer?.name ?? '-'}
            </Text>
          </div>
          <div>
            <Text size="xs" fw={800} c="dimmed" tt="uppercase">
              Obra
            </Text>
            <Text size="sm" fw={700}>
              {selectedWorksiteLabel}
            </Text>
          </div>
          <div>
            <Text size="xs" fw={800} c="dimmed" tt="uppercase">
              Fecha
            </Text>
            <Text size="sm" fw={700}>
              {docDate || '-'}
            </Text>
          </div>
          <div>
            <Text size="xs" fw={800} c="dimmed" tt="uppercase">
              {docType === 'REMISSION' ? 'Entrega' : 'Devolución'}
            </Text>
            <Text size="sm" fw={700}>
              {docType === 'REMISSION'
                ? deliveryMode === 'ON_SITE'
                  ? `En obra (${selectedDriver?.name ?? '-'})`
                  : `Bodega (${selectedDispatcher?.name ?? '-'})`
                : deliveryMode === 'ON_SITE'
                  ? `Recogida en obra (${selectedDriver?.name ?? '-'})`
                  : `Cliente entrega en bodega (${selectedDriver?.name ?? '-'})`}
            </Text>
          </div>
        </SimpleGrid>
      </Paper>
      <Text c="dimmed">Agregar los equipos y su origen.</Text>

      <Group mt="md" align="flex-end" wrap="wrap">
        {sourceMode === 'warehouse' && (
          <WarehouseSelect
            label={helpLabel(
              'Origen',
              'Dueño del inventario a despachar. Este filtro no cambia la bodega de ubicacion.',
            )}
            value={sourceOwnerWarehouseId}
            onChange={(value) => {
              setSourceOwnerWarehouseId(value);
              const nextWarehouse = warehouses.find(
                (warehouse) => warehouse.id === value,
              );
              if (nextWarehouse?.type !== 'ALLY')
                setCreationProviderRequirements(null);
            }}
            warehouses={warehouses}
            clearable
            placeholder="Buscar origen"
            width={isMobile ? '100%' : 320}
          />
        )}
        {useManualWarehouseCapture && !canDecide ? null : (
          <Button
            onClick={() => void loadInventory()}
            loading={loadingInventory}
          >
            Cargar items
          </Button>
        )}
      </Group>

      {useManualWarehouseCapture ? (
        <Stack mt="md" gap="sm">
          <Group align="flex-end" wrap="wrap">
            <TextInput
              label="Referencia"
              placeholder="Escribe la referencia entregada"
              value={freeTagInput}
              onChange={(value) => {
                setFreeTagInput(value.currentTarget.value);
                setError(null);
              }}
              w={isMobile ? '100%' : 320}
            />
            <NumberInput
              label="N° interno (opcional)"
              min={1}
              allowDecimal={false}
              value={freeInternalNumber}
              onChange={(value) =>
                setFreeInternalNumber(typeof value === 'number' ? value : '')
              }
              w={isMobile ? '100%' : 190}
            />
            <Button onClick={addFreeItem}>Agregar item</Button>
          </Group>
        </Stack>
      ) : null}

      <Divider my="md" />

      {useManualWarehouseCapture ? null : (
        <Text size="sm" c="dimmed">
          Pulsa "Cargar items" para abrir el selector de items.
        </Text>
      )}
      <Divider my="md" />

      <Title order={4}>Seleccionados</Title>
      {selectedItems.length === 0 ? (
        <Paper radius="lg" p="lg" bg="gray.0" mt="md">
          <Text fw={700}>No hay equipos agregados</Text>
          <Text size="sm" c="dimmed" mt={4}>
            Carga items desde el origen o agrega manualmente para continuar con
            la firma.
          </Text>
        </Paper>
      ) : !isTabletOrMobile ? (
        <Table striped highlightOnHover mt="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Desc.</Table.Th>
              <Table.Th style={{ width: 120, textAlign: 'center' }}>
                Cantidad
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {selectedItems.map((item, index) => (
              <Table.Tr key={item.selectionId}>
                <Table.Td>
                  <Text fw={600}>{item.name}</Text>
                  {item.serial && (
                    <Text size="xs" c="dimmed">
                      {item.serial}
                    </Text>
                  )}
                  {renderDamageFields(item, index)}
                  {renderAdminItemFields(item, index)}
                </Table.Td>
                <Table.Td>
                  {item.type === 'bulk' || item.type === 'free' ? (
                    <NumberInput
                      min={1}
                      value={item.quantity ?? 1}
                      onChange={(value) =>
                        updateSelected(index, {
                          quantity: normalizeQuantityInput(
                            value,
                            item.quantity ?? 1,
                          ),
                        })
                      }
                    />
                  ) : (
                    <Text>1</Text>
                  )}
                  {canResolveInline && item.type === 'free' ? (
                    <Select
                      mt="xs"
                      label="Resolver a SKU"
                      placeholder="Seleccionar SKU"
                      searchable
                      clearable
                      data={skuOptions.map((sku) => ({
                        value: sku.id,
                        label: sku.name,
                      }))}
                      onChange={(value) => resolveFreeItemToSku(index, value)}
                    />
                  ) : null}
                  <Button
                    size="xs"
                    mt="xs"
                    variant="subtle"
                    color="red"
                    onClick={() => removeSelected(item.selectionId)}
                  >
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
            <Paper key={item.selectionId} withBorder radius="md" p="sm">
              <Stack gap="xs">
                <div>
                  <Text fw={600}>{item.name}</Text>
                  {item.serial ? (
                    <Text size="xs" c="dimmed">
                      {item.serial}
                    </Text>
                  ) : null}
                </div>
                {item.type === 'bulk' || item.type === 'free' ? (
                  <NumberInput
                    label="Cantidad"
                    min={1}
                    value={item.quantity ?? 1}
                    onChange={(value) =>
                      updateSelected(index, {
                        quantity: normalizeQuantityInput(
                          value,
                          item.quantity ?? 1,
                        ),
                      })
                    }
                  />
                ) : (
                  <Text size="sm">Cantidad: 1</Text>
                )}
                {renderDamageFields(item, index)}
                {renderAdminItemFields(item, index)}
                {canResolveInline && item.type === 'free' ? (
                  <Select
                    label="Resolver a SKU"
                    placeholder="Seleccionar SKU"
                    searchable
                    clearable
                    data={skuOptions.map((sku) => ({
                      value: sku.id,
                      label: sku.name,
                    }))}
                    onChange={(value) => resolveFreeItemToSku(index, value)}
                  />
                ) : null}
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => removeSelected(item.selectionId)}
                >
                  Quitar
                </Button>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      <Group mt="md" justify="space-between" className="mobile-actions">
        <Button
          variant="light"
          color="gray"
          onClick={() => setGenerateStep('info')}
        >
          Volver a info
        </Button>
        <Button
          onClick={() => void goToSignStep()}
          loading={checkingProviderRemissions}
        >
          Siguiente: Firma
        </Button>
      </Group>
    </Paper>
  );
}
