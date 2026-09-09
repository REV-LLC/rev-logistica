'use client';
import {
  type AssetComponentOption,
  type AssetComponentSelection,
} from '@/components/AssetComponentsSelectionModal';
import type { InventoryItemPickerSerialItem } from '@/components/InventoryItemPickerModal';
import { api, ApiError } from '@/lib/api';
import { getSerialDisplayName } from '@/lib/serial-assets';
import type { Dispatch, SetStateAction } from 'react';
import { useMemo, useState } from 'react';
import { buildBulkKey, createSelectionId } from './request-formatting';
import { InventorySerial, SelectedItem } from './request-types';

type Options = {
  serialItems: InventoryItemPickerSerialItem[];
  selectedSerialIds: Set<string>;
  setSelectedItems: Dispatch<SetStateAction<SelectedItem[]>>;
  setItemsModalOpen: Dispatch<SetStateAction<boolean>>;
  docType: 'REMISSION' | 'RETURN';
  setError: Dispatch<SetStateAction<string | null>>;
  setItemsAddedNotice: Dispatch<SetStateAction<string | null>>;
  setSerialItems: Dispatch<SetStateAction<InventoryItemPickerSerialItem[]>>;
};

export function useRequestAssetSelection({
  serialItems,
  selectedSerialIds,
  setSelectedItems,
  setItemsModalOpen,
  docType,
  setError,
  setItemsAddedNotice,
  setSerialItems,
}: Options) {
  const [pendingMixerQueue, setPendingMixerQueue] = useState<InventorySerial[]>(
    [],
  );

  const [componentParent, setComponentParent] =
    useState<InventorySerial | null>(null);

  const [componentOptions, setComponentOptions] = useState<
    AssetComponentOption[]
  >([]);

  const [componentOptionsLoading, setComponentOptionsLoading] = useState(false);

  const [assigningMotor, setAssigningMotor] = useState(false);

  const [assignMotorError, setAssignMotorError] = useState<string | null>(null);

  const activePendingMixer = pendingMixerQueue[0] ?? null;

  const availableMotorsForMixer = useMemo(() => {
    if (!activePendingMixer) return [];
    return serialItems.filter(
      (item) =>
        item.kind === 'MOTOR' &&
        item.quantity > 0 &&
        (!item.assignedMixerId ||
          item.assignedMixerId === activePendingMixer.assetId) &&
        !selectedSerialIds.has(item.assetId),
    );
  }, [activePendingMixer, selectedSerialIds, serialItems]);

  const appendSerialItem = (
    item: InventorySerial,
    associatedMixerId?: string,
  ) => {
    let added = false;
    setSelectedItems((prev) => {
      const exists = prev.find(
        (entry) => entry.assetId === item.assetId && entry.type === 'serial',
      );
      if (exists) return prev;
      added = true;
      return [
        ...prev,
        {
          selectionId: createSelectionId(),
          type: 'serial',
          assetId: item.assetId,
          name: getSerialDisplayName(item),
          serial: item.serialOrEngine,
          ownerWarehouseId: item.ownerWarehouseId,
          associatedMixerId,
        },
      ];
    });
    return added;
  };

  const addSerialItem = (item: InventorySerial) => {
    if (item.kind !== 'MOTOR') {
      setComponentOptionsLoading(true);
      api<{ components: AssetComponentOption[] }>(
        `/assets/${item.assetId}/component-options`,
      )
        .then((response) => {
          if (response.components.length) {
            setComponentParent(item);
            setComponentOptions(response.components);
            setItemsModalOpen(false);
            return;
          }
          if (
            docType === 'REMISSION' &&
            item.motorConfiguration === 'INTERCHANGEABLE'
          ) {
            setPendingMixerQueue((current) =>
              current.some((entry) => entry.assetId === item.assetId)
                ? current
                : [...current, item],
            );
            return;
          }
          appendSerialItem(item);
        })
        .catch((err) =>
          setError(
            err instanceof Error
              ? err.message
              : 'No se pudieron consultar los componentes.',
          ),
        )
        .finally(() => setComponentOptionsLoading(false));
      return true;
    }
    if (
      docType === 'REMISSION' &&
      item.motorConfiguration === 'INTERCHANGEABLE' &&
      item.kind !== 'MOTOR'
    ) {
      let queued = false;
      setPendingMixerQueue((current) => {
        const alreadyQueued = current.some(
          (mixer) => mixer.assetId === item.assetId,
        );
        const alreadySelected = selectedSerialIds.has(item.assetId);
        if (alreadyQueued || alreadySelected) return current;
        queued = true;
        return [...current, item];
      });
      return queued;
    }
    return appendSerialItem(item);
  };

  const confirmAssetComponents = async (
    selections: AssetComponentSelection[],
  ) => {
    if (!componentParent) return;
    const parent = componentParent;
    const motor = selections.find(
      (
        selection,
      ): selection is Extract<AssetComponentSelection, { type: 'serial' }> =>
        selection.type === 'serial' && selection.item.kind === 'MOTOR',
    );
    if (
      docType === 'REMISSION' &&
      parent.motorConfiguration === 'INTERCHANGEABLE' &&
      motor
    ) {
      try {
        await api(`/assets/${parent.assetId}/assigned-motor`, {
          method: 'PATCH',
          json: { motorId: motor.item.assetId },
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'No se pudo asociar el motor.',
        );
        return;
      }
    }
    setSelectedItems((current) => {
      const selectedAssetIds = new Set(
        current.map((item) => item.assetId).filter(Boolean),
      );
      const additions: SelectedItem[] = [
        {
          selectionId: createSelectionId(),
          type: 'serial',
          assetId: parent.assetId,
          name: getSerialDisplayName(parent),
          serial: parent.serialOrEngine,
          ownerWarehouseId: parent.ownerWarehouseId,
        },
      ];
      selections.forEach((selection) => {
        if (selection.type === 'bulk') {
          additions.push({
            selectionId: createSelectionId(),
            type: 'bulk',
            bulkKey: buildBulkKey(selection.item),
            skuId: selection.item.skuId,
            name: `${selection.item.skuName ?? 'Componente'} · con ${getSerialDisplayName(parent)}`,
            quantity: selection.quantity,
            availableQuantity: selection.item.quantity,
            ownerWarehouseId: selection.item.ownerWarehouseId,
            componentParentAssetId: parent.assetId,
          });
        } else if (!selectedAssetIds.has(selection.item.assetId)) {
          additions.push({
            selectionId: createSelectionId(),
            type: 'serial',
            assetId: selection.item.assetId,
            name: `${getSerialDisplayName(selection.item)} · con ${getSerialDisplayName(parent)}`,
            serial: selection.item.serialOrEngine,
            ownerWarehouseId: selection.item.ownerWarehouseId,
            componentParentAssetId: parent.assetId,
          });
        }
      });
      return [
        ...current.filter((item) => item.assetId !== parent.assetId),
        ...additions,
      ];
    });
    setItemsAddedNotice(
      `${getSerialDisplayName(parent)} y sus componentes fueron agregados.`,
    );
    setComponentParent(null);
    setComponentOptions([]);
  };

  const cancelPendingMixer = () => {
    if (assigningMotor) return;
    setAssignMotorError(null);
    setPendingMixerQueue((current) => current.slice(1));
  };

  const confirmMixerMotor = async (motor: InventorySerial) => {
    if (!activePendingMixer) return;
    setAssigningMotor(true);
    setAssignMotorError(null);
    try {
      await api(`/assets/${activePendingMixer.assetId}/assigned-motor`, {
        method: 'PATCH',
        json: { motorId: motor.assetId },
      });

      setSelectedItems((current) => {
        const withoutDuplicates = current.filter(
          (item) =>
            item.assetId !== activePendingMixer.assetId &&
            item.assetId !== motor.assetId,
        );
        return [
          ...withoutDuplicates,
          {
            selectionId: createSelectionId(),
            type: 'serial',
            assetId: activePendingMixer.assetId,
            name: getSerialDisplayName(activePendingMixer),
            serial: activePendingMixer.serialOrEngine,
            ownerWarehouseId: activePendingMixer.ownerWarehouseId,
          },
          {
            selectionId: createSelectionId(),
            type: 'serial',
            assetId: motor.assetId,
            name: `${getSerialDisplayName(motor)} · motor asociado`,
            serial: motor.serialOrEngine,
            ownerWarehouseId: motor.ownerWarehouseId,
            associatedMixerId: activePendingMixer.assetId,
          },
        ];
      });
      setSerialItems((current) =>
        current.map((item) => {
          if (
            item.kind === 'MOTOR' &&
            item.assignedMixerId === activePendingMixer.assetId &&
            item.assetId !== motor.assetId
          ) {
            return { ...item, assignedMixerId: null };
          }
          if (item.assetId === motor.assetId) {
            return { ...item, assignedMixerId: activePendingMixer.assetId };
          }
          if (item.assetId === activePendingMixer.assetId) {
            return { ...item, assignedMotorId: motor.assetId };
          }
          return item;
        }),
      );
      setItemsAddedNotice('Mezcladora y motor agregados al documento.');
      setPendingMixerQueue((current) => current.slice(1));
    } catch (err) {
      setAssignMotorError(
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'No se pudo asignar el motor.',
      );
    } finally {
      setAssigningMotor(false);
    }
  };
  return {
    setPendingMixerQueue,
    componentParent,
    setComponentParent,
    componentOptions,
    setComponentOptions,
    assigningMotor,
    assignMotorError,
    setAssignMotorError,
    activePendingMixer,
    availableMotorsForMixer,
    addSerialItem,
    confirmAssetComponents,
    cancelPendingMixer,
    confirmMixerMotor,
  };
}
