'use client';

import AssetComponentsSelectionModal from '@/components/AssetComponentsSelectionModal';
import InventoryItemPickerModal from '@/components/InventoryItemPickerModal';
import MixerMotorSelectionModal from '@/components/MixerMotorSelectionModal';
import type { DataTableColumn } from '@/components/tables/table.types';
import WarehouseSelect from '@/components/WarehouseSelect';
import { api, ApiError } from '@/lib/api';
import { getCurrentUserRole, getCurrentUserSession } from '@/lib/auth';
import { getSerialDisplayName } from '@/lib/serial-assets';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Container,
  Group,
  Paper,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  buildBulkKey,
  createSelectionId,
  extractUserObservations,
  formatDateTime,
  formatDocType,
  getEmployeeFullName,
  getTodayDateInput,
  normalizeLocalWhatsappPhone,
  parseNotes,
  requestTypeColor,
} from './request-formatting';
import { pushFlowStateToUrl, readFlowStateFromUrl } from './request-navigation';
import {
  GenerateFieldErrors,
  GenerateStep,
  ProviderRemissionModalState,
  ProviderRemissionRequirements,
  RequestDocument,
  RequestDocumentDetail,
  RequestsPageMode,
  SelectedItem,
  SolicitudesTab,
} from './request-types';

