'use client';
import { documentCompositionPayload } from './request-items';
import { getRequestSourceWarehouseId, getRequestItemInventoryKey, loadRequestSourceInventories } from './request-inventory-source';
import { api, ApiError } from '@/lib/api';
import {
  buildInventoryStockShortageMessage,
  extractInventoryStockShortages,
} from '@/lib/inventory-stock-errors';
import type { Dispatch, SetStateAction } from 'react';
import { useState } from 'react';
import {
  extractOwnerWarehouseIdFromMessage,
  extractSkuIdsFromMessages,
  getMissingProvidersFromApprovalError,
  normalizeApiErrorMessages,
} from './request-errors';
import {
  normalizeTagBase,
  parseInternalNumberFromTag,
} from './request-formatting';
import type {
  EvidencePhotoDraft,
  ProviderRemissionRequirement,
  Warehouse,
} from './request-types';
import {
  CreateSerializedAssetResponse,
  InventoryBulk,
  InventorySerial,
  ProviderRemissionModalState,
  ProviderRemissionRequirements,
  RequestDocumentDetail,
  ResolveInventoryByOwner,
  SkuOption,
} from './request-types';

type Options = {
  skuOptions: SkuOption[];
  setRequestsError: Dispatch<SetStateAction<string | null>>;
  canDecide: boolean;
  warehouses: Warehouse[];
  setItemsAddedNotice: Dispatch<SetStateAction<string | null>>;
  setProviderRemissionModal: Dispatch<
    SetStateAction<ProviderRemissionModalState | null>
  >;
  setProviderRemissionError: Dispatch<SetStateAction<string | null>>;
  loadRequests: () => Promise<void>;
  providerRemissionModal: ProviderRemissionModalState | null;
  providerRemissionDrafts: Record<string, EvidencePhotoDraft>;
  uploadProviderRemissionDocuments: (
    documentId: string,
    providers: ProviderRemissionRequirement[],
  ) => Promise<void>;
  clearProviderRemissionDocuments: () => void;
};

