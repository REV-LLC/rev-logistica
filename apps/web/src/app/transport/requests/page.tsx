'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Autocomplete,
  Badge,
  Button,
  Checkbox,
  Container,
  Divider,
  Group,
  Modal,
  Paper,
  Radio,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  NumberInput,
  NativeSelect,
  Textarea,
  Tooltip
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconCamera, IconTrash } from '@tabler/icons-react';
import { api, ApiError } from '@/lib/api';
import { getCurrentUserRole, getCurrentUserSession } from '@/lib/auth';
import FileAttachmentsPanel from '@/components/FileAttachmentsPanel';
import { ownerColorById } from '@/lib/owner-color';
import InventoryItemPickerModal, {
  type InventoryItemPickerBulkItem,
  type InventoryItemPickerSerialItem,
} from '@/components/InventoryItemPickerModal';
import { getSerialDisplayName } from '@/lib/serial-assets';

type InventoryBulk = InventoryItemPickerBulkItem;
type InventorySerial = InventoryItemPickerSerialItem;

type CatalogSku = {
  skuId: string;
  name: string;
  controlType: 'BULK' | 'SERIAL';
};

type CatalogAsset = {
  assetId: string;
  serialOrEngine: string | null;
  skuId: string | null;
};

type Employee = {
  id: string;
  name: string;
  lastName?: string | null;
  user?: {
    id: string;
    email: string;
    role: string;
    active: boolean;
  } | null;
};
const getEmployeeFullName = (employee: Pick<Employee, 'name' | 'lastName'>) =>
  `${employee.name} ${employee.lastName ?? ''}`.trim();

type Customer = { id: string; name: string };
type CustomerWorksite = {
  id: string;
  alias: string | null;
  worksite: { id: string; name: string; address: string | null };
};

type Vehicle = { id: string; plate?: string | null; name?: string | null };
type Warehouse = { id: string; name: string; type?: 'OWN' | 'ALLY' | string };

type SelectedItem = {
  type: 'bulk' | 'serial' | 'free';
  bulkKey?: string;
  skuId?: string;
  assetId?: string;
  name: string;
  requestedTag?: string;
  serial?: string | null;
  quantity?: number;
  availableQuantity?: number;
  ownerWarehouseId?: string | null;
  isDamaged?: boolean;
  damageDescription?: string;
};

type EvidencePhotoDraft = {
  id: string;
  file: File;
  previewUrl: string;
};

const MAX_EVIDENCE_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_EVIDENCE_PHOTO_COUNT = 12;
const ALLOWED_EVIDENCE_PHOTO_TYPES = new Set(['image/png', 'image/webp', 'image/jpeg']);

type PrincipalCatalogEntry = {
  key: string;
  label: string;
  type: 'bulk' | 'serial';
  skuName?: string;
  skuId?: string;
  assetId?: string;
  ownerWarehouseId: string;
  quantity?: number;
  serial?: string | null;
};

type GenerateFieldErrors = {
  customerId?: string;
  docDate?: string;
  customerWorksiteId?: string;
  driverId?: string;
};

type RequestDocument = {
  id: string;
  type: 'REMISSION' | 'RETURN' | string;
  status: string;
  consecutive: string | null;
  createdAt: string;
  docDate: string;
  creator?: { id: string; name: string | null; email: string | null } | null;
  customerWorksite?: {
    id: string;
    alias: string | null;
    customer?: { id: string; name: string } | null;
    worksite?: { id: string; name: string } | null;
  } | null;
  _count?: { items: number };
};

type RequestDocumentDetail = {
  id: string;
  type: 'REMISSION' | 'RETURN' | string;
  consecutive: string | null;
  docDate: string;
  notes: string | null;
  warehouse?: { id: string; name: string } | null;
  customerWorksite?: {
    id: string;
    alias: string | null;
    customer?: { id: string; name: string } | null;
    worksite?: { id: string; name: string } | null;
  } | null;
  files?: Array<{
    id: string;
    fileType: string;
    storageKey: string;
    mimeType?: string | null;
    createdAt: string;
  }>;
  items: Array<{
    id: string;
    skuId?: string | null;
    assetId?: string | null;
    quantity?: string | number | null;
    condition?: string | null;
    conditionNote?: string | null;
    requestedTag?: string | null;
    billingCutoffDate?: string | null;
    sku?: { id: string; name: string } | null;
    asset?: {
      id: string;
      serialOrEngine?: string | null;
      description?: string | null;
      sku?: { id: string; name: string } | null;
    } | null;
  }>;
};

type SkuOption = {
  id: string;
  name: string;
  assetFamilyId: string;
  controlType: 'BULK' | 'SERIAL';
  category?: string | null;
};

type ResolveInventoryByOwner = Record<string, { serial: InventorySerial[] }>;

type CreateSerializedAssetResponse = {
  asset: {
    id: string;
    internalNumber: number;
    skuId: string;
    warehouseOwnerId: string;
    warehouseCurrentId: string;
  };
};
const WAREHOUSES_CACHE_KEY = 'requests.warehouses.v1';
const PRINCIPAL_TAGS_CACHE_KEY = 'requests.principalTags.v1';

const buildBulkKey = (item: { skuId: string; ownerWarehouseId: string | null }) =>
  `${item.skuId}::${item.ownerWarehouseId ?? 'none'}`;

