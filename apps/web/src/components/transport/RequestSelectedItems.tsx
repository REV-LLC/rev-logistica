'use client';
import { ActionIcon, Box, Button, Group, NumberInput, Paper, Select, Stack, Table, Text } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import { Fragment, useState, type ReactNode } from 'react';
import { groupRequestItems, type RequestItemGroup } from './request-item-groups';
import { normalizeQuantityInput } from './request-formatting';
import type { SelectedItem, SkuOption, Warehouse } from './request-types';
import { getItemOwnerLabel } from './request-item-owners';

export type RequestSelectedItemsProps = {
  selectedItems: SelectedItem[];
  isTabletOrMobile: boolean;
  docType: 'REMISSION' | 'RETURN';
  warehouses: Warehouse[];
  renderDamageFields: (item: SelectedItem, index: number) => ReactNode;
  renderAdminItemFields: (item: SelectedItem, index: number) => ReactNode;
  renderConfiguration?: (item: SelectedItem) => ReactNode;
  updateSelected: (index: number, updates: Partial<SelectedItem>) => void;
  canResolveInline: boolean;
  skuOptions: SkuOption[];
  resolveFreeItemToSku: (index: number, skuId: string | null) => void;
  removeSelected: (selectionId: string) => void;
};

export default function RequestSelectedItems(props: RequestSelectedItemsProps) {
  const groups = groupRequestItems(props.selectedItems);
  if (!groups.length) return <Paper radius="lg" p="lg" bg="gray.0" mt="md">
    <Text fw={700}>No hay equipos agregados</Text><Text size="sm" c="dimmed" mt={4}>Carga ítems desde el origen o agrega manualmente para continuar con la firma.</Text>
  </Paper>;
  const rows = groups.map(node => <ItemRow key={node.item.selectionId} {...props} node={node} depth={0} />);
  return props.isTabletOrMobile ? <Stack mt="md" gap="sm">{rows}</Stack> :
    <Table striped highlightOnHover mt="md" style={{ tableLayout: 'fixed' }}>
      <Table.Thead><Table.Tr><Table.Th>Descripción</Table.Th><Table.Th w={120} ta="center">Cantidad</Table.Th><Table.Th w={132} ta="center">Acciones</Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>{rows}</Table.Tbody>
    </Table>;
}

function ItemRow(props: RequestSelectedItemsProps & { node: RequestItemGroup; depth: number }) {
  const { node: { item, index, children }, depth } = props;
  const [expanded, setExpanded] = useState(false);
  const canHaveParts = Boolean(item.assetId || (item.accessoryId && item.accessoryKind === 'INDIVIDUAL' && item.accessoryPurpose !== 'COMPONENT'));
  const configurable = Boolean((canHaveParts && props.renderConfiguration) || children.length);
  const panelId = `configuration-${item.selectionId}`;
  const details = <>
    <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{item.name}</Text>
    {props.docType === 'RETURN' && item.deliveryFuel ? <Text size="sm">Motor: {item.deliveryFuel === 'ELECTRICO' ? 'Eléctrico' : 'Gasolina'}</Text> : null}
    {props.docType === 'REMISSION' ? <Text size="xs" c="gray.7">Dueño: {getItemOwnerLabel(props.warehouses.find(w => w.id === item.ownerWarehouseId))}</Text> : null}
    {item.serial ? <Text size="xs" c="dimmed">{item.serial}</Text> : null}
    {children.length ? <Text size="xs" c="teal">{children.length} pieza(s) incluida(s){expanded ? '' : ' · Ver configuración'}</Text> : null}
    {props.renderDamageFields(item, index)}
    {props.renderAdminItemFields(item, index)}
    {props.canResolveInline && item.type === 'free' ? <Select mt="xs" label="Resolver a SKU" placeholder="Seleccionar SKU" searchable clearable
      data={props.skuOptions.map(sku => ({ value: sku.id, label: sku.name }))}
      onChange={value => props.resolveFreeItemToSku(index, value)} /> : null}
  </>;
  const quantity = item.type === 'bulk' || item.type === 'free' || (item.type === 'accessory' && item.accessoryKind !== 'INDIVIDUAL')
    ? <NumberInput aria-label={`Cantidad de ${item.name}`} allowDecimal={item.type !== 'accessory'} min={1}
      max={item.type === 'accessory' ? item.availableQuantity : undefined} value={item.quantity ?? 1}
      styles={{ input: { textAlign: 'center', fontVariantNumeric: 'tabular-nums' } }}
      onChange={value => props.updateSelected(index, { quantity: normalizeQuantityInput(value, item.quantity ?? 1) })} />
    : <Text fw={600} ta="center" aria-label={`Cantidad de ${item.name}: 1`}>1</Text>;
  const actions = <Group gap={4} wrap="nowrap" justify="center">
    {configurable ? <ActionIcon variant={expanded ? 'filled' : 'light'} color="teal" size="lg"
      aria-label={`Configurar ${item.name}`} title="Configurar este equipo en el documento" aria-expanded={expanded} aria-controls={panelId}
      onClick={() => setExpanded(value => !value)}><IconSettings size={19} aria-hidden /></ActionIcon> : null}
    <Button size="xs" px="xs" variant="subtle" color="red" aria-label={`Quitar ${item.name}`} onClick={() => props.removeSelected(item.selectionId)}>Quitar</Button>
  </Group>;
  const configuration = expanded && configurable ? <Box id={panelId} role="region" aria-label={`Configuración de ${item.name}`} p="sm" bg="teal.0" style={{ borderRadius: 8 }}>
    {canHaveParts ? props.renderConfiguration?.(item) : null}
    {children.length ? <Text fw={700} size="sm" mt="sm">Piezas incluidas en este documento</Text> : null}
  </Box> : null;
  if (props.isTabletOrMobile) return <Paper withBorder radius="md" p="sm">
    <Group align="start" wrap="nowrap"><Box style={{ flex: 1, minWidth: 0 }}>{details}</Box>{actions}</Group>
    <Group mt="xs"><Text size="sm">Cantidad</Text><Box w={100}>{quantity}</Box></Group>
    {expanded ? <Stack mt="sm" gap="xs">{configuration}{children.map(node => <ItemRow key={node.item.selectionId} {...props} node={node} depth={depth + 1} />)}</Stack> : null}
  </Paper>;
  return <Fragment>
    <Table.Tr>
      <Table.Td style={{ verticalAlign: 'top', paddingLeft: 10 + Math.min(depth, 5) * 16 }}>{details}</Table.Td>
      <Table.Td style={{ verticalAlign: 'top' }}>{quantity}</Table.Td>
      <Table.Td style={{ verticalAlign: 'top' }}>{actions}</Table.Td>
    </Table.Tr>
    {expanded ? <>
      <Table.Tr><Table.Td colSpan={3}>{configuration}</Table.Td></Table.Tr>
      {children.map(node => <ItemRow key={node.item.selectionId} {...props} node={node} depth={depth + 1} />)}
    </> : null}
  </Fragment>;
}
