'use client';
import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { getSerialDisplayName } from '@/lib/serial-assets';
import { createSelectionId } from './request-formatting';
import { addDocumentParts, loadDocumentConfiguration } from './request-equipment-configuration';
import type { InventorySerial, SelectedItem } from './request-types';

type Options = {
  configurationWorksiteId?: string;
  motorOnly?: boolean;
  docType: 'REMISSION' | 'RETURN';
  setSelectedItems: Dispatch<SetStateAction<SelectedItem[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setItemsAddedNotice: Dispatch<SetStateAction<string | null>>;
};

export function useRequestAssetSelection({ configurationWorksiteId, motorOnly, docType, setSelectedItems, setError, setItemsAddedNotice }: Options) {
  const pending = useRef(new Set<AbortController>());
  const cancelPendingSelections = () => {
    for (const controller of pending.current) controller.abort();
    pending.current.clear();
  };
  useEffect(() => cancelPendingSelections, [docType, configurationWorksiteId, motorOnly]);
  const addSerialItem = (item: InventorySerial) => {
    const root: SelectedItem = { selectionId: createSelectionId(), type: 'serial', assetId: item.assetId,
      name: getSerialDisplayName(item), serial: item.serialOrEngine, ownerWarehouseId: item.ownerWarehouseId,
      sourceWarehouseId: item.sourceWarehouseId };
    const controller = new AbortController();
    pending.current.add(controller);
    const load = docType === 'REMISSION' && configurationWorksiteId
      ? loadDocumentConfiguration(root, { docType, customerWorksiteId: configurationWorksiteId, motorOnly }, controller.signal)
      : Promise.resolve([]);
    void load.then(options => {
      if (controller.signal.aborted) return;
      setSelectedItems(current => current.some(entry => entry.assetId === root.assetId) ? current
        : addDocumentParts([...current, root], root, options.filter(option => option.defaultIncluded)));
      setItemsAddedNotice(options.length
        ? 'Equipo agregado. Revisa sus piezas y los requeridos desde la tuerca de configuración.'
        : 'Equipo agregado al documento.');
    }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'No se pudo consultar la configuración.');
    }).finally(() => pending.current.delete(controller));
    return true;
  };
  return { addSerialItem, cancelPendingSelections };
}