const normalizeTagBase = (value?: string | null) =>
  (value ?? '')
    .replace(/#\s*\d+\s*$/i, '')
    .trim()
    .toUpperCase();

const parseInternalNumberFromTag = (value?: string | null) => {
  const match = (value ?? '').match(/#\s*(\d+)\s*$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const helpLabel = (label: string, help: string, required = false) => (
  <Group gap={6} align="center">
    <Text span>{label}</Text>
    {required ? (
      <Text span c="red" fw={700}>
        *
      </Text>
    ) : null}
    <Tooltip label={help} multiline w={280} withArrow>
      <Text span c="dimmed" fw={700} style={{ cursor: 'help' }}>
        ?
      </Text>
    </Tooltip>
  </Group>
);

function withDocPrefix(value: string, docType: 'REMISSION' | 'RETURN') {
  const prefix = docType === 'REMISSION' ? 'RM' : 'DV';
  const cleaned = value.trim().replace(/^(RM|DV)[\s\-_]*/i, '');
  return `${prefix}${cleaned}`;
}

function formatDocType(value: string) {
  return value === 'REMISSION' ? 'RM' : value === 'RETURN' ? 'DV' : value;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-CO');
}

function getTodayDateInput() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function requestTypeColor(type: string) {
  return type === 'REMISSION' ? 'green' : type === 'RETURN' ? 'red' : 'gray';
}

const FUEL_OPTIONS = [
  { value: 'GASOLINA', label: 'Gasolina' },
  { value: 'DIESEL', label: 'Diesel' },
  { value: 'ELECTRICO', label: 'Electric' },
];

function normalizeQuantityInput(value: string | number, fallback = 1) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNotes(notes: string | null) {
  if (!notes) return {};
  const parts = notes.split('|').map((value) => value.trim());
  const map = new Map<string, string>();
  parts.forEach((part) => {
    const [k, ...rest] = part.split(':');
    if (!k || rest.length === 0) return;
    map.set(k.trim().toLowerCase(), rest.join(':').trim());
  });
  return {
    deliveryMode: map.get('entrega') ?? '',
    vehicleId: map.get('vehículo') ?? '',
    driverId: map.get('conductor') ?? '',
    dispatcherId: map.get('despachador') ?? '',
  };
}

function normalizeApiErrorMessages(error: ApiError) {
  const messages: string[] = [];
  if (typeof error.message === 'string' && error.message.trim()) {
    messages.push(error.message.trim());
  }
  const data = error.data as
    | { message?: string | string[]; error?: string }
    | string
    | null
    | undefined;
  if (typeof data === 'string' && data.trim()) {
    messages.push(data.trim());
  } else if (data && typeof data === 'object') {
    if (typeof data.error === 'string' && data.error.trim()) {
      messages.push(data.error.trim());
    }
    const apiMessage = data.message;
    if (Array.isArray(apiMessage)) {
      apiMessage.forEach((entry) => {
        if (typeof entry === 'string' && entry.trim()) {
          messages.push(entry.trim());
        }
      });
    } else if (typeof apiMessage === 'string' && apiMessage.trim()) {
      messages.push(apiMessage.trim());
    }
  }
  return [...new Set(messages)];
}

function extractOwnerWarehouseIdFromMessage(message: string) {
  const match = message.match(/ownerWarehouse(?:Id)?\s+([0-9a-fA-F-]{36})/i);
  return match?.[1] ?? null;
}

function extractSkuIdsFromMessages(messages: string[]) {
  const ids = new Set<string>();
  messages.forEach((message) => {
    const regex = /skuId\s+([0-9a-fA-F-]{36})/gi;
    let match = regex.exec(message);
    while (match) {
      ids.add(match[1]);
      match = regex.exec(message);
    }
  });
  return [...ids];
}

function readJsonCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJsonCache(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
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

function pushFlowStateToUrl(tab: SolicitudesTab, step: GenerateStep) {
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
  } else {
    url.searchParams.delete('tab');
    url.searchParams.delete('step');
  }
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) {
    window.history.pushState(null, '', nextUrl);
  }
}

export function TransportRequestsWorkspace({ mode = 'requests' }: { mode?: RequestsPageMode }) {
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
  const [docDate, setDocDate] = useState(() => getTodayDateInput());
  const [deliveryMode, setDeliveryMode] = useState<'WAREHOUSE' | 'ON_SITE'>('ON_SITE');
  const [customerWorksiteId, setCustomerWorksiteId] = useState('');
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [dispatcherId, setDispatcherId] = useState<string | null>(null);

  const [sourceOwnerWarehouseId, setSourceOwnerWarehouseId] = useState<string | null>(null);
  const [sourceWorksiteId, setSourceWorksiteId] = useState<string | null>(null);

  const [bulkItems, setBulkItems] = useState<InventoryBulk[]>([]);
  const [serialItems, setSerialItems] = useState<InventorySerial[]>([]);

  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [onSiteItemSelect, setOnSiteItemSelect] = useState<string | null>(null);
  const [freeTagInput, setFreeTagInput] = useState('');
  const [freeQtyInput, setFreeQtyInput] = useState<number | ''>('');
  const [freeInternalNumber, setFreeInternalNumber] = useState<number | ''>('');
  const [principalCatalog, setPrincipalCatalog] = useState<PrincipalCatalogEntry[]>([]);
  const [loadingPrincipalTags, setLoadingPrincipalTags] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [worksites, setWorksites] = useState<CustomerWorksite[]>([]);
  const [worksitesLoading, setWorksitesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [itemsModalOpen, setItemsModalOpen] = useState(false);
  const [generateFieldErrors, setGenerateFieldErrors] = useState<GenerateFieldErrors>({});
  const [itemsAddedNotice, setItemsAddedNotice] = useState<string | null>(null);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [requests, setRequests] = useState<RequestDocument[]>([]);
  const [documentsRequest, setDocumentsRequest] = useState<RequestDocument | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [skuOptions, setSkuOptions] = useState<SkuOption[]>([]);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolveDocument, setResolveDocument] = useState<RequestDocumentDetail | null>(null);
  const [resolveSkuByIndex, setResolveSkuByIndex] = useState<Record<number, string>>({});
  const [resolveAssetByIndex, setResolveAssetByIndex] = useState<Record<number, string>>({});
  const [resolveInventoryByOwner, setResolveInventoryByOwner] = useState<ResolveInventoryByOwner>({});
  const [resolvingApprove, setResolvingApprove] = useState(false);
  const [createSerialOpen, setCreateSerialOpen] = useState(false);
  const [createSerialIndex, setCreateSerialIndex] = useState<number | null>(null);
  const [createSerialSerialOrEngine, setCreateSerialSerialOrEngine] = useState('');
  const [createSerialInternalNumber, setCreateSerialInternalNumber] = useState<number | ''>('');
  const [createSerialBrand, setCreateSerialBrand] = useState('');
  const [createSerialModel, setCreateSerialModel] = useState('');
  const [createSerialYear, setCreateSerialYear] = useState<number | ''>('');
  const [createSerialFuel, setCreateSerialFuel] = useState<string | null>(null);
  const [createSerialSaving, setCreateSerialSaving] = useState(false);
  const [createSerialError, setCreateSerialError] = useState<string | null>(null);
  const [adjustWarningModalOpen, setAdjustWarningModalOpen] = useState(false);
  const [adjustWarningMessage, setAdjustWarningMessage] = useState<string | null>(null);
  const [adjustWarningOwnerWarehouseId, setAdjustWarningOwnerWarehouseId] = useState<string | null>(null);
  const [receivedSignature, setReceivedSignature] = useState<string | null>(null);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [signatureDraft, setSignatureDraft] = useState<string | null>(null);
  const [evidencePhotos, setEvidencePhotos] = useState<EvidencePhotoDraft[]>([]);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureDrawingRef = useRef(false);
  const evidenceInputRef = useRef<HTMLInputElement | null>(null);
  const evidencePhotosRef = useRef<EvidencePhotoDraft[]>([]);
  const skipNextFlowUrlSyncRef = useRef(false);
  const lastAutoOpenedWarehouseRef = useRef<string | null>(null);
  const userSession = useMemo(() => getCurrentUserSession(), []);
  const userRole = useMemo(() => getCurrentUserRole(), []);
  const isDriverRole = userRole === 'DRIVER';
  const currentUserId = userSession?.sub ?? null;
  const canDecide = userRole === 'ADMIN' || userRole === 'OFFICE';
  const canResolveInline = canDecide && Boolean(editingRequestId);
  const sourceMode: 'warehouse' | 'on-site' = docType === 'REMISSION' ? 'warehouse' : 'on-site';
  const sourceOwnerWarehouse = warehouses.find((warehouse) => warehouse.id === sourceOwnerWarehouseId) ?? null;
  const isAlternateOwnerMode = sourceMode === 'warehouse' && sourceOwnerWarehouse?.type === 'ALLY';
  const useManualWarehouseCapture = sourceMode === 'warehouse' && isAlternateOwnerMode;
  const principalWarehouse = useMemo(
    () =>
      warehouses.find((warehouse) => warehouse.name.trim().toUpperCase() === 'BODEGA PRINCIPAL') ??
      warehouses.find((warehouse) => warehouse.name.toUpperCase().includes('PRINCIPAL')) ??
      warehouses.find((warehouse) => warehouse.type === 'OWN') ??
      null,
    [warehouses],
  );
  const ownerWarehouseOptions = warehouses.map((warehouse) => ({
    value: warehouse.id,
    label: warehouse.type === 'ALLY' ? `${warehouse.name} (Alterna)` : warehouse.name,
  }));
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
  const selectedItemsTotalQuantity = useMemo(
    () =>
      selectedItems.reduce((total, item) => {
        if (item.type === 'serial') return total + 1;
        const quantity = Number(item.quantity ?? 1);
        return total + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
      }, 0),
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
  const onSiteItemOptions = useMemo(
    () => [
      ...availableSerialItems.map((item) => ({
        value: `serial:${item.assetId}`,
        label: getSerialDisplayName(item),
        ownerWarehouseId: item.ownerWarehouseId ?? null,
      })),
      ...availableBulkItems.map((item) => ({
        value: `bulk:${buildBulkKey(item)}`,
        label: `${item.skuName ?? 'SKU'}`,
        ownerWarehouseId: item.ownerWarehouseId ?? null,
      })),
    ],
    [availableBulkItems, availableSerialItems],
  );
  const onSiteOwnerByValue = useMemo(() => {
    const map = new Map<string, { ownerId: string | null; ownerName: string }>();
    onSiteItemOptions.forEach((option) => {
      const ownerId = option.ownerWarehouseId ?? null;
      const ownerName = ownerId
        ? warehouses.find((warehouse) => warehouse.id === ownerId)?.name ?? 'Sin dueño'
        : 'Sin dueño';
      map.set(option.value, { ownerId, ownerName });
    });
    return map;
  }, [onSiteItemOptions, warehouses]);
  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null;
  const selectedWorksite = worksites.find((worksite) => worksite.id === customerWorksiteId) ?? null;
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null;
  const selectedDriver = employees.find((employee) => employee.id === driverId) ?? null;
  const selectedDispatcher = employees.find((employee) => employee.id === dispatcherId) ?? null;
  const alternateTagCatalog = useMemo(() => {
    if (!isAlternateOwnerMode) return [] as Array<{ label: string; type: 'bulk' | 'serial' }>;
    const byLabel = new Map<string, { label: string; type: 'bulk' | 'serial' }>();
    principalCatalog.forEach((entry) => {
      const rawLabel =
        entry.type === 'serial'
          ? entry.skuName?.trim() || entry.label.trim()
          : entry.label.trim();
      if (!rawLabel) return;
      const key = rawLabel.toUpperCase();
      if (!byLabel.has(key)) {
        byLabel.set(key, { label: rawLabel, type: entry.type });
      }
    });
    return [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [isAlternateOwnerMode, principalCatalog]);
  const alternateTagMatch = useMemo(() => {
    if (!isAlternateOwnerMode) return null;
    const typed = freeTagInput.trim().toUpperCase();
    if (!typed) return null;
    return alternateTagCatalog.find((entry) => entry.label.toUpperCase() === typed) ?? null;
  }, [isAlternateOwnerMode, freeTagInput, alternateTagCatalog]);
  const sourceOwnerWarehouseName =
    warehouses.find((warehouse) => warehouse.id === sourceOwnerWarehouseId)?.name ?? '-';
  const effectiveSourceWorksiteId =
    sourceMode === 'on-site' ? customerWorksiteId || sourceWorksiteId || null : sourceWorksiteId;
  const sourceWorksiteName =
    worksites.find((worksite) => worksite.id === effectiveSourceWorksiteId)?.alias ??
    worksites.find((worksite) => worksite.id === effectiveSourceWorksiteId)?.worksite.name ??
    '-';
  const isResolvePendingItem = (item: RequestDocumentDetail['items'][number]) => {
    const hasTag = Boolean(item.requestedTag?.trim());
    if (!item.skuId && !item.assetId) {
      return hasTag;
    }
    if (item.skuId && !item.assetId) {
      const skuType = skuOptions.find((sku) => sku.id === item.skuId)?.controlType;
      return skuType === 'SERIAL';
    }
    return false;
  };

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
    pushFlowStateToUrl(fixedTab, generateStep);
  }, [fixedTab, flowUrlReady, generateStep]);

  const ensureSignatureCanvas = (source?: string | null) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const ratio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const targetWidth = Math.max(1, Math.floor(rect.width * ratio));
    const targetHeight = Math.max(1, Math.floor(rect.height * ratio));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext('2d');
      if (!context) return canvas;
      context.scale(ratio, ratio);
      context.lineWidth = 2;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = '#111';
      context.fillStyle = '#fff';
      context.fillRect(0, 0, rect.width, rect.height);
      const previous = source ?? null;
      if (previous) {
        const image = new Image();
        image.onload = () => {
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(image, 0, 0, rect.width, rect.height);
        };
        image.src = previous;
      }
    }
    return canvas;
  };

  const getCanvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const beginSignature = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = ensureSignatureCanvas();
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const point = getCanvasPoint(event);
    if (!context || !point) return;
    signatureDrawingRef.current = true;
    context.beginPath();
    context.moveTo(point.x, point.y);
    canvas.setPointerCapture(event.pointerId);
  };

  const moveSignature = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!signatureDrawingRef.current) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const point = getCanvasPoint(event);
    if (!context || !point) return;
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const endSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    signatureDrawingRef.current = false;
    setSignatureDraft(canvas.toDataURL('image/png'));
  };

  const clearSignature = () => {
    const canvas = ensureSignatureCanvas(null);
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, rect.width, rect.height);
    setSignatureDraft(null);
  };

  useEffect(() => {
    if (!signatureModalOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const canvas = ensureSignatureCanvas();
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      const rect = canvas.getBoundingClientRect();
      context.clearRect(0, 0, rect.width, rect.height);
      context.fillStyle = '#fff';
      context.fillRect(0, 0, rect.width, rect.height);
      const source = signatureDraft ?? receivedSignature;
      if (!source) return;
      const image = new Image();
      image.onload = () => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(image, 0, 0, rect.width, rect.height);
      };
      image.src = source;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [signatureModalOpen, signatureDraft, receivedSignature]);

  useEffect(() => {
    evidencePhotosRef.current = evidencePhotos;
  }, [evidencePhotos]);

  useEffect(() => {
    return () => {
      evidencePhotosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    };
  }, []);

  const addEvidencePhotos = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setError(null);
    const nextPhotos: EvidencePhotoDraft[] = [];
    Array.from(fileList).forEach((file) => {
      if (!ALLOWED_EVIDENCE_PHOTO_TYPES.has(file.type)) {
        setError('Las evidencias deben ser fotos PNG, WEBP o JPEG.');
        return;
      }
      if (file.size > MAX_EVIDENCE_PHOTO_SIZE_BYTES) {
        setError('Cada foto de evidencia debe pesar maximo 10 MB.');
        return;
      }
      nextPhotos.push({
        id: `${file.name}-${file.lastModified}-${Date.now()}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    });
    if (!nextPhotos.length) return;

    const availableSlots = MAX_EVIDENCE_PHOTO_COUNT - evidencePhotos.length;
    if (availableSlots <= 0) {
      nextPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      setError(`Puedes adjuntar maximo ${MAX_EVIDENCE_PHOTO_COUNT} fotos por solicitud.`);
      return;
    }

    const accepted = nextPhotos.slice(0, availableSlots);
    nextPhotos.slice(availableSlots).forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    if (accepted.length < nextPhotos.length) {
      setError(`Solo se agregaron ${accepted.length} fotos. El maximo es ${MAX_EVIDENCE_PHOTO_COUNT}.`);
    }
    setEvidencePhotos((prev) => [...prev, ...accepted]);
    if (evidenceInputRef.current) {
      evidenceInputRef.current.value = '';
    }
  };

  const removeEvidencePhoto = (photoId: string) => {
    setEvidencePhotos((prev) => {
      const photo = prev.find((entry) => entry.id === photoId);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return prev.filter((entry) => entry.id !== photoId);
    });
  };

  const clearEvidencePhotos = () => {
    setEvidencePhotos((prev) => {
      prev.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      return [];
    });
    if (evidenceInputRef.current) {
      evidenceInputRef.current.value = '';
    }
  };

  const uploadEvidencePhotos = async (documentId: string) => {
    if (!evidencePhotos.length) return;
    const formData = new FormData();
    evidencePhotos.forEach((photo) => {
      formData.append('photos', photo.file);
    });
    await api(`/files/documents/${documentId}/evidence`, {
      method: 'POST',
      body: formData,
    });
  };

  const handleApprovalError = (err: unknown) => {
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
      /asset\s+[0-9a-f-]{36}\s+is not available in owner warehouse/i.test(message),
    );
    if (hasAssetUnavailableError) {
      setRequestsError(
        'No se puede aprobar: el equipo no esta disponible en la bodega de origen. Revisa si esta en obra o selecciona/carga el equipo correcto antes de aprobar.',
      );
      return;
    }

    const hasStockError = messages.some((message) => /insufficient stock/i.test(message));
    if (hasStockError && canDecide) {
      const messageWithOwner = messages.find((message) => /ownerWarehouse/i.test(message)) ?? messages[0] ?? '';
      const ownerId = extractOwnerWarehouseIdFromMessage(messageWithOwner);
      const ownerName = ownerId
        ? warehouses.find((warehouse) => warehouse.id.toLowerCase() === ownerId.toLowerCase())?.name
        : null;
      const missingSkuLabels = extractSkuIdsFromMessages(messages).map((skuId) => {
        const skuName = skuOptions.find((entry) => entry.id === skuId)?.name;
        return skuName ?? `SKU ${skuId.slice(0, 8)}`;
      });
      const warehouseLabel = ownerName ?? 'la bodega alterna';
      const missingItemsBlock = missingSkuLabels.length
        ? `\n\nItems por crear/ajustar:\n- ${missingSkuLabels.join('\n- ')}`
        : '';
      setAdjustWarningOwnerWarehouseId(ownerId ?? null);
      setAdjustWarningMessage(
        `Primero ajusta la bodega "${warehouseLabel}" antes de hacer movimientos.${missingItemsBlock}`,
      );
      setAdjustWarningModalOpen(true);
      setRequestsError(null);
      return;
    }

    setRequestsError(`${err.status}: ${err.message}`);
  };

  useEffect(() => {
    const cachedWarehouses = readJsonCache<{ items?: Warehouse[] }>(WAREHOUSES_CACHE_KEY);
    if (cachedWarehouses?.items?.length) {
      setWarehouses(cachedWarehouses.items);
    }
  }, []);

  useEffect(() => {
    if (!principalWarehouse?.id) return;
    if (warehouseId !== principalWarehouse.id) {
      setWarehouseId(principalWarehouse.id);
    }
  }, [principalWarehouse?.id, warehouseId]);

  useEffect(() => {
    let mounted = true;
    const loadPrincipalTags = async () => {
      if (!principalWarehouse?.id) return;
      setLoadingPrincipalTags(true);
      try {
        const data = await api<{ bulk: InventoryBulk[]; serial: InventorySerial[] }>(
          `/inventory/warehouse/${principalWarehouse.id}`,
          { method: 'GET' },
        );
        if (!mounted) return;
        const catalogEntries: PrincipalCatalogEntry[] = [];
        const uniqueLabels = new Map<string, string>();
        data.bulk.forEach((item) => {
          const label = item.skuName?.trim();
          if (!label) return;
          const key = `bulk:${item.skuId}:${item.ownerWarehouseId ?? principalWarehouse.id}`;
          catalogEntries.push({
            key,
            label,
            type: 'bulk',
            skuName: label,
            skuId: item.skuId,
            ownerWarehouseId: item.ownerWarehouseId ?? principalWarehouse.id,
            quantity: item.quantity,
          });
          uniqueLabels.set(label.toUpperCase(), label);
        });
        data.serial.forEach((item) => {
          const label = getSerialDisplayName(item);
          if (!label) return;
          const key = `serial:${item.assetId}`;
          catalogEntries.push({
            key,
            label,
            type: 'serial',
            skuName: item.skuName?.trim() || undefined,
            assetId: item.assetId,
            ownerWarehouseId: item.ownerWarehouseId ?? principalWarehouse.id,
            serial: item.serialOrEngine,
          });
          uniqueLabels.set(label.toUpperCase(), label);
        });
        const sortedTags = [...uniqueLabels.values()].sort((a, b) => a.localeCompare(b));
        setPrincipalCatalog(catalogEntries);
        writeJsonCache(PRINCIPAL_TAGS_CACHE_KEY, {
          tags: sortedTags,
          principalWarehouseId: principalWarehouse.id,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        if (!mounted) return;
        // ignore: si no carga, la captura alterna queda sin sugerencias hasta refrescar
      } finally {
        if (mounted) setLoadingPrincipalTags(false);
      }
    };
    loadPrincipalTags();
    return () => {
      mounted = false;
    };
  }, [principalWarehouse?.id]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [emps, vehs, whs] = await Promise.all([
          api<Employee[]>('/employees', { method: 'GET' }),
          api<Vehicle[]>('/vehicles', { method: 'GET' }),
          api<Warehouse[]>('/warehouses', { method: 'GET' }),
        ]);
        if (!mounted) return;
        setEmployees(emps);
        setVehicles(vehs);
        setWarehouses(whs);
        writeJsonCache(WAREHOUSES_CACHE_KEY, {
          items: whs,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        if (!mounted) return;
        const cachedWarehouses = readJsonCache<{ items?: Warehouse[] }>(WAREHOUSES_CACHE_KEY);
        if (cachedWarehouses?.items?.length) {
          setWarehouses(cachedWarehouses.items);
        }
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadCustomers = async () => {
      try {
        const data = await api<Customer[]>('/customers', { method: 'GET' });
        if (!mounted) return;
        setCustomers(data);
      } catch {
        if (!mounted) return;
      }
    };
    loadCustomers();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadWorksites = async () => {
      if (!customerId) {
        setWorksites([]);
        return;
      }
      setWorksitesLoading(true);
      try {
        const data = await api<CustomerWorksite[]>(
          `/customers/${customerId}/worksites`,
          { method: 'GET' }
        );
        if (!mounted) return;
        setWorksites(data);
      } catch {
        if (!mounted) return;
      } finally {
        if (mounted) setWorksitesLoading(false);
      }
    };
    loadWorksites();
    return () => {
      mounted = false;
    };
  }, [customerId]);

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

  const loadInventory = async (openSelector = true) => {
    setLoadingInventory(true);
    setError(null);
    try {
      if (sourceMode === 'warehouse') {
        if (!sourceOwnerWarehouseId) throw new Error('Selecciona la bodega dueña para filtrar items.');
        const selectedOwner = warehouses.find((warehouse) => warehouse.id === sourceOwnerWarehouseId);
        if (selectedOwner?.type === 'ALLY') {
          throw new Error('Para bodega alterna, usa captura libre de tags.');
        }
        const data = await api<{ bulk: InventoryBulk[]; serial: InventorySerial[] }>(
          `/inventory/warehouse/${sourceOwnerWarehouseId}`,
          { method: 'GET' }
        );
        setBulkItems(
          data.bulk.filter((item) => item.ownerWarehouseId === sourceOwnerWarehouseId),
        );
        setSerialItems(
          data.serial.filter((item) => item.ownerWarehouseId === sourceOwnerWarehouseId),
        );
      } else if (sourceMode === 'on-site') {
        if (!effectiveSourceWorksiteId) throw new Error('Selecciona una obra');
        const data = await api<{ bulk: InventoryBulk[]; serial: InventorySerial[] }>(
          `/inventory/on-site/${effectiveSourceWorksiteId}`,
          { method: 'GET' }
        );
        setBulkItems(data.bulk);
        setSerialItems(data.serial);
      }
      if (openSelector && !useManualWarehouseCapture) {
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
    if (sourceMode !== 'warehouse') return;
    if (!sourceOwnerWarehouseId) {
      lastAutoOpenedWarehouseRef.current = null;
      return;
    }
    const selectedOwner = warehouses.find((warehouse) => warehouse.id === sourceOwnerWarehouseId);
    if (selectedOwner?.type === 'ALLY') {
      lastAutoOpenedWarehouseRef.current = null;
      return;
    }
    if (lastAutoOpenedWarehouseRef.current === sourceOwnerWarehouseId) return;
    lastAutoOpenedWarehouseRef.current = sourceOwnerWarehouseId;
    void loadInventory(true);
  }, [sourceMode, sourceOwnerWarehouseId, warehouses]);

  useEffect(() => {
    if (sourceMode !== 'on-site') return;
    if (!effectiveSourceWorksiteId) {
      setBulkItems([]);
      setSerialItems([]);
      setOnSiteItemSelect(null);
      return;
    }
    void loadInventory(false);
    setOnSiteItemSelect(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceMode, effectiveSourceWorksiteId]);

  useEffect(() => {
    setBulkItems([]);
    setSerialItems([]);
    setOnSiteItemSelect(null);
    setFreeTagInput('');
    setFreeQtyInput('');
    setItemsModalOpen(false);
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

  const loadRequests = async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const data = await api<RequestDocument[]>('/documents?status=DRAFT&take=200', {
        method: 'GET',
      });
      setRequests(data.filter((doc) => doc.type === 'REMISSION' || doc.type === 'RETURN'));
    } catch (err) {
      if (err instanceof ApiError) {
        setRequestsError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setRequestsError(err.message);
      } else {
        setRequestsError('Error cargando solicitudes');
      }
    } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadSkuOptions = async () => {
      try {
        const data = await api<
          Array<{
            id: string;
            name: string;
            assetFamilyId: string;
            controlType: 'BULK' | 'SERIAL';
            category?: string | null;
          }>
        >('/skus', { method: 'GET' });
        if (!mounted) return;
        setSkuOptions(
          data.map((item) => ({
            id: item.id,
            name: item.name,
            assetFamilyId: item.assetFamilyId,
            controlType: item.controlType,
            category: item.category ?? null,
          })),
        );
      } catch {
        if (!mounted) return;
      }
    };
    loadSkuOptions();
    return () => {
      mounted = false;
    };
  }, []);

  const closeResolveModal = () => {
    if (resolvingApprove) return;
    setResolveModalOpen(false);
    setResolveDocument(null);
    setResolveSkuByIndex({});
    setResolveAssetByIndex({});
    setResolveInventoryByOwner({});
  };

  const loadResolveInventories = async (ownerIds: string[]) => {
    const uniqueOwnerIds = [...new Set(ownerIds.filter(Boolean))];
    if (!uniqueOwnerIds.length) return {};
    const loadedEntries = await Promise.all(
      uniqueOwnerIds.map(async (ownerId) => {
        try {
          const inventory = await api<{ serial: InventorySerial[] }>(`/inventory/warehouse/${ownerId}`, {
            method: 'GET',
          });
          return [ownerId, { serial: inventory.serial ?? [] }] as const;
        } catch {
          return [ownerId, { serial: [] }] as const;
        }
      }),
    );
    return Object.fromEntries(loadedEntries) as ResolveInventoryByOwner;
  };

  const buildInitialResolveState = (
    doc: RequestDocumentDetail,
    inventoriesByOwner: ResolveInventoryByOwner,
  ) => {
    const skuByNormalizedName = new Map<string, SkuOption>();
    skuOptions.forEach((sku) => skuByNormalizedName.set(sku.name.trim().toUpperCase(), sku));
    const initialSkuMap: Record<number, string> = {};
    const initialAssetMap: Record<number, string> = {};

    doc.items.forEach((item, index) => {
      if (item.assetId) return;
      const normalizedTag = normalizeTagBase(item.requestedTag);
      const matchedSku = item.skuId
        ? skuOptions.find((sku) => sku.id === item.skuId) ?? null
        : (normalizedTag ? skuByNormalizedName.get(normalizedTag) ?? null : null);
      if (!matchedSku) return;

      initialSkuMap[index] = matchedSku.id;

      if (matchedSku.controlType !== 'SERIAL') return;
      const ownerWarehouseId = item.condition?.trim();
      if (!ownerWarehouseId) return;
      const serialCandidates =
        inventoriesByOwner[ownerWarehouseId]?.serial.filter((serial) => serial.skuId === matchedSku.id) ?? [];
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
      setCreateSerialError('The line has no owner warehouse.');
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
          warehouseCurrentId: ownerWarehouseId,
        },
      });

      const refreshedInventory = await api<{ serial: InventorySerial[] }>(`/inventory/warehouse/${ownerWarehouseId}`, {
        method: 'GET',
      });
      setResolveInventoryByOwner((prev) => ({
        ...prev,
        [ownerWarehouseId]: { serial: refreshedInventory.serial ?? [] },
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
      await api(`/documents/${documentId}/decision`, {
        method: 'POST',
        json: { action: 'APPROVE' },
      });
      await loadRequests();
    } catch (err) {
      handleApprovalError(err);
    } finally {
      setDecidingId(null);
    }
  };

  const decideRequest = async (documentId: string, action: 'APPROVE' | 'REJECT') => {
    if (action === 'REJECT') {
      const reason = window.prompt('Motivo de rechazo (opcional):') ?? undefined;
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
      const doc = await api<RequestDocumentDetail>(`/documents/${documentId}`, { method: 'GET' });
      const unresolved = doc.items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => isResolvePendingItem(item));

      if (unresolved.length > 0) {
        const ownerIds = unresolved
          .map(({ item }) => item.condition?.trim() ?? '')
          .filter((value): value is string => Boolean(value));
        const inventoriesByOwner = await loadResolveInventories(ownerIds);
        const { initialSkuMap, initialAssetMap } = buildInitialResolveState(doc, inventoriesByOwner);

        setResolveDocument(doc);
        setResolveInventoryByOwner(inventoriesByOwner);
        setResolveSkuByIndex(initialSkuMap);
        setResolveAssetByIndex(initialAssetMap);
        setResolveModalOpen(true);
        return;
      }

      if (!window.confirm('¿Aprobar esta solicitud y ejecutar el movimiento de inventario?')) return;
      await approveWithDecision(documentId);
    } catch (err) {
      handleApprovalError(err);
    }
  };

  const addBulkItem = (item: InventoryBulk) => {
    if (item.quantity < 0) {
      setError('Este item tiene alerta de inventario negativo. Ajusta stock antes de usarlo en un documento.');
      return false;
    }
    const bulkKey = buildBulkKey(item);
    let added = false;
    setSelectedItems((prev) => {
      const exists = prev.find((entry) => entry.type === 'bulk' && entry.bulkKey === bulkKey);
      if (exists) return prev;
      added = true;
      return [
        ...prev,
        {
          type: 'bulk',
          bulkKey,
          skuId: item.skuId,
          name: item.skuName ?? item.skuId,
          quantity: 1,
          availableQuantity: item.quantity,
          ownerWarehouseId: item.ownerWarehouseId
        }
      ];
    });
    return added;
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
      setRequestsError('Falta seleccionar o crear equipo para uno o mas tags seriales.');
      return;
    }

    setResolvingApprove(true);
    setRequestsError(null);
    try {
      const itemsPayload = resolveDocument.items.map((item, index) => {
        const ownerWarehouseId = item.condition ?? undefined;
        if (item.assetId) {
          return {
            assetId: item.assetId,
            ownerWarehouseId,
            conditionNote: item.conditionNote ?? undefined,
          };
        }
        if (item.skuId && !item.assetId) {
          const existingSku = skuOptions.find((entry) => entry.id === item.skuId);
          if (existingSku?.controlType === 'SERIAL') {
            return {
              assetId: resolveAssetByIndex[index],
              ownerWarehouseId,
              requestedTag: item.requestedTag ?? undefined,
              conditionNote: item.conditionNote ?? undefined,
            };
          }
        }
        if (item.skuId) {
          return {
            skuId: item.skuId,
            quantity: Number(item.quantity ?? 1) || 1,
            ownerWarehouseId,
            requestedTag: item.requestedTag ?? undefined,
            conditionNote: item.conditionNote ?? undefined,
          };
        }
        const resolvedSkuId = resolveSkuByIndex[index];
        const resolvedSku = skuOptions.find((entry) => entry.id === resolvedSkuId);
        if (resolvedSku?.controlType === 'SERIAL') {
          return {
            assetId: resolveAssetByIndex[index],
            ownerWarehouseId,
            requestedTag: item.requestedTag ?? undefined,
            conditionNote: item.conditionNote ?? undefined,
          };
        }
        return {
          skuId: resolvedSkuId,
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

  const addSerialItem = (item: InventorySerial) => {
    let added = false;
    setSelectedItems((prev) => {
      const exists = prev.find((entry) => entry.assetId === item.assetId && entry.type === 'serial');
      if (exists) return prev;
      added = true;
      return [
        ...prev,
        {
          type: 'serial',
          assetId: item.assetId,
          name: getSerialDisplayName(item),
          serial: item.serialOrEngine,
          ownerWarehouseId: item.ownerWarehouseId
        }
      ];
    });
    return added;
  };

  const addFreeItem = () => {
    const tag = freeTagInput.trim().toUpperCase();
    const qty = typeof freeQtyInput === 'number' ? freeQtyInput : 0;
    if (!tag) {
      setError('Escribe el item');
      return;
    }
    if (!sourceOwnerWarehouseId) {
      setError('Selecciona primero la bodega dueña');
      return;
    }
    const selectedOwnerType = warehouses.find((warehouse) => warehouse.id === sourceOwnerWarehouseId)?.type;

    if (selectedOwnerType === 'ALLY') {
      const isAlternateSerial = alternateTagMatch?.type === 'serial';
      if (isAlternateSerial) {
        const internal = typeof freeInternalNumber === 'number' ? freeInternalNumber : 0;
        if (!internal || internal <= 0) {
          setError('Ingresa el numero interno del equipo');
          return;
        }
        const serialLabel = `${tag} #${internal}`;
        setError(null);
        setSelectedItems((prev) => {
          const exists = prev.some(
            (item) =>
              item.ownerWarehouseId === sourceOwnerWarehouseId &&
              (item.requestedTag ?? item.name).toUpperCase() === serialLabel.toUpperCase(),
          );
          if (exists) return prev;
          return [
            ...prev,
            {
              type: 'free',
              name: serialLabel,
              requestedTag: serialLabel,
              quantity: 1,
              ownerWarehouseId: sourceOwnerWarehouseId,
            },
          ];
        });
        setFreeTagInput('');
        setFreeQtyInput('');
        setFreeInternalNumber('');
        setItemsAddedNotice(`${serialLabel} agregado a la lista.`);
        return;
      }
      if (!qty || qty <= 0) {
        setError('Invalid quantity for the item');
        return;
      }
      setError(null);
      setSelectedItems((prev) => [
        ...prev,
        {
          type: 'free',
          name: tag,
          requestedTag: tag,
          quantity: qty,
          ownerWarehouseId: sourceOwnerWarehouseId,
        },
      ]);
      setFreeTagInput('');
      setFreeQtyInput('');
      setFreeInternalNumber('');
      setItemsAddedNotice(`${tag} agregado a la lista.`);
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
              type: 'bulk',
              bulkKey: buildBulkKey({ skuId, ownerWarehouseId: item.ownerWarehouseId ?? null }),
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
    setSelectedItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  };

  const removeSelected = (index: number) => {
    setSelectedItems((prev) => prev.filter((_, i) => i !== index));
  };

  const resetGenerateForm = () => {
    setEditingRequestId(null);
    setError(null);
    setConsecutive('');
    setCustomerId(null);
    setDocDate(getTodayDateInput());
    setDeliveryMode('ON_SITE');
    setCustomerWorksiteId('');
    setWarehouseId(null);
    setVehicleId(null);
    setDriverId(null);
    setDispatcherId(null);
    setSourceOwnerWarehouseId(null);
    setSourceWorksiteId(null);
    setBulkItems([]);
    setSerialItems([]);
    setSelectedItems([]);
    setFreeTagInput('');
    setFreeQtyInput('');
    setFreeInternalNumber('');
    setGenerateFieldErrors({});
    setGenerateStep('info');
    setReceivedSignature(null);
    clearEvidencePhotos();
  };

  const editRequest = async (documentId: string) => {
    if (mode === 'requests') {
      router.push(`/transport/generate?edit=${documentId}`);
      return;
    }

    setError(null);
    setSubmitResult(null);
    try {
      const doc = await api<RequestDocumentDetail>(`/documents/${documentId}`, { method: 'GET' });
      const parsed = parseNotes(doc.notes ?? null);
      setEditingRequestId(doc.id);
      setDocType(doc.type === 'RETURN' ? 'RETURN' : 'REMISSION');
      setConsecutive(doc.consecutive ?? '');
      setCustomerId(doc.customerWorksite?.customer?.id ?? null);
      setDocDate(doc.docDate ? new Date(doc.docDate).toISOString().slice(0, 10) : '');
      setDeliveryMode(parsed.deliveryMode === 'ON_SITE' ? 'ON_SITE' : 'WAREHOUSE');
      setCustomerWorksiteId(doc.customerWorksite?.id ?? '');
      setWarehouseId(doc.warehouse?.id ?? null);
      setVehicleId(parsed.vehicleId ?? null);
      setDriverId(parsed.driverId ?? null);
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
              type: 'free' as const,
              name: item.requestedTag,
              requestedTag: item.requestedTag,
              quantity: Number(item.quantity ?? 1) || 1,
              ownerWarehouseId,
              isDamaged: Boolean(item.conditionNote?.trim()),
              damageDescription: item.conditionNote ?? '',
            };
          }
          if (item.skuId) {
            return {
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
            isDamaged: Boolean(item.conditionNote?.trim()),
            damageDescription: item.conditionNote ?? '',
          };
        }),
      );
      const savedSignature = doc.files?.find((file) => file.fileType === 'SIGNATURE_RECEIVED')?.storageKey ?? null;
      setReceivedSignature(savedSignature);
      clearEvidencePhotos();
      setActiveTab('generate');
      setGenerateStep('info');
    } catch (err) {
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
    const editId = new URLSearchParams(window.location.search).get('edit');
    if (!editId || editingRequestId === editId) return;
    void editRequest(editId);
  }, [editingRequestId, mode]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitResult(null);
    setError(null);
    try {
      if (!docDate || !customerId) {
        throw new Error('Completa los campos requeridos.');
      }
      if (!selectedItems.length) {
        throw new Error('Selecciona al menos un item.');
      }
      if (
        selectedItems.some(
          (item) => item.type === 'bulk' && item.availableQuantity != null && item.availableQuantity < 0,
        )
      ) {
        throw new Error('Algunos items tienen alertas de inventario negativo. Ajusta stock antes de crear el documento.');
      }
      if (!customerWorksiteId) {
        throw new Error('Selecciona la obra.');
      }
      if (!editingRequestId && !receivedSignature) {
        throw new Error('Captura la firma del cliente antes de enviar.');
      }
      const effectiveWarehouseId = warehouseId ?? principalWarehouse?.id ?? null;
      if (docType === 'RETURN' && !effectiveWarehouseId) {
        throw new Error('Selecciona la bodega para la devolucion.');
      }
      if (docType === 'REMISSION' && deliveryMode === 'WAREHOUSE' && !effectiveWarehouseId) {
        throw new Error('Selecciona la bodega de despacho.');
      }
      if (docType === 'REMISSION' && deliveryMode === 'ON_SITE' && isDriverRole && !driverId) {
        throw new Error('Tu usuario no esta vinculado a un empleado conductor.');
      }
      const damagedWithoutDescription = selectedItems.find(
        (item) => item.isDamaged && !item.damageDescription?.trim(),
      );
      if (docType === 'RETURN' && damagedWithoutDescription) {
        throw new Error(`Describe el daño de ${damagedWithoutDescription.name}.`);
      }

      const documentPayload = {
        type: docType,
        number: consecutive ? withDocPrefix(consecutive, docType) : undefined,
        warehouseId: effectiveWarehouseId ?? undefined,
        customerWorksiteId: customerWorksiteId || undefined,
        receivedSignature: editingRequestId ? undefined : (receivedSignature ?? undefined),
        notes: [
          `Fecha documento: ${docDate}`,
          docType === 'REMISSION' ? `Entrega: ${deliveryMode}` : null,
          deliveryMode === 'ON_SITE' && vehicleId ? `Vehiculo: ${vehicleId}` : null,
          deliveryMode === 'ON_SITE' && driverId ? `Conductor: ${driverId}` : null,
          deliveryMode === 'WAREHOUSE' && dispatcherId ? `Despachador: ${dispatcherId}` : null
        ].filter(Boolean).join(' | ')
      } as const;

      const movementItems = selectedItems.map((item) => {
        if (!item.ownerWarehouseId) {
          throw new Error(`Missing owner for item ${item.name}`);
        }
        if (item.type === 'free') {
          return {
            requestedTag: item.requestedTag ?? item.name,
            quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
            ownerWarehouseId: item.ownerWarehouseId,
            conditionNote:
              docType === 'RETURN' && item.isDamaged
                ? item.damageDescription?.trim()
                : undefined,
          };
        }
        return item.type === 'bulk'
          ? {
              skuId: item.skuId,
              quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
              ownerWarehouseId: item.ownerWarehouseId,
              conditionNote:
                docType === 'RETURN' && item.isDamaged
                  ? item.damageDescription?.trim()
                  : undefined,
            }
          : {
              assetId: item.assetId,
              ownerWarehouseId: item.ownerWarehouseId,
              conditionNote:
                docType === 'RETURN' && item.isDamaged
                  ? item.damageDescription?.trim()
                  : undefined,
            };
      });

      const created = await api<{ id: string }>(
        editingRequestId ? `/documents/${editingRequestId}/request` : '/documents/requests',
        {
          method: editingRequestId ? 'PATCH' : 'POST',
          json: {
            ...documentPayload,
            items: movementItems,
          },
        },
      );
      const successMessage = editingRequestId
        ? `Request updated (${created.id}).`
        : `Request sent as draft (${created.id}).`;
      try {
        await uploadEvidencePhotos(created.id);
        if (!editingRequestId) {
          await api(`/documents/${created.id}/customer-email/draft`, {
            method: 'POST',
          });
        }
      } catch (uploadError) {
        const message =
          uploadError instanceof ApiError
            ? `${uploadError.status}: ${uploadError.message}`
            : uploadError instanceof Error
              ? uploadError.message
              : 'No se pudieron subir las evidencias.';
        throw new Error(`La solicitud se guardo (${created.id}), pero fallaron las fotos: ${message}`);
      }
      resetGenerateForm();
      setSubmitResult(successMessage);
      setItemsModalOpen(false);
      setWorksites([]);
      setActiveTab(fixedTab);
      await loadRequests();
      if (mode === 'generate') {
        router.push('/transport/requests');
      }
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error enviando la solicitud.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const goToItemsStep = () => {
    setError(null);
    const nextFieldErrors: GenerateFieldErrors = {};
    if (!customerId) nextFieldErrors.customerId = 'Selecciona la razon social.';
    if (!docDate) nextFieldErrors.docDate = 'Selecciona la fecha.';
    if (!customerWorksiteId) nextFieldErrors.customerWorksiteId = 'Selecciona la obra.';
    if (docType === 'REMISSION' && deliveryMode === 'ON_SITE' && isDriverRole && !driverId) {
      nextFieldErrors.driverId = 'Selecciona el conductor.';
    }
    setGenerateFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      setError('Revisa los campos obligatorios resaltados.');
      return;
    }
    setGenerateStep('items');
  };

  const goToSignStep = () => {
    setError(null);
    if (!selectedItems.length) {
      setError('Selecciona al menos un item.');
      return;
    }
    setGenerateStep('sign');
  };

  const handleGenerateStepChange = (value: string | null) => {
    if (value === 'items') {
      goToItemsStep();
      return;
    }
    if (value === 'sign') {
      goToSignStep();
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
              damageDescription: event.currentTarget.checked ? item.damageDescription ?? '' : '',
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
              <Group justify="space-between" mb="sm">
                <div>
                  <Text fw={700}>Solicitudes en borrador</Text>
                  <Text size="sm" c="dimmed">
                    Revisa solicitudes pendientes, abre detalles o decide aprobacion y rechazo.
                  </Text>
                </div>
                <Button variant="light" onClick={loadRequests} loading={requestsLoading}>
                  Refrescar
                </Button>
              </Group>
              {requestsError ? (
                <Text c="red" mb="sm">
                  {requestsError}
                </Text>
              ) : null}
              {submitResult ? (
                <Alert color="green" variant="light" mb="sm" withCloseButton onClose={() => setSubmitResult(null)}>
                  {submitResult}
                </Alert>
              ) : null}
              {isMobile ? (
                <Stack gap="sm">
                  {requests.map((row) => (
                    <Paper key={row.id} withBorder radius="md" p="sm">
                      <Stack gap={6}>
                        <Group justify="space-between" align="flex-start">
                          <Text fw={700}>{row.consecutive ?? 'Sin consecutivo'}</Text>
                          <Badge color="yellow" variant="light">
                            {row.status}
                          </Badge>
                        </Group>
                        <Text size="sm" component="div">
                          <strong>Tipo:</strong>{' '}
                          <Badge size="sm" variant="light" color={requestTypeColor(row.type)}>
                            {formatDocType(row.type)}
                          </Badge>
                        </Text>
                        <Text size="sm">
                          <strong>Cliente:</strong> {row.customerWorksite?.customer?.name ?? '-'}
                        </Text>
                        <Text size="sm">
                          <strong>Obra:</strong>{' '}
                          {row.customerWorksite?.alias ?? row.customerWorksite?.worksite?.name ?? '-'}
                        </Text>
                        <Text size="sm">
                          <strong>Items:</strong> {row._count?.items ?? 0}
                        </Text>
                        <Text size="sm">
                          <strong>Creado por:</strong> {row.creator?.name ?? row.creator?.email ?? '-'}
                        </Text>
                        <Text size="sm">
                          <strong>Fecha:</strong> {formatDateTime(row.createdAt)}
                        </Text>
                        <Group gap="xs" wrap="wrap" mt={4}>
                          <Button
                            component={Link}
                            href={`/inventory/ledger/document/${row.id}`}
                            variant="light"
                            size="xs"
                          >
                            Ver
                          </Button>
                          <Button
                            variant="light"
                            color="blue"
                            size="xs"
                            onClick={() => setDocumentsRequest(row)}
                          >
                            Documentos
                          </Button>
                          {canDecide ? (
                            <>
                            <Button
                              variant="light"
                              color="blue"
                              size="xs"
                              onClick={() => editRequest(row.id)}
                            >
                              Editar
                            </Button>
                            <Button
                              color="green"
                              size="xs"
                              loading={decidingId === row.id}
                              onClick={() => decideRequest(row.id, 'APPROVE')}
                            >
                              ✓
                            </Button>
                            <Button
                              color="red"
                              variant="light"
                              size="xs"
                              loading={decidingId === row.id}
                              onClick={() => decideRequest(row.id, 'REJECT')}
                            >
                              ✕
                            </Button>
                            </>
                          ) : null}
                        </Group>
                      </Stack>
                    </Paper>
                  ))}
                  {!requestsLoading && requests.length === 0 ? (
                    <Text c="dimmed">No hay solicitudes en borrador.</Text>
                  ) : null}
                </Stack>
              ) : (
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Tipo</Table.Th>
                      <Table.Th>Consecutivo</Table.Th>
                      <Table.Th>Cliente / Obra</Table.Th>
                      <Table.Th>Items</Table.Th>
                      <Table.Th>Creado por</Table.Th>
                      <Table.Th>Fecha</Table.Th>
                      <Table.Th>Estado</Table.Th>
                      <Table.Th style={{ width: 220, whiteSpace: 'nowrap' }}>Acciones</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {requests.map((row) => (
                      <Table.Tr key={row.id}>
                        <Table.Td>
                          <Badge size="sm" variant="light" color={requestTypeColor(row.type)}>
                            {formatDocType(row.type)}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{row.consecutive ?? '-'}</Table.Td>
                        <Table.Td>
                          <Text size="sm">{row.customerWorksite?.customer?.name ?? '-'}</Text>
                          <Text size="xs" c="dimmed">
                            {row.customerWorksite?.alias ?? row.customerWorksite?.worksite?.name ?? '-'}
                          </Text>
                        </Table.Td>
                        <Table.Td>{row._count?.items ?? 0}</Table.Td>
                        <Table.Td>{row.creator?.name ?? row.creator?.email ?? '-'}</Table.Td>
                        <Table.Td>{formatDateTime(row.createdAt)}</Table.Td>
                        <Table.Td>
                          <Badge color="yellow" variant="light">
                            {row.status}
                          </Badge>
                        </Table.Td>
                        <Table.Td style={{ whiteSpace: 'nowrap' }}>
                          <Group gap="xs" wrap="nowrap">
                            <Button
                              component={Link}
                              href={`/inventory/ledger/document/${row.id}`}
                              variant="light"
                              size="xs"
                            >
                              Ver
                            </Button>
                            <Button
                              variant="light"
                              color="blue"
                              size="xs"
                              onClick={() => setDocumentsRequest(row)}
                            >
                              Docs
                            </Button>
                            {canDecide ? (
                              <>
                                <Button
                                  variant="light"
                                  color="blue"
                                  size="xs"
                                  onClick={() => editRequest(row.id)}
                                >
                                  Editar
                                </Button>
                                <Button
                                  color="green"
                                  size="xs"
                                  loading={decidingId === row.id}
                                  onClick={() => decideRequest(row.id, 'APPROVE')}
                                >
                                  ✓
                                </Button>
                                <Button
                                  color="red"
                                  variant="light"
                                  size="xs"
                                  loading={decidingId === row.id}
                                  onClick={() => decideRequest(row.id, 'REJECT')}
                                >
                                  ✕
                                </Button>
                              </>
                            ) : null}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                    {!requestsLoading && requests.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={8}>
                          <Text c="dimmed">No hay solicitudes en borrador.</Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : null}
                  </Table.Tbody>
                </Table>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="generate" pt="md">
              <Stack gap="sm" mb="lg">
                  <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                    <div>
                      <Group gap="xs" mb={6}>
                        <Badge color={docType === 'REMISSION' ? 'blue' : 'orange'} variant="light">
                          {formatDocType(docType)}
                        </Badge>
                        <Badge color={editingRequestId ? 'grape' : 'teal'} variant="light">
                          {editingRequestId ? `Editando ${editingRequestId.slice(0, 8)}` : 'Nueva solicitud'}
                        </Badge>
                      </Group>
                      <Text fw={800} size="lg">
                        Generar documento
                      </Text>
                      <Text size="sm" c="dimmed">
                        Completa informacion, items y firma antes de enviar.
                      </Text>
                    </div>
                    {editingRequestId ? (
                      <Button variant="light" color="gray" onClick={resetGenerateForm}>
                        Cancelar edicion
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
                <>
              {renderGenerateError()}
              <Stack gap="md">
                <Paper withBorder radius="lg" p="md" bg="gray.0">
                  <Stack gap="md">
                    <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                      <div>
                        <Text fw={800}>Documento</Text>
                        <Text size="sm" c="dimmed">
                          Define el tipo, consecutivo y fecha base del movimiento.
                        </Text>
                      </div>
                      <Badge color={docType === 'REMISSION' ? 'blue' : 'orange'} variant="light">
                        {formatDocType(docType)}
                      </Badge>
                    </Group>

                    <Radio.Group
                      value={docType}
                      onChange={(value) => setDocType(value as 'REMISSION' | 'RETURN')}
                      label="Tipo"
                    >
                      <Group mt="xs">
                        <Radio value="REMISSION" label="Despacho" />
                        <Radio value="RETURN" label="Devolucion" />
                      </Group>
                    </Radio.Group>

                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {!isDriverRole ? (
              <TextInput
                label={helpLabel('Consecutivo (opcional)', 'Si queda vacio, oficina puede asignarlo en la confirmacion.')}
                withAsterisk={false}
                value={consecutive}
                onChange={(event) => setConsecutive(event.target.value)}
              />
            ) : null}
            {isMobile ? (
              <NativeSelect
                label="Razón social"
                value={customerId ?? ''}
                onChange={(event) => {
                  setCustomerId(event.currentTarget.value || null);
                  setCustomerWorksiteId('');
                  setGenerateFieldErrors((prev) => ({ ...prev, customerId: undefined, customerWorksiteId: undefined }));
                }}
                data={[
                  { value: '', label: 'Seleccionar cliente' },
                  ...customers.map((customer) => ({
                    value: customer.id,
                    label: customer.name,
                  })),
                ]}
                required
                error={generateFieldErrors.customerId}
              />
            ) : (
              <Select
                label="Razón social"
                value={customerId}
                onChange={(value) => {
                  setCustomerId(value);
                  setCustomerWorksiteId('');
                  setGenerateFieldErrors((prev) => ({ ...prev, customerId: undefined, customerWorksiteId: undefined }));
                }}
                data={customers.map((customer) => ({
                  value: customer.id,
                  label: customer.name
                }))}
                searchable
                clearable
                required
                placeholder="Seleccionar cliente"
                error={generateFieldErrors.customerId}
              />
            )}
            <TextInput
              label={helpLabel('Fecha', 'Fecha del documento de despacho o devolucion.', true)}
              withAsterisk={false}
              type="date"
              value={docDate}
              onChange={(event) => {
                setDocDate(event.target.value);
                setGenerateFieldErrors((prev) => ({ ...prev, docDate: undefined }));
              }}
              required
              error={generateFieldErrors.docDate}
            />
                    </SimpleGrid>
                  </Stack>
                </Paper>

              {docType === 'REMISSION' && (
                <Paper withBorder radius="lg" p="md">
                  <Stack gap="sm">
                    <Text fw={800}>Modo de entrega</Text>
                    <Radio.Group
                      value={deliveryMode}
                      onChange={(value) => setDeliveryMode(value as 'WAREHOUSE' | 'ON_SITE')}
                      label="Entrega"
                    >
                      <Group mt="xs">
                        <Radio value="WAREHOUSE" label="Despacho desde bodega" />
                        <Radio value="ON_SITE" label="Entrega en obra" />
                      </Group>
                    </Radio.Group>
                  </Stack>
                </Paper>
              )}

                <Paper withBorder radius="lg" p="md">
                  <Stack gap="md">
                    <div>
                      <Text fw={800}>Cliente, obra y responsables</Text>
                      <Text size="sm" c="dimmed">
                        Selecciona el destino y quien responde por el despacho.
                      </Text>
                    </div>
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {isMobile ? (
              <NativeSelect
                label={helpLabel('Obra', 'Obra destino del movimiento.')}
                value={customerWorksiteId}
                onChange={(event) => {
                  setCustomerWorksiteId(event.currentTarget.value);
                  setGenerateFieldErrors((prev) => ({ ...prev, customerWorksiteId: undefined }));
                }}
                data={[
                  { value: '', label: customerId ? 'Seleccionar obra' : 'Selecciona primero un cliente' },
                  ...worksiteOptions,
                ]}
                disabled={!customerId || worksitesLoading}
                error={generateFieldErrors.customerWorksiteId}
              />
            ) : (
              <Select
                label={helpLabel('Obra', 'Obra destino del movimiento.')}
                value={customerWorksiteId}
                onChange={(value) => {
                  setCustomerWorksiteId(value ?? '');
                  setGenerateFieldErrors((prev) => ({ ...prev, customerWorksiteId: undefined }));
                }}
                data={worksiteOptions}
                searchable
                clearable
                placeholder={customerId ? 'Seleccionar obra' : 'Selecciona primero un cliente'}
                disabled={!customerId || worksitesLoading}
                error={generateFieldErrors.customerWorksiteId}
              />
            )}
            {docType === 'REMISSION' && deliveryMode === 'ON_SITE' && (
              isMobile ? (
                <NativeSelect
                  label={helpLabel('Vehiculo', 'Vehiculo que transporta el despacho a obra.')}
                  value={vehicleId ?? ''}
                  onChange={(event) => setVehicleId(event.currentTarget.value || null)}
                  data={[{ value: '', label: 'Seleccionar vehiculo' }, ...vehicleOptions]}
                />
              ) : (
                <Select
                  label={helpLabel('Vehiculo', 'Vehiculo que transporta el despacho a obra.')}
                  value={vehicleId}
                  onChange={(value) => setVehicleId(value)}
                  data={vehicleOptions}
                  searchable
                  clearable
                />
              )
            )}
            {docType === 'REMISSION' && deliveryMode === 'ON_SITE' && (
              isMobile ? (
                <NativeSelect
                  label={helpLabel('Conductor', 'Persona responsable del transporte del despacho.')}
                  value={driverId ?? ''}
                  onChange={(event) => {
                    setDriverId(event.currentTarget.value || null);
                    setGenerateFieldErrors((prev) => ({ ...prev, driverId: undefined }));
                  }}
                  data={[{ value: '', label: 'Seleccionar conductor' }, ...employeeOptions]}
                  disabled={isDriverRole}
                  error={generateFieldErrors.driverId}
                />
              ) : (
                <Select
                  label={helpLabel('Conductor', 'Persona responsable del transporte del despacho.')}
                  value={driverId}
                  onChange={(value) => {
                    setDriverId(value);
                    setGenerateFieldErrors((prev) => ({ ...prev, driverId: undefined }));
                  }}
                  data={employeeOptions}
                  searchable
                  clearable
                  disabled={isDriverRole}
                  error={generateFieldErrors.driverId}
                />
              )
            )}
            {docType === 'REMISSION' && deliveryMode === 'WAREHOUSE' && (
              isMobile ? (
                <NativeSelect
                  label={helpLabel('Despachador', 'Empleado que entrega material desde bodega.')}
                  value={dispatcherId ?? ''}
                  onChange={(event) => setDispatcherId(event.currentTarget.value || null)}
                  data={[{ value: '', label: 'Seleccionar despachador' }, ...employeeOptions]}
                  disabled={isDriverRole}
                />
              ) : (
                <Select
                  label={helpLabel('Despachador', 'Empleado que entrega material desde bodega.')}
                  value={dispatcherId}
                  onChange={(value) => setDispatcherId(value)}
                  data={employeeOptions}
                  searchable
                  clearable
                  disabled={isDriverRole}
                />
              )
            )}
                    </SimpleGrid>
                  </Stack>
                </Paper>
              </Stack>
              <Group mt="md" justify="flex-end" className="mobile-actions">
                <Button onClick={goToItemsStep}>Siguiente: Items</Button>
              </Group>
                </>
              ) : null}
            </Tabs.Panel>
          </Tabs>
          </Paper>

        {activeTab === 'generate' && generateStep === 'items' ? (
        <Paper shadow="sm" p={{ base: 'md', md: 'xl' }} radius="xl" withBorder mt="lg">
          <Group justify="space-between" align="center" mb="sm">
            <div>
              <Group gap="xs" mb={4}>
                <Badge color="teal" variant="light">Paso 2</Badge>
                <Badge color={sourceMode === 'warehouse' ? 'blue' : 'orange'} variant="light">
                  {sourceMode === 'warehouse' ? 'Desde bodega' : 'Desde obra'}
                </Badge>
              </Group>
              <Title order={4}>Items del documento</Title>
              <Text size="sm" c="dimmed">
                Agrega equipos, cantidades y condiciones para construir el documento.
              </Text>
            </div>
            <Button variant="light" color="gray" onClick={() => setGenerateStep('info')}>
              Volver a info
            </Button>
          </Group>
          {renderGenerateError()}
          <Paper withBorder radius="lg" p="md" bg="teal.0" mb="md">
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
                <Text size="xs" fw={800} c="dimmed" tt="uppercase">Entrega</Text>
                <Text size="sm" fw={700}>
                  {docType === 'REMISSION'
                    ? deliveryMode === 'ON_SITE'
                      ? `En obra (${selectedDriver?.name ?? '-'})`
                      : `Bodega (${selectedDispatcher?.name ?? '-'})`
                    : 'Devolucion'}
                </Text>
              </div>
            </SimpleGrid>
          </Paper>
          <Text c="dimmed">Agregar los equipos y su origen.</Text>

          <Group mt="md" align="flex-end" wrap="wrap">
            {sourceMode === 'warehouse' && (
              isMobile ? (
                <NativeSelect
                  label={helpLabel('Origen', 'Dueño del inventario a despachar. Este filtro no cambia la bodega de ubicacion.')}
                  value={sourceOwnerWarehouseId ?? ''}
                  onChange={(event) => setSourceOwnerWarehouseId(event.currentTarget.value || null)}
                  data={[{ value: '', label: 'Seleccionar dueño' }, ...ownerWarehouseOptions]}
                  w="100%"
                />
              ) : (
                <Select
                  label={helpLabel('Origen', 'Dueño del inventario a despachar. Este filtro no cambia la bodega de ubicacion.')}
                  value={sourceOwnerWarehouseId}
                  onChange={(value) => setSourceOwnerWarehouseId(value)}
                  data={ownerWarehouseOptions}
                  searchable
                  clearable
                  placeholder="Seleccionar dueño"
                  w={320}
                />
              )
            )}
            {useManualWarehouseCapture ? null : (
              <Button onClick={() => void loadInventory()} loading={loadingInventory}>
                Cargar items
              </Button>
            )}
          </Group>

          {useManualWarehouseCapture ? (
            <Stack mt="md" gap="sm">
              <Group align="flex-end" wrap="wrap">
                <Autocomplete
                  label="Item/s"
                  placeholder={loadingPrincipalTags ? 'Cargando items...' : 'Selecciona o escribe el item'}
                  data={alternateTagCatalog.map((entry) => entry.label)}
                  value={freeTagInput}
                  onChange={(value) => {
                    setFreeTagInput(value);
                    setError(null);
                  }}
                  disabled={loadingPrincipalTags}
                  w={isMobile ? '100%' : 320}
                />
                {isAlternateOwnerMode && alternateTagMatch?.type === 'serial' ? (
                  <NumberInput
                    label="N° interno"
                    min={1}
                    value={freeInternalNumber}
                    onChange={(value) => setFreeInternalNumber(typeof value === 'number' ? value : '')}
                    w={isMobile ? '100%' : 140}
                  />
                ) : null}
                {alternateTagMatch?.type !== 'serial' ? (
                  <NumberInput
                    label="Cantidad"
                    min={1}
                    value={freeQtyInput}
                    onChange={(value) => setFreeQtyInput(typeof value === 'number' ? value : '')}
                    w={isMobile ? '100%' : 140}
                  />
                ) : null}
                <Button onClick={addFreeItem}>Agregar item</Button>
              </Group>
            </Stack>
          ) : null}

          <Divider my="md" />

          {useManualWarehouseCapture ? null : (
            <Text size="sm" c="dimmed">
              Pulsa "Cargar items" para abrir el selector de items.
            </Text>
          )}
          <Divider my="md" />

          <Title order={4}>Seleccionados</Title>
          {selectedItems.length === 0 ? (
            <Paper radius="lg" p="lg" bg="gray.0" mt="md">
              <Text fw={700}>No hay equipos agregados</Text>
              <Text size="sm" c="dimmed" mt={4}>
                Carga items desde el origen o agrega manualmente para continuar con la firma.
              </Text>
            </Paper>
          ) : !isTabletOrMobile ? (
            <Table striped highlightOnHover mt="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Desc.</Table.Th>
                  <Table.Th style={{ width: 120, textAlign: 'center' }}>Cantidad</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {selectedItems.map((item, index) => (
                  <Table.Tr key={`${item.type}-${item.skuId ?? item.assetId}-${index}`}>
                    <Table.Td>
                      <Text fw={600}>{item.name}</Text>
                      {item.serial && (
                        <Text size="xs" c="dimmed">
                          {item.serial}
                        </Text>
                      )}
                      {renderDamageFields(item, index)}
                    </Table.Td>
                    <Table.Td>
                      {item.type === 'bulk' || item.type === 'free' ? (
                        <NumberInput
                          min={1}
                          value={item.quantity ?? 1}
                          onChange={(value) =>
                            updateSelected(index, {
                              quantity: normalizeQuantityInput(value, item.quantity ?? 1)
                            })
                          }
                        />
                      ) : (
                        <Text>1</Text>
                      )}
                      {canResolveInline && item.type === 'free' ? (
                        <Select
                          mt="xs"
                          label="Resolver a SKU"
                          placeholder="Seleccionar SKU"
                          searchable
                          clearable
                          data={skuOptions.map((sku) => ({ value: sku.id, label: sku.name }))}
                          onChange={(value) => resolveFreeItemToSku(index, value)}
                        />
                      ) : null}
                      <Button size="xs" mt="xs" variant="subtle" color="red" onClick={() => removeSelected(index)}>
                        Quitar
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Stack mt="md" gap="sm">
              {selectedItems.map((item, index) => (
                <Paper
                  key={`${item.type}-${item.bulkKey ?? item.skuId ?? item.assetId}-${index}`}
                  withBorder
                  radius="md"
                  p="sm"
                >
                  <Stack gap="xs">
                    <div>
                      <Text fw={600}>{item.name}</Text>
                      {item.serial ? (
                        <Text size="xs" c="dimmed">
                          {item.serial}
                        </Text>
                      ) : null}
                    </div>
                    {item.type === 'bulk' || item.type === 'free' ? (
                      <NumberInput
                        label="Cantidad"
                        min={1}
                        value={item.quantity ?? 1}
                        onChange={(value) =>
                          updateSelected(index, {
                            quantity: normalizeQuantityInput(value, item.quantity ?? 1),
                          })
                        }
                      />
                    ) : (
                      <Text size="sm">Cantidad: 1</Text>
                    )}
                    {renderDamageFields(item, index)}
                    {canResolveInline && item.type === 'free' ? (
                      <Select
                        label="Resolver a SKU"
                        placeholder="Seleccionar SKU"
                        searchable
                        clearable
                        data={skuOptions.map((sku) => ({ value: sku.id, label: sku.name }))}
                        onChange={(value) => resolveFreeItemToSku(index, value)}
                      />
                    ) : null}
                    <Button size="xs" variant="subtle" color="red" onClick={() => removeSelected(index)}>
                      Quitar
                    </Button>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}

          <Group mt="md" justify="space-between" className="mobile-actions">
            <Button variant="light" color="gray" onClick={() => setGenerateStep('info')}>
              Volver a info
            </Button>
            <Button onClick={goToSignStep}>Siguiente: Firma</Button>
          </Group>
        </Paper>
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

          {isTabletOrMobile ? (
            <Stack gap="xs" mb="md">
              {selectedItems.map((item, index) => (
                <Paper
                  key={`sign-item-${item.type}-${item.skuId ?? item.assetId ?? item.name}-${index}`}
                  withBorder
                  radius="md"
                  p="sm"
                >
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <div style={{ minWidth: 0 }}>
                      <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                        {item.name}
                      </Text>
                      {docType === 'RETURN' && item.isDamaged ? (
                        <Text size="xs" c="red" style={{ overflowWrap: 'anywhere' }}>
                          Dañado: {item.damageDescription?.trim() || 'Sin descripcion'}
                        </Text>
                      ) : null}
                    </div>
                    <Text fw={800} ta="right" style={{ flex: '0 0 auto' }}>
                      {item.type === 'serial' ? 1 : item.quantity ?? 1}
                    </Text>
                  </Group>
                </Paper>
              ))}
              <Paper withBorder radius="md" p="sm" bg="gray.0">
                <Group justify="space-between" wrap="nowrap">
                  <Text fw={800}>Total</Text>
                  <Text fw={900}>{selectedItemsTotalQuantity}</Text>
                </Group>
              </Paper>
            </Stack>
          ) : (
            <Table striped highlightOnHover mb="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Item</Table.Th>
                  <Table.Th style={{ width: 110, textAlign: 'center' }}>Cantidad</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {selectedItems.map((item, index) => (
                  <Table.Tr key={`sign-item-${item.type}-${item.skuId ?? item.assetId ?? item.name}-${index}`}>
                    <Table.Td>
                      <Text>{item.name}</Text>
                      {docType === 'RETURN' && item.isDamaged ? (
                        <Text size="xs" c="red">
                          Dañado: {item.damageDescription?.trim() || 'Sin descripcion'}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'center' }}>
                      {item.type === 'serial' ? 1 : item.quantity ?? 1}
                    </Table.Td>
                  </Table.Tr>
                ))}
                <Table.Tr>
                  <Table.Td>
                    <Text fw={800}>Total</Text>
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'center' }}>
                    <Text fw={800}>{selectedItemsTotalQuantity}</Text>
                  </Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          )}

          <Stack gap="xs">
            <Text fw={600}>Firma de recibido</Text>
            <Group justify="space-between" align="center">
              <Text size="sm" c="dimmed">
                {receivedSignature ? 'Firma capturada' : 'Sin firma'}
              </Text>
              {editingRequestId ? (
                <Text size="xs" c="dimmed">
                  Firma bloqueada durante la edicion
                </Text>
              ) : (
                <Button
                  type="button"
                  variant="light"
                  onClick={() => {
                    setSignatureDraft(receivedSignature);
                    setSignatureModalOpen(true);
                  }}
                >
                  Firmar
                </Button>
              )}
            </Group>
            {receivedSignature ? (
              <img
                src={receivedSignature}
                alt="Firma de recibido"
                style={{
                  width: '100%',
                  maxWidth: 420,
                  height: 110,
                  objectFit: 'contain',
                  border: '1px solid var(--mantine-color-gray-4)',
                  borderRadius: 8,
                  background: '#fff',
                }}
              />
            ) : null}
          </Stack>

          <Paper withBorder radius="lg" p="md" mt="md">
            <Stack gap="sm">
              <Group justify="space-between" align="center" className="mobile-stack">
                <div>
                  <Text fw={700}>Evidencias fotograficas</Text>
                  <Text size="sm" c="dimmed">
                    Toma fotos desde la tablet o adjunta imagenes antes de enviar.
                  </Text>
                </div>
                <Group gap="xs">
                  <Button
                    type="button"
                    variant="light"
                    leftSection={<IconCamera size={16} />}
                    onClick={() => evidenceInputRef.current?.click()}
                  >
                    Tomar / adjuntar
                  </Button>
                  {evidencePhotos.length ? (
                    <Button type="button" variant="subtle" color="red" onClick={clearEvidencePhotos}>
                      Limpiar
                    </Button>
                  ) : null}
                </Group>
              </Group>
              <input
                ref={evidenceInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                capture="environment"
                multiple
                onChange={(event) => addEvidencePhotos(event.currentTarget.files)}
                style={{ display: 'none' }}
              />
              {evidencePhotos.length ? (
                <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
                  {evidencePhotos.map((photo) => (
                    <Paper key={photo.id} withBorder radius="md" p={6}>
                      <div style={{ position: 'relative' }}>
                        <img
                          src={photo.previewUrl}
                          alt="Vista previa de evidencia"
                          style={{
                            width: '100%',
                            aspectRatio: '4 / 3',
                            objectFit: 'cover',
                            borderRadius: 6,
                            display: 'block',
                          }}
                        />
                        <Button
                          type="button"
                          size="xs"
                          color="red"
                          variant="filled"
                          leftSection={<IconTrash size={12} />}
                          onClick={() => removeEvidencePhoto(photo.id)}
                          style={{ position: 'absolute', top: 6, right: 6 }}
                        >
                          Quitar
                        </Button>
                      </div>
                      <Text size="xs" c="dimmed" mt={4} truncate>
                        {photo.file.name}
                      </Text>
                    </Paper>
                  ))}
                </SimpleGrid>
              ) : (
                <Text size="sm" c="dimmed">
                  Sin fotos adjuntas.
                </Text>
              )}
            </Stack>
          </Paper>

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

      <Modal
        opened={signatureModalOpen}
        onClose={() => setSignatureModalOpen(false)}
        title="Firma de recibido"
        centered
      >
        <Stack gap="md">
          <canvas
            ref={signatureCanvasRef}
            onPointerDown={beginSignature}
            onPointerMove={moveSignature}
            onPointerUp={endSignature}
            onPointerCancel={endSignature}
            onPointerLeave={endSignature}
            style={{
              width: '100%',
              height: 180,
              border: '1px solid var(--mantine-color-gray-4)',
              borderRadius: 8,
              background: '#fff',
              touchAction: 'none',
            }}
          />
          <Group justify="space-between" className="mobile-actions">
            <Button variant="default" onClick={clearSignature}>
              Limpiar
            </Button>
            <Group>
              <Button variant="default" onClick={() => setSignatureModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  setReceivedSignature(signatureDraft ?? null);
                  setSignatureModalOpen(false);
                }}
              >
                Confirmar y guardar
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={adjustWarningModalOpen}
        onClose={() => {
          setAdjustWarningModalOpen(false);
          setAdjustWarningOwnerWarehouseId(null);
        }}
        title="Ajuste requerido"
        centered
      >
        <Stack gap="md">
          <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
            {adjustWarningMessage ??
              'Primero ajusta el stock de bodega antes de hacer movimientos.'}
          </Text>
          <Group justify="flex-end">
            <Button
              onClick={() => {
                setAdjustWarningModalOpen(false);
                const params = new URLSearchParams();
                if (adjustWarningOwnerWarehouseId) {
                  params.set('ownerWarehouseId', adjustWarningOwnerWarehouseId);
                  params.set('warehouseId', adjustWarningOwnerWarehouseId);
                }
                router.push(
                  `/inventory/bulk-adjustments${params.toString() ? `?${params.toString()}` : ''}`,
                );
                setAdjustWarningOwnerWarehouseId(null);
              }}
            >
              Entendido
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={resolveModalOpen}
        onClose={closeResolveModal}
        title="Resolver tags antes de aprobar"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Masivo resuelve por SKU. Serializado resuelve por equipo especifico (interno #).
          </Text>
          {(resolveDocument?.items ?? [])
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => isResolvePendingItem(item))
            .map(({ item, index }) => (
              <Paper key={`${item.requestedTag}-${index}`} withBorder p="sm" radius="md">
                <Stack gap={6}>
                  <Text fw={600}>{item.requestedTag ?? item.sku?.name ?? `Item ${index + 1}`}</Text>
                  <Text size="xs" c="dimmed">
                    Cantidad: {Number(item.quantity ?? 1) || 1}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Bodega: {warehouses.find((warehouse) => warehouse.id === item.condition)?.name ?? '-'}
                  </Text>
                  <Select
                    label="Equipo"
                    placeholder="Seleccionar SKU"
                    searchable
                    data={skuOptions.map((sku) => ({ value: sku.id, label: sku.name }))}
                    value={resolveSkuByIndex[index] ?? null}
                    onChange={(value) => {
                      setResolveSkuByIndex((prev) => ({
                        ...prev,
                        [index]: value ?? '',
                      }));
                      setResolveAssetByIndex((prev) => ({
                        ...prev,
                        [index]: '',
                      }));
                    }}
                  />
                  {(() => {
                    const selectedSkuId = resolveSkuByIndex[index];
                    const selectedSku = skuOptions.find((entry) => entry.id === selectedSkuId);
                    if (selectedSku?.controlType !== 'SERIAL') return null;
                    const ownerWarehouseId = item.condition?.trim() ?? '';
                    const inventory = resolveInventoryByOwner[ownerWarehouseId]?.serial ?? [];
                    const expectedInternal = parseInternalNumberFromTag(item.requestedTag);
                    const serialOptions = inventory
                      .filter(
                        (serial) =>
                          serial.skuId === selectedSku.id &&
                          (expectedInternal == null || serial.internalNumber === expectedInternal),
                      )
                      .map((serial) => ({
                        value: serial.assetId,
                        label: getSerialDisplayName(serial),
                      }));
                    const hasExpected = expectedInternal == null
                      ? false
                      : inventory.some(
                          (serial) =>
                            serial.skuId === selectedSku.id &&
                            serial.internalNumber === expectedInternal,
                        );
                    return (
                      <Stack gap={6}>
                        <Select
                          label="Equipo serial"
                          placeholder="Seleccionar equipo"
                          searchable
                          data={serialOptions}
                          value={resolveAssetByIndex[index] ?? null}
                          nothingFoundMessage="No hay equipo para este SKU en esa bodega"
                          onChange={(value) =>
                            setResolveAssetByIndex((prev) => ({
                              ...prev,
                              [index]: value ?? '',
                            }))
                          }
                        />
                        {expectedInternal != null && !hasExpected ? (
                          <Text size="xs" c="orange.7">
                            El tag solicita #{expectedInternal}, pero no existe en esa bodega.
                          </Text>
                        ) : null}
                        {!serialOptions.length || (expectedInternal != null && !hasExpected) ? (
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() => openCreateSerialForRow(index)}
                          >
                            Crear equipo faltante
                          </Button>
                        ) : null}
                      </Stack>
                    );
                  })()}
                </Stack>
              </Paper>
            ))}

          <Group justify="flex-end" className="mobile-actions">
            <Button
              variant="default"
              onClick={closeResolveModal}
              disabled={resolvingApprove}
            >
              Cancelar
            </Button>
            <Button onClick={resolveAndApprove} loading={resolvingApprove}>
              Resolver y aprobar
            </Button>
          </Group>
        </Stack>
      </Modal>

      <InventoryItemPickerModal
        opened={itemsModalOpen && !useManualWarehouseCapture}
        onClose={() => setItemsModalOpen(false)}
        title="Seleccionar items"
        bulkItems={availableBulkItems}
        serialItems={availableSerialItems}
        selectedBulkKeys={selectedBulkKeys}
        selectedSerialIds={selectedSerialIds}
        onAddBulk={addBulkItem}
        onAddSerial={addSerialItem}
        skuOptions={skuOptions}
        itemsAddedNotice={itemsAddedNotice}
        isDriverRole={isDriverRole}
        sourceMode={sourceMode}
        emptyStateText={
          useManualWarehouseCapture ? 'Use description capture in the main section.' : null
        }
        onItemAddedNotice={setItemsAddedNotice}
      />

      <Modal
        opened={!!documentsRequest}
        onClose={() => setDocumentsRequest(null)}
        title={documentsRequest ? `Documentos ${documentsRequest.consecutive ?? ''}` : 'Documentos'}
        centered
        size="xl"
      >
        {documentsRequest ? (
          <FileAttachmentsPanel
            entityType="DOCUMENT"
            entityId={documentsRequest.id}
            title="Documentos y evidencias de la solicitud"
          />
        ) : null}
      </Modal>

      <Modal
        opened={createSerialOpen}
        onClose={() => {
          if (createSerialSaving) return;
          setCreateSerialOpen(false);
          setCreateSerialIndex(null);
          setCreateSerialError(null);
          setCreateSerialBrand('');
          setCreateSerialModel('');
          setCreateSerialYear('');
          setCreateSerialFuel(null);
        }}
        title="Crear equipo serializado faltante"
        centered
      >
        <Stack gap="sm">
          {createSerialError ? <Text c="red">{createSerialError}</Text> : null}
          <TextInput
            label="Serial / motor"
            value={createSerialSerialOrEngine}
            onChange={(event) => setCreateSerialSerialOrEngine(event.currentTarget.value)}
            required
          />
          <NumberInput
            label="Internal number"
            value={createSerialInternalNumber}
            onChange={(value) =>
              setCreateSerialInternalNumber(typeof value === 'number' ? value : '')
            }
            min={1}
            required
          />
          <Group grow>
            <TextInput
              label="Marca (opcional)"
              value={createSerialBrand}
              onChange={(event) => setCreateSerialBrand(event.currentTarget.value)}
            />
            <TextInput
              label="Modelo (opcional)"
              value={createSerialModel}
              onChange={(event) => setCreateSerialModel(event.currentTarget.value)}
            />
          </Group>
          <Group grow>
            <NumberInput
              label="Year (optional)"
              value={createSerialYear}
              onChange={(value) => setCreateSerialYear(typeof value === 'number' ? value : '')}
              min={1900}
              max={2100}
            />
            <Select
              label="Combustible (opcional)"
              data={FUEL_OPTIONS}
              value={createSerialFuel}
              onChange={(value) => setCreateSerialFuel(value)}
              clearable
            />
          </Group>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                if (createSerialSaving) return;
                setCreateSerialOpen(false);
                setCreateSerialIndex(null);
                setCreateSerialError(null);
                setCreateSerialBrand('');
                setCreateSerialModel('');
                setCreateSerialYear('');
                setCreateSerialFuel(null);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={createMissingSerialFromResolve} loading={createSerialSaving}>
              Crear y usar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </main>
  );
}

export default function SolicitudesIpadPage() {
  return <TransportRequestsWorkspace mode="requests" />;
}
