'use client';
import { api, ApiError } from '@/lib/api';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildBulkKey } from './request-formatting';
import { buildProviderCatalog, getItemOwnerLabel } from './request-item-owners';
import { inventoryWithReturnOrigins, type ReturnDocumentOrigin } from './return-document-origins';
import type { Warehouse } from './request-types';
import {
  GenerateStep,
  InventoryBulk,
  InventorySerial,
  RequestInventoryResponse,
  SelectedItem,
  SkuOption,
  SolicitudesTab,
} from './request-types';

type Options = {
  selectedItems: SelectedItem[];
  docType: 'REMISSION' | 'RETURN';
  sourceMode: 'warehouse' | 'on-site';
  physicalSourceWarehouseId: string | null;
  fixedSourceWarehouseId?: string;
  sourceOwnerWarehouseId: string | null;
  setSourceOwnerWarehouseId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  warehouses: Warehouse[];
  skuOptions?: SkuOption[];
  effectiveSourceWorksiteId: string | null;
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
  physicalSourceWarehouseId,
  fixedSourceWarehouseId,
  sourceOwnerWarehouseId,
  setSourceOwnerWarehouseId,
  setError,
  warehouses,
  skuOptions = [],
  effectiveSourceWorksiteId,
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
  const [ownerModalOpen, setOwnerModalOpen] = useState(false);
  const itemStepStartedRef = useRef(false);

  const inventoryLoadVersionRef = useRef(0);
  const clearLoadedInventory = () => {
    inventoryLoadVersionRef.current += 1;
    setLoadingInventory(false);
    setBulkItems([]);
    setSerialItems([]);
    setItemsModalOpen(false);
  };
  useEffect(() => () => { inventoryLoadVersionRef.current += 1; },
    [docType, effectiveSourceWorksiteId]);

  const selectedBulkKeys = useMemo(
    () =>
      new Set(
        selectedItems
          .filter((item) => item.type === 'bulk' || item.type === 'free')
          .flatMap((item) => {
            if (item.bulkKey) return [item.bulkKey];
            const reference = item.type === 'free' ? skuOptions.find(sku => sku.name === item.requestedTag) : null;
            return reference ? [buildBulkKey({ skuId: reference.id, ownerWarehouseId: item.ownerWarehouseId ?? null, sourceWarehouseId: item.sourceWarehouseId })] : [];
          }),
      ),
    [selectedItems, skuOptions],
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

  const loadInventory = async (openSelector = true, ownerId = sourceOwnerWarehouseId ?? physicalSourceWarehouseId) => {
    const version = ++inventoryLoadVersionRef.current;
    setLoadingInventory(true);
    setError(null);
    try {
      if (sourceMode === 'warehouse') {
        if (!ownerId) throw new Error('Selecciona el dueño del equipo.');
        const sourceWarehouseId = fixedSourceWarehouseId ?? ownerId;
        const selectedOwner = warehouses.find(
          (warehouse) => warehouse.id === ownerId,
        );
        if (selectedOwner?.type === 'ALLY') {
          if (!skuOptions.length) throw new Error('No se pudo cargar el catálogo de equipos. Intenta nuevamente.');
          setBulkItems(buildProviderCatalog(skuOptions, selectedOwner, sourceWarehouseId));
          setSerialItems([]);
        } else {
          const data = await api<{
            bulk: InventoryBulk[];
            serial: InventorySerial[];
          }>(`/inventory/warehouse/${sourceWarehouseId}`, { method: 'GET' });
          if (version !== inventoryLoadVersionRef.current) return;
          const ownerNames = new Map(warehouses.map(warehouse => [warehouse.id, getItemOwnerLabel(warehouse)]));
          const bulk = selectedOwner?.type === 'OWN' ? data.bulk.filter(item => item.ownerWarehouseId === ownerId) : data.bulk;
          const serial = selectedOwner?.type === 'OWN' ? data.serial.filter(item => item.ownerWarehouseId === ownerId) : data.serial;
          setBulkItems(bulk.map(item => ({ ...item, sourceWarehouseId,
            ownerWarehouseName: ownerNames.get(item.ownerWarehouseId ?? '') ?? item.ownerWarehouseName,
          })));
          setSerialItems(serial.map(item => ({ ...item, sourceWarehouseId,
            ownerWarehouseName: ownerNames.get(item.ownerWarehouseId ?? '') ?? item.ownerWarehouseName,
          })));
        }
      } else if (sourceMode === 'on-site') {
        if (!effectiveSourceWorksiteId) throw new Error('Selecciona una obra');
        const [stock, origins] = await Promise.all([api<RequestInventoryResponse>(
          `/inventory/on-site/${effectiveSourceWorksiteId}/request-options`,
          { method: 'GET' },
        ), docType === 'RETURN' ? api<ReturnDocumentOrigin[]>(`/equipment-configurations/return-origins?customerWorksiteId=${encodeURIComponent(effectiveSourceWorksiteId)}`) : Promise.resolve([])]);
        if (version !== inventoryLoadVersionRef.current) return;
        const data = inventoryWithReturnOrigins(stock, origins);
        setBulkItems(data.bulk);
        setSerialItems(data.serial);
        setShowInventoryOwnerWarehouse(data.presentation.showOwnerWarehouse);
      }
      if (openSelector) {
        setItemsModalOpen(true);
      }
    } catch (err) {
      if (version !== inventoryLoadVersionRef.current) return;
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('No se pudo cargar la lista de equipos.');
      }
    } finally {
      if (version === inventoryLoadVersionRef.current) setLoadingInventory(false);
    }
  };

  const startItemSelection = () => {
    clearLoadedInventory();
    if (sourceMode === 'warehouse') setOwnerModalOpen(true);
    else void loadInventory();
  };

  const confirmItemOwner = (ownerId: string) => {
    clearLoadedInventory();
    setSourceOwnerWarehouseId(ownerId);
    setOwnerModalOpen(false);
    return loadInventory(true, ownerId);
  };

  useEffect(() => {
    if (activeTab !== 'generate' || generateStep !== 'items') {
      inventoryLoadVersionRef.current += 1;
      setLoadingInventory(false);
      setItemsModalOpen(false);
      setOwnerModalOpen(false);
      itemStepStartedRef.current = false;
      return;
    }
    if (sourceMode !== 'warehouse') return;
    if (itemStepStartedRef.current) return;
    itemStepStartedRef.current = true;
    if (!selectedItems.length) setOwnerModalOpen(true);
  }, [activeTab, generateStep, sourceMode, selectedItems.length]);

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
    clearLoadedInventory,
    bulkItems,
    setBulkItems,
    serialItems,
    setSerialItems,
    loadingInventory,
    showInventoryOwnerWarehouse,
    itemsModalOpen,
    ownerModalOpen,
    setOwnerModalOpen,
    startItemSelection,
    confirmItemOwner,
    setItemsModalOpen,
    selectedBulkKeys,
    selectedSerialIds,
    availableBulkItems,
    pickerSerialItems,
    loadInventory,
  };
}
