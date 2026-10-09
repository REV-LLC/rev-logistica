'use client';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Alert, Button, Card, Group, Loader, Modal, Select, Stack, Text } from '@mantine/core';
import { api } from '@/lib/api';
import { getSerialDisplayName } from '@/lib/serial-assets';
import { availableForDocument, loadDocumentConfiguration, type DocumentPartOption } from './request-equipment-configuration';
import { appendNativeImplement, nativeImplementOption, type ImplementDocumentParent } from './native-implement-selection';
import type { ReturnDocumentOrigin } from './return-document-origins';
import type { InventorySerial, SelectedItem, Warehouse } from './request-types';

export default function RequestImplementSelector(props: {
  warehouseId: string | null; warehouses: Warehouse[]; customerWorksiteId: string;
  selectedItems: SelectedItem[]; setSelectedItems: Dispatch<SetStateAction<SelectedItem[]>>;
}) {
  const [opened, setOpened] = useState(false);
  return <>
    <Button variant="light" my="md" disabled={!props.customerWorksiteId} onClick={() => setOpened(true)}>Agregar implementos</Button>
    <Modal opened={opened} onClose={() => setOpened(false)} title="Agregar implementos" size="lg" centered>
      {opened ? <ImplementOptions {...props} /> : null}
    </Modal>
  </>;
}

function ImplementOptions({ warehouseId, warehouses, customerWorksiteId, selectedItems, setSelectedItems }: Parameters<typeof RequestImplementSelector>[0]) {
  const [onsite, setOnsite] = useState<ImplementDocumentParent[]>([]);
  const [loadingParents, setLoadingParents] = useState(true);
  const [error, setError] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [sourceWarehouse, setSourceWarehouse] = useState<string | null>(warehouseId);
  const [options, setOptions] = useState<DocumentPartOption[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoadingParents(true);
    Promise.all([
      api<{ serial: InventorySerial[] }>(`/inventory/on-site/${customerWorksiteId}/request-options`, { signal: controller.signal }),
      api<ReturnDocumentOrigin[]>(`/equipment-configurations/return-origins?customerWorksiteId=${customerWorksiteId}`, { signal: controller.signal }),
      api<Array<{ id: string; assetId: string }>>(`/legacy-equipment-origins/active?customerWorksiteId=${customerWorksiteId}`, { signal: controller.signal }),
    ]).then(([stock, origins, legacy]) => {
      if (controller.signal.aborted) return;
      setOnsite(stock.serial.filter(row => row.quantity === 1).flatMap(row => {
        const documentary = origins.filter(origin => origin.assetId === row.assetId);
        const reviewed = legacy.filter(origin => origin.assetId === row.assetId);
        if (documentary.length > 1 || reviewed.length > 1 || (!documentary.length && !reviewed.length)) return [];
        return [{ assetId: row.assetId, name: `${getSerialDisplayName(row)} · En obra`,
          ...(documentary.length ? { sourceDocumentItemId: documentary[0].sourceDocumentItemId } : { legacyOriginId: reviewed[0].id }) }];
      }));
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingParents(false); });
    return () => controller.abort();
  }, [customerWorksiteId]);
  const parents: ImplementDocumentParent[] = [
    ...selectedItems.flatMap(row => row.assetId ? [{ assetId: row.assetId, name: row.name, selectionId: row.selectionId }] : []),
    ...onsite.filter(row => !selectedItems.some(item => item.assetId === row.assetId)),
  ];
  const parent = parents.find(row => (row.selectionId ?? row.assetId) === parentId);
  const parentAssetId = parent?.assetId;
  const parentSelectionId = parent?.selectionId;
  const parentSourceDocumentItemId = parent?.sourceDocumentItemId;
  const parentLegacyOriginId = parent?.legacyOriginId;
  useEffect(() => {
    const controller = new AbortController();
    setOptions([]);
    setLoading(false);
    if (!parentAssetId || !sourceWarehouse) return () => controller.abort();
    setLoading(true); setError('');
    loadDocumentConfiguration({ selectionId: parentSelectionId ?? '', type: 'serial', name: '',
      assetId: parentAssetId, sourceWarehouseId: sourceWarehouse }, { docType: 'REMISSION', customerWorksiteId }, controller.signal)
      .then(rows => { if (!controller.signal.aborted) setOptions(rows.filter(row => row.item && row.item.type !== 'accessory')); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [parentAssetId, parentSelectionId, parentSourceDocumentItemId, parentLegacyOriginId, sourceWarehouse, customerWorksiteId]);
  return <Stack>
    <Select label="Equipo" searchable value={parentId} disabled={loadingParents}
      onChange={setParentId} data={parents.map(row => ({ value: row.selectionId ?? row.assetId, label: row.name }))} />
    <Select label="Salen de" searchable value={sourceWarehouse} onChange={setSourceWarehouse}
      data={warehouses.map(row => ({ value: row.id, label: row.name }))} />
    {loadingParents || loading ? <Loader size="sm" aria-label="Cargando implementos" /> : null}
    {error ? <Alert color="red">{error}</Alert> : null}
    {parent && sourceWarehouse && !loading && !error && !options.length ? <Text c="dimmed" size="sm">No hay implementos compatibles disponibles en esta bodega.</Text> : null}
    {parent ? options.map(option => {
      const item = nativeImplementOption(option, parent).item;
      const available = item ? availableForDocument(item, selectedItems) : 0;
      return <Card key={option.key} withBorder padding="sm"><Group justify="space-between" wrap="wrap">
        <div><Text fw={600}>{option.name}</Text><Text size="xs" c="dimmed">Disponible: {available}</Text></div>
        <Button size="xs" disabled={available < option.quantity} onClick={() => setSelectedItems(current => appendNativeImplement(current, option, parent))}>Agregar</Button>
      </Group></Card>;
    }) : null}
  </Stack>;
}
