'use client';
import type { Dispatch, SetStateAction } from 'react';
import { buildBulkKey, createSelectionId } from './request-formatting';
import type { Warehouse } from './request-types';
import { InventoryBulk, SelectedItem, SkuOption } from './request-types';

type Options = {
  setError: Dispatch<SetStateAction<string | null>>;
  setSelectedItems: Dispatch<SetStateAction<SelectedItem[]>>;
  sourceMode: 'warehouse' | 'on-site';
  freeTagInput: string;
  sourceOwnerWarehouseId: string | null;
  warehouses: Warehouse[];
  freeInternalNumber: number | '';
  setFreeTagInput: Dispatch<SetStateAction<string>>;
  setFreeInternalNumber: Dispatch<SetStateAction<number | ''>>;
  setItemsAddedNotice: Dispatch<SetStateAction<string | null>>;
  skuOptions: SkuOption[];
};

export function useRequestItemEditing({
  setError,
  setSelectedItems,
  sourceMode,
  freeTagInput,
  sourceOwnerWarehouseId,
  warehouses,
  freeInternalNumber,
  setFreeTagInput,
  setFreeInternalNumber,
  setItemsAddedNotice,
  skuOptions,
}: Options) {
  const addBulkItem = (item: InventoryBulk) => {
    if (item.quantity < 0) {
      setError(
        'Este item tiene alerta de inventario negativo. Ajusta stock antes de usarlo en un documento.',
      );
      return false;
    }
    const bulkKey = buildBulkKey(item);
    let added = false;
    setSelectedItems((prev) => {
      const exists = prev.find(
        (entry) => entry.type === 'bulk' && entry.bulkKey === bulkKey,
      );
      if (exists) return prev;
      added = true;
      return [
        ...prev,
        {
          selectionId: createSelectionId(),
          type: 'bulk',
          bulkKey,
          skuId: item.skuId,
          name: item.skuName ?? item.skuId,
          quantity: sourceMode === 'on-site' ? item.quantity : 1,
          availableQuantity: item.quantity,
          ownerWarehouseId: item.ownerWarehouseId,
        },
      ];
    });
    return added;
  };

  const addFreeItem = () => {
    const tag = freeTagInput.trim().toUpperCase();
    if (!tag) {
      setError('Escribe la referencia');
      return;
    }
    if (!sourceOwnerWarehouseId) {
      setError('Selecciona primero la bodega dueña');
      return;
    }
    const selectedOwnerType = warehouses.find(
      (warehouse) => warehouse.id === sourceOwnerWarehouseId,
    )?.type;

    if (selectedOwnerType === 'ALLY') {
      const internal =
        typeof freeInternalNumber === 'number' ? freeInternalNumber : null;
      const requestedReference = internal ? `${tag} #${internal}` : tag;
      setError(null);
      setSelectedItems((prev) => {
        const exists = prev.some(
          (item) =>
            item.ownerWarehouseId === sourceOwnerWarehouseId &&
            (item.requestedTag ?? item.name).toUpperCase() ===
              requestedReference,
        );
        if (exists) return prev;
        return [
          ...prev,
          {
            selectionId: createSelectionId(),
            type: 'free',
            name: requestedReference,
            requestedTag: requestedReference,
            quantity: 1,
            ownerWarehouseId: sourceOwnerWarehouseId,
          },
        ];
      });
      setFreeTagInput('');
      setFreeInternalNumber('');
      setItemsAddedNotice(`${requestedReference} agregado a la lista.`);
      return;
    }

    setError('La captura manual solo aplica a bodega alterna.');
  };

  const resolveFreeItemToSku = (index: number, skuId: string | null) => {
    if (!skuId) return;
    const sku = skuOptions.find((entry) => entry.id === skuId);
    if (!sku) return;
    setSelectedItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              selectionId: item.selectionId,
              type: 'bulk',
              bulkKey: buildBulkKey({
                skuId,
                ownerWarehouseId: item.ownerWarehouseId ?? null,
              }),
              skuId,
              name: sku.name,
              quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
              ownerWarehouseId: item.ownerWarehouseId,
              isDamaged: item.isDamaged,
              damageDescription: item.damageDescription,
            }
          : item,
      ),
    );
  };

  const updateSelected = (index: number, updates: Partial<SelectedItem>) => {
    setSelectedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item)),
    );
  };

  const updateSelectedOwner = (
    index: number,
    ownerWarehouseId: string | null,
  ) => {
    setSelectedItems((prev) =>
      prev.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        return {
          ...item,
          ownerWarehouseId,
          ...(item.type === 'bulk' && item.skuId
            ? { bulkKey: buildBulkKey({ skuId: item.skuId, ownerWarehouseId }) }
            : {}),
        };
      }),
    );
  };

  const splitSelectedItem = (index: number) => {
    setSelectedItems((current) => {
      const item = current[index];
      const quantity = Number(item?.quantity ?? 1);
      if (
        !item ||
        item.type === 'serial' ||
        !Number.isFinite(quantity) ||
        quantity <= 1
      ) {
        return current;
      }
      const next = [...current];
      next.splice(
        index,
        1,
        { ...item, quantity: 1 },
        {
          ...item,
          selectionId: createSelectionId(),
          quantity: quantity - 1,
          ownerWarehouseId: null,
        },
      );
      return next;
    });
  };

  const removeSelected = (selectionId: string) => {
    setSelectedItems((current) => {
      const removed = current.find((item) => item.selectionId === selectionId);
      if (!removed) return current;

      if (
        removed.assetId &&
        current.some((item) => item.componentParentAssetId === removed.assetId)
      ) {
        return current.filter(
          (item) =>
            item.selectionId !== selectionId &&
            item.componentParentAssetId !== removed.assetId,
        );
      }

      const mixerAssetId =
        removed.associatedMixerId ??
        (removed.assetId &&
        current.some((item) => item.associatedMixerId === removed.assetId)
          ? removed.assetId
          : null);

      if (!mixerAssetId) {
        return current.filter((item) => item.selectionId !== selectionId);
      }

      return current.filter(
        (item) =>
          item.selectionId !== selectionId &&
          item.assetId !== mixerAssetId &&
          item.associatedMixerId !== mixerAssetId,
      );
    });
  };
  return {
    addBulkItem,
    addFreeItem,
    resolveFreeItemToSku,
    updateSelected,
    updateSelectedOwner,
    splitSelectedItem,
    removeSelected,
  };
}
