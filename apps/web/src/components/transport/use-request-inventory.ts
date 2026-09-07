'use client';
import { api, ApiError } from '@/lib/api';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildBulkKey } from './request-formatting';
import type { Warehouse } from './request-types';
import {
  GenerateStep,
  InventoryBulk,
  InventorySerial,
  RequestInventoryResponse,
  SelectedItem,
  SolicitudesTab,
} from './request-types';

type Options = {
  selectedItems: SelectedItem[];
  docType: 'REMISSION' | 'RETURN';
  sourceMode: 'warehouse' | 'on-site';
  principalWarehouse: Warehouse | null;
  sourceOwnerWarehouseId: string | null;
  setSourceOwnerWarehouseId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  warehouses: Warehouse[];
  canDecide: boolean;
  effectiveSourceWorksiteId: string | null;
  useManualWarehouseCapture: boolean;
  activeTab: SolicitudesTab;
  generateStep: GenerateStep;
  setFreeTagInput: Dispatch<SetStateAction<string>>;
  setFreeInternalNumber: Dispatch<SetStateAction<number | ''>>;
  clearProviderRemissionDocuments: () => void;
  setSourceWorksiteId: Dispatch<SetStateAction<string | null>>;
};

export function useRequestInventory({
  selectedItems,
  docType,
  sourceMode,
  principalWarehouse,
  sourceOwnerWarehouseId,
  setSourceOwnerWarehouseId,
  setError,
  warehouses,
  canDecide,
  effectiveSourceWorksiteId,
  useManualWarehouseCapture,
  activeTab,
  generateStep,
  setFreeTagInput,
  setFreeInternalNumber,
  clearProviderRemissionDocuments,
  setSourceWorksiteId,
}: Options) {
  const [bulkItems, setBulkItems] = useState<InventoryBulk[]>([]);

  const [serialItems, setSerialItems] = useState<InventorySerial[]>([]);

  const [loadingInventory, setLoadingInventory] = useState(false);

  const [showInventoryOwnerWarehouse, setShowInventoryOwnerWarehouse] =
    useState(true);

  const [itemsModalOpen, setItemsModalOpen] = useState(false);

  const lastAutoOpenedWarehouseRef = useRef<string | null>(null);

  const selectedBulkKeys = useMemo(
    () =>
      new Set(
        selectedItems
          .filter((item) => item.type === 'bulk' && item.bulkKey)
          .map((item) => item.bulkKey as string),
      ),
    [selectedItems],
  );

  const selectedSerialIds = useMemo(
    () =>
      new Set(
        selectedItems
          .filter((item) => item.type === 'serial' && item.assetId)
          .map((item) => item.assetId as string),
      ),
    [selectedItems],
  );

  const availableBulkItems = useMemo(
    () => bulkItems.filter((item) => !selectedBulkKeys.has(buildBulkKey(item))),
    [bulkItems, selectedBulkKeys],
  );

  const availableSerialItems = useMemo(
    () => serialItems.filter((item) => !selectedSerialIds.has(item.assetId)),
    [serialItems, selectedSerialIds],
  );

  const pickerSerialItems = useMemo(
    () =>
      docType === 'REMISSION'
        ? availableSerialItems.filter((item) => item.kind !== 'MOTOR')
        : availableSerialItems,
    [availableSerialItems, docType],
  );

  useEffect(() => {
    if (
      sourceMode !== 'warehouse' ||
      !principalWarehouse?.id ||
      sourceOwnerWarehouseId
    )
      return;
    lastAutoOpenedWarehouseRef.current = principalWarehouse.id;
    setSourceOwnerWarehouseId(principalWarehouse.id);
  }, [principalWarehouse?.id, sourceMode, sourceOwnerWarehouseId]);

  const loadInventory = async (openSelector = true) => {
    setLoadingInventory(true);
    setError(null);
    try {
      if (sourceMode === 'warehouse') {
        if (!sourceOwnerWarehouseId)
          throw new Error('Selecciona la bodega dueña para filtrar items.');
        const selectedOwner = warehouses.find(
          (warehouse) => warehouse.id === sourceOwnerWarehouseId,
        );
        if (selectedOwner?.type === 'ALLY' && !canDecide) {
          throw new Error('Para bodega alterna, usa captura libre de tags.');
        }
        const data = await api<{
          bulk: InventoryBulk[];
          serial: InventorySerial[];
        }>(`/inventory/warehouse/${sourceOwnerWarehouseId}`, { method: 'GET' });
        setBulkItems(
          data.bulk.filter(
            (item) => item.ownerWarehouseId === sourceOwnerWarehouseId,
          ),
        );
        setSerialItems(
          data.serial.filter(
            (item) => item.ownerWarehouseId === sourceOwnerWarehouseId,
          ),
        );
      } else if (sourceMode === 'on-site') {
        if (!effectiveSourceWorksiteId) throw new Error('Selecciona una obra');
        const data = await api<RequestInventoryResponse>(
          `/inventory/on-site/${effectiveSourceWorksiteId}/request-options`,
          { method: 'GET' },
        );
        setBulkItems(data.bulk);
        setSerialItems(data.serial);
        setShowInventoryOwnerWarehouse(data.presentation.showOwnerWarehouse);
      }
      if (openSelector && (!useManualWarehouseCapture || canDecide)) {
        setItemsModalOpen(true);
      }
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
    if (activeTab !== 'generate' || generateStep !== 'items') {
      setItemsModalOpen(false);
      return;
    }
    if (sourceMode !== 'warehouse') return;
    if (!sourceOwnerWarehouseId) {
      lastAutoOpenedWarehouseRef.current = null;
      return;
    }
    const selectedOwner = warehouses.find(
      (warehouse) => warehouse.id === sourceOwnerWarehouseId,
    );
    if (selectedOwner?.type === 'ALLY') {
      lastAutoOpenedWarehouseRef.current = null;
      return;
    }
    if (lastAutoOpenedWarehouseRef.current === sourceOwnerWarehouseId) return;
    lastAutoOpenedWarehouseRef.current = sourceOwnerWarehouseId;
    void loadInventory(true);
  }, [activeTab, generateStep, sourceMode, sourceOwnerWarehouseId, warehouses]);

  useEffect(() => {
    if (sourceMode !== 'on-site') return;
    if (!effectiveSourceWorksiteId) {
      setBulkItems([]);
      setSerialItems([]);
      return;
    }
    void loadInventory(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceMode, effectiveSourceWorksiteId]);

  useEffect(() => {
    setBulkItems([]);
    setSerialItems([]);
    setFreeTagInput('');
    setFreeInternalNumber('');
    clearProviderRemissionDocuments();
    setItemsModalOpen(false);
    if (docType === 'REMISSION') {
      setSourceWorksiteId(null);
    } else {
      setSourceOwnerWarehouseId(null);
    }
  }, [docType]);
  return {
    bulkItems,
    setBulkItems,
    serialItems,
    setSerialItems,
    loadingInventory,
    showInventoryOwnerWarehouse,
    itemsModalOpen,
    setItemsModalOpen,
    selectedBulkKeys,
    selectedSerialIds,
    availableBulkItems,
    pickerSerialItems,
    loadInventory,
  };
}