import ApprovalCreateAssetDialog from './ApprovalCreateAssetDialog';
import ApprovalResolutionDialog from './ApprovalResolutionDialog';
import InventoryAdjustmentDialog from './InventoryAdjustmentDialog';
import ProviderRemissionDialog from './ProviderRemissionDialog';
import RequestDocumentsDialog from './RequestDocumentsDialog';
import RequestInformationSection from './RequestInformationSection';
import RequestItemsSection from './RequestItemsSection';
import RequestSignatureDialog from './RequestSignatureDialog';
import RequestSigningSection from './RequestSigningSection';
import RequestsListSection from './RequestsListSection';
import { useRequestApproval } from './use-request-approval';
import { useRequestAssetSelection } from './use-request-asset-selection';
import { useRequestAutosave } from './use-request-autosave';
import { useRequestCatalogs } from './use-request-catalogs';
import { useRequestFiles } from './use-request-files';
import { useRequestInventory } from './use-request-inventory';
import { useRequestItemEditing } from './use-request-item-editing';
import { useRequestRecipients } from './use-request-recipients';
import { useRequestSignature } from './use-request-signature';
import { useRequestSubmission } from './use-request-submission';
import { useRequestsList } from './use-requests-list';
export default function TransportRequestsWorkspace({
  mode = 'requests',
}: {
  mode?: RequestsPageMode;
}) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isTabletOrMobile = useMediaQuery('(max-width: 1024px)');
  const router = useRouter();
  const fixedTab: SolicitudesTab = mode === 'generate' ? 'generate' : 'list';
  const isGeneratePage = fixedTab === 'generate';
  const [activeTab, setActiveTab] = useState<SolicitudesTab>(fixedTab);
  const [generateStep, setGenerateStep] = useState<GenerateStep>('info');
  const [flowUrlReady, setFlowUrlReady] = useState(false);
  const [docType, setDocType] = useState<'REMISSION' | 'RETURN'>('REMISSION');
  const [consecutive, setConsecutive] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [sendWhatsapp, setSendWhatsapp] = useState(true);
  const [docDate, setDocDate] = useState(() => getTodayDateInput());
  const [deliveryMode, setDeliveryMode] = useState<'WAREHOUSE' | 'ON_SITE'>(
    'ON_SITE',
  );
  const [customerWorksiteId, setCustomerWorksiteId] = useState('');
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [observations, setObservations] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [dispatcherId, setDispatcherId] = useState<string | null>(null);

  const [sourceOwnerWarehouseId, setSourceOwnerWarehouseId] = useState<
    string | null
  >(null);
  const [sourceWorksiteId, setSourceWorksiteId] = useState<string | null>(null);

  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [freeTagInput, setFreeTagInput] = useState('');
  const [freeInternalNumber, setFreeInternalNumber] = useState<number | ''>('');
  const {
    employees,
    vehicles,
    warehouses,
    customers,
    worksites,
    setWorksites,
    worksitesLoading,
    skuOptions,
  } = useRequestCatalogs({ customerId });
  const [error, setError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<string | null>(null);
  const [generateFieldErrors, setGenerateFieldErrors] =
    useState<GenerateFieldErrors>({});
  const [itemsAddedNotice, setItemsAddedNotice] = useState<string | null>(null);
  const {
    requestsLoading,
    requestsError,
    setRequestsError,
    requests,
    documentsRequest,
    setDocumentsRequest,
    loadRequests,
  } = useRequestsList();
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [autosaveDraftId, setAutosaveDraftId] = useState<string | null>(null);
  const [autosaveReady, setAutosaveReady] = useState(false);
  const {
    receivedSignature,
    setReceivedSignature,
    signatureModalOpen,
    setSignatureModalOpen,
    signatureDraft,
    setSignatureDraft,
    signatureCanvasRef,
    beginSignature,
    moveSignature,
    endSignature,
    clearSignature,
  } = useRequestSignature();
  const [creationProviderRequirements, setCreationProviderRequirements] =
    useState<ProviderRemissionRequirements | null>(null);
  const [providerRemissionModal, setProviderRemissionModal] =
    useState<ProviderRemissionModalState | null>(null);
  const [providerRemissionError, setProviderRemissionError] = useState<
    string | null
  >(null);
  const {
    evidencePhotos,
    providerRemissionDrafts,
    evidenceInputRef,
    addEvidencePhotos,
    removeEvidencePhoto,
    clearEvidencePhotos,
    uploadEvidencePhotos,
    selectProviderRemissionDocument,
    clearProviderRemissionDocuments,
    uploadProviderRemissionDocuments,
  } = useRequestFiles({
    setError,
    setProviderRemissionError,
    setCreationProviderRequirements,
    setProviderRemissionModal,
  });
  const [checkingProviderRemissions, setCheckingProviderRemissions] =
    useState(false);
  const skipNextFlowUrlSyncRef = useRef(false);
  const autosaveCreatingRef = useRef(false);
  const restoringRequestRef = useRef<string | null>(null);
  const userSession = useMemo(() => getCurrentUserSession(), []);
  const userRole = useMemo(() => getCurrentUserRole(), []);
  const isAdminRole = userRole === 'ADMIN';
  const isDriverRole = userRole === 'DRIVER';
  const currentUserId = userSession?.sub ?? null;
  const canDecide = userRole === 'ADMIN' || userRole === 'OFFICE';
  const {
    motorRecovery,
    setMotorRecovery,
    motorRecoveryLoading,
    motorRecoveryError,
    setMotorRecoveryError,
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
    confirmRecoveredMixerMotor,
    decideRequest,
    resolveAndApprove,
  } = useRequestApproval({
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
  });

  const shouldSendWhatsapp = !canDecide || sendWhatsapp;
  const canResolveInline = canDecide && Boolean(editingRequestId);
  const sourceMode: 'warehouse' | 'on-site' =
    docType === 'REMISSION' ? 'warehouse' : 'on-site';
  const sourceOwnerWarehouse =
    warehouses.find((warehouse) => warehouse.id === sourceOwnerWarehouseId) ??
    null;
  const isAlternateOwnerMode =
    sourceMode === 'warehouse' && sourceOwnerWarehouse?.type === 'ALLY';
  const useManualWarehouseCapture =
    sourceMode === 'warehouse' && isAlternateOwnerMode;
  const principalWarehouse = useMemo(
    () =>
      warehouses.find((warehouse) => warehouse.type === 'OWN') ??
      warehouses.find(
        (warehouse) =>
          warehouse.name.trim().toUpperCase() === 'BODEGA PRINCIPAL',
      ) ??
      warehouses.find((warehouse) =>
        warehouse.name.toUpperCase().includes('PRINCIPAL'),
      ) ??
      null,
    [warehouses],
  );
  const worksiteOptions = worksites.map((item) => ({
    value: item.id,
    label: item.alias
      ? `${item.alias} · ${item.worksite.name}`
      : item.worksite.name,
  }));
  const vehicleOptions = vehicles.map((v) => ({
    value: v.id,
    label: v.plate ? `${v.plate} ${v.name ?? ''}`.trim() : (v.name ?? v.id),
  }));
  const employeeOptions = employees.map((employee) => ({
    value: employee.id,
    label: getEmployeeFullName(employee),
  }));
  const selectedItemsTotalQuantity = useMemo(
    () =>
      selectedItems.reduce((total, item) => {
        if (item.type === 'serial') return total + 1;
        const quantity = Number(item.quantity ?? 1);
        return (
          total + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1)
        );
      }, 0),
    [selectedItems],
  );
  const selectedCustomer =
    customers.find((customer) => customer.id === customerId) ?? null;
  const selectedWorksite =
    worksites.find((worksite) => worksite.id === customerWorksiteId) ?? null;
  const {
    setAdditionalRecipientPhones,
    recipientPhoneDraft,
    setRecipientPhoneDraft,
    defaultWhatsappRecipients,
    manualWhatsappPhones,
    whatsappRecipientPhones,
    addWhatsappRecipient,
    removeWhatsappRecipient,
  } = useRequestRecipients({
    selectedWorksite,
    selectedCustomer,
    setGenerateFieldErrors,
  });
  const { autosaveStatus, setAutosaveStatus, autosavePayload } =
    useRequestAutosave({
      docType,
      consecutive,
      warehouseId,
      principalWarehouse,
      customerWorksiteId,
      observations,
      docDate,
      deliveryMode,
      vehicleId,
      driverId,
      dispatcherId,
      shouldSendWhatsapp,
      whatsappRecipientPhones,
      receivedSignature,
      selectedItems,
      autosaveDraftId,
      autosaveReady,
      editingRequestId,
      submitting,
    });

  const selectedVehicle =
    vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null;
  const selectedDriver =
    employees.find((employee) => employee.id === driverId) ?? null;
  const selectedDispatcher =
    employees.find((employee) => employee.id === dispatcherId) ?? null;
  const customerSignatureLabel =
    docType === 'RETURN' ? 'Firma de quien entrega' : 'Firma de recibido';
  const sourceOwnerWarehouseName =
    warehouses.find((warehouse) => warehouse.id === sourceOwnerWarehouseId)
      ?.name ?? '-';
  const effectiveSourceWorksiteId =
    sourceMode === 'on-site'
      ? customerWorksiteId || sourceWorksiteId || null
      : sourceWorksiteId;
  const {
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
  } = useRequestInventory({
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
  });
  const {
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
  } = useRequestAssetSelection({
    serialItems,
    selectedSerialIds,
    setSelectedItems,
    setItemsModalOpen,
    docType,
    setError,
    setItemsAddedNotice,
    setSerialItems,
  });

  const sourceWorksiteName =
    worksites.find((worksite) => worksite.id === effectiveSourceWorksiteId)
      ?.alias ??
    worksites.find((worksite) => worksite.id === effectiveSourceWorksiteId)
      ?.worksite.name ??
    '-';

  useEffect(() => {
    const applyUrlState = () => {
      const { tab, step } = readFlowStateFromUrl();
      skipNextFlowUrlSyncRef.current = true;
      setActiveTab(fixedTab);
      setGenerateStep(
        isGeneratePage ? step : tab === 'generate' ? step : 'info',
      );
    };

    applyUrlState();
    setFlowUrlReady(true);
    window.addEventListener('popstate', applyUrlState);
    return () => {
      window.removeEventListener('popstate', applyUrlState);
    };
  }, [fixedTab, isGeneratePage]);

  useEffect(() => {
    if (!flowUrlReady) return;
    if (skipNextFlowUrlSyncRef.current) {
      skipNextFlowUrlSyncRef.current = false;
      return;
    }
    pushFlowStateToUrl(fixedTab, generateStep, autosaveDraftId);
  }, [autosaveDraftId, fixedTab, flowUrlReady, generateStep]);

  useEffect(() => {
    if (!principalWarehouse?.id || warehouseId) return;
    setWarehouseId(principalWarehouse.id);
  }, [principalWarehouse?.id, warehouseId]);

  useEffect(() => {
    if (!isDriverRole || !currentUserId) return;
    const matchedEmployee = employees.find(
      (employee) => employee.user?.id === currentUserId,
    );
    if (matchedEmployee && driverId !== matchedEmployee.id) {
      setDriverId(matchedEmployee.id);
    }
  }, [currentUserId, driverId, employees, isDriverRole]);

  useEffect(() => {
    if (!isDriverRole || !currentUserId) return;
    const matchedEmployee = employees.find(
      (employee) => employee.user?.id === currentUserId,
    );
    if (matchedEmployee && dispatcherId !== matchedEmployee.id) {
      setDispatcherId(matchedEmployee.id);
    }
  }, [currentUserId, dispatcherId, employees, isDriverRole]);

  useEffect(() => {
    if (!itemsAddedNotice) return;
    const timeout = window.setTimeout(() => setItemsAddedNotice(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [itemsAddedNotice]);
  const {
    addBulkItem,
    addFreeItem,
    resolveFreeItemToSku,
    updateSelected,
    updateSelectedOwner,
    splitSelectedItem,
    removeSelected,
  } = useRequestItemEditing({
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
  });

  const resetGenerateForm = () => {
    if (currentUserId) {
      window.localStorage.removeItem(`rev:transport-draft:${currentUserId}`);
    }
    setEditingRequestId(null);
    setAutosaveDraftId(null);
    setAutosaveReady(false);
    setAutosaveStatus('idle');
    setPendingMixerQueue([]);
    setAssignMotorError(null);
    setError(null);
    setConsecutive('');
    setCustomerId(null);
    setAdditionalRecipientPhones([]);
    setRecipientPhoneDraft('');
    setSendWhatsapp(true);
    setDocDate(getTodayDateInput());
    setDeliveryMode('ON_SITE');
    setCustomerWorksiteId('');
    setWarehouseId(null);
    setObservations('');
    setVehicleId(null);
    setDriverId(null);
    setDispatcherId(null);
    setSourceOwnerWarehouseId(null);
    setSourceWorksiteId(null);
    setBulkItems([]);
    setSerialItems([]);
    setSelectedItems([]);
    setFreeTagInput('');
    setFreeInternalNumber('');
    setGenerateFieldErrors({});
    setGenerateStep('info');
    setReceivedSignature(null);
    clearEvidencePhotos();
    clearProviderRemissionDocuments();
  };
  const { handleSubmit } = useRequestSubmission({
    setSubmitting,
    observations,
    vehicleId,
    dispatcherId,
    mode,
    setSubmitResult,
    setError,
    docDate,
    customerId,
    selectedItems,
    customerWorksiteId,
    shouldSendWhatsapp,
    recipientPhoneDraft,
    whatsappRecipientPhones,
    editingRequestId,
    receivedSignature,
    warehouseId,
    principalWarehouse,
    docType,
    deliveryMode,
    isDriverRole,
    driverId,
    consecutive,
    isAdminRole,
    autosaveDraftId,
    evidencePhotos,
    providerRemissionDrafts,
    autosavePayload,
    resetGenerateForm,
    setItemsModalOpen,
    setWorksites,
    uploadEvidencePhotos,
    uploadProviderRemissionDocuments,
    creationProviderRequirements,
    setActiveTab,
    fixedTab,
    loadRequests,
    router,
  });

  const editRequest = async (documentId: string, autosaved = false) => {
    if (mode === 'requests' && !autosaved) {
      router.push(`/transport/generate?edit=${documentId}`);
      return;
    }

    setError(null);
    setSubmitResult(null);
    try {
      const doc = await api<RequestDocumentDetail>(`/documents/${documentId}`, {
        method: 'GET',
      });
      if (autosaved && doc.status !== 'IN_PROGRESS') {
        throw new Error('El formulario autoguardado ya fue enviado.');
      }
      const parsed = parseNotes(doc.notes ?? null);
      setEditingRequestId(autosaved ? null : doc.id);
      setAutosaveDraftId(autosaved ? doc.id : null);
      setAutosaveReady(false);
      setDocType(doc.type === 'RETURN' ? 'RETURN' : 'REMISSION');
      setConsecutive(doc.consecutive ?? '');
      setCustomerId(doc.customerWorksite?.customer?.id ?? null);
      setAdditionalRecipientPhones(
        (doc.recipientPhones?.length
          ? doc.recipientPhones
          : doc.recipientPhone
            ? [doc.recipientPhone]
            : []
        )
          .map((phone) => normalizeLocalWhatsappPhone(phone))
          .filter((phone): phone is string => Boolean(phone)),
      );
      setRecipientPhoneDraft('');
      setDocDate(
        doc.docDate ? new Date(doc.docDate).toISOString().slice(0, 10) : '',
      );
      setDeliveryMode(
        parsed.deliveryMode === 'ON_SITE' ? 'ON_SITE' : 'WAREHOUSE',
      );
      setCustomerWorksiteId(doc.customerWorksite?.id ?? '');
      setWarehouseId(doc.warehouse?.id ?? null);
      setObservations(extractUserObservations(doc.notes ?? null));
      setVehicleId(parsed.vehicleId ?? null);
      setDriverId(parsed.receiverId || parsed.driverId || null);
      setDispatcherId(parsed.dispatcherId ?? null);
      setSourceOwnerWarehouseId(null);
      setSourceWorksiteId(null);
      setBulkItems([]);
      setSerialItems([]);
      setSelectedItems(
        doc.items.map((item) => {
          const ownerWarehouseId = item.condition ?? null;
          if (!item.skuId && !item.assetId && item.requestedTag) {
            return {
              selectionId: createSelectionId(),
              type: 'free' as const,
              name: item.requestedTag,
              requestedTag: item.requestedTag,
              quantity: Number(item.quantity ?? 1) || 1,
              componentParentAssetId: item.componentParentAssetId ?? undefined,
              ownerWarehouseId,
              isDamaged: Boolean(item.conditionNote?.trim()),
              damageDescription: item.conditionNote ?? '',
            };
          }
          if (item.skuId) {
            return {
              selectionId: createSelectionId(),
              type: 'bulk' as const,
              bulkKey: buildBulkKey({
                skuId: item.skuId,
                ownerWarehouseId,
              }),
              skuId: item.skuId,
              name: item.sku?.name ?? item.skuId,
              quantity: Number(item.quantity ?? 1) || 1,
              ownerWarehouseId,
              isDamaged: Boolean(item.conditionNote?.trim()),
              damageDescription: item.conditionNote ?? '',
            };
          }
          return {
            selectionId: createSelectionId(),
            type: 'serial' as const,
            assetId: item.assetId ?? undefined,
            name:
              item.asset?.description ??
              item.asset?.sku?.name ??
              item.asset?.serialOrEngine ??
              item.assetId ??
              'Serial',
            serial: item.asset?.serialOrEngine ?? null,
            ownerWarehouseId,
            associatedMixerId: item.asset?.assignedToMixer?.id,
            componentParentAssetId: item.componentParentAssetId ?? undefined,
            isDamaged: Boolean(item.conditionNote?.trim()),
            damageDescription: item.conditionNote ?? '',
          };
        }),
      );
      const savedSignature =
        doc.files?.find((file) => file.fileType === 'SIGNATURE_RECEIVED')
          ?.storageKey ?? null;
      setReceivedSignature(savedSignature);
      clearEvidencePhotos();
      setActiveTab('generate');
      setGenerateStep('info');
      if (autosaved) {
        if (currentUserId) {
          window.localStorage.setItem(
            `rev:transport-draft:${currentUserId}`,
            doc.id,
          );
        }
        window.setTimeout(() => {
          setAutosaveReady(true);
          setAutosaveStatus('saved');
        }, 0);
      }
    } catch (err) {
      if (autosaved && currentUserId) {
        window.localStorage.removeItem(`rev:transport-draft:${currentUserId}`);
      }
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error cargando la solicitud para editar');
      }
    }
  };

  useEffect(() => {
    if (mode !== 'generate' || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit');
    const explicitDraftId = params.get('draft');
    const storedDraftId = currentUserId
      ? window.localStorage.getItem(`rev:transport-draft:${currentUserId}`)
      : null;
    const draftId = explicitDraftId ?? (editId ? null : storedDraftId);
    const target = editId
      ? `edit:${editId}`
      : draftId
        ? `draft:${draftId}`
        : null;
    if (!target || restoringRequestRef.current === target) return;
    if (editId && editingRequestId === editId) return;
    if (draftId && autosaveDraftId === draftId) return;

    restoringRequestRef.current = target;
    void editRequest(editId ?? (draftId as string), !editId).finally(() => {
      if (restoringRequestRef.current === target)
        restoringRequestRef.current = null;
    });
  }, [autosaveDraftId, currentUserId, editingRequestId, mode]);

  const goToItemsStep = async () => {
    setError(null);
    const nextFieldErrors: GenerateFieldErrors = {};
    if (!customerId) nextFieldErrors.customerId = 'Selecciona la razon social.';
    if (!docDate) nextFieldErrors.docDate = 'Selecciona la fecha.';
    if (!customerWorksiteId)
      nextFieldErrors.customerWorksiteId = 'Selecciona la obra.';
    if (
      docType === 'REMISSION' &&
      deliveryMode === 'ON_SITE' &&
      isDriverRole &&
      !driverId
    ) {
      nextFieldErrors.driverId = 'Selecciona el conductor.';
    }
    if (docType === 'RETURN' && !driverId) {
      nextFieldErrors.driverId =
        deliveryMode === 'ON_SITE'
          ? 'Selecciona quién recoge la devolución.'
          : 'Selecciona quién recibe la devolución.';
    }
    setGenerateFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      setError('Revisa los campos obligatorios resaltados.');
      return;
    }
    if (!editingRequestId && !autosaveDraftId) {
      if (autosaveCreatingRef.current) return;
      autosaveCreatingRef.current = true;
      setAutosaveStatus('saving');
      try {
        const draft = await api<{ id: string; consecutive?: string | null }>(
          '/documents/requests/autosave',
          {
            method: 'POST',
            json: autosavePayload,
          },
        );
        setAutosaveDraftId(draft.id);
        if (currentUserId) {
          window.localStorage.setItem(
            `rev:transport-draft:${currentUserId}`,
            draft.id,
          );
        }
        setAutosaveReady(true);
        setAutosaveStatus('saved');
        if (draft.consecutive) setConsecutive(draft.consecutive);
      } catch (err) {
        setAutosaveStatus('error');
        setError(
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : 'No se pudo iniciar el autoguardado.',
        );
        return;
      } finally {
        autosaveCreatingRef.current = false;
      }
    }
    setGenerateStep('items');
  };

  const goToSignStep = async () => {
    setError(null);
    if (!selectedItems.length) {
      setError('Selecciona al menos un item.');
      return;
    }
    if (docType !== 'REMISSION' || !navigator.onLine) {
      setGenerateStep('sign');
      return;
    }

    setCheckingProviderRemissions(true);
    try {
      const requirements = await api<ProviderRemissionRequirements>(
        '/documents/requests/provider-remission-requirements',
        {
          method: 'POST',
          json: {
            type: docType,
            items: selectedItems.map((item) => ({
              ...(item.ownerWarehouseId
                ? { ownerWarehouseId: item.ownerWarehouseId }
                : {}),
              quantity:
                item.type === 'serial' ? 1 : Number(item.quantity ?? 1) || 1,
            })),
          },
        },
      );
      setCreationProviderRequirements(requirements);
      if (requirements.missingProviders.length) {
        setProviderRemissionModal({ mode: 'OPTIONAL', requirements });
        setProviderRemissionError(null);
        return;
      }
      setGenerateStep('sign');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : 'No se pudo validar si los items requieren remisión de proveedor.',
      );
    } finally {
      setCheckingProviderRemissions(false);
    }
  };

  const handleGenerateStepChange = (value: string | null) => {
    if (value === 'items') {
      void goToItemsStep();
      return;
    }
    if (value === 'sign') {
      void goToSignStep();
      return;
    }
    setGenerateStep('info');
  };

  const renderDamageFields = (item: SelectedItem, index: number) => {
    if (docType !== 'RETURN') return null;
    return (
      <Stack gap={6} mt="xs">
        <Checkbox
          label="Entra averiado"
          checked={Boolean(item.isDamaged)}
          onChange={(event) =>
            updateSelected(index, {
              isDamaged: event.currentTarget.checked,
              damageDescription: event.currentTarget.checked
                ? (item.damageDescription ?? '')
                : '',
            })
          }
        />
        {item.isDamaged ? (
          <Textarea
            label="Descripcion del daño"
            placeholder="Describe el daño reportado al recibir el equipo"
            value={item.damageDescription ?? ''}
            onChange={(event) =>
              updateSelected(index, {
                damageDescription: event.currentTarget.value,
              })
            }
            minRows={2}
            autosize
            required
          />
        ) : null}
      </Stack>
    );
  };

  const renderAdminItemFields = (item: SelectedItem, index: number) => {
    if (!editingRequestId || !canDecide) return null;
    return (
      <Stack gap="xs" mt="xs">
        {item.type === 'free' ? (
          <TextInput
            label="Referencia del item"
            value={item.requestedTag ?? item.name}
            onChange={(event) => {
              const requestedTag = event.currentTarget.value;
              updateSelected(index, { requestedTag, name: requestedTag });
            }}
          />
        ) : null}
        <WarehouseSelect
          label="Bodega dueña del item"
          value={item.ownerWarehouseId ?? null}
          onChange={(value) => updateSelectedOwner(index, value)}
          warehouses={warehouses}
          clearable={false}
          required
          width="100%"
        />
        {item.type !== 'serial' && Number(item.quantity ?? 1) > 1 ? (
          <Button
            size="xs"
            variant="light"
            onClick={() => splitSelectedItem(index)}
          >
            Dividir cantidad entre bodegas
          </Button>
        ) : null}
      </Stack>
    );
  };

  const renderGenerateError = () =>
    error ? (
      <Alert
        color="red"
        variant="light"
        mb="md"
        withCloseButton
        onClose={() => setError(null)}
      >
        {error}
      </Alert>
    ) : null;

  const selectedWorksiteLabel = selectedWorksite
    ? selectedWorksite.alias
      ? `${selectedWorksite.alias} · ${selectedWorksite.worksite.name}`
      : selectedWorksite.worksite.name
    : 'Sin obra';
  const pageTitle = isGeneratePage
    ? 'Generar documento'
    : 'Solicitudes de documentos';
  const pageDescription = isGeneratePage
    ? 'Completa informacion, items y firma para crear una solicitud de documento.'
    : isDriverRole
      ? 'Consulta tus borradores y anexa fotografías que hayan quedado pendientes.'
      : 'Revisa borradores, abre detalles y controla aprobaciones del flujo operativo.';
  const requestColumns: DataTableColumn<RequestDocument>[] = [
    {
      id: 'consecutive',
      header: 'Solicitud',
      width: '15%',
      mobile: { priority: 'primary' },
      cell: (row) => (
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Text fw={700}>{row.consecutive ?? 'Sin consecutivo'}</Text>
            <Badge
              mt={4}
              size="sm"
              variant="light"
              color={requestTypeColor(row.type)}
            >
              {formatDocType(row.type)}
            </Badge>
          </div>
          <Badge hiddenFrom="md" color="yellow" variant="light">
            {row.status}
          </Badge>
        </Group>
      ),
    },
    {
      id: 'customer',
      header: 'Cliente / Obra',
      width: '22%',
      mobile: { label: 'Cliente / obra', priority: 'detail' },
      cell: (row) => (
        <div>
          <Text size="sm">{row.customerWorksite?.customer?.name ?? '-'}</Text>
          <Text size="xs" c="dimmed">
            {row.customerWorksite?.alias ??
              row.customerWorksite?.worksite?.name ??
              '-'}
          </Text>
        </div>
      ),
    },
    {
      id: 'items',
      header: 'Ítems',
      width: '8%',
      align: 'center',
      mobile: { label: 'Ítems', priority: 'detail' },
      cell: (row) => row._count?.items ?? 0,
    },
    {
      id: 'creator',
      header: 'Creado por',
      width: '19%',
      mobile: { label: 'Creado por', priority: 'detail' },
      cell: (row) => row.creator?.name ?? row.creator?.email ?? '-',
    },
    {
      id: 'createdAt',
      header: 'Fecha',
      width: '19%',
      mobile: { label: 'Fecha', priority: 'detail' },
      cell: (row) => formatDateTime(row.createdAt),
    },
    {
      id: 'status',
      header: 'Estado',
      width: '10%',
      mobile: false,
      cell: (row) => (
        <Badge color="yellow" variant="light">
          {row.status}
        </Badge>
      ),
    },
  ];

  return (
    <main>
      <Container size="xl" py="xl">
        <Stack gap="lg">
          <Paper shadow="sm" p="xl" radius="xl" withBorder>
            <Group
              justify="space-between"
              align="flex-start"
              mb="lg"
              className="mobile-stack"
            >
              <div>
                <Title order={2}>{pageTitle}</Title>
                <Text c="dimmed" size="sm">
                  {pageDescription}
                </Text>
              </div>
              {isGeneratePage ? (
                <Badge color="teal" variant="light" size="lg">
                  Flujo guiado
                </Badge>
              ) : (
                <Badge color="yellow" variant="light" size="lg">
                  {requests.length} pendiente{requests.length === 1 ? '' : 's'}
                </Badge>
              )}
            </Group>
            <Tabs value={activeTab} variant="pills">
              <RequestsListSection
                isDriverRole={isDriverRole}
                loadRequests={loadRequests}
                requestsLoading={requestsLoading}
                requestsError={requestsError}
                submitResult={submitResult}
                setSubmitResult={setSubmitResult}
                requests={requests}
                requestColumns={requestColumns}
                setDocumentsRequest={setDocumentsRequest}
                canDecide={canDecide}
                editRequest={editRequest}
                decidingId={decidingId}
                decideRequest={decideRequest}
              />

              <RequestInformationSection
                docType={docType}
                editingRequestId={editingRequestId}
                autosaveDraftId={autosaveDraftId}
                autosaveStatus={autosaveStatus}
                resetGenerateForm={resetGenerateForm}
                generateStep={generateStep}
                handleGenerateStepChange={handleGenerateStepChange}
                isTabletOrMobile={isTabletOrMobile}
                renderGenerateError={renderGenerateError}
                setDocType={setDocType}
                isDriverRole={isDriverRole}
                consecutive={consecutive}
                setConsecutive={setConsecutive}
                customerId={customerId}
                setCustomerId={setCustomerId}
                setCustomerWorksiteId={setCustomerWorksiteId}
                setGenerateFieldErrors={setGenerateFieldErrors}
                customers={customers}
                generateFieldErrors={generateFieldErrors}
                docDate={docDate}
                setDocDate={setDocDate}
                isAdminRole={isAdminRole}
                warehouseId={warehouseId}
                setWarehouseId={setWarehouseId}
                warehouses={warehouses}
                observations={observations}
                setObservations={setObservations}
                deliveryMode={deliveryMode}
                setDeliveryMode={setDeliveryMode}
                isMobile={isMobile}
                customerWorksiteId={customerWorksiteId}
                worksiteOptions={worksiteOptions}
                worksitesLoading={worksitesLoading}
                vehicleId={vehicleId}
                setVehicleId={setVehicleId}
                vehicleOptions={vehicleOptions}
                driverId={driverId}
                setDriverId={setDriverId}
                employeeOptions={employeeOptions}
                dispatcherId={dispatcherId}
                setDispatcherId={setDispatcherId}
                goToItemsStep={goToItemsStep}
              />
            </Tabs>
          </Paper>

          {activeTab === 'generate' && generateStep === 'items' ? (
            <RequestItemsSection
              sourceMode={sourceMode}
              setGenerateStep={setGenerateStep}
              renderGenerateError={renderGenerateError}
              selectedCustomer={selectedCustomer}
              selectedWorksiteLabel={selectedWorksiteLabel}
              docDate={docDate}
              docType={docType}
              deliveryMode={deliveryMode}
              selectedDriver={selectedDriver}
              selectedDispatcher={selectedDispatcher}
              sourceOwnerWarehouseId={sourceOwnerWarehouseId}
              setSourceOwnerWarehouseId={setSourceOwnerWarehouseId}
              warehouses={warehouses}
              setCreationProviderRequirements={setCreationProviderRequirements}
              isMobile={isMobile}
              useManualWarehouseCapture={useManualWarehouseCapture}
              canDecide={canDecide}
              loadInventory={loadInventory}
              loadingInventory={loadingInventory}
              freeTagInput={freeTagInput}
              setFreeTagInput={setFreeTagInput}
              setError={setError}
              freeInternalNumber={freeInternalNumber}
              setFreeInternalNumber={setFreeInternalNumber}
              addFreeItem={addFreeItem}
              selectedItems={selectedItems}
              isTabletOrMobile={isTabletOrMobile}
              renderDamageFields={renderDamageFields}
              renderAdminItemFields={renderAdminItemFields}
              updateSelected={updateSelected}
              canResolveInline={canResolveInline}
              skuOptions={skuOptions}
              resolveFreeItemToSku={resolveFreeItemToSku}
              removeSelected={removeSelected}
              goToSignStep={goToSignStep}
              checkingProviderRemissions={checkingProviderRemissions}
            />
          ) : null}

          {activeTab === 'generate' && generateStep === 'sign' ? (
            <RequestSigningSection
              handleSubmit={handleSubmit}
              receivedSignature={receivedSignature}
              setGenerateStep={setGenerateStep}
              renderGenerateError={renderGenerateError}
              selectedCustomer={selectedCustomer}
              selectedWorksiteLabel={selectedWorksiteLabel}
              docDate={docDate}
              selectedItems={selectedItems}
              canDecide={canDecide}
              sendWhatsapp={sendWhatsapp}
              setSendWhatsapp={setSendWhatsapp}
              setGenerateFieldErrors={setGenerateFieldErrors}
              shouldSendWhatsapp={shouldSendWhatsapp}
              defaultWhatsappRecipients={defaultWhatsappRecipients}
              manualWhatsappPhones={manualWhatsappPhones}
              removeWhatsappRecipient={removeWhatsappRecipient}
              recipientPhoneDraft={recipientPhoneDraft}
              setRecipientPhoneDraft={setRecipientPhoneDraft}
              addWhatsappRecipient={addWhatsappRecipient}
              generateFieldErrors={generateFieldErrors}
              isTabletOrMobile={isTabletOrMobile}
              docType={docType}
              selectedItemsTotalQuantity={selectedItemsTotalQuantity}
              customerSignatureLabel={customerSignatureLabel}
              editingRequestId={editingRequestId}
              isAdminRole={isAdminRole}
              setReceivedSignature={setReceivedSignature}
              setSignatureDraft={setSignatureDraft}
              setSignatureModalOpen={setSignatureModalOpen}
              evidenceInputRef={evidenceInputRef}
              evidencePhotos={evidencePhotos}
              clearEvidencePhotos={clearEvidencePhotos}
              addEvidencePhotos={addEvidencePhotos}
              removeEvidencePhoto={removeEvidencePhoto}
              submitResult={submitResult}
              submitting={submitting}
            />
          ) : null}
        </Stack>
      </Container>

      <ProviderRemissionDialog
        providerRemissionModal={providerRemissionModal}
        providerRemissionUploading={providerRemissionUploading}
        setProviderRemissionModal={setProviderRemissionModal}
        setProviderRemissionError={setProviderRemissionError}
        providerRemissionDrafts={providerRemissionDrafts}
        selectProviderRemissionDocument={selectProviderRemissionDocument}
        providerRemissionError={providerRemissionError}
        setGenerateStep={setGenerateStep}
        uploadMissingProviderRemissionsAndApprove={
          uploadMissingProviderRemissionsAndApprove
        }
      />

      <RequestSignatureDialog
        signatureModalOpen={signatureModalOpen}
        setSignatureModalOpen={setSignatureModalOpen}
        customerSignatureLabel={customerSignatureLabel}
        signatureCanvasRef={signatureCanvasRef}
        beginSignature={beginSignature}
        moveSignature={moveSignature}
        endSignature={endSignature}
        clearSignature={clearSignature}
        setReceivedSignature={setReceivedSignature}
        signatureDraft={signatureDraft}
      />

      <InventoryAdjustmentDialog
        adjustWarningModalOpen={adjustWarningModalOpen}
        setAdjustWarningModalOpen={setAdjustWarningModalOpen}
        setAdjustWarningOwnerWarehouseId={setAdjustWarningOwnerWarehouseId}
        adjustWarningMessage={adjustWarningMessage}
        adjustWarningOwnerWarehouseId={adjustWarningOwnerWarehouseId}
        router={router}
      />

      <ApprovalResolutionDialog
        resolveModalOpen={resolveModalOpen}
        closeResolveModal={closeResolveModal}
        resolveDocument={resolveDocument}
        isResolvePendingItem={isResolvePendingItem}
        warehouses={warehouses}
        getResolveSkuOptions={getResolveSkuOptions}
        resolveSkuByIndex={resolveSkuByIndex}
        setResolveSkuByIndex={setResolveSkuByIndex}
        setResolveAssetByIndex={setResolveAssetByIndex}
        skuOptions={skuOptions}
        resolveInventoryByOwner={resolveInventoryByOwner}
        resolveAssetByIndex={resolveAssetByIndex}
        openCreateSerialForRow={openCreateSerialForRow}
        resolvingApprove={resolvingApprove}
        resolveAndApprove={resolveAndApprove}
      />

      <InventoryItemPickerModal
        opened={
          activeTab === 'generate' &&
          generateStep === 'items' &&
          itemsModalOpen &&
          (!useManualWarehouseCapture || canDecide)
        }
        onClose={() => setItemsModalOpen(false)}
        title="Seleccionar items"
        bulkItems={availableBulkItems}
        serialItems={pickerSerialItems}
        selectedBulkKeys={selectedBulkKeys}
        selectedSerialIds={selectedSerialIds}
        onAddBulk={addBulkItem}
        onAddSerial={addSerialItem}
        skuOptions={skuOptions}
        itemsAddedNotice={itemsAddedNotice}
        showOwnerWarehouse={
          sourceMode === 'on-site' ? showInventoryOwnerWarehouse : !isDriverRole
        }
        emptyStateText={
          useManualWarehouseCapture
            ? 'Use description capture in the main section.'
            : null
        }
        onItemAddedNotice={setItemsAddedNotice}
      />

      <MixerMotorSelectionModal
        opened={Boolean(activePendingMixer)}
        mixer={activePendingMixer}
        motors={availableMotorsForMixer}
        loading={assigningMotor}
        error={assignMotorError}
        onCancel={cancelPendingMixer}
        onConfirm={confirmMixerMotor}
      />

      <MixerMotorSelectionModal
        opened={Boolean(motorRecovery)}
        mixer={motorRecovery?.mixer ?? null}
        motors={motorRecovery?.motors ?? []}
        loading={motorRecoveryLoading}
        error={motorRecoveryError}
        onCancel={() => {
          if (!motorRecoveryLoading) {
            setMotorRecovery(null);
            setMotorRecoveryError(null);
          }
        }}
        onConfirm={(motor) => void confirmRecoveredMixerMotor(motor)}
      />

      <AssetComponentsSelectionModal
        opened={Boolean(componentParent)}
        parentName={
          componentParent ? getSerialDisplayName(componentParent) : ''
        }
        options={componentOptions}
        bulkItems={bulkItems}
        serialItems={serialItems}
        ownerWarehouseId={componentParent?.ownerWarehouseId ?? null}
        restrictOwnerWarehouse={sourceMode === 'warehouse'}
        canCreate={
          canDecide && sourceMode === 'warehouse' && docType === 'REMISSION'
        }
        excludedAssetIds={selectedSerialIds}
        onAssetCreated={(asset) =>
          setSerialItems((current) => [
            ...current.filter((item) => item.assetId !== asset.assetId),
            asset,
          ])
        }
        onClose={() => {
          setComponentParent(null);
          setComponentOptions([]);
        }}
        onConfirm={(selections) => void confirmAssetComponents(selections)}
      />

      <RequestDocumentsDialog
        documentsRequest={documentsRequest}
        setDocumentsRequest={setDocumentsRequest}
        isDriverRole={isDriverRole}
      />

      <ApprovalCreateAssetDialog
        createSerialOpen={createSerialOpen}
        createSerialSaving={createSerialSaving}
        setCreateSerialOpen={setCreateSerialOpen}
        setCreateSerialIndex={setCreateSerialIndex}
        setCreateSerialError={setCreateSerialError}
        setCreateSerialBrand={setCreateSerialBrand}
        setCreateSerialModel={setCreateSerialModel}
        setCreateSerialYear={setCreateSerialYear}
        setCreateSerialFuel={setCreateSerialFuel}
        createSerialError={createSerialError}
        createSerialSerialOrEngine={createSerialSerialOrEngine}
        setCreateSerialSerialOrEngine={setCreateSerialSerialOrEngine}
        createSerialInternalNumber={createSerialInternalNumber}
        setCreateSerialInternalNumber={setCreateSerialInternalNumber}
        createSerialBrand={createSerialBrand}
        createSerialModel={createSerialModel}
        createSerialYear={createSerialYear}
        createSerialFuel={createSerialFuel}
        createMissingSerialFromResolve={createMissingSerialFromResolve}
      />
    </main>
  );
}
