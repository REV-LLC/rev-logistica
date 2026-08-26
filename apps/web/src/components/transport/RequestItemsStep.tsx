'use client';

import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import WarehouseSelect from '@/components/WarehouseSelect';

export type RequestSelectedItem = {
  selectionId: string;
  type: 'bulk' | 'serial' | 'free';
  bulkKey?: string;
  skuId?: string;
  assetId?: string;
  name: string;
  requestedTag?: string;
  serial?: string | null;
  quantity?: number;
  availableQuantity?: number;
  ownerWarehouseId?: string | null;
  isDamaged?: boolean;
  damageDescription?: string;
  associatedMixerId?: string;
  componentParentAssetId?: string;
};

type WarehouseOption = { id: string; name: string; type?: 'OWN' | 'ALLY' | string };
type SkuOption = { id: string; name: string };

type RequestItemsStepProps = {
  documentType: 'REMISSION' | 'RETURN';
  sourceMode: 'warehouse' | 'on-site';
  customerName: string;
  worksiteLabel: string;
  documentDate: string;
  deliverySummary: string;
  error: string | null;
  isMobile: boolean;
  isTabletOrMobile: boolean;
  sourceOwnerWarehouseId: string | null;
  warehouses: WarehouseOption[];
  manualCapture: boolean;
  loadingInventory: boolean;
  freeTagInput: string;
  freeInternalNumber: number | '';
  items: RequestSelectedItem[];
  editing: boolean;
  canDecide: boolean;
  canResolveInline: boolean;
  skuOptions: SkuOption[];
  checkingProviderRemissions: boolean;
  onDismissError: () => void;
  onBack: () => void;
  onNext: () => void;
  onSourceOwnerChange: (warehouseId: string | null) => void;
  onLoadInventory: () => void;
  onFreeTagChange: (value: string) => void;
  onFreeInternalNumberChange: (value: number | '') => void;
  onAddFreeItem: () => void;
  onUpdateItem: (index: number, updates: Partial<RequestSelectedItem>) => void;
  onUpdateOwner: (index: number, warehouseId: string | null) => void;
  onSplitItem: (index: number) => void;
  onResolveFreeItem: (index: number, skuId: string | null) => void;
  onRemoveItem: (selectionId: string) => void;
};

const HelpLabel = ({ label, help }: { label: string; help: string }) => (
  <Group gap={6} align="center">
    <Text span>{label}</Text>
    <Tooltip label={help} multiline w={280} withArrow>
      <Text span c="dimmed" fw={700} style={{ cursor: 'help' }}>?</Text>
    </Tooltip>
  </Group>
);

