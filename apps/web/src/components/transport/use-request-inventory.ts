'use client';

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, ApiError } from '@/lib/api';
import type {
  InventoryItemPickerBulkItem,
  InventoryItemPickerSerialItem,
} from '@/components/InventoryItemPickerModal';
import type { RequestSelectedItem } from '@/components/transport/RequestItemsStep';
import {
  getAvailableRequestInventory,
  getSelectedInventoryKeys,
} from '@/components/transport/request-inventory';

type InventoryBulk = InventoryItemPickerBulkItem;
type InventorySerial = InventoryItemPickerSerialItem;
type Warehouse = { id: string; name: string; type?: 'OWN' | 'ALLY' | string };

type RequestInventoryResponse = {
  bulk: InventoryBulk[];
  serial: InventorySerial[];
  presentation: { showOwnerWarehouse: boolean };
};

type UseRequestInventoryOptions = {
  active: boolean;
  documentType: 'REMISSION' | 'RETURN';
  sourceMode: 'warehouse' | 'on-site';
  sourceOwnerWarehouseId: string | null;
  sourceWorksiteId: string | null;
  warehouses: Warehouse[];
  manualCapture: boolean;
  selectedItems: RequestSelectedItem[];
  setError: Dispatch<SetStateAction<string | null>>;
};

export const useRequestInventory = ({
  active,
  documentType,
  sourceMode,
  sourceOwnerWarehouseId,
  sourceWorksiteId,
  warehouses,
  manualCapture,
  selectedItems,
  setError,
}: UseRequestInventoryOptions) => {
  const [bulkItems, setBulkItems] = useState<InventoryBulk[]>([]);
  const [serialItems, setSerialItems] = useState<InventorySerial[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [showOwnerWarehouse, setShowOwnerWarehouse] = useState(true);
  const lastAutoOpenedWarehouseRef = useRef<string | null>(null);

  const { bulkKeys: selectedBulkKeys, serialIds: selectedSerialIds } = useMemo(
    () => getSelectedInventoryKeys(selectedItems),
    [selectedItems],
  );
  const { bulk: availableBulkItems, serial: pickerSerialItems } = useMemo(
    () =>
      getAvailableRequestInventory({
        bulkItems,
        serialItems,
        selectedBulkKeys,
        selectedSerialIds,
        documentType,
      }),
    [bulkItems, documentType, selectedBulkKeys, selectedSerialIds, serialItems],
  );

  const load = useCallback(
    async (openSelector = true) => {
      setLoading(true);
      setError(null);
      try {
        if (sourceMode === 'warehouse') {
          if (!sourceOwnerWarehouseId) {
            throw new Error('Selecciona la bodega dueña para filtrar ítems.');
          }
          const selectedOwner = warehouses.find(
            (warehouse) => warehouse.id === sourceOwnerWarehouseId,
          );
          if (selectedOwner?.type === 'ALLY') {
            throw new Error('Para bodega alterna, usa captura libre de tags.');
          }
          const data = await api<{ bulk: InventoryBulk[]; serial: InventorySerial[] }>(
            `/inventory/warehouse/${sourceOwnerWarehouseId}`,
            { method: 'GET' },
          );
          setBulkItems(
            data.bulk.filter((item) => item.ownerWarehouseId === sourceOwnerWarehouseId),
          );
          setSerialItems(
            data.serial.filter((item) => item.ownerWarehouseId === sourceOwnerWarehouseId),
          );
        } else {
          if (!sourceWorksiteId) throw new Error('Selecciona una obra');
          const data = await api<RequestInventoryResponse>(
            `/inventory/on-site/${sourceWorksiteId}/request-options`,
            { method: 'GET' },
          );
          setBulkItems(data.bulk);
          setSerialItems(data.serial);
          setShowOwnerWarehouse(data.presentation.showOwnerWarehouse);
        }
        if (openSelector && !manualCapture) setSelectorOpen(true);
      } catch (error) {
        if (error instanceof ApiError) {
          setError(`${error.status}: ${error.message}`);
        } else if (error instanceof Error) {
          setError(error.message);
        } else {
          setError('No se pudo cargar el inventario.');
        }
      } finally {
        setLoading(false);
      }
    }, [manualCapture, setError, sourceMode, sourceOwnerWarehouseId, sourceWorksiteId, warehouses],
  );

  useEffect(() => {
    if (!active) {
      setSelectorOpen(false);
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
    void load(true);
  }, [active, load, sourceMode, sourceOwnerWarehouseId, warehouses]);

  useEffect(() => {
    if (sourceMode !== 'on-site') return;
    if (!sourceWorksiteId) {
      setBulkItems([]);
      setSerialItems([]);
      return;
    }
    void load(false);
  }, [load, sourceMode, sourceWorksiteId]);

  const clear = useCallback(() => {
    setBulkItems([]);
    setSerialItems([]);
    setSelectorOpen(false);
  }, []);

  const markWarehouseHandled = useCallback((warehouseId: string | null) => {
    lastAutoOpenedWarehouseRef.current = warehouseId;
  }, []);

  return {
    bulkItems,
    serialItems,
    setBulkItems,
    setSerialItems,
    loading,
    selectorOpen,
    setSelectorOpen,
    showOwnerWarehouse,
    availableBulkItems,
    pickerSerialItems,
    selectedBulkKeys,
    selectedSerialIds,
    load,
    clear,
    markWarehouseHandled,
  };
};
