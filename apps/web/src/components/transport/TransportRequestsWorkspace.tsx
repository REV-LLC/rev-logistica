'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { api, ApiError } from '@/lib/api';
import { getCurrentUserRole, getCurrentUserSession } from '@/lib/auth';
import FileAttachmentsPanel from '@/components/FileAttachmentsPanel';
import { ownerColorById } from '@/lib/owner-color';
import InventoryItemPickerModal, {
  type InventoryItemPickerBulkItem,
  type InventoryItemPickerSerialItem,
} from '@/components/InventoryItemPickerModal';
import { getSerialDisplayName } from '@/lib/serial-assets';
import MixerMotorSelectionModal from '@/components/MixerMotorSelectionModal';
import AssetComponentsSelectionModal from '@/components/AssetComponentsSelectionModal';
import { syncOfflineOperations } from '@/lib/offline-queue';
import { buildRequestItems } from '@/components/transport/request-items';
import { normalizeLocalWhatsappPhone } from '@/components/transport/request-submission';
import { buildAutosavePayload } from '@/components/transport/request-payload';
import { useRequestAutosave } from '@/components/transport/use-request-autosave';
import { getRequestDraftStorageKey } from '@/components/transport/request-draft';
import { useRequestDraftRestoration } from '@/components/transport/use-request-draft-restoration';
import { useRequestsList } from '@/components/transport/use-requests-list';
import { parseInternalNumberFromTag } from '@/components/transport/approval-resolution';
import ApprovalResolutionModal from '@/components/transport/ApprovalResolutionModal';
import CreateSerializedAssetModal from '@/components/inventory/CreateSerializedAssetModal';
import { mapDocumentToRequestForm } from '@/components/transport/request-form-mapping';
import SignatureCaptureModal from '@/components/SignatureCaptureModal';
import EvidencePhotosPanel from '@/components/transport/EvidencePhotosPanel';
import RequestItemsSummary from '@/components/transport/RequestItemsSummary';
import RequestItemsStep, {
  type RequestSelectedItem,
} from '@/components/transport/RequestItemsStep';
import RequestInfoStep, {
  type RequestInfoErrors,
} from '@/components/transport/RequestInfoStep';
import RequestSignaturePanel from '@/components/transport/RequestSignaturePanel';
import WhatsappRecipientsPanel from '@/components/transport/WhatsappRecipientsPanel';
import ProviderRemissionsModal, {
  type ProviderRemissionModalState,
  type ProviderRemissionRequirements,
} from '@/components/transport/ProviderRemissionsModal';
import { useEvidencePhotos } from '@/components/transport/use-evidence-photos';
import { useProviderRemissions } from '@/components/transport/use-provider-remissions';
import { useRequestInventory } from '@/components/transport/use-request-inventory';
import { useRequestAssetSelection } from '@/components/transport/use-request-asset-selection';
import {
  type Employee,
  useRequestCatalogs,
} from '@/components/transport/use-request-catalogs';
import type {
  RequestDocumentDetail,
} from '@/components/transport/request-document-types';
import { formatTransportError } from '@/components/transport/transport-errors';
import { useRequestApprovalWorkflow } from '@/components/transport/use-request-approval-workflow';
import { submitRequestWorkflow } from '@/components/transport/request-submission-workflow';
import {
  addBulkSelection,
  addFreeSelection,
  addSerialSelection,
  removeSelection,
  resolveFreeSelection,
  splitSelection,
  updateSelection,
  updateSelectionOwner,
} from '@/components/transport/request-item-selection';
import RequestsListPanel, {
  type RequestDocument,
} from '@/components/transport/RequestsListPanel';

type InventoryBulk = InventoryItemPickerBulkItem;
type InventorySerial = InventoryItemPickerSerialItem;

const getEmployeeFullName = (employee: Pick<Employee, 'name' | 'lastName'>) =>
  `${employee.name} ${employee.lastName ?? ''}`.trim();

type SelectedItem = RequestSelectedItem;

const createSelectionId = () => globalThis.crypto.randomUUID();

type GenerateFieldErrors = RequestInfoErrors;

function formatDocType(value: string) {
  return value === 'REMISSION' ? 'RM' : value === 'RETURN' ? 'DV' : value;
}

function getTodayDateInput() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

type SolicitudesTab = 'list' | 'generate';
type RequestsPageMode = 'requests' | 'generate';
type GenerateStep = 'info' | 'items' | 'sign';

function normalizeSolicitudesTab(value: string | null): SolicitudesTab {
  return value === 'generate' ? 'generate' : 'list';
}

function normalizeGenerateStep(value: string | null): GenerateStep {
  if (value === 'items' || value === 'sign') return value;
  return 'info';
}

function readFlowStateFromUrl() {
  if (typeof window === 'undefined') {
    return { tab: 'list' as SolicitudesTab, step: 'info' as GenerateStep };
  }
  const params = new URLSearchParams(window.location.search);
  const tab = normalizeSolicitudesTab(params.get('tab'));
  return {
    tab,
    step: tab === 'generate' ? normalizeGenerateStep(params.get('step')) : 'info',
  };
}

function pushFlowStateToUrl(tab: SolicitudesTab, step: GenerateStep, draftId?: string | null) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const isGenerateRoute = url.pathname.startsWith('/transport/generate');
  if (tab === 'generate' || isGenerateRoute) {
    if (isGenerateRoute) {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', 'generate');
    }
    url.searchParams.set('step', step);
    if (draftId) {
      url.searchParams.set('draft', draftId);
    } else {
      url.searchParams.delete('draft');
    }
  } else {
    url.searchParams.delete('tab');
    url.searchParams.delete('step');
    url.searchParams.delete('draft');
  }
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) {
    window.history.pushState(null, '', nextUrl);
  }
}

