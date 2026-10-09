'use client';
import { Alert, Badge, Button, Checkbox, Group, Loader, Stack, Text } from '@mantine/core';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { SelectedItem } from './request-types';
import { removeRequestItem } from './request-item-groups';
import { addDocumentParts, availableForDocument, documentTemplateRouteStatus, loadDocumentConfiguration, sameDocumentPart,
  type ConfigurationContext, type DocumentPartOption } from './request-equipment-configuration';

type Props = ConfigurationContext & {
  parent: SelectedItem;
  selectedItems: SelectedItem[];
  setSelectedItems: Dispatch<SetStateAction<SelectedItem[]>>;
};

export default function RequestEquipmentConfiguration({ parent, docType, customerWorksiteId, selectedItems, setSelectedItems }: Props) {
  const [options, setOptions] = useState<DocumentPartOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const { assetId, accessoryId, accessoryKind, componentParentAssetId, sourceDocumentItemId, sourceWarehouseId, selectionId } = parent;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setOptions([]);
    loadDocumentConfiguration({ selectionId, type: accessoryId ? 'accessory' : 'serial', name: '', assetId, accessoryId, accessoryKind, componentParentAssetId, sourceDocumentItemId, sourceWarehouseId },
      { docType, customerWorksiteId }, controller.signal)
      .then(result => { if (!controller.signal.aborted) setOptions(result); })
      .catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [assetId, accessoryId, accessoryKind, componentParentAssetId, sourceDocumentItemId, sourceWarehouseId, selectionId, docType, customerWorksiteId, revision]);

  const route = docType === 'REMISSION' && !loading && !error
    ? documentTemplateRouteStatus(parent, options, selectedItems) : null;

  return <Stack gap="sm">
    <Group justify="space-between" gap="xs">
      <Text fw={700}>Configuración de este documento</Text>
      {route ? <Badge variant="light" color={route.complete ? 'teal' : 'gray'}
        title={route.complete ? 'Todas las familias de la ruta están incluidas.' : route.status === 'UNVERIFIED'
          ? 'Hay líneas vinculadas cuya familia no está identificada. Revisa la ruta antes de confirmar.'
          : `Falta: ${route.missingFamilyNames.join(', ')}`}>
        {route.complete ? 'Ruta completa' : route.status === 'UNVERIFIED' ? 'Ruta por verificar' : `Ruta parcial ${route.present}/${route.total}`}
      </Badge> : null}
    </Group>
    <Text size="sm" c="dimmed">{docType === 'REMISSION'
      ? 'Marca lo que acompaña al equipo. Los cambios no modifican su configuración de inventario.'
      : 'Selecciona lo que regresa. Se muestran existencias pendientes en esta obra, no los valores predeterminados del inventario.'}</Text>
    {loading ? <Loader size="sm" aria-label="Cargando configuración" /> : null}
    {error ? <Alert color="red">{error}<Button variant="subtle" onClick={() => setRevision(value => value + 1)}>Reintentar</Button></Alert> : null}
    {!loading && !error && !options.length ? <Text size="sm" c="dimmed">{docType === 'REMISSION'
      ? 'Este equipo no tiene piezas predeterminadas configuradas. Puedes revisar las piezas ya incluidas abajo o agregar accesorios desde el selector.'
      : 'No hay accesorios pendientes registrados para este equipo en esta obra.'}</Text> : null}
    {options.map(option => {
      const selected = selectedItems.filter(item => option.item ? sameDocumentPart(item, option.item) : false);
      const available = option.item ? availableForDocument(option.item, selectedItems) : 0;
      return <Group key={option.key} align="start" justify="space-between" wrap="wrap">
        <div style={{ flex: 1, minWidth: 180 }}>
          <Checkbox label={option.name} checked={selected.length > 0}
            disabled={!selected.length && (!option.item || available < option.quantity)}
            onChange={event => {
              const checked = event.currentTarget.checked;
              setSelectedItems(current => checked ? addDocumentParts(current, parent, [option])
                : current.filter(item => option.item && sameDocumentPart(item, option.item))
                  .reduce((next, item) => removeRequestItem(next, item.selectionId), current));
            }} />
          <Text size="xs" c="dimmed" mt={4}>{option.unavailable ?? (selected.length
            ? 'Incluido. Ajusta cantidad y condición en la fila de abajo.'
            : available < option.quantity ? 'Sin cantidad suficiente o ya seleccionado en otra fila.'
            : `Cantidad propuesta: ${option.quantity} · Disponible: ${available}`)}</Text>
        </div>
        <Group gap={4}>
          <Badge variant="light" color="teal">Implemento</Badge>
          {option.defaultIncluded ? <Badge variant="outline" color="gray">Predeterminado</Badge> : null}
          {option.required ? <Badge color="orange" variant="light">Requerido</Badge> : null}
        </Group>
      </Group>;
    })}
    {!loading && !error && docType === 'REMISSION' && options.some(option => option.defaultIncluded) ?
      <Button variant="light" size="xs" style={{ alignSelf: 'flex-start' }} onClick={() =>
        setSelectedItems(current => addDocumentParts(current, parent, options.filter(option => option.defaultIncluded)))}>
        Agregar predeterminados disponibles
      </Button> : null}
  </Stack>;
}