const normalizeQuantity = (value: string | number, fallback: number) => {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : fallback;
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

type ItemFieldsProps = Pick<
  RequestItemsStepProps,
  | 'documentType'
  | 'editing'
  | 'canDecide'
  | 'canResolveInline'
  | 'warehouses'
  | 'skuOptions'
  | 'onUpdateItem'
  | 'onUpdateOwner'
  | 'onSplitItem'
  | 'onResolveFreeItem'
  | 'onRemoveItem'
> & {
  item: RequestSelectedItem;
  index: number;
  compact: boolean;
  section?: 'all' | 'details' | 'actions';
};

function ItemFields({
  item,
  index,
  compact,
  section = 'all',
  documentType,
  editing,
  canDecide,
  canResolveInline,
  warehouses,
  skuOptions,
  onUpdateItem,
  onUpdateOwner,
  onSplitItem,
  onResolveFreeItem,
  onRemoveItem,
}: ItemFieldsProps) {
  return (
    <>
      {section !== 'details' && (item.type === 'bulk' || item.type === 'free') ? (
        <NumberInput
          label={compact ? 'Cantidad' : undefined}
          min={1}
          value={item.quantity ?? 1}
          onChange={(value) =>
            onUpdateItem(index, {
              quantity: normalizeQuantity(value, item.quantity ?? 1),
            })
          }
        />
      ) : section !== 'details' ? (
        <Text size={compact ? 'sm' : undefined}>{compact ? 'Cantidad: 1' : '1'}</Text>
      ) : null}

      {section !== 'actions' && documentType === 'RETURN' ? (
        <Stack gap={6} mt="xs">
          <Checkbox
            label="Entra averiado"
            checked={Boolean(item.isDamaged)}
            onChange={(event) =>
              onUpdateItem(index, {
                isDamaged: event.currentTarget.checked,
                damageDescription: event.currentTarget.checked
                  ? item.damageDescription ?? ''
                  : '',
              })
            }
          />
          {item.isDamaged ? (
            <Textarea
              label="Descripción del daño"
              placeholder="Describe el daño reportado al recibir el equipo"
              value={item.damageDescription ?? ''}
              onChange={(event) =>
                onUpdateItem(index, { damageDescription: event.currentTarget.value })
              }
              minRows={2}
              autosize
              required
            />
          ) : null}
        </Stack>
      ) : null}

      {section !== 'actions' && editing && canDecide ? (
        <Stack gap="xs" mt="xs">
          {item.type === 'free' ? (
            <TextInput
              label="Referencia del ítem"
              value={item.requestedTag ?? item.name}
              onChange={(event) => {
                const requestedTag = event.currentTarget.value;
                onUpdateItem(index, { requestedTag, name: requestedTag });
              }}
            />
          ) : null}
          <WarehouseSelect
            label="Bodega dueña del ítem"
            value={item.ownerWarehouseId ?? null}
            onChange={(value) => onUpdateOwner(index, value)}
            warehouses={warehouses}
            clearable={false}
            required
            width="100%"
          />
          {item.type !== 'serial' && Number(item.quantity ?? 1) > 1 ? (
            <Button type="button" size="xs" variant="light" onClick={() => onSplitItem(index)}>
              Dividir cantidad entre bodegas
            </Button>
          ) : null}
        </Stack>
      ) : null}

      {section !== 'details' && canResolveInline && item.type === 'free' ? (
        <Select
          mt={compact ? undefined : 'xs'}
          label="Resolver a SKU"
          placeholder="Seleccionar SKU"
          searchable
          clearable
          data={skuOptions.map((sku) => ({ value: sku.id, label: sku.name }))}
          onChange={(value) => onResolveFreeItem(index, value)}
        />
      ) : null}
      {section !== 'details' ? (
        <Button
          type="button"
          size="xs"
          mt={compact ? undefined : 'xs'}
          variant="subtle"
          color="red"
          onClick={() => onRemoveItem(item.selectionId)}
        >
          Quitar
        </Button>
      ) : null}
    </>
  );
}

export default function RequestItemsStep(props: RequestItemsStepProps) {
  const {
    documentType,
    sourceMode,
    customerName,
    worksiteLabel,
    documentDate,
    deliverySummary,
    error,
    isMobile,
    isTabletOrMobile,
    sourceOwnerWarehouseId,
    warehouses,
    manualCapture,
    loadingInventory,
    freeTagInput,
    freeInternalNumber,
    items,
    checkingProviderRemissions,
    onDismissError,
    onBack,
    onNext,
    onSourceOwnerChange,
    onLoadInventory,
    onFreeTagChange,
    onFreeInternalNumberChange,
    onAddFreeItem,
  } = props;

  const sharedItemProps = {
    documentType,
    editing: props.editing,
    canDecide: props.canDecide,
    canResolveInline: props.canResolveInline,
    warehouses,
    skuOptions: props.skuOptions,
    onUpdateItem: props.onUpdateItem,
    onUpdateOwner: props.onUpdateOwner,
    onSplitItem: props.onSplitItem,
    onResolveFreeItem: props.onResolveFreeItem,
    onRemoveItem: props.onRemoveItem,
  };

  return (
    <Paper shadow="sm" p={{ base: 'md', md: 'xl' }} radius="xl" withBorder mt="lg">
      <Group justify="space-between" align="center" mb="sm">
        <div>
          <Group gap="xs" mb={4}>
            <Badge color="teal" variant="light">Paso 2</Badge>
            <Badge color={sourceMode === 'warehouse' ? 'blue' : 'orange'} variant="light">
              {sourceMode === 'warehouse' ? 'Desde bodega' : 'Desde obra'}
            </Badge>
          </Group>
          <Title order={4}>Ítems del documento</Title>
          <Text size="sm" c="dimmed">
            Agrega equipos, cantidades y condiciones para construir el documento.
          </Text>
        </div>
        <Button type="button" variant="light" color="gray" onClick={onBack}>Volver a info</Button>
      </Group>

      {error ? (
        <Alert color="red" variant="light" mb="md" withCloseButton onClose={onDismissError}>
          {error}
        </Alert>
      ) : null}

      <Paper withBorder radius="lg" p="md" bg="teal.0" mb="md">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
          <div><Text size="xs" fw={800} c="dimmed" tt="uppercase">Cliente</Text><Text size="sm" fw={700}>{customerName}</Text></div>
          <div><Text size="xs" fw={800} c="dimmed" tt="uppercase">Obra</Text><Text size="sm" fw={700}>{worksiteLabel}</Text></div>
          <div><Text size="xs" fw={800} c="dimmed" tt="uppercase">Fecha</Text><Text size="sm" fw={700}>{documentDate || '-'}</Text></div>
          <div>
            <Text size="xs" fw={800} c="dimmed" tt="uppercase">
              {documentType === 'REMISSION' ? 'Entrega' : 'Devolución'}
            </Text>
            <Text size="sm" fw={700}>{deliverySummary}</Text>
          </div>
        </SimpleGrid>
      </Paper>

      <Text c="dimmed">Agregar los equipos y su origen.</Text>
      <Group mt="md" align="flex-end" wrap="wrap">
        {sourceMode === 'warehouse' ? (
          <WarehouseSelect
            label={<HelpLabel label="Origen" help="Dueño del inventario a despachar. Este filtro no cambia la bodega de ubicación." />}
            value={sourceOwnerWarehouseId}
            onChange={onSourceOwnerChange}
            warehouses={warehouses}
            clearable
            placeholder="Buscar origen"
            width={isMobile ? '100%' : 320}
          />
        ) : null}
        {manualCapture ? null : (
          <Button type="button" onClick={onLoadInventory} loading={loadingInventory}>Cargar ítems</Button>
        )}
      </Group>

      {manualCapture ? (
        <Stack mt="md" gap="sm">
          <Group align="flex-end" wrap="wrap">
            <TextInput
              label="Referencia"
              placeholder="Escribe la referencia entregada"
              value={freeTagInput}
              onChange={(event) => onFreeTagChange(event.currentTarget.value)}
              w={isMobile ? '100%' : 320}
            />
            <NumberInput
              label="N° interno (opcional)"
              min={1}
              allowDecimal={false}
              value={freeInternalNumber}
              onChange={(value) => onFreeInternalNumberChange(typeof value === 'number' ? value : '')}
              w={isMobile ? '100%' : 190}
            />
            <Button type="button" onClick={onAddFreeItem}>Agregar ítem</Button>
          </Group>
        </Stack>
      ) : null}

      <Divider my="md" />
      {manualCapture ? null : (
        <Text size="sm" c="dimmed">Pulsa &quot;Cargar ítems&quot; para abrir el selector de ítems.</Text>
      )}
      <Divider my="md" />

      <Title order={4}>Seleccionados</Title>
      {items.length === 0 ? (
        <Paper radius="lg" p="lg" bg="gray.0" mt="md">
          <Text fw={700}>No hay equipos agregados</Text>
          <Text size="sm" c="dimmed" mt={4}>
            Carga ítems desde el origen o agrega manualmente para continuar con la firma.
          </Text>
        </Paper>
      ) : !isTabletOrMobile ? (
        <Table striped highlightOnHover mt="md">
          <Table.Thead><Table.Tr><Table.Th>Desc.</Table.Th><Table.Th style={{ width: 120, textAlign: 'center' }}>Cantidad</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {items.map((item, index) => (
              <Table.Tr key={item.selectionId}>
                <Table.Td>
                  <Text fw={600}>{item.name}</Text>
                  {item.serial ? <Text size="xs" c="dimmed">{item.serial}</Text> : null}
                  <ItemFields
                    {...sharedItemProps}
                    item={item}
                    index={index}
                    compact={false}
                    section="details"
                  />
                </Table.Td>
                <Table.Td>
                  <ItemFields
                    {...sharedItemProps}
                    item={item}
                    index={index}
                    compact={false}
                    section="actions"
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Stack mt="md" gap="sm">
          {items.map((item, index) => (
            <Paper key={item.selectionId} withBorder radius="md" p="sm">
              <Stack gap="xs">
                <div>
                  <Text fw={600}>{item.name}</Text>
                  {item.serial ? <Text size="xs" c="dimmed">{item.serial}</Text> : null}
                </div>
                <ItemFields {...sharedItemProps} item={item} index={index} compact />
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      <Group mt="md" justify="space-between" className="mobile-actions">
        <Button type="button" variant="light" color="gray" onClick={onBack}>Volver a info</Button>
        <Button type="button" onClick={onNext} loading={checkingProviderRemissions}>Siguiente: Firma</Button>
      </Group>
    </Paper>
  );
}