export default function TransportRequestsWorkspace({ mode = 'requests' }: { mode?: RequestsPageMode }) {
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
  const [additionalRecipientPhones, setAdditionalRecipientPhones] = useState<string[]>([]);
  const [recipientPhoneDraft, setRecipientPhoneDraft] = useState('');
  const [sendWhatsapp, setSendWhatsapp] = useState(true);
  const [docDate, setDocDate] = useState(() => getTodayDateInput());
  const [deliveryMode, setDeliveryMode] = useState<'WAREHOUSE' | 'ON_SITE'>('ON_SITE');
  const [customerWorksiteId, setCustomerWorksiteId] = useState('');
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [observations, setObservations] = useState('');
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [dispatcherId, setDispatcherId] = useState<string | null>(null);

  const [sourceOwnerWarehouseId, setSourceOwnerWarehouseId] = useState<string | null>(null);
  const [sourceWorksiteId, setSourceWorksiteId] = useState<string | null>(null);

  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [freeTagInput, setFreeTagInput] = useState('');
  const [freeInternalNumber, setFreeInternalNumber] = useState<number | ''>('');
  const {
    employees,
    vehicles,
    warehouses,
    customers,
    skuOptions,
    worksites,
    worksitesLoading,
    clearWorksites,
  } = useRequestCatalogs(customerId);
  const [error, setError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generateFieldErrors, setGenerateFieldErrors] = useState<GenerateFieldErrors>({});
  const [itemsAddedNotice, setItemsAddedNotice] = useState<string | null>(null);
  const [documentsRequest, setDocumentsRequest] = useState<RequestDocument | null>(null);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [autosaveDraftId, setAutosaveDraftId] = useState<string | null>(null);
  const [autosaveReady, setAutosaveReady] = useState(false);
  const [receivedSignature, setReceivedSignature] = useState<string | null>(null);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const {
    photos: evidencePhotos,
    error: evidencePhotosError,
    add: addEvidencePhotos,
    remove: removeEvidencePhoto,
    clear: clearEvidencePhotos,
    upload: uploadEvidencePhotos,
  } = useEvidencePhotos();
  const {
    drafts: providerRemissionDrafts,
    error: providerRemissionError,
    setError: setProviderRemissionError,
    select: selectProviderRemissionDocument,
    clear: clearProviderRemissionDrafts,
    upload: uploadProviderRemissionDocuments,
  } = useProviderRemissions();
  const [creationProviderRequirements, setCreationProviderRequirements] =
    useState<ProviderRemissionRequirements | null>(null);
  const [providerRemissionModal, setProviderRemissionModal] =
    useState<ProviderRemissionModalState | null>(null);
  const [providerRemissionUploading, setProviderRemissionUploading] = useState(false);
  const [checkingProviderRemissions, setCheckingProviderRemissions] = useState(false);
  const skipNextFlowUrlSyncRef = useRef(false);
  const autosaveCreatingRef = useRef(false);
  const userSession = useMemo(() => getCurrentUserSession(), []);
  const userRole = useMemo(() => getCurrentUserRole(), []);
  const isAdminRole = userRole === 'ADMIN';
  const isDriverRole = userRole === 'DRIVER';
  const currentUserId = userSession?.sub ?? null;
  const canDecide = userRole === 'ADMIN' || userRole === 'OFFICE';
  const {
    requests,
    loading: requestsLoading,
    error: requestsError,
    setError: setRequestsError,
    reload: loadRequests,
  } = useRequestsList(mode === 'requests');
  const shouldSendWhatsapp = !canDecide || sendWhatsapp;
  const canResolveInline = canDecide && Boolean(editingRequestId);
  const sourceMode: 'warehouse' | 'on-site' = docType === 'REMISSION' ? 'warehouse' : 'on-site';
  const sourceOwnerWarehouse = warehouses.find((warehouse) => warehouse.id === sourceOwnerWarehouseId) ?? null;
  const isAlternateOwnerMode = sourceMode === 'warehouse' && sourceOwnerWarehouse?.type === 'ALLY';
  const useManualWarehouseCapture = sourceMode === 'warehouse' && isAlternateOwnerMode;
  const principalWarehouse = useMemo(
    () =>
      warehouses.find((warehouse) => warehouse.type === 'OWN') ??
      warehouses.find((warehouse) => warehouse.name.trim().toUpperCase() === 'BODEGA PRINCIPAL') ??
      warehouses.find((warehouse) => warehouse.name.toUpperCase().includes('PRINCIPAL')) ??
      null,
    [warehouses],
  );
  const worksiteOptions = worksites.map((item) => ({
    value: item.id,
    label: item.alias ? `${item.alias} · ${item.worksite.name}` : item.worksite.name,
  }));
  const vehicleOptions = vehicles.map((v) => ({
    value: v.id,
    label: v.plate ? `${v.plate} ${v.name ?? ''}`.trim() : v.name ?? v.id,
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
        return total + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
      }, 0),
    [selectedItems],
  );
  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null;
  const selectedWorksite = worksites.find((worksite) => worksite.id === customerWorksiteId) ?? null;
  const defaultWhatsappRecipients = useMemo(
    () => [
      {
        key: 'worksite',
        label: 'Encargado de obra',
        phone: normalizeLocalWhatsappPhone(selectedWorksite?.worksite.phone),
      },
      {
        key: 'customer',
        label: 'Cliente',
        phone: normalizeLocalWhatsappPhone(selectedCustomer?.phone),
      },
    ],
    [selectedCustomer?.phone, selectedWorksite?.worksite.phone],
  );
  const defaultWhatsappPhones = useMemo(
    () => defaultWhatsappRecipients
      .map((recipient) => recipient.phone)
      .filter((phone): phone is string => Boolean(phone)),
    [defaultWhatsappRecipients],
  );
  const manualWhatsappPhones = useMemo(
    () => additionalRecipientPhones.filter(
      (phone) => !defaultWhatsappPhones.includes(phone),
    ),
    [additionalRecipientPhones, defaultWhatsappPhones],
  );
  const whatsappRecipientPhones = useMemo(
    () => [...new Set([...defaultWhatsappPhones, ...additionalRecipientPhones])],
    [additionalRecipientPhones, defaultWhatsappPhones],
  );
  const autosavePayload = useMemo(
    () => buildAutosavePayload({
      docType,
      consecutive,
      warehouseId: warehouseId ?? principalWarehouse?.id ?? null,
      customerWorksiteId,
      observations,
      docDate,
      deliveryMode,
      vehicleId,
      driverId,
      dispatcherId,
      recipientPhones: shouldSendWhatsapp ? whatsappRecipientPhones : [],
      receivedSignature,
      items: buildRequestItems(selectedItems),
    }),
    [
      consecutive,
      customerWorksiteId,
      deliveryMode,
      dispatcherId,
      docDate,
      docType,
      driverId,
      observations,
      principalWarehouse?.id,
      receivedSignature,
      selectedItems,
      shouldSendWhatsapp,
      vehicleId,
      warehouseId,
      whatsappRecipientPhones,
    ],
  );
  const { status: autosaveStatus, setStatus: setAutosaveStatus } = useRequestAutosave({
    draftId: autosaveDraftId,
    payload: autosavePayload,
    ready: autosaveReady,
    editing: Boolean(editingRequestId),
    submitting,
  });
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null;
  const selectedDriver = employees.find((employee) => employee.id === driverId) ?? null;
  const selectedDispatcher = employees.find((employee) => employee.id === dispatcherId) ?? null;
  const customerSignatureLabel =
    docType === 'RETURN' ? 'Firma de quien entrega' : 'Firma de recibido';
  const sourceOwnerWarehouseName =
    warehouses.find((warehouse) => warehouse.id === sourceOwnerWarehouseId)?.name ?? '-';
  const effectiveSourceWorksiteId =
    sourceMode === 'on-site' ? customerWorksiteId || sourceWorksiteId || null : sourceWorksiteId;
  const {
    bulkItems,
    serialItems,
    setBulkItems,
    setSerialItems,
    loading: loadingInventory,
    selectorOpen: itemsModalOpen,
    setSelectorOpen: setItemsModalOpen,
    showOwnerWarehouse: showInventoryOwnerWarehouse,
    availableBulkItems,
    pickerSerialItems,
    selectedBulkKeys,
    selectedSerialIds,
    load: loadInventory,
    clear: clearInventory,
    markWarehouseHandled,
  } = useRequestInventory({
    active: activeTab === 'generate' && generateStep === 'items',
    documentType: docType,
    sourceMode,
    sourceOwnerWarehouseId,
    sourceWorksiteId: effectiveSourceWorksiteId,
    warehouses,
    manualCapture: useManualWarehouseCapture,
    selectedItems,
    setError,
  });
  const {
    componentParent,
    componentOptions,
    componentOptionsLoading,
    activePendingMixer,
    availableMotors: availableMotorsForMixer,
    assigningMotor,
    assignMotorError,
    addSerial: addSerialItem,
    confirmComponents: confirmAssetComponents,
    closeComponents: closeAssetComponents,
    cancelPendingMixer,
    confirmMixerMotor,
    reset: resetAssetSelection,
  } = useRequestAssetSelection({
    documentType: docType,
    serialItems,
    selectedSerialIds,
    setSerialItems,
    setSelectedItems,
    setSelectorOpen: setItemsModalOpen,
    setError,
    setItemsAddedNotice,
    createSelectionId,
  });
  const sourceWorksiteName =
    worksites.find((worksite) => worksite.id === effectiveSourceWorksiteId)?.alias ??
    worksites.find((worksite) => worksite.id === effectiveSourceWorksiteId)?.worksite.name ??
    '-';
  useEffect(() => {
    const applyUrlState = () => {
      const { tab, step } = readFlowStateFromUrl();
      skipNextFlowUrlSyncRef.current = true;
      setActiveTab(fixedTab);
      setGenerateStep(isGeneratePage ? step : tab === 'generate' ? step : 'info');
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

  const addWhatsappRecipient = () => {
    const phone = normalizeLocalWhatsappPhone(recipientPhoneDraft);
    if (!phone) {
      setGenerateFieldErrors((prev) => ({
        ...prev,
        recipientPhones: 'Ingresa un número colombiano de exactamente 10 dígitos.',
      }));
      return;
    }
    if (whatsappRecipientPhones.includes(phone)) {
      setRecipientPhoneDraft('');
      setGenerateFieldErrors((prev) => ({ ...prev, recipientPhones: undefined }));
      return;
    }
    if (whatsappRecipientPhones.length >= 10) {
      setGenerateFieldErrors((prev) => ({
        ...prev,
        recipientPhones: 'Puedes agregar máximo 10 destinatarios.',
      }));
      return;
    }
    setAdditionalRecipientPhones((prev) => [...prev, phone]);
    setRecipientPhoneDraft('');
    setGenerateFieldErrors((prev) => ({ ...prev, recipientPhones: undefined }));
  };

  const removeWhatsappRecipient = (phone: string) => {
    setAdditionalRecipientPhones((prev) => prev.filter((value) => value !== phone));
    setGenerateFieldErrors((prev) => ({ ...prev, recipientPhones: undefined }));
  };

  const clearProviderRemissionDocuments = () => {
    clearProviderRemissionDrafts();
    setCreationProviderRequirements(null);
    setProviderRemissionModal(null);
    setProviderRemissionError(null);
  };

  const approvalWorkflow = useRequestApprovalWorkflow({
    canDecide,
    warehouses,
    skuOptions,
    setRequestsError,
    onReload: loadRequests,
    onItemsAddedNotice: setItemsAddedNotice,
    onProviderRemissionRequired: (documentId, requirements) => {
      setProviderRemissionModal({ mode: 'REQUIRED', requirements, documentId });
      setProviderRemissionError(null);
    },
  });

  useEffect(() => {
    if (!principalWarehouse?.id || warehouseId) return;
    setWarehouseId(principalWarehouse.id);
  }, [principalWarehouse?.id, warehouseId]);

  useEffect(() => {
    if (sourceMode !== 'warehouse' || !principalWarehouse?.id || sourceOwnerWarehouseId) return;
    markWarehouseHandled(principalWarehouse.id);
    setSourceOwnerWarehouseId(principalWarehouse.id);
  }, [markWarehouseHandled, principalWarehouse?.id, sourceMode, sourceOwnerWarehouseId]);

  useEffect(() => {
    if (!isDriverRole || !currentUserId) return;
    const matchedEmployee = employees.find((employee) => employee.user?.id === currentUserId);
    if (matchedEmployee && driverId !== matchedEmployee.id) {
      setDriverId(matchedEmployee.id);
    }
  }, [currentUserId, driverId, employees, isDriverRole]);

  useEffect(() => {
    if (!isDriverRole || !currentUserId) return;
    const matchedEmployee = employees.find((employee) => employee.user?.id === currentUserId);
    if (matchedEmployee && dispatcherId !== matchedEmployee.id) {
      setDispatcherId(matchedEmployee.id);
    }
  }, [currentUserId, dispatcherId, employees, isDriverRole]);

  useEffect(() => {
    clearInventory();
    setFreeTagInput('');
    setFreeInternalNumber('');
    clearProviderRemissionDocuments();
    if (docType === 'REMISSION') {
      setSourceWorksiteId(null);
    } else {
      setSourceOwnerWarehouseId(null);
    }
  }, [docType]);

  useEffect(() => {
    if (!itemsAddedNotice) return;
    const timeout = window.setTimeout(() => setItemsAddedNotice(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [itemsAddedNotice]);

  const uploadMissingProviderRemissionsAndApprove = async () => {
    if (
      providerRemissionModal?.mode !== 'REQUIRED' ||
      !providerRemissionModal.documentId
    ) {
      return;
    }
    const missingProviders = providerRemissionModal.requirements.missingProviders;
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
      const approved = await approvalWorkflow.approve(providerRemissionModal.documentId);
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

  const addBulkItem = (item: InventoryBulk) => {
    if (item.quantity < 0) {
      setError('Este item tiene alerta de inventario negativo. Ajusta stock antes de usarlo en un documento.');
      return false;
    }
    let added = false;
    setSelectedItems((prev) => {
      const next = addBulkSelection({
        items: prev,
        inventoryItem: item,
        sourceMode,
        createSelectionId,
      });
      added = next !== prev;
      return next;
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
    const selectedOwnerType = warehouses.find((warehouse) => warehouse.id === sourceOwnerWarehouseId)?.type;

    if (selectedOwnerType === 'ALLY') {
      const internal = typeof freeInternalNumber === 'number' ? freeInternalNumber : null;
      const requestedReference = internal ? `${tag} #${internal}` : tag;
      setError(null);
      setSelectedItems((prev) =>
        addFreeSelection({
          items: prev,
          requestedReference,
          ownerWarehouseId: sourceOwnerWarehouseId,
          createSelectionId,
        }),
      );
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
      resolveFreeSelection({ items: prev, index, skuId, skuName: sku.name }),
    );
  };

  const updateSelected = (index: number, updates: Partial<SelectedItem>) => {
    setSelectedItems((prev) => updateSelection(prev, index, updates));
  };

  const updateSelectedOwner = (index: number, ownerWarehouseId: string | null) => {
    setSelectedItems((prev) => updateSelectionOwner(prev, index, ownerWarehouseId));
  };

  const splitSelectedItem = (index: number) => {
    setSelectedItems((current) => splitSelection(current, index, createSelectionId));
  };

  const removeSelected = (selectionId: string) => {
    setSelectedItems((current) => removeSelection(current, selectionId));
  };

  const resetGenerateForm = () => {
    if (currentUserId) {
      window.localStorage.removeItem(getRequestDraftStorageKey(currentUserId));
    }
    setEditingRequestId(null);
    setAutosaveDraftId(null);
    setAutosaveReady(false);
    setAutosaveStatus('idle');
    resetAssetSelection();
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
    clearInventory();
    setSelectedItems([]);
    setFreeTagInput('');
    setFreeInternalNumber('');
    setGenerateFieldErrors({});
    setGenerateStep('info');
    setReceivedSignature(null);
    clearEvidencePhotos();
    clearProviderRemissionDocuments();
  };

  const editRequest = async (documentId: string, autosaved = false) => {
    if (mode === 'requests' && !autosaved) {
      router.push(`/transport/generate?edit=${documentId}`);
      return;
    }

    setError(null);
    setSubmitResult(null);
    try {
      const doc = await api<RequestDocumentDetail>(`/documents/${documentId}`, { method: 'GET' });
      if (autosaved && doc.status !== 'IN_PROGRESS') {
        throw new Error('El formulario autoguardado ya fue enviado.');
      }
      const form = mapDocumentToRequestForm(doc, {
        createSelectionId,
        normalizePhone: normalizeLocalWhatsappPhone,
      });
      setEditingRequestId(autosaved ? null : doc.id);
      setAutosaveDraftId(autosaved ? doc.id : null);
      setAutosaveReady(false);
      setDocType(form.docType);
      setConsecutive(form.consecutive);
      setCustomerId(form.customerId);
      setAdditionalRecipientPhones(form.additionalRecipientPhones);
      setRecipientPhoneDraft('');
      setDocDate(form.docDate);
      setDeliveryMode(form.deliveryMode);
      setCustomerWorksiteId(form.customerWorksiteId);
      setWarehouseId(form.warehouseId);
      setObservations(form.observations);
      setVehicleId(form.vehicleId);
      setDriverId(form.driverId);
      setDispatcherId(form.dispatcherId);
      setSourceOwnerWarehouseId(null);
      setSourceWorksiteId(null);
      clearInventory();
      setSelectedItems(form.selectedItems);
      setReceivedSignature(form.receivedSignature);
      clearEvidencePhotos();
      setActiveTab('generate');
      setGenerateStep('info');
      if (autosaved) {
        if (currentUserId) {
          window.localStorage.setItem(getRequestDraftStorageKey(currentUserId), doc.id);
        }
        window.setTimeout(() => {
          setAutosaveReady(true);
          setAutosaveStatus('saved');
        }, 0);
      }
    } catch (err) {
      if (autosaved && currentUserId) {
        window.localStorage.removeItem(getRequestDraftStorageKey(currentUserId));
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

  useRequestDraftRestoration({
    enabled: mode === 'generate',
    currentUserId,
    editingRequestId,
    autosaveDraftId,
    onRestore: editRequest,
  });

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitResult(null);
    setError(null);
    try {
      const result = await submitRequestWorkflow({
        documentType: docType,
        consecutive,
        warehouseId,
        principalWarehouseId: principalWarehouse?.id ?? null,
        customerId,
        customerWorksiteId,
        observations,
        documentDate: docDate,
        deliveryMode,
        vehicleId,
        driverId,
        dispatcherId,
        selectedItems,
        shouldSendWhatsapp,
        recipientPhoneDraft,
        recipientPhones: whatsappRecipientPhones,
        receivedSignature,
        editingRequestId,
        autosaveDraftId,
        isAdmin: isAdminRole,
        isDriver: isDriverRole,
        evidencePhotoCount: evidencePhotos.length,
        providerRemissionCount: Object.keys(providerRemissionDrafts).length,
        providerRequirements: creationProviderRequirements,
        uploadEvidencePhotos,
        uploadProviderRemissions: uploadProviderRemissionDocuments,
      });
      resetGenerateForm();
      setSubmitResult(result.message);
      setItemsModalOpen(false);
      clearWorksites();
      if (result.offline) return;
      setActiveTab(fixedTab);
      await loadRequests();
      if (mode === 'generate') {
        router.push('/transport/requests');
      }
      router.refresh();
      void syncOfflineOperations();
    } catch (err) {
      setError(formatTransportError(err, 'No se pudo enviar la solicitud.'));
    } finally {
      setSubmitting(false);
    }
  };

  const goToItemsStep = async () => {
    setError(null);
    const nextFieldErrors: GenerateFieldErrors = {};
    if (!customerId) nextFieldErrors.customerId = 'Selecciona la razon social.';
    if (!docDate) nextFieldErrors.docDate = 'Selecciona la fecha.';
    if (!customerWorksiteId) nextFieldErrors.customerWorksiteId = 'Selecciona la obra.';
    if (docType === 'REMISSION' && deliveryMode === 'ON_SITE' && isDriverRole && !driverId) {
      nextFieldErrors.driverId = 'Selecciona el conductor.';
    }
    if (docType === 'RETURN' && !driverId) {
      nextFieldErrors.driverId = deliveryMode === 'ON_SITE'
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
          window.localStorage.setItem(getRequestDraftStorageKey(currentUserId), draft.id);
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
              quantity: item.type === 'serial' ? 1 : Number(item.quantity ?? 1) || 1,
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

  const renderGenerateError = () =>
    error ? (
      <Alert color="red" variant="light" mb="md" withCloseButton onClose={() => setError(null)}>
        {error}
      </Alert>
    ) : null;

  const selectedWorksiteLabel = selectedWorksite
    ? selectedWorksite.alias
      ? `${selectedWorksite.alias} · ${selectedWorksite.worksite.name}`
      : selectedWorksite.worksite.name
    : 'Sin obra';
  const pageTitle = isGeneratePage ? 'Generar documento' : 'Solicitudes de documentos';
  const pageDescription = isGeneratePage
    ? 'Completa informacion, items y firma para crear una solicitud de documento.'
    : isDriverRole
      ? 'Consulta tus borradores y anexa fotografías que hayan quedado pendientes.'
      : 'Revisa borradores, abre detalles y controla aprobaciones del flujo operativo.';
  return (
    <main>
      <Container size="xl" py="xl">
        <Stack gap="lg">
          <Paper shadow="sm" p="xl" radius="xl" withBorder>
            <Group justify="space-between" align="flex-start" mb="lg" className="mobile-stack">
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

            <Tabs.Panel value="list" pt="md">
              <RequestsListPanel
                requests={requests}
                loading={requestsLoading}
                error={requestsError}
                successMessage={submitResult}
                isDriverRole={isDriverRole}
                canDecide={canDecide}
                decidingId={approvalWorkflow.decidingId}
                onRefresh={() => void loadRequests()}
                onDismissSuccess={() => setSubmitResult(null)}
                onOpenDocuments={setDocumentsRequest}
                onEdit={(documentId) => void editRequest(documentId)}
                onApprove={(documentId) => void approvalWorkflow.decideRequest(documentId, 'APPROVE')}
                onReject={(documentId) => void approvalWorkflow.decideRequest(documentId, 'REJECT')}
              />
            </Tabs.Panel>

            <Tabs.Panel value="generate" pt="md">
              <Stack gap="sm" mb="lg">
                  <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                    <div>
                      <Group gap="xs" mb={6}>
                        <Badge color={docType === 'REMISSION' ? 'blue' : 'orange'} variant="light">
                          {formatDocType(docType)}
                        </Badge>
                        <Badge color={editingRequestId ? 'grape' : autosaveDraftId ? 'blue' : 'teal'} variant="light">
                          {editingRequestId
                            ? `Editando ${editingRequestId.slice(0, 8)}`
                            : autosaveDraftId
                              ? `Borrador ${autosaveDraftId.slice(0, 8)}`
                              : 'Nueva solicitud'}
                        </Badge>
                        {autosaveDraftId ? (
                          <Badge
                            color={autosaveStatus === 'error' ? 'red' : autosaveStatus === 'saving' || autosaveStatus === 'offline' ? 'yellow' : 'green'}
                            variant="dot"
                          >
                            {autosaveStatus === 'saving'
                              ? 'Guardando...'
                              : autosaveStatus === 'offline'
                                ? 'Cambios en dispositivo'
                              : autosaveStatus === 'error'
                                ? 'Error al guardar'
                                : 'Guardado'}
                          </Badge>
                        ) : null}
                      </Group>
                      <Text fw={800} size="lg">
                        Generar documento
                      </Text>
                      <Text size="sm" c="dimmed">
                        Completa informacion, items y firma antes de enviar.
                      </Text>
                    </div>
                    {editingRequestId || autosaveDraftId ? (
                      <Button variant="light" color="gray" onClick={resetGenerateForm}>
                        {editingRequestId ? 'Cancelar edición' : 'Salir del borrador'}
                      </Button>
                    ) : null}
                  </Group>

                  <Tabs value={generateStep} onChange={handleGenerateStepChange} variant="pills">
                    <Tabs.List grow={isTabletOrMobile}>
                      <Tabs.Tab value="info">1. Informacion</Tabs.Tab>
                      <Tabs.Tab value="items">2. Items</Tabs.Tab>
                      <Tabs.Tab value="sign">3. Firma</Tabs.Tab>
                    </Tabs.List>
                  </Tabs>
              </Stack>
              {generateStep === 'info' ? (
                <RequestInfoStep
                  documentType={docType}
                  consecutive={consecutive}
                  customerId={customerId}
                  documentDate={docDate}
                  warehouseId={warehouseId}
                  observations={observations}
                  deliveryMode={deliveryMode}
                  worksiteId={customerWorksiteId}
                  vehicleId={vehicleId}
                  driverId={driverId}
                  dispatcherId={dispatcherId}
                  customerOptions={customers.map((customer) => ({
                    value: customer.id,
                    label: customer.name,
                  }))}
                  worksiteOptions={worksiteOptions}
                  vehicleOptions={vehicleOptions}
                  employeeOptions={employeeOptions}
                  warehouses={warehouses}
                  errors={generateFieldErrors}
                  error={error}
                  editing={Boolean(editingRequestId)}
                  isAdmin={isAdminRole}
                  isDriver={isDriverRole}
                  isMobile={isMobile}
                  worksitesLoading={worksitesLoading}
                  onDismissError={() => setError(null)}
                  onDocumentTypeChange={setDocType}
                  onConsecutiveChange={setConsecutive}
                  onCustomerChange={(value) => {
                    setCustomerId(value);
                    setCustomerWorksiteId('');
                    setGenerateFieldErrors((prev) => ({
                      ...prev,
                      customerId: undefined,
                      customerWorksiteId: undefined,
                    }));
                  }}
                  onDocumentDateChange={(value) => {
                    setDocDate(value);
                    setGenerateFieldErrors((prev) => ({ ...prev, docDate: undefined }));
                  }}
                  onWarehouseChange={setWarehouseId}
                  onObservationsChange={setObservations}
                  onDeliveryModeChange={setDeliveryMode}
                  onWorksiteChange={(value) => {
                    setCustomerWorksiteId(value);
                    setGenerateFieldErrors((prev) => ({
                      ...prev,
                      customerWorksiteId: undefined,
                    }));
                  }}
                  onVehicleChange={setVehicleId}
                  onDriverChange={(value) => {
                    setDriverId(value);
                    setGenerateFieldErrors((prev) => ({ ...prev, driverId: undefined }));
                  }}
                  onDispatcherChange={setDispatcherId}
                  onNext={() => void goToItemsStep()}
                />
              ) : null}
            </Tabs.Panel>
          </Tabs>
          </Paper>

        {activeTab === 'generate' && generateStep === 'items' ? (
          <RequestItemsStep
            documentType={docType}
            sourceMode={sourceMode}
            customerName={selectedCustomer?.name ?? '-'}
            worksiteLabel={selectedWorksiteLabel}
            documentDate={docDate}
            deliverySummary={
              docType === 'REMISSION'
                ? deliveryMode === 'ON_SITE'
                  ? `En obra (${selectedDriver?.name ?? '-'})`
                  : `Bodega (${selectedDispatcher?.name ?? '-'})`
                : deliveryMode === 'ON_SITE'
                  ? `Recogida en obra (${selectedDriver?.name ?? '-'})`
                  : `Cliente entrega en bodega (${selectedDriver?.name ?? '-'})`
            }
            error={error}
            isMobile={isMobile}
            isTabletOrMobile={isTabletOrMobile}
            sourceOwnerWarehouseId={sourceOwnerWarehouseId}
            warehouses={warehouses}
            manualCapture={useManualWarehouseCapture}
            loadingInventory={loadingInventory}
            freeTagInput={freeTagInput}
            freeInternalNumber={freeInternalNumber}
            items={selectedItems}
            editing={Boolean(editingRequestId)}
            canDecide={canDecide}
            canResolveInline={canResolveInline}
            skuOptions={skuOptions}
            checkingProviderRemissions={checkingProviderRemissions}
            onDismissError={() => setError(null)}
            onBack={() => setGenerateStep('info')}
            onNext={() => void goToSignStep()}
            onSourceOwnerChange={(value) => {
              setSourceOwnerWarehouseId(value);
              const nextWarehouse = warehouses.find((warehouse) => warehouse.id === value);
              if (nextWarehouse?.type !== 'ALLY') setCreationProviderRequirements(null);
            }}
            onLoadInventory={() => void loadInventory()}
            onFreeTagChange={(value) => {
              setFreeTagInput(value);
              setError(null);
            }}
            onFreeInternalNumberChange={setFreeInternalNumber}
            onAddFreeItem={addFreeItem}
            onUpdateItem={updateSelected}
            onUpdateOwner={updateSelectedOwner}
            onSplitItem={splitSelectedItem}
            onResolveFreeItem={resolveFreeItemToSku}
            onRemoveItem={removeSelected}
          />
        ) : null}

        {activeTab === 'generate' && generateStep === 'sign' ? (
        <Paper
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
          shadow="sm"
          p={{ base: 'md', md: 'xl' }}
          radius="xl"
          withBorder
          mt="lg"
        >
          <Group justify="space-between" align="center" mb="sm">
            <div>
              <Group gap="xs" mb={4}>
                <Badge color="orange" variant="light">Paso 3</Badge>
                <Badge color={receivedSignature ? 'green' : 'gray'} variant="light">
                  {receivedSignature ? 'Firma lista' : 'Firma pendiente'}
                </Badge>
              </Group>
              <Title order={4}>Firma y envio</Title>
              <Text size="sm" c="dimmed">
                Verifica el resumen final, captura la firma y envia la solicitud.
              </Text>
            </div>
            <Button type="button" variant="light" color="gray" onClick={() => setGenerateStep('items')}>
              Volver a items
            </Button>
          </Group>
          {renderGenerateError()}

          <Paper withBorder radius="lg" p="md" bg="orange.0" mb="md">
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
              <div>
                <Text size="xs" fw={800} c="dimmed" tt="uppercase">Cliente</Text>
                <Text size="sm" fw={700}>{selectedCustomer?.name ?? '-'}</Text>
              </div>
              <div>
                <Text size="xs" fw={800} c="dimmed" tt="uppercase">Obra</Text>
                <Text size="sm" fw={700}>{selectedWorksiteLabel}</Text>
              </div>
              <div>
                <Text size="xs" fw={800} c="dimmed" tt="uppercase">Fecha</Text>
                <Text size="sm" fw={700}>{docDate || '-'}</Text>
              </div>
              <div>
                <Text size="xs" fw={800} c="dimmed" tt="uppercase">Items</Text>
                <Text size="sm" fw={700}>{selectedItems.length} item{selectedItems.length === 1 ? '' : 's'}</Text>
              </div>
            </SimpleGrid>
          </Paper>

          <WhatsappRecipientsPanel
            canDecide={canDecide}
            enabled={shouldSendWhatsapp}
            sendWhatsapp={sendWhatsapp}
            defaultRecipients={defaultWhatsappRecipients}
            additionalPhones={manualWhatsappPhones}
            phoneDraft={recipientPhoneDraft}
            error={generateFieldErrors.recipientPhones ?? null}
            onEnabledChange={(enabled) => {
              setSendWhatsapp(enabled);
              setGenerateFieldErrors((prev) => ({ ...prev, recipientPhones: undefined }));
            }}
            onPhoneDraftChange={(phone) => {
              setRecipientPhoneDraft(phone);
              setGenerateFieldErrors((prev) => ({ ...prev, recipientPhones: undefined }));
            }}
            onAdd={addWhatsappRecipient}
            onRemove={removeWhatsappRecipient}
          />

          <RequestItemsSummary
            compact={isTabletOrMobile}
            documentType={docType}
            items={selectedItems}
            totalQuantity={selectedItemsTotalQuantity}
          />

          <RequestSignaturePanel
            label={customerSignatureLabel}
            signature={receivedSignature}
            editing={Boolean(editingRequestId)}
            signatureLocked={Boolean(editingRequestId && !isAdminRole)}
            onRemove={() => setReceivedSignature(null)}
            onOpenCapture={() => setSignatureModalOpen(true)}
          />

          <EvidencePhotosPanel
            photos={evidencePhotos}
            error={evidencePhotosError}
            onAdd={addEvidencePhotos}
            onRemove={removeEvidencePhoto}
            onClear={clearEvidencePhotos}
          />

          {submitResult && (
            <Text c="green" mt="sm">
              {submitResult}
            </Text>
          )}

          <Group mt="md">
            <Button type="submit" loading={submitting}>
              {editingRequestId ? 'Guardar cambios' : 'Enviar solicitud'}
            </Button>
          </Group>
        </Paper>
        ) : null}
        </Stack>
      </Container>

      <ProviderRemissionsModal
        state={providerRemissionModal}
        drafts={providerRemissionDrafts}
        error={providerRemissionError}
        uploading={providerRemissionUploading}
        onSelect={selectProviderRemissionDocument}
        onClose={() => {
          if (providerRemissionUploading) return;
          setProviderRemissionModal(null);
          setProviderRemissionError(null);
        }}
        onContinue={() => {
          setProviderRemissionModal(null);
          setProviderRemissionError(null);
          setGenerateStep('sign');
        }}
        onSubmit={() => void uploadMissingProviderRemissionsAndApprove()}
      />

      {signatureModalOpen ? (
        <SignatureCaptureModal
          opened
          title={customerSignatureLabel}
          value={receivedSignature}
          onClose={() => setSignatureModalOpen(false)}
          onConfirm={(signature) => {
            setReceivedSignature(signature);
            setSignatureModalOpen(false);
          }}
        />
      ) : null}

      <Modal
        opened={approvalWorkflow.adjustWarning.message !== null}
        onClose={approvalWorkflow.adjustWarning.dismiss}
        title="Ajuste requerido"
        centered
      >
        <Stack gap="md">
          <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
            {approvalWorkflow.adjustWarning.message ??
              'Primero ajusta el stock de bodega antes de hacer movimientos.'}
          </Text>
          <Group justify="flex-end">
            <Button
              onClick={() => {
                const ownerWarehouseId = approvalWorkflow.adjustWarning.ownerWarehouseId;
                approvalWorkflow.adjustWarning.dismiss();
                const params = new URLSearchParams();
                if (ownerWarehouseId) {
                  params.set('ownerWarehouseId', ownerWarehouseId);
                  params.set('warehouseId', ownerWarehouseId);
                }
                router.push(
                  `/inventory/bulk-adjustments${params.toString() ? `?${params.toString()}` : ''}`,
                );
              }}
            >
              Entendido
            </Button>
          </Group>
        </Stack>
      </Modal>

      <ApprovalResolutionModal
        opened={approvalWorkflow.resolution.opened}
        items={approvalWorkflow.resolution.document?.items ?? []}
        skuOptions={skuOptions}
        inventoriesByOwner={approvalWorkflow.resolution.inventoriesByOwner}
        warehouses={warehouses}
        skuByIndex={approvalWorkflow.resolution.skuByIndex}
        assetByIndex={approvalWorkflow.resolution.assetByIndex}
        resolving={approvalWorkflow.resolution.resolving}
        onClose={approvalWorkflow.resolution.close}
        onSkuChange={approvalWorkflow.resolution.changeSku}
        onAssetChange={approvalWorkflow.resolution.changeAsset}
        onCreateSerial={approvalWorkflow.createSerial.open}
        onApprove={() => void approvalWorkflow.resolution.approve()}
      />

      <InventoryItemPickerModal
        opened={
          activeTab === 'generate' &&
          generateStep === 'items' &&
          itemsModalOpen &&
          !useManualWarehouseCapture
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
          useManualWarehouseCapture ? 'Use description capture in the main section.' : null
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
        opened={Boolean(approvalWorkflow.motorRecovery.value)}
        mixer={approvalWorkflow.motorRecovery.value?.mixer ?? null}
        motors={approvalWorkflow.motorRecovery.value?.motors ?? []}
        loading={approvalWorkflow.motorRecovery.loading}
        error={approvalWorkflow.motorRecovery.error}
        onCancel={approvalWorkflow.motorRecovery.cancel}
        onConfirm={(motor) => void approvalWorkflow.motorRecovery.confirm(motor)}
      />

      <AssetComponentsSelectionModal
        opened={Boolean(componentParent)}
        parentName={componentParent ? getSerialDisplayName(componentParent) : ''}
        options={componentOptions}
        bulkItems={bulkItems}
        serialItems={serialItems}
        ownerWarehouseId={componentParent?.ownerWarehouseId ?? null}
        restrictOwnerWarehouse={sourceMode === 'warehouse'}
        onClose={closeAssetComponents}
        onConfirm={(selections) => void confirmAssetComponents(selections)}
      />

      <Modal
        opened={!!documentsRequest}
        onClose={() => setDocumentsRequest(null)}
        title={
          documentsRequest
            ? `${isDriverRole ? 'Fotos del borrador' : 'Documentos'} ${documentsRequest.consecutive ?? ''}`
            : isDriverRole
              ? 'Fotos del borrador'
              : 'Documentos'
        }
        centered
        size="xl"
      >
        {documentsRequest ? (
          <FileAttachmentsPanel
            entityType="DOCUMENT"
            entityId={documentsRequest.id}
            title={isDriverRole ? 'Evidencias fotográficas' : 'Documentos y evidencias de la solicitud'}
            description={
              isDriverRole
                ? 'Anexa las fotografías que olvidaste incluir. Solo puedes modificar tus propios borradores.'
                : undefined
            }
            uploadMode={isDriverRole ? 'document-evidence' : 'generic'}
            allowDelete={!isDriverRole}
          />
        ) : null}
      </Modal>

      {approvalWorkflow.createSerial.index != null ? (
        <CreateSerializedAssetModal
          opened
          initialInternalNumber={parseInternalNumberFromTag(
            approvalWorkflow.resolution.document?.items[approvalWorkflow.createSerial.index]
              ?.requestedTag,
          )}
          title="Crear equipo serializado faltante"
          submitLabel="Crear y usar"
          onClose={() => {
            approvalWorkflow.createSerial.close();
          }}
          onSubmit={approvalWorkflow.createSerial.submit}
        />
      ) : null}
    </main>
  );
}
