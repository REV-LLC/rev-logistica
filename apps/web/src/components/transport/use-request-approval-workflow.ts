'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { api, ApiError } from '@/lib/api';
import type {
  InventoryItemPickerBulkItem,
  InventoryItemPickerSerialItem,
} from '@/components/InventoryItemPickerModal';
import type { CreateSerializedAssetValues } from '@/components/inventory/CreateSerializedAssetModal';
import {
  buildInventoryStockShortageMessage,
  extractInventoryStockShortages,
} from '@/lib/inventory-stock-errors';
import {
  buildInitialResolveState,
  buildResolvedItemsPayload,
  isResolvePendingItem,
  validateApprovalResolution,
} from '@/components/transport/approval-resolution';
import { classifyApprovalRecovery } from '@/components/transport/approval-errors';
import type { ProviderRemissionRequirements } from '@/components/transport/ProviderRemissionsModal';
import type {
  RequestDocumentDetail,
  ResolveInventoryByOwner,
  SkuOption,
} from '@/components/transport/request-document-types';
import type { Warehouse } from '@/components/transport/use-request-catalogs';
import { useRequestApproval } from '@/components/transport/use-request-approval';
import {
  extractOwnerWarehouseIdFromMessage,
  extractSkuIdsFromMessages,
  normalizeApiErrorMessages,
} from '@/components/transport/transport-errors';

type InventorySerial = InventoryItemPickerSerialItem;

type MixerMotorRecovery = {
  document: RequestDocumentDetail;
  mixer: InventorySerial;
  motors: InventorySerial[];
  ownerWarehouseId: string;
};

type CreateSerializedAssetResponse = {
  asset: { id: string };
};

type UseRequestApprovalWorkflowOptions = {
  canDecide: boolean;
  warehouses: Warehouse[];
  skuOptions: SkuOption[];
  setRequestsError: Dispatch<SetStateAction<string | null>>;
  onReload: () => Promise<void>;
  onItemsAddedNotice: (message: string) => void;
  onProviderRemissionRequired: (
    documentId: string,
    requirements: ProviderRemissionRequirements,
  ) => void;
};

