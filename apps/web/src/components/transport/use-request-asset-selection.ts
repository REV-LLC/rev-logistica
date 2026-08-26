'use client';

import { type Dispatch, type SetStateAction, useCallback, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { InventoryItemPickerSerialItem } from '@/components/InventoryItemPickerModal';
import type {
  AssetComponentOption,
  AssetComponentSelection,
} from '@/components/AssetComponentsSelectionModal';
import { getSerialDisplayName } from '@/lib/serial-assets';
import type { RequestSelectedItem } from '@/components/transport/RequestItemsStep';
import { addSerialSelection } from '@/components/transport/request-item-selection';
import { getAvailableMixerMotors } from '@/components/transport/request-inventory';

type InventorySerial = InventoryItemPickerSerialItem;

type UseRequestAssetSelectionOptions = {
  documentType: 'REMISSION' | 'RETURN';
  serialItems: InventorySerial[];
  selectedSerialIds: Set<string>;
  setSerialItems: Dispatch<SetStateAction<InventorySerial[]>>;
  setSelectedItems: Dispatch<SetStateAction<RequestSelectedItem[]>>;
  setSelectorOpen: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setItemsAddedNotice: Dispatch<SetStateAction<string | null>>;
  createSelectionId: () => string;
};

const bulkKey = (skuId: string, ownerWarehouseId: string | null) =>
  `${skuId}::${ownerWarehouseId ?? 'none'}`;

export const useRequestAssetSelection = ({
  documentType,
  serialItems,
  selectedSerialIds,
  setSerialItems,
  setSelectedItems,
  setSelectorOpen,
  setError,
  setItemsAddedNotice,
  createSelectionId,
}: UseRequestAssetSelectionOptions) => {
  const [pendingMixers, setPendingMixers] = useState<InventorySerial[]>([]);
  const [componentParent, setComponentParent] = useState<InventorySerial | null>(null);
  const [componentOptions, setComponentOptions] = useState<AssetComponentOption[]>([]);
  const [componentOptionsLoading, setComponentOptionsLoading] = useState(false);
  const [assigningMotor, setAssigningMotor] = useState(false);
  const [assignMotorError, setAssignMotorError] = useState<string | null>(null);
  const activePendingMixer = pendingMixers[0] ?? null;

  const availableMotors = useMemo(
    () =>
      getAvailableMixerMotors({
        serialItems,
        selectedSerialIds,
        mixerAssetId: activePendingMixer?.assetId ?? null,
      }),
    [activePendingMixer?.assetId, selectedSerialIds, serialItems],
  );

  const appendSerial = useCallback(
    (item: InventorySerial, associatedMixerId?: string) => {
      let added = false;
      setSelectedItems((current) => {
        const next = addSerialSelection({
          items: current,
          inventoryItem: item,
          displayName: getSerialDisplayName(item),
          associatedMixerId,
          createSelectionId,
        });
        added = next !== current;
        return next;
      });
      return added;
    },
    [createSelectionId, setSelectedItems],
  );

  const addSerial = useCallback(
    (item: InventorySerial) => {
      if (item.kind === 'MOTOR') return appendSerial(item);

      setComponentOptionsLoading(true);
      api<{ components: AssetComponentOption[] }>(`/assets/${item.assetId}/component-options`)
        .then((response) => {
          if (response.components.length) {
            setComponentParent(item);
            setComponentOptions(response.components);
            setSelectorOpen(false);
            return;
          }
          if (documentType === 'REMISSION' && item.motorConfiguration === 'INTERCHANGEABLE') {
            setPendingMixers((current) =>
              current.some((entry) => entry.assetId === item.assetId)
                ? current
                : [...current, item],
            );
            return;
          }
          appendSerial(item);
        })
        .catch((error) =>
          setError(
            error instanceof Error
              ? error.message
              : 'No se pudieron consultar los componentes.',
          ),
        )
        .finally(() => setComponentOptionsLoading(false));
      return true;
    }, [appendSerial, documentType, setError, setSelectorOpen]);

  const confirmComponents = useCallback(
    async (selections: AssetComponentSelection[]) => {
      if (!componentParent) return;
      const parent = componentParent;
      const motor = selections.find(
        (selection): selection is Extract<AssetComponentSelection, { type: 'serial' }> =>
          selection.type === 'serial' && selection.item.kind === 'MOTOR',
      );
      if (
        documentType === 'REMISSION' &&
        parent.motorConfiguration === 'INTERCHANGEABLE' &&
        motor
      ) {
        try {
          await api(`/assets/${parent.assetId}/assigned-motor`, {
            method: 'PATCH',
            json: { motorId: motor.item.assetId },
          });
        } catch (error) {
          setError(error instanceof Error ? error.message : 'No se pudo asociar el motor.');
          return;
        }
      }

      setSelectedItems((current) => {
        const selectedAssetIds = new Set(current.map((item) => item.assetId).filter(Boolean));
        const additions: RequestSelectedItem[] = [
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
              bulkKey: bulkKey(selection.item.skuId, selection.item.ownerWarehouseId),
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
        return [...current.filter((item) => item.assetId !== parent.assetId), ...additions];
      });
      setItemsAddedNotice(`${getSerialDisplayName(parent)} y sus componentes fueron agregados.`);
      setComponentParent(null);
      setComponentOptions([]);
    }, [componentParent, createSelectionId, documentType, setError, setItemsAddedNotice, setSelectedItems],
  );

  const closeComponents = useCallback(() => {
    setComponentParent(null);
    setComponentOptions([]);
  }, []);

  const cancelPendingMixer = useCallback(() => {
    if (assigningMotor) return;
    setAssignMotorError(null);
    setPendingMixers((current) => current.slice(1));
  }, [assigningMotor]);

  const confirmMixerMotor = useCallback(
    async (motor: InventorySerial) => {
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
              item.assetId !== activePendingMixer.assetId && item.assetId !== motor.assetId,
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
        setPendingMixers((current) => current.slice(1));
      } catch (error) {
        setAssignMotorError(
          error instanceof ApiError
            ? `${error.status}: ${error.message}`
            : error instanceof Error
              ? error.message
              : 'No se pudo asignar el motor.',
        );
      } finally {
        setAssigningMotor(false);
      }
    }, [activePendingMixer, createSelectionId, setItemsAddedNotice, setSelectedItems, setSerialItems],
  );

  const reset = useCallback(() => {
    setPendingMixers([]);
    setAssignMotorError(null);
    setComponentParent(null);
    setComponentOptions([]);
  }, []);

  return {
    componentParent,
    componentOptions,
    componentOptionsLoading,
    activePendingMixer,
    availableMotors,
    assigningMotor,
    assignMotorError,
    addSerial,
    confirmComponents,
    closeComponents,
    cancelPendingMixer,
    confirmMixerMotor,
    reset,
  };
};