export function useRequestApproval({
  skuOptions,
  setRequestsError,
  canDecide,
  warehouses,
  setItemsAddedNotice,
  setProviderRemissionModal,
  setProviderRemissionError,
  loadRequests,
  providerRemissionModal,
  providerRemissionDrafts,
  uploadProviderRemissionDocuments,
  clearProviderRemissionDocuments,
}: Options) {
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const [resolveModalOpen, setResolveModalOpen] = useState(false);

  const [resolveDocument, setResolveDocument] =
    useState<RequestDocumentDetail | null>(null);

  const [resolveSkuByIndex, setResolveSkuByIndex] = useState<
    Record<number, string>
  >({});

  const [resolveAssetByIndex, setResolveAssetByIndex] = useState<
    Record<number, string>
  >({});

  const [resolveInventoryByOwner, setResolveInventoryByOwner] =
    useState<ResolveInventoryByOwner>({});

  const [resolvingApprove, setResolvingApprove] = useState(false);

  const [createSerialOpen, setCreateSerialOpen] = useState(false);

  const [createSerialIndex, setCreateSerialIndex] = useState<number | null>(
    null,
  );

  const [createSerialSerialOrEngine, setCreateSerialSerialOrEngine] =
    useState('');

  const [createSerialInternalNumber, setCreateSerialInternalNumber] = useState<
    number | ''
  >('');

  const [createSerialBrand, setCreateSerialBrand] = useState('');

  const [createSerialModel, setCreateSerialModel] = useState('');

  const [createSerialYear, setCreateSerialYear] = useState<number | ''>('');

  const [createSerialFuel, setCreateSerialFuel] = useState<string | null>(null);

  const [createSerialSaving, setCreateSerialSaving] = useState(false);

  const [createSerialError, setCreateSerialError] = useState<string | null>(
    null,
  );

  const [adjustWarningModalOpen, setAdjustWarningModalOpen] = useState(false);

  const [adjustWarningMessage, setAdjustWarningMessage] = useState<
    string | null
  >(null);

  const [adjustWarningOwnerWarehouseId, setAdjustWarningOwnerWarehouseId] =
    useState<string | null>(null);

  const [adjustWarningWarehouseId, setAdjustWarningWarehouseId] = useState<string | null>(null);

  const [providerRemissionUploading, setProviderRemissionUploading] =
    useState(false);

  const isResolvePendingItem = (
    item: RequestDocumentDetail['items'][number],
  ) => {
    const hasTag = Boolean(item.requestedTag?.trim());
    if (item.accessoryId) return false;
    if (!item.skuId && !item.assetId) {
      return hasTag;
    }
    if (item.skuId && !item.assetId) {
      const skuType = skuOptions.find(
        (sku) => sku.id === item.skuId,
      )?.controlType;
      return skuType === 'SERIAL';
    }
    return false;
  };

  const getResolveSkuOptions = (ownerWarehouseId?: string | null) => {
    if (!ownerWarehouseId) return [];
    if (resolveDocument?.type === 'RETURN') {
      const inventory = resolveInventoryByOwner[ownerWarehouseId];
      const available = new Set([
        ...(inventory?.bulk.filter((item) => item.quantity > 0).map((item) => item.skuId) ?? []),
        ...(inventory?.serial.map((item) => item.skuId) ?? []),
      ]);
      return skuOptions.filter((sku) => available.has(sku.id)).map((sku) => ({ value: sku.id, label: sku.name }));
    }
    // Catalogue references remain selectable when the specific equipment must
    // first be registered. Availability is checked on the physical-source picker.
    return skuOptions.map((sku) => ({ value: sku.id, label: sku.name }));
  };

  const handleApprovalError = (err: unknown, documentId?: string) => {
    if (!(err instanceof ApiError)) {
      if (err instanceof Error) {
        setRequestsError(err.message);
      } else {
        setRequestsError('Error procesando la solicitud');
      }
      return;
    }

    const messages = normalizeApiErrorMessages(err);
    const hasAssetUnavailableError = messages.some((message) =>
      /asset\s+[0-9a-f-]{36}\s+is not available in owner warehouse/i.test(
        message,
      ),
    );
    if (hasAssetUnavailableError) {
      setRequestsError(
        'No se puede aprobar: el equipo no esta disponible en la bodega de origen. Revisa si esta en obra o selecciona/carga el equipo correcto antes de aprobar.',
      );
      return;
    }

    const stockShortages = extractInventoryStockShortages(err.data);
    const hasStockError =
      stockShortages.length > 0 ||
      messages.some((message) =>
        /insufficient stock|stock insuficiente/i.test(message),
      );
    if (hasStockError && canDecide) {
      setAdjustWarningWarehouseId(stockShortages[0]?.warehouseId ?? null);
      if (stockShortages.length > 0) {
        const firstOwnerId = stockShortages[0]?.ownerWarehouseId ?? null;
        setAdjustWarningOwnerWarehouseId(firstOwnerId);
        setAdjustWarningMessage(
          buildInventoryStockShortageMessage(
            stockShortages,
            (skuId) =>
              skuOptions.find((entry) => entry.id === skuId)?.name ??
              `SKU ${skuId.slice(0, 8)}`,
            (warehouseId) =>
              warehouses.find(
                (warehouse) =>
                  warehouse.id.toLowerCase() === warehouseId.toLowerCase(),
              )?.name ?? 'bodega sin identificar',
          ),
        );
        setAdjustWarningModalOpen(true);
        setRequestsError(null);
        return;
      }
      const messageWithOwner =
        messages.find((message) => /ownerWarehouse/i.test(message)) ??
        messages[0] ??
        '';
      const ownerId = extractOwnerWarehouseIdFromMessage(messageWithOwner);
      const ownerName = ownerId
        ? warehouses.find(
            (warehouse) => warehouse.id.toLowerCase() === ownerId.toLowerCase(),
          )?.name
        : null;
      const missingSkuLabels = extractSkuIdsFromMessages(messages).map(
        (skuId) => {
          const skuName = skuOptions.find((entry) => entry.id === skuId)?.name;
          return skuName ?? `SKU ${skuId.slice(0, 8)}`;
        },
      );
      const ownerLabel = ownerName ? ` Propietario indicado: ${ownerName}.` : '';
      const missingItemsBlock = missingSkuLabels.length
        ? `\n\nItems por crear/ajustar:\n- ${missingSkuLabels.join('\n- ')}`
        : '';
      setAdjustWarningOwnerWarehouseId(ownerId ?? null);
      setAdjustWarningMessage(
        `No se puede aprobar la remisión: revisa las existencias en el origen físico del documento.${ownerLabel}${missingItemsBlock}`,
      );
      setAdjustWarningModalOpen(true);
      setRequestsError(null);
      return;
    }

    setRequestsError(`${err.status}: ${err.message}`);
  };

  const closeResolveModal = () => {
    if (resolvingApprove) return;
    setResolveModalOpen(false);
    setResolveDocument(null);
    setResolveSkuByIndex({});
    setResolveAssetByIndex({});
    setResolveInventoryByOwner({});
  };

  const loadResolveInventories = (doc: RequestDocumentDetail, ownerIds: string[]) =>
    loadRequestSourceInventories<InventoryBulk, InventorySerial>(doc, ownerIds, (id) =>
      api<{ bulk: InventoryBulk[]; serial: InventorySerial[] }>(`/inventory/warehouse/${id}`, { method: 'GET' }));

  const buildInitialResolveState = (
    doc: RequestDocumentDetail,
    inventoriesByOwner: ResolveInventoryByOwner,
  ) => {
    const skuByNormalizedName = new Map<string, SkuOption>();
    skuOptions.forEach((sku) => skuByNormalizedName.set(sku.name.trim().toUpperCase(), sku));
    const initialSkuMap: Record<number, string> = {};
    const initialAssetMap: Record<number, string> = {};

    doc.items.forEach((item, index) => {
      if (item.assetId || item.accessoryId) return;
      const normalizedTag = normalizeTagBase(item.requestedTag);
      const matchedSku = item.skuId
        ? skuOptions.find((sku) => sku.id === item.skuId) ?? null
        : (normalizedTag ? skuByNormalizedName.get(normalizedTag) ?? null : null);
      if (!matchedSku) return;

      const ownerWarehouseId = item.condition?.trim();
      if (!ownerWarehouseId) return;
      if (doc.type === 'RETURN') {
        const inventory = inventoriesByOwner[ownerWarehouseId];
        if (!inventory?.bulk.some((bulk) => bulk.skuId === matchedSku.id && bulk.quantity > 0)
          && !inventory?.serial.some((serial) => serial.skuId === matchedSku.id)) return;
      }
      initialSkuMap[index] = matchedSku.id;

      if (matchedSku.controlType !== 'SERIAL') return;
      const serialCandidates =
        inventoriesByOwner[getRequestItemInventoryKey(doc, item)]?.serial.filter((serial) => serial.skuId === matchedSku.id) ?? [];
      const internalFromTag = parseInternalNumberFromTag(item.requestedTag);
      if (internalFromTag == null) return;
      const exactAsset = serialCandidates.find((serial) => serial.internalNumber === internalFromTag);
      if (exactAsset) {
        initialAssetMap[index] = exactAsset.assetId;
      }
    });

    return { initialSkuMap, initialAssetMap };
  };

  const openCreateSerialForRow = (index: number) => {
    const row = resolveDocument?.items[index];
    if (!row) return;
    const internal = parseInternalNumberFromTag(row.requestedTag);
    setCreateSerialIndex(index);
    setCreateSerialSerialOrEngine('');
    setCreateSerialInternalNumber(internal ?? '');
    setCreateSerialBrand('');
    setCreateSerialModel('');
    setCreateSerialYear('');
    setCreateSerialFuel(null);
    setCreateSerialError(null);
    setCreateSerialOpen(true);
  };

  const createMissingSerialFromResolve = async () => {
    if (!resolveDocument || createSerialIndex == null) return;
    const row = resolveDocument.items[createSerialIndex];
    if (!row) return;
    const ownerWarehouseId = row.condition?.trim();
    if (!ownerWarehouseId) {
      setCreateSerialError('Selecciona el propietario del equipo antes de crearlo.');
      return;
    }
    const sourceWarehouseId = getRequestSourceWarehouseId(resolveDocument, ownerWarehouseId, row.sourceWarehouseId);
    if (!sourceWarehouseId) {
      setCreateSerialError('Selecciona la bodega de salida del documento antes de crear el equipo.');
      return;
    }
    const selectedSkuId = resolveSkuByIndex[createSerialIndex];
    const selectedSku = skuOptions.find((entry) => entry.id === selectedSkuId);
    if (!selectedSku || selectedSku.controlType !== 'SERIAL') {
      setCreateSerialError('Selecciona primero un SKU serializado.');
      return;
    }
    if (!createSerialSerialOrEngine.trim()) {
      setCreateSerialError('El serial/motor es obligatorio.');
      return;
    }
    if (createSerialInternalNumber === '' || Number(createSerialInternalNumber) <= 0) {
      setCreateSerialError('Invalid internal number.');
      return;
    }

    setCreateSerialSaving(true);
    setCreateSerialError(null);
    try {
      const response = await api<CreateSerializedAssetResponse>('/inventory/serialized-assets', {
        method: 'POST',
        json: {
          family: { id: selectedSku.assetFamilyId },
          sku: { id: selectedSku.id },
          asset: {
            serialOrEngine: createSerialSerialOrEngine.trim(),
            internalNumber: Number(createSerialInternalNumber),
            brand: createSerialBrand.trim() || undefined,
            model: createSerialModel.trim() || undefined,
            year: createSerialYear === '' ? undefined : createSerialYear,
            fuel: createSerialFuel ?? undefined,
            active: true,
          },
          ownerWarehouseId,
          warehouseCurrentId: sourceWarehouseId,
        },
      });

      const refreshedInventory = await api<{ bulk: InventoryBulk[]; serial: InventorySerial[] }>(`/inventory/warehouse/${sourceWarehouseId}`, {
        method: 'GET',
      });
      setResolveInventoryByOwner((prev) => ({
        ...prev,
        [getRequestItemInventoryKey(resolveDocument, row)]: {
          bulk: (refreshedInventory.bulk ?? []).filter(
            (item) => item.ownerWarehouseId === ownerWarehouseId,
          ),
          serial: (refreshedInventory.serial ?? []).filter(
            (item) => item.ownerWarehouseId === ownerWarehouseId,
          ),
        },
      }));
      setResolveAssetByIndex((prev) => ({
        ...prev,
        [createSerialIndex]: response.asset.id,
      }));
      setCreateSerialOpen(false);
      setCreateSerialIndex(null);
      setCreateSerialBrand('');
      setCreateSerialModel('');
      setCreateSerialYear('');
      setCreateSerialFuel(null);
      setItemsAddedNotice('Equipo creado y asignado al tag.');
    } catch (err) {
      if (err instanceof ApiError) {
        setCreateSerialError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setCreateSerialError(err.message);
      } else {
        setCreateSerialError('Error creando equipo.');
      }
    } finally {
      setCreateSerialSaving(false);
    }
  };

  const approveWithDecision = async (documentId: string) => {
    setDecidingId(documentId);
    setRequestsError(null);
    try {
      const requirements = await api<ProviderRemissionRequirements>(
        `/documents/${documentId}/provider-remission-requirements`,
        { method: 'GET' },
      );
      if (requirements.missingProviders.length) {
        setProviderRemissionModal({
          mode: 'REQUIRED',
          requirements,
          documentId,
        });
        setProviderRemissionError(null);
        return false;
      }
      await api(`/documents/${documentId}/decision`, {
        method: 'POST',
        json: { action: 'APPROVE' },
      });
      await loadRequests();
      return true;
    } catch (err) {
      const missingProviders = getMissingProvidersFromApprovalError(err);
      if (missingProviders?.length) {
        setProviderRemissionModal({
          mode: 'REQUIRED',
          requirements: {
            required: true,
            providers: missingProviders,
            missingProviders,
          },
          documentId,
        });
        setProviderRemissionError(null);
        return false;
      }
      handleApprovalError(err, documentId);
      return false;
    } finally {
      setDecidingId(null);
    }
  };

  const uploadMissingProviderRemissionsAndApprove = async () => {
    if (
      providerRemissionModal?.mode !== 'REQUIRED' ||
      !providerRemissionModal.documentId
    ) {
      return;
    }
    const missingProviders =
      providerRemissionModal.requirements.missingProviders;
    const missingFile = missingProviders.find(
      (provider) => !providerRemissionDrafts[provider.providerWarehouseId],
    );
    if (missingFile) {
      setProviderRemissionError(
        `Adjunta la remisión física de ${missingFile.providerName}.`,
      );
      return;
    }

    setProviderRemissionUploading(true);
    setProviderRemissionError(null);
    try {
      await uploadProviderRemissionDocuments(
        providerRemissionModal.documentId,
        missingProviders,
      );
      const approved = await approveWithDecision(
        providerRemissionModal.documentId,
      );
      if (approved) clearProviderRemissionDocuments();
    } catch (err) {
      setProviderRemissionError(
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'No se pudieron subir las remisiones del proveedor.',
      );
    } finally {
      setProviderRemissionUploading(false);
    }
  };

  const decideRequest = async (
    documentId: string,
    action: 'APPROVE' | 'REJECT',
  ) => {
    if (action === 'REJECT') {
      const reason =
        window.prompt('Motivo de rechazo (opcional):') ?? undefined;
      if (!window.confirm('¿Rechazar esta solicitud?')) return;
      setDecidingId(documentId);
      setRequestsError(null);
      try {
        await api(`/documents/${documentId}/decision`, {
          method: 'POST',
          json: { action, reason },
        });
        await loadRequests();
      } catch (err) {
        handleApprovalError(err);
      } finally {
        setDecidingId(null);
      }
      return;
    }

    try {
      const doc = await api<RequestDocumentDetail>(`/documents/${documentId}`, {
        method: 'GET',
      });
      const unresolved = doc.items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => isResolvePendingItem(item));

      if (unresolved.length > 0) {
        const ownerIds = unresolved
          .map(({ item }) => item.condition?.trim() ?? '')
          .filter((value): value is string => Boolean(value));
        const inventoriesByOwner = await loadResolveInventories(doc, ownerIds);
        const { initialSkuMap, initialAssetMap } = buildInitialResolveState(
          doc,
          inventoriesByOwner,
        );

        setResolveDocument(doc);
        setResolveInventoryByOwner(inventoriesByOwner);
        setResolveSkuByIndex(initialSkuMap);
        setResolveAssetByIndex(initialAssetMap);
        setResolveModalOpen(true);
        return;
      }

      if (
        !window.confirm(
          '¿Aprobar esta solicitud y ejecutar el movimiento de inventario?',
        )
      )
        return;
      await approveWithDecision(documentId);
    } catch (err) {
      handleApprovalError(err);
    }
  };

  const resolveAndApprove = async () => {
    if (!resolveDocument) return;
    const unresolved = resolveDocument.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => isResolvePendingItem(item));

    const missing = unresolved.filter(({ index }) => !resolveSkuByIndex[index]);
    if (missing.length > 0) {
      setRequestsError('Resuelve todos los tags pendientes antes de aprobar.');
      return;
    }

    const serialMissingAsset = unresolved.filter(({ item, index }) => {
      const skuId = resolveSkuByIndex[index];
      const sku = skuOptions.find((entry) => entry.id === skuId);
      if (sku?.controlType !== 'SERIAL') return false;
      return !resolveAssetByIndex[index];
    });
    if (serialMissingAsset.length > 0) {
      setRequestsError(
        'Falta seleccionar o crear equipo para uno o mas tags seriales.',
      );
      return;
    }

    setResolvingApprove(true);
    setRequestsError(null);
    try {
      const itemsPayload = resolveDocument.items.map((item, index) => {
        const composition = documentCompositionPayload(item);
        const ownerWarehouseId = item.condition ?? undefined;
        if (item.accessoryId) return {
          ...composition,
          sourceWarehouseId: item.sourceWarehouseId ?? undefined,
          accessoryId: item.accessoryId,
          accessorySourceBalanceId: item.accessorySourceBalanceId ?? undefined,
          componentParentAssetId: item.componentParentAssetId ?? undefined,
          quantity: Number(item.quantity), ownerWarehouseId, conditionNote: item.conditionNote ?? undefined,
        };
        if (item.assetId) {
          return {
            ...composition,
            assetId: item.assetId,
            sourceWarehouseId: item.sourceWarehouseId ?? undefined,
            componentParentAssetId: item.componentParentAssetId ?? undefined,
            ownerWarehouseId,
            conditionNote: item.conditionNote ?? undefined,
          };
        }
        if (item.skuId && !item.assetId) {
          const existingSku = skuOptions.find(
            (entry) => entry.id === item.skuId,
          );
          if (existingSku?.controlType === 'SERIAL') {
            return {
              ...composition,
              assetId: resolveAssetByIndex[index],
              sourceWarehouseId: item.sourceWarehouseId ?? undefined,
              componentParentAssetId: item.componentParentAssetId ?? undefined,
              ownerWarehouseId,
              requestedTag: item.requestedTag ?? undefined,
              conditionNote: item.conditionNote ?? undefined,
            };
          }
        }
        if (item.skuId) {
          return {
            ...composition,
            skuId: item.skuId,
            sourceWarehouseId: item.sourceWarehouseId ?? undefined,
            componentParentAssetId: item.componentParentAssetId ?? undefined,
            quantity: Number(item.quantity ?? 1) || 1,
            ownerWarehouseId,
            requestedTag: item.requestedTag ?? undefined,
            conditionNote: item.conditionNote ?? undefined,
          };
        }
        const resolvedSkuId = resolveSkuByIndex[index];
        const resolvedSku = skuOptions.find(
          (entry) => entry.id === resolvedSkuId,
        );
        if (resolvedSku?.controlType === 'SERIAL') {
          return {
            ...composition,
            assetId: resolveAssetByIndex[index],
            sourceWarehouseId: item.sourceWarehouseId ?? undefined,
            componentParentAssetId: item.componentParentAssetId ?? undefined,
            ownerWarehouseId,
            requestedTag: item.requestedTag ?? undefined,
            conditionNote: item.conditionNote ?? undefined,
          };
        }
        return {
          ...composition,
          skuId: resolvedSkuId,
          sourceWarehouseId: item.sourceWarehouseId ?? undefined,
          componentParentAssetId: item.componentParentAssetId ?? undefined,
          quantity: Number(item.quantity ?? 1) || 1,
          ownerWarehouseId,
          requestedTag: item.requestedTag ?? undefined,
          conditionNote: item.conditionNote ?? undefined,
        };
      });

      await api(`/documents/${resolveDocument.id}/request`, {
        method: 'PATCH',
        json: {
          type: resolveDocument.type,
          number: resolveDocument.consecutive ?? undefined,
          warehouseId: resolveDocument.warehouse?.id ?? undefined,
          inventorySourceMode: resolveDocument.inventorySourceMode ?? undefined,
          customerWorksiteId: resolveDocument.customerWorksite?.id ?? undefined,
          notes: resolveDocument.notes ?? undefined,
          items: itemsPayload,
        },
      });

      await approveWithDecision(resolveDocument.id);
      closeResolveModal();
    } catch (err) {
      handleApprovalError(err);
    } finally {
      setResolvingApprove(false);
    }
  };
  return {
    decidingId,
    resolveModalOpen,
    resolveDocument,
    resolveSkuByIndex,
    setResolveSkuByIndex,
    resolveAssetByIndex,
    setResolveAssetByIndex,
    resolveInventoryByOwner,
    resolvingApprove,
    createSerialOpen,
    setCreateSerialOpen,
    createSerialIndex,
    setCreateSerialIndex,
    createSerialSerialOrEngine,
    setCreateSerialSerialOrEngine,
    createSerialInternalNumber,
    setCreateSerialInternalNumber,
    createSerialBrand,
    setCreateSerialBrand,
    createSerialModel,
    setCreateSerialModel,
    createSerialYear,
    setCreateSerialYear,
    createSerialFuel,
    setCreateSerialFuel,
    createSerialSaving,
    createSerialError,
    setCreateSerialError,
    adjustWarningWarehouseId,
    setAdjustWarningWarehouseId,
    adjustWarningModalOpen,
    setAdjustWarningModalOpen,
    adjustWarningMessage,
    adjustWarningOwnerWarehouseId,
    setAdjustWarningOwnerWarehouseId,
    providerRemissionUploading,
    isResolvePendingItem,
    getResolveSkuOptions,
    closeResolveModal,
    openCreateSerialForRow,
    createMissingSerialFromResolve,
    uploadMissingProviderRemissionsAndApprove,
    decideRequest,
    resolveAndApprove,
  };
}