export function useRequestApprovalWorkflow({
  canDecide,
  warehouses,
  skuOptions,
  setRequestsError,
  onReload,
  onItemsAddedNotice,
  onProviderRemissionRequired,
}: UseRequestApprovalWorkflowOptions) {
  const [motorRecovery, setMotorRecovery] = useState<MixerMotorRecovery | null>(null);
  const [motorRecoveryLoading, setMotorRecoveryLoading] = useState(false);
  const [motorRecoveryError, setMotorRecoveryError] = useState<string | null>(null);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolveDocument, setResolveDocument] = useState<RequestDocumentDetail | null>(null);
  const [resolveSkuByIndex, setResolveSkuByIndex] = useState<Record<number, string>>({});
  const [resolveAssetByIndex, setResolveAssetByIndex] = useState<Record<number, string>>({});
  const [resolveInventoryByOwner, setResolveInventoryByOwner] =
    useState<ResolveInventoryByOwner>({});
  const [resolvingApprove, setResolvingApprove] = useState(false);
  const [createSerialIndex, setCreateSerialIndex] = useState<number | null>(null);
  const [adjustWarningMessage, setAdjustWarningMessage] = useState<string | null>(null);
  const [adjustWarningOwnerWarehouseId, setAdjustWarningOwnerWarehouseId] =
    useState<string | null>(null);

  const openMixerMotorRecovery = async (
    documentId: string,
    mixerAssetId: string,
    recoveryOwnerWarehouseId: string | null,
  ) => {
    setMotorRecoveryLoading(true);
    setMotorRecoveryError(null);
    try {
      const document = await api<RequestDocumentDetail>(`/documents/${documentId}`, {
        method: 'GET',
      });
      const mixerItem = document.items.find((item) => item.assetId === mixerAssetId);
      const ownerWarehouseId = recoveryOwnerWarehouseId ?? mixerItem?.condition?.trim();
      if (!mixerItem?.asset || !ownerWarehouseId) {
        throw new Error('No se pudo identificar la mezcladora o su bodega de origen.');
      }
      const inventory = await api<{ serial: InventorySerial[] }>(
        `/inventory/warehouse/${ownerWarehouseId}`,
        { method: 'GET' },
      );
      const mixer: InventorySerial = {
        assetId: mixerItem.asset.id,
        skuId: mixerItem.skuId ?? mixerItem.asset.sku?.id ?? null,
        skuName: mixerItem.asset.sku?.name ?? mixerItem.sku?.name ?? 'Mezcladora',
        description: mixerItem.asset.description ?? null,
        serialOrEngine: mixerItem.asset.serialOrEngine ?? null,
        internalNumber: null,
        quantity: 1,
        ownerWarehouseId,
        assignedMotorId: mixerItem.asset.assignedMotorId ?? null,
      };
      const motors = (inventory.serial ?? []).filter(
        (item) => item.kind === 'MOTOR'
          && item.ownerWarehouseId === ownerWarehouseId
          && (!item.assignedMixerId || item.assignedMixerId === mixer.assetId),
      );
      setMotorRecovery({ document, mixer, motors, ownerWarehouseId });
      setRequestsError(null);
    } catch (error) {
      setRequestsError(
        error instanceof Error
          ? error.message
          : 'No se pudieron cargar los motores disponibles.',
      );
    } finally {
      setMotorRecoveryLoading(false);
    }
  };

  const handleApprovalError = (error: unknown, documentId?: string) => {
    if (!(error instanceof ApiError)) {
      setRequestsError(
        error instanceof Error ? error.message : 'Error procesando la solicitud',
      );
      return;
    }

    const recovery = classifyApprovalRecovery(error.data);
    if (documentId && recovery?.type === 'mixer-motor-required') {
      void openMixerMotorRecovery(
        documentId,
        recovery.mixerAssetId,
        recovery.ownerWarehouseId,
      );
      return;
    }

    const messages = normalizeApiErrorMessages(error);
    const assetUnavailable = messages.some((message) =>
      /asset\s+[0-9a-f-]{36}\s+is not available in owner warehouse/i.test(message),
    );
    if (assetUnavailable) {
      setRequestsError(
        'No se puede aprobar: el equipo no está disponible en la bodega de origen. Revisa si está en obra o selecciona/carga el equipo correcto antes de aprobar.',
      );
      return;
    }

    const stockShortages = extractInventoryStockShortages(error.data);
    const hasStockError = stockShortages.length > 0
      || messages.some((message) => /insufficient stock|stock insuficiente/i.test(message));
    if (hasStockError && canDecide) {
      if (stockShortages.length) {
        setAdjustWarningOwnerWarehouseId(stockShortages[0]?.ownerWarehouseId ?? null);
        setAdjustWarningMessage(
          buildInventoryStockShortageMessage(
            stockShortages,
            (skuId) => skuOptions.find((entry) => entry.id === skuId)?.name
              ?? `SKU ${skuId.slice(0, 8)}`,
            (warehouseId) => warehouses.find(
              (warehouse) => warehouse.id.toLowerCase() === warehouseId.toLowerCase(),
            )?.name ?? 'bodega sin identificar',
          ),
        );
        setRequestsError(null);
        return;
      }

      const messageWithOwner = messages.find((message) => /ownerWarehouse/i.test(message))
        ?? messages[0]
        ?? '';
      const ownerId = extractOwnerWarehouseIdFromMessage(messageWithOwner);
      const ownerName = ownerId
        ? warehouses.find(
            (warehouse) => warehouse.id.toLowerCase() === ownerId.toLowerCase(),
          )?.name
        : null;
      const missingSkuLabels = extractSkuIdsFromMessages(messages).map((skuId) =>
        skuOptions.find((entry) => entry.id === skuId)?.name ?? `SKU ${skuId.slice(0, 8)}`,
      );
      const missingItemsBlock = missingSkuLabels.length
        ? `\n\nItems por crear/ajustar:\n- ${missingSkuLabels.join('\n- ')}`
        : '';
      setAdjustWarningOwnerWarehouseId(ownerId);
      setAdjustWarningMessage(
        `No se puede aprobar la remisión porque "${ownerName ?? 'la bodega alterna'}" no tiene stock suficiente.${missingItemsBlock}`,
      );
      setRequestsError(null);
      return;
    }

    setRequestsError(`${error.status}: ${error.message}`);
  };

  const {
    decidingId,
    approve: approveWithDecision,
    reject: rejectWithDecision,
  } = useRequestApproval({
    onReload,
    onError: handleApprovalError,
    onProviderRemissionRequired,
  });

  const loadResolveInventories = async (ownerIds: string[]) => {
    const uniqueOwnerIds = [...new Set(ownerIds.filter(Boolean))];
    const entries = await Promise.all(
      uniqueOwnerIds.map(async (ownerId) => {
        try {
          const inventory = await api<{
            bulk: InventoryItemPickerBulkItem[];
            serial: InventorySerial[];
          }>(`/inventory/warehouse/${ownerId}`, { method: 'GET' });
          return [
            ownerId,
            {
              bulk: (inventory.bulk ?? []).filter(
                (item) => item.ownerWarehouseId === ownerId,
              ),
              serial: (inventory.serial ?? []).filter(
                (item) => item.ownerWarehouseId === ownerId,
              ),
            },
          ] as const;
        } catch {
          return [ownerId, { bulk: [], serial: [] }] as const;
        }
      }),
    );
    return Object.fromEntries(entries) as ResolveInventoryByOwner;
  };

  const closeResolveModal = () => {
    if (resolvingApprove) return;
    setResolveModalOpen(false);
    setResolveDocument(null);
    setResolveSkuByIndex({});
    setResolveAssetByIndex({});
    setResolveInventoryByOwner({});
  };

  const decideRequest = async (documentId: string, action: 'APPROVE' | 'REJECT') => {
    if (action === 'REJECT') {
      const reason = window.prompt('Motivo de rechazo (opcional):') ?? undefined;
      if (!window.confirm('¿Rechazar esta solicitud?')) return;
      setRequestsError(null);
      await rejectWithDecision(documentId, reason);
      return;
    }

    try {
      const document = await api<RequestDocumentDetail>(`/documents/${documentId}`, {
        method: 'GET',
      });
      const unresolved = document.items.filter((item) =>
        isResolvePendingItem(item, skuOptions),
      );
      if (unresolved.length) {
        const ownerIds = unresolved
          .map((item) => item.condition?.trim() ?? '')
          .filter(Boolean);
        const inventoriesByOwner = await loadResolveInventories(ownerIds);
        const { initialSkuMap, initialAssetMap } = buildInitialResolveState(
          document.items,
          inventoriesByOwner,
          skuOptions,
        );
        setResolveDocument(document);
        setResolveInventoryByOwner(inventoriesByOwner);
        setResolveSkuByIndex(initialSkuMap);
        setResolveAssetByIndex(initialAssetMap);
        setResolveModalOpen(true);
        return;
      }
      if (!window.confirm('¿Aprobar esta solicitud y ejecutar el movimiento de inventario?')) {
        return;
      }
      await approveWithDecision(documentId);
    } catch (error) {
      handleApprovalError(error);
    }
  };

  const resolveAndApprove = async () => {
    if (!resolveDocument) return;
    const resolutionError = validateApprovalResolution(
      resolveDocument.items,
      resolveSkuByIndex,
      resolveAssetByIndex,
      skuOptions,
    );
    if (resolutionError) {
      setRequestsError(resolutionError);
      return;
    }

    setResolvingApprove(true);
    setRequestsError(null);
    try {
      await api(`/documents/${resolveDocument.id}/request`, {
        method: 'PATCH',
        json: {
          type: resolveDocument.type,
          number: resolveDocument.consecutive ?? undefined,
          warehouseId: resolveDocument.warehouse?.id ?? undefined,
          customerWorksiteId: resolveDocument.customerWorksite?.id ?? undefined,
          notes: resolveDocument.notes ?? undefined,
          items: buildResolvedItemsPayload(
            resolveDocument.items,
            resolveSkuByIndex,
            resolveAssetByIndex,
            skuOptions,
          ),
        },
      });
      await approveWithDecision(resolveDocument.id);
      closeResolveModal();
    } catch (error) {
      handleApprovalError(error);
    } finally {
      setResolvingApprove(false);
    }
  };

  const createMissingSerial = async (values: CreateSerializedAssetValues) => {
    if (!resolveDocument || createSerialIndex == null) return;
    const row = resolveDocument.items[createSerialIndex];
    const ownerWarehouseId = row?.condition?.trim();
    if (!ownerWarehouseId) throw new Error('La línea no tiene una bodega propietaria.');
    const selectedSku = skuOptions.find(
      (entry) => entry.id === resolveSkuByIndex[createSerialIndex],
    );
    if (!selectedSku || selectedSku.controlType !== 'SERIAL') {
      throw new Error('Selecciona primero un SKU serializado.');
    }

    try {
      const response = await api<CreateSerializedAssetResponse>(
        '/inventory/serialized-assets',
        {
          method: 'POST',
          json: {
            family: { id: selectedSku.assetFamilyId },
            sku: { id: selectedSku.id },
            asset: { ...values, active: true },
            ownerWarehouseId,
            warehouseCurrentId: ownerWarehouseId,
          },
        },
      );
      const inventory = await api<{
        bulk: InventoryItemPickerBulkItem[];
        serial: InventorySerial[];
      }>(`/inventory/warehouse/${ownerWarehouseId}`, { method: 'GET' });
      setResolveInventoryByOwner((current) => ({
        ...current,
        [ownerWarehouseId]: {
          bulk: (inventory.bulk ?? []).filter(
            (item) => item.ownerWarehouseId === ownerWarehouseId,
          ),
          serial: (inventory.serial ?? []).filter(
            (item) => item.ownerWarehouseId === ownerWarehouseId,
          ),
        },
      }));
      setResolveAssetByIndex((current) => ({
        ...current,
        [createSerialIndex]: response.asset.id,
      }));
      setCreateSerialIndex(null);
      onItemsAddedNotice('Equipo creado y asignado al tag.');
    } catch (error) {
      if (error instanceof ApiError) throw new Error(`${error.status}: ${error.message}`);
      if (error instanceof Error) throw error;
      throw new Error('Error creando equipo.');
    }
  };

  const confirmRecoveredMixerMotor = async (motor: InventorySerial) => {
    if (!motorRecovery) return;
    const { document, mixer, ownerWarehouseId } = motorRecovery;
    setMotorRecoveryLoading(true);
    setMotorRecoveryError(null);
    try {
      await api(`/assets/${mixer.assetId}/assigned-motor`, {
        method: 'PATCH',
        json: { motorId: motor.assetId },
      });
      const existingItems = document.items.filter((item) => item.assetId !== motor.assetId);
      await api(`/documents/${document.id}/request`, {
        method: 'PATCH',
        json: {
          type: document.type,
          number: document.consecutive ?? undefined,
          warehouseId: document.warehouse?.id ?? undefined,
          customerWorksiteId: document.customerWorksite?.id ?? undefined,
          notes: document.notes ?? undefined,
          recipientPhones: document.recipientPhones?.length
            ? document.recipientPhones
            : undefined,
          items: [
            ...existingItems.map((item) => ({
              skuId: item.assetId ? undefined : item.skuId ?? undefined,
              assetId: item.assetId ?? undefined,
              componentParentAssetId: item.componentParentAssetId ?? undefined,
              quantity: item.assetId ? undefined : Number(item.quantity ?? 1) || 1,
              ownerWarehouseId: item.condition ?? undefined,
              requestedTag: item.requestedTag ?? undefined,
              conditionNote: item.conditionNote ?? undefined,
            })),
            {
              assetId: motor.assetId,
              componentParentAssetId: mixer.assetId,
              ownerWarehouseId,
            },
          ],
        },
      });
      setMotorRecovery(null);
      await approveWithDecision(document.id);
    } catch (error) {
      setMotorRecoveryError(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar el motor seleccionado.',
      );
    } finally {
      setMotorRecoveryLoading(false);
    }
  };

  return {
    decidingId,
    decideRequest,
    approve: approveWithDecision,
    adjustWarning: {
      message: adjustWarningMessage,
      ownerWarehouseId: adjustWarningOwnerWarehouseId,
      dismiss: () => {
        setAdjustWarningMessage(null);
        setAdjustWarningOwnerWarehouseId(null);
      },
    },
    resolution: {
      opened: resolveModalOpen,
      document: resolveDocument,
      inventoriesByOwner: resolveInventoryByOwner,
      skuByIndex: resolveSkuByIndex,
      assetByIndex: resolveAssetByIndex,
      resolving: resolvingApprove,
      close: closeResolveModal,
      changeSku: (index: number, skuId: string) => {
        setResolveSkuByIndex((current) => ({ ...current, [index]: skuId }));
        setResolveAssetByIndex((current) => ({ ...current, [index]: '' }));
      },
      changeAsset: (index: number, assetId: string) => {
        setResolveAssetByIndex((current) => ({ ...current, [index]: assetId }));
      },
      approve: resolveAndApprove,
    },
    createSerial: {
      index: createSerialIndex,
      open: (index: number) => setCreateSerialIndex(index),
      close: () => setCreateSerialIndex(null),
      submit: createMissingSerial,
    },
    motorRecovery: {
      value: motorRecovery,
      loading: motorRecoveryLoading,
      error: motorRecoveryError,
      cancel: () => {
        if (motorRecoveryLoading) return;
        setMotorRecovery(null);
        setMotorRecoveryError(null);
      },
      confirm: confirmRecoveredMixerMotor,
    },
  };
}
