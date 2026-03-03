'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Autocomplete,
  Badge,
  Button,
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
  Tooltip
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';

type InventoryBulk = {
  skuId: string;
  skuName: string | null;
  ownerWarehouseId: string | null;
  ownerWarehouseName?: string | null;
  quantity: number;
};

type InventorySerial = {
  assetId: string;
  serialOrEngine: string | null;
  description: string | null;
  skuName?: string | null;
  brand?: string | null;
  model?: string | null;
  internalNumber?: number | null;
  quantity: number;
  skuId?: string | null;
  ownerWarehouseId: string | null;
};

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
  user?: {
    id: string;
    email: string;
    role: string;
    active: boolean;
  } | null;
};
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
  ownerWarehouseId?: string | null;
};

type PrincipalCatalogEntry = {
  key: string;
  label: string;
  type: 'bulk' | 'serial';
  skuId?: string;
  assetId?: string;
  ownerWarehouseId: string;
  quantity?: number;
  serial?: string | null;
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
    skuId?: string | null;
    assetId?: string | null;
    quantity?: string | number | null;
    condition?: string | null;
    requestedTag?: string | null;
    sku?: { id: string; name: string } | null;
    asset?: {
      id: string;
      serialOrEngine?: string | null;
      description?: string | null;
      sku?: { id: string; name: string } | null;
    } | null;
  }>;
};

type SkuOption = { id: string; name: string };
const WAREHOUSES_CACHE_KEY = 'solicitudes.warehouses.v1';
const PRINCIPAL_TAGS_CACHE_KEY = 'solicitudes.principalTags.v1';

const buildBulkKey = (item: { skuId: string; ownerWarehouseId: string | null }) =>
  `${item.skuId}::${item.ownerWarehouseId ?? 'none'}`;

const buildSerialDisplayName = (item: InventorySerial) => {
  const parts = [item.skuName, item.brand, item.model]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const base = parts.length ? parts.join(' ') : item.description ?? item.serialOrEngine ?? item.assetId;
  const internal = item.internalNumber != null ? ` #${item.internalNumber}` : '';
  return `${base}${internal}`.trim();
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

const OWNER_BADGE_COLORS = ['blue', 'teal', 'grape', 'orange', 'pink', 'cyan', 'indigo', 'lime'];

function ownerColorById(ownerWarehouseId: string | null | undefined) {
  if (!ownerWarehouseId) return 'gray';
  let hash = 0;
  for (let index = 0; index < ownerWarehouseId.length; index += 1) {
    hash = (hash * 31 + ownerWarehouseId.charCodeAt(index)) >>> 0;
  }
  return OWNER_BADGE_COLORS[hash % OWNER_BADGE_COLORS.length];
}

function getCurrentUserRole(): string | null {
  const token = getToken();
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const decoded = typeof window !== 'undefined' ? window.atob(padded) : '';
    const payload = JSON.parse(decoded) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

function getCurrentUserSession() {
  const token = getToken();
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const decoded = typeof window !== 'undefined' ? window.atob(padded) : '';
    const payload = JSON.parse(decoded) as { sub?: string; role?: string; email?: string };
    return payload;
  } catch {
    return null;
  }
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
    cutOffDate: map.get('fecha corte') ?? '',
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

export default function SolicitudesIpadPage() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string | null>('list');
  const [generateStep, setGenerateStep] = useState<'info' | 'items' | 'sign'>('info');
  const [docType, setDocType] = useState<'REMISSION' | 'RETURN'>('REMISSION');
  const [consecutive, setConsecutive] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [docDate, setDocDate] = useState('');
  const [cutOffDate, setCutOffDate] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'WAREHOUSE' | 'ON_SITE'>('WAREHOUSE');
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
  const [bulkSelect, setBulkSelect] = useState<string | null>(null);
  const [serialSelect, setSerialSelect] = useState<string | null>(null);
  const [freeTagInput, setFreeTagInput] = useState('');
  const [freeQtyInput, setFreeQtyInput] = useState<number | ''>('');
  const [principalTags, setPrincipalTags] = useState<string[]>([]);
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
  const [itemsAddedNotice, setItemsAddedNotice] = useState<string | null>(null);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [requests, setRequests] = useState<RequestDocument[]>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [skuOptions, setSkuOptions] = useState<SkuOption[]>([]);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolveDocument, setResolveDocument] = useState<RequestDocumentDetail | null>(null);
  const [resolveSkuByIndex, setResolveSkuByIndex] = useState<Record<number, string>>({});
  const [resolvingApprove, setResolvingApprove] = useState(false);
  const [adjustWarningModalOpen, setAdjustWarningModalOpen] = useState(false);
  const [adjustWarningMessage, setAdjustWarningMessage] = useState<string | null>(null);
  const [adjustWarningOwnerWarehouseId, setAdjustWarningOwnerWarehouseId] = useState<string | null>(null);
  const [receivedSignature, setReceivedSignature] = useState<string | null>(null);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [signatureDraft, setSignatureDraft] = useState<string | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureDrawingRef = useRef(false);
  const userSession = useMemo(() => getCurrentUserSession(), []);
  const userRole = useMemo(() => getCurrentUserRole(), []);
  const isDriverRole = userRole === 'DRIVER';
  const currentUserId = userSession?.sub ?? null;
  const canDecide = userRole === 'ADMIN' || userRole === 'OFFICE';
  const canResolveInline = canDecide && Boolean(editingRequestId);
  const sourceMode: 'warehouse' | 'on-site' = docType === 'REMISSION' ? 'warehouse' : 'on-site';
  const sourceOwnerWarehouse = warehouses.find((warehouse) => warehouse.id === sourceOwnerWarehouseId) ?? null;
  const isAlternateOwnerMode = sourceMode === 'warehouse' && sourceOwnerWarehouse?.type === 'ALLY';
  const isDriverWarehouseCaptureMode = isDriverRole && sourceMode === 'warehouse';
  const useManualWarehouseCapture = sourceMode === 'warehouse' && (isAlternateOwnerMode || isDriverWarehouseCaptureMode);
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
    label: employee.name,
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
  const availableBulkItems = useMemo(
    () => bulkItems.filter((item) => !selectedBulkKeys.has(buildBulkKey(item))),
    [bulkItems, selectedBulkKeys],
  );
  const availableSerialItems = useMemo(
    () => serialItems.filter((item) => !selectedSerialIds.has(item.assetId)),
    [serialItems, selectedSerialIds],
  );
  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null;
  const selectedWorksite = worksites.find((worksite) => worksite.id === customerWorksiteId) ?? null;
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null;
  const selectedDriver = employees.find((employee) => employee.id === driverId) ?? null;
  const selectedDispatcher = employees.find((employee) => employee.id === dispatcherId) ?? null;
  const freeTagCatalogMatch = useMemo(() => {
    const typed = freeTagInput.trim().toUpperCase();
    if (!typed) return null;
    return (
      principalCatalog.find((entry) => entry.label.trim().toUpperCase() === typed) ??
      null
    );
  }, [freeTagInput, principalCatalog]);
  const sourceOwnerWarehouseName =
    warehouses.find((warehouse) => warehouse.id === sourceOwnerWarehouseId)?.name ?? '-';
  const sourceWorksiteName =
    worksites.find((worksite) => worksite.id === sourceWorksiteId)?.alias ??
    worksites.find((worksite) => worksite.id === sourceWorksiteId)?.worksite.name ??
    '-';

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

  const handleApprovalError = (err: unknown) => {
    if (!(err instanceof ApiError)) {
      if (err instanceof Error) {
        setRequestsError(err.message);
      } else {
        setRequestsError('Error al procesar solicitud');
      }
      return;
    }

    const messages = normalizeApiErrorMessages(err);
    const hasStockError = messages.some((message) => /insufficient stock/i.test(message));
    if (hasStockError && canDecide) {
      const messageWithOwner = messages.find((message) => /ownerWarehouse/i.test(message)) ?? messages[0] ?? '';
      const ownerId = extractOwnerWarehouseIdFromMessage(messageWithOwner);
      const ownerName = ownerId
        ? warehouses.find((warehouse) => warehouse.id.toLowerCase() === ownerId.toLowerCase())?.name
        : null;
      const warehouseLabel = ownerName ?? 'la bodega alterna';
      setAdjustWarningOwnerWarehouseId(ownerId ?? null);
      setAdjustWarningMessage(
        `Primero debes hacer ajuste de "${warehouseLabel}" bodega para hacer movimientos.`,
      );
      setAdjustWarningModalOpen(true);
      setRequestsError(null);
      return;
    }

    setRequestsError(`${err.status}: ${err.message}`);
  };

  useEffect(() => {
    const cachedTags = readJsonCache<{ tags?: string[] }>(PRINCIPAL_TAGS_CACHE_KEY);
    if (cachedTags?.tags?.length) {
      setPrincipalTags(cachedTags.tags);
    }
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
            skuId: item.skuId,
            ownerWarehouseId: item.ownerWarehouseId ?? principalWarehouse.id,
            quantity: item.quantity,
          });
          uniqueLabels.set(label.toUpperCase(), label);
        });
        data.serial.forEach((item) => {
          const label = buildSerialDisplayName(item);
          if (!label) return;
          const key = `serial:${item.assetId}`;
          catalogEntries.push({
            key,
            label,
            type: 'serial',
            assetId: item.assetId,
            ownerWarehouseId: item.ownerWarehouseId ?? principalWarehouse.id,
            serial: item.serialOrEngine,
          });
          uniqueLabels.set(label.toUpperCase(), label);
        });
        const sortedTags = [...uniqueLabels.values()].sort((a, b) => a.localeCompare(b));
        setPrincipalTags(sortedTags);
        setPrincipalCatalog(catalogEntries);
        writeJsonCache(PRINCIPAL_TAGS_CACHE_KEY, {
          tags: sortedTags,
          principalWarehouseId: principalWarehouse.id,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        if (!mounted) return;
        const cachedTags = readJsonCache<{ tags?: string[] }>(PRINCIPAL_TAGS_CACHE_KEY);
        if (cachedTags?.tags?.length) {
          setPrincipalTags(cachedTags.tags);
        }
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

  const loadInventory = async () => {
    setLoadingInventory(true);
    setError(null);
    try {
      if (sourceMode === 'warehouse') {
        if (!sourceOwnerWarehouseId) throw new Error('Selecciona la bodega dueña para filtrar items.');
        const selectedOwner = warehouses.find((warehouse) => warehouse.id === sourceOwnerWarehouseId);
        if (selectedOwner?.type === 'ALLY') {
          throw new Error('Para bodega alterna usa captura por tag libre.');
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
        if (!sourceWorksiteId) throw new Error('Selecciona una obra origen');
        const data = await api<{ bulk: InventoryBulk[]; serial: InventorySerial[] }>(
          `/inventory/on-site/${sourceWorksiteId}`,
          { method: 'GET' }
        );
        setBulkItems(data.bulk);
        setSerialItems(data.serial);
      }
      if (isMobile) {
        setItemsModalOpen(true);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error cargando inventario');
      }
    } finally {
      setLoadingInventory(false);
    }
  };

  useEffect(() => {
    setBulkItems([]);
    setSerialItems([]);
    setBulkSelect(null);
    setSerialSelect(null);
    setFreeTagInput('');
    setFreeQtyInput('');
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
      if (!canDecide) return;
      try {
        const data = await api<Array<{ id: string; name: string }>>('/skus', { method: 'GET' });
        if (!mounted) return;
        setSkuOptions(data.map((item) => ({ id: item.id, name: item.name })));
      } catch {
        if (!mounted) return;
      }
    };
    loadSkuOptions();
    return () => {
      mounted = false;
    };
  }, [canDecide]);

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
        .filter(
          ({ item }) =>
            !item.skuId &&
            !item.assetId &&
            Boolean(item.requestedTag?.trim()),
        );

      if (unresolved.length > 0) {
        const initialMap: Record<number, string> = {};
        unresolved.forEach(({ index }) => {
          initialMap[index] = '';
        });
        setResolveDocument(doc);
        setResolveSkuByIndex(initialMap);
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
      .filter(
        ({ item }) =>
          !item.skuId &&
          !item.assetId &&
          Boolean(item.requestedTag?.trim()),
      );

    const missing = unresolved.filter(({ index }) => !resolveSkuByIndex[index]);
    if (missing.length > 0) {
      setRequestsError('Resuelve todos los tags pendientes antes de aprobar.');
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
          };
        }
        if (item.skuId) {
          return {
            skuId: item.skuId,
            quantity: Number(item.quantity ?? 1) || 1,
            ownerWarehouseId,
            requestedTag: item.requestedTag ?? undefined,
          };
        }
        const resolvedSkuId = resolveSkuByIndex[index];
        return {
          skuId: resolvedSkuId,
          quantity: Number(item.quantity ?? 1) || 1,
          ownerWarehouseId,
          requestedTag: item.requestedTag ?? undefined,
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
      setResolveModalOpen(false);
      setResolveDocument(null);
      setResolveSkuByIndex({});
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
          name: buildSerialDisplayName(item),
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
    const isPrincipalOwner = sourceOwnerWarehouseId === principalWarehouse?.id;
    const matchedCatalogEntry =
      principalCatalog.find((entry) => entry.label.trim().toUpperCase() === tag) ?? null;

    if (isPrincipalOwner && principalCatalog.length > 0) {
      if (!matchedCatalogEntry) {
        setError('Selecciona un item válido del catálogo de bodega principal');
        return;
      }
      if (matchedCatalogEntry.type === 'serial' && matchedCatalogEntry.assetId) {
        setError(null);
        setSelectedItems((prev) => {
          const exists = prev.some((item) => item.type === 'serial' && item.assetId === matchedCatalogEntry.assetId);
          if (exists) return prev;
          return [
            ...prev,
            {
              type: 'serial',
              assetId: matchedCatalogEntry.assetId,
              name: matchedCatalogEntry.label,
              serial: matchedCatalogEntry.serial ?? null,
              ownerWarehouseId: sourceOwnerWarehouseId,
            },
          ];
        });
        setFreeTagInput('');
        setFreeQtyInput('');
        setItemsAddedNotice(`${matchedCatalogEntry.label} agregado a la lista.`);
        return;
      }
      if (!qty || qty <= 0) {
        setError('Cantidad inválida para el item');
        return;
      }
      if (matchedCatalogEntry.type === 'bulk' && matchedCatalogEntry.skuId) {
        setError(null);
        setSelectedItems((prev) => {
          const bulkKey = buildBulkKey({
            skuId: matchedCatalogEntry.skuId as string,
            ownerWarehouseId: sourceOwnerWarehouseId,
          });
          const exists = prev.some((item) => item.type === 'bulk' && item.bulkKey === bulkKey);
          if (exists) return prev;
          return [
            ...prev,
            {
              type: 'bulk',
              bulkKey,
              skuId: matchedCatalogEntry.skuId,
              name: matchedCatalogEntry.label,
              quantity: qty,
              ownerWarehouseId: sourceOwnerWarehouseId,
            },
          ];
        });
        setFreeTagInput('');
        setFreeQtyInput('');
        setItemsAddedNotice(`${matchedCatalogEntry.label} agregado a la lista.`);
        return;
      }
    }

    if (selectedOwnerType === 'ALLY') {
      if (!qty || qty <= 0) {
        setError('Cantidad inválida para el item');
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
      setItemsAddedNotice(`${tag} agregado a la lista.`);
      return;
    }

    if (!qty || qty <= 0) {
      setError('Cantidad inválida para el item');
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
    setItemsAddedNotice(`${tag} agregado a la lista.`);
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
    setSubmitResult(null);
    setConsecutive('');
    setCustomerId(null);
    setDocDate('');
    setCutOffDate('');
    setDeliveryMode('WAREHOUSE');
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
    setBulkSelect(null);
    setSerialSelect(null);
    setFreeTagInput('');
    setFreeQtyInput('');
    setGenerateStep('info');
    setReceivedSignature(null);
  };

  const editRequest = async (documentId: string) => {
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
      setCutOffDate(parsed.cutOffDate ?? '');
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
      setBulkSelect(null);
      setSerialSelect(null);
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
          };
        }),
      );
      const savedSignature = doc.files?.find((file) => file.fileType === 'SIGNATURE_RECEIVED')?.storageKey ?? null;
      setReceivedSignature(savedSignature);
      setActiveTab('generate');
      setGenerateStep('info');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error cargando solicitud para editar');
      }
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitResult(null);
    setError(null);
    try {
      if (!docDate || !customerId) {
        throw new Error('Completa los campos obligatorios.');
      }
      if (!selectedItems.length) {
        throw new Error('Selecciona al menos un item.');
      }
      if (!customerWorksiteId) {
        throw new Error('Selecciona la obra (worksite).');
      }
      if (!receivedSignature) {
        throw new Error('Captura la firma del cliente antes de enviar.');
      }
      const effectiveWarehouseId = warehouseId ?? principalWarehouse?.id ?? null;
      if (docType === 'RETURN' && !effectiveWarehouseId) {
        throw new Error('Selecciona la bodega para la devolución.');
      }
      if (docType === 'REMISSION' && deliveryMode === 'WAREHOUSE' && !effectiveWarehouseId) {
        throw new Error('Selecciona la bodega de despacho.');
      }
      if (docType === 'REMISSION' && deliveryMode === 'ON_SITE' && isDriverRole && !driverId) {
        throw new Error('Tu usuario no está vinculado a un empleado conductor.');
      }

      const documentPayload = {
        type: docType,
        number: consecutive ? withDocPrefix(consecutive, docType) : undefined,
        warehouseId: effectiveWarehouseId ?? undefined,
        customerWorksiteId: customerWorksiteId || undefined,
        receivedSignature: receivedSignature ?? undefined,
        notes: [
          `Fecha doc: ${docDate}`,
          docType === 'RETURN' && cutOffDate ? `Fecha corte: ${cutOffDate}` : null,
          docType === 'REMISSION' ? `Entrega: ${deliveryMode}` : null,
          deliveryMode === 'ON_SITE' && vehicleId ? `Vehículo: ${vehicleId}` : null,
          deliveryMode === 'ON_SITE' && driverId ? `Conductor: ${driverId}` : null,
          deliveryMode === 'WAREHOUSE' && dispatcherId ? `Despachador: ${dispatcherId}` : null
        ].filter(Boolean).join(' | ')
      } as const;

      const movementItems = selectedItems.map((item) => {
        if (!item.ownerWarehouseId) {
          throw new Error(`Falta dueño/a para item ${item.name}`);
        }
        if (item.type === 'free') {
          return {
            requestedTag: item.requestedTag ?? item.name,
            quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
            ownerWarehouseId: item.ownerWarehouseId,
          };
        }
        return item.type === 'bulk'
          ? {
              skuId: item.skuId,
              quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
              ownerWarehouseId: item.ownerWarehouseId
            }
          : {
              assetId: item.assetId,
              ownerWarehouseId: item.ownerWarehouseId
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
      setSubmitResult(
        editingRequestId
          ? `Solicitud actualizada (${created.id}).`
          : `Solicitud enviada en borrador (${created.id}).`,
      );
      resetGenerateForm();
      setItemsModalOpen(false);
      setWorksites([]);
      setActiveTab('list');
      await loadRequests();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al enviar solicitud.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const goToItemsStep = () => {
    setError(null);
    if (!docDate || !customerId) {
      setError('Completa los campos obligatorios de información.');
      return;
    }
    if (!customerWorksiteId) {
      setError('Selecciona la obra (worksite).');
      return;
    }
    if (docType === 'REMISSION' && deliveryMode === 'ON_SITE' && isDriverRole && !driverId) {
      setError('Tu usuario no está vinculado a un empleado conductor.');
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

  return (
    <main>
      <Container size="lg" py="xl">
        <Paper shadow="sm" p="xl" radius="md" withBorder>
          <Title order={2}>Solicitudes de documentos</Title>
          <Tabs value={activeTab} onChange={setActiveTab} mt="md">
            <Tabs.List grow={isMobile}>
              <Tabs.Tab value="list">{isMobile ? 'Solicitudes' : 'Solicitudes documentos'}</Tabs.Tab>
              <Tabs.Tab value="generate">{isMobile ? 'Generar' : 'Generar documento'}</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="list" pt="md">
              <Group justify="space-between" mb="sm">
                <Text fw={600}>Solicitudes en borrador</Text>
                <Button variant="light" onClick={loadRequests} loading={requestsLoading}>
                  Refrescar
                </Button>
              </Group>
              {requestsError ? (
                <Text c="red" mb="sm">
                  {requestsError}
                </Text>
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
                        <Text size="sm">
                          <strong>Tipo:</strong> {formatDocType(row.type)}
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
                        {canDecide ? (
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
                          </Group>
                        ) : null}
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
                        <Table.Td>{formatDocType(row.type)}</Table.Td>
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
                            {canDecide ? (
                              <>
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
              <Group justify="space-between" mb="sm">
                <Text fw={600}>
                  {editingRequestId ? `Editando solicitud ${editingRequestId.slice(0, 8)}` : 'Nueva solicitud'}
                </Text>
                {editingRequestId ? (
                  <Button variant="light" color="gray" onClick={resetGenerateForm}>
                    Cancelar edición
                  </Button>
                ) : null}
              </Group>
              <Tabs value={generateStep} onChange={handleGenerateStepChange} mb="md">
                <Tabs.List grow={isMobile}>
                  <Tabs.Tab value="info">1. Información</Tabs.Tab>
                  <Tabs.Tab value="items">2. Items</Tabs.Tab>
                  <Tabs.Tab value="sign">3. Firma y envío</Tabs.Tab>
                </Tabs.List>
              </Tabs>
              {generateStep === 'info' ? (
                <>
              <Radio.Group
                mt="md"
                value={docType}
                onChange={(value) => setDocType(value as 'REMISSION' | 'RETURN')}
                label="Tipo"
              >
                <Group mt="xs">
                  <Radio value="REMISSION" label="Remisión" />
                  <Radio value="RETURN" label="Devolución" />
                </Group>
              </Radio.Group>

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mt="md">
            <TextInput
              label={helpLabel('Consecutivo (opcional)', 'Si lo dejas vacío, oficina podrá asignarlo al confirmar.')}
              withAsterisk={false}
              value={consecutive}
              onChange={(event) => setConsecutive(event.target.value)}
            />
            {isMobile ? (
              <NativeSelect
                label="Razón social"
                value={customerId ?? ''}
                onChange={(event) => {
                  setCustomerId(event.currentTarget.value || null);
                  setCustomerWorksiteId('');
                }}
                data={[
                  { value: '', label: 'Selecciona cliente' },
                  ...customers.map((customer) => ({
                    value: customer.id,
                    label: customer.name,
                  })),
                ]}
                required
              />
            ) : (
              <Select
                label="Razón social"
                value={customerId}
                onChange={(value) => {
                  setCustomerId(value);
                  setCustomerWorksiteId('');
                }}
                data={customers.map((customer) => ({
                  value: customer.id,
                  label: customer.name
                }))}
                searchable
                clearable
                required
                placeholder="Selecciona cliente"
              />
            )}
            <TextInput
              label={helpLabel('Fecha', 'Fecha del documento de remisión o devolución.', true)}
              withAsterisk={false}
              type="date"
              value={docDate}
              onChange={(event) => setDocDate(event.target.value)}
              required
            />
            {docType === 'RETURN' && (
              <TextInput
                label="Fecha de corte (opcional)"
                type="date"
                value={cutOffDate}
                onChange={(event) => setCutOffDate(event.target.value)}
              />
            )}
              </SimpleGrid>

              {docType === 'REMISSION' && (
            <Radio.Group
              mt="md"
              value={deliveryMode}
              onChange={(value) => setDeliveryMode(value as 'WAREHOUSE' | 'ON_SITE')}
              label="Entrega"
            >
              <Group mt="xs">
                <Radio value="WAREHOUSE" label="Despacho en bodega" />
                <Radio value="ON_SITE" label="Entrega on-site" />
              </Group>
            </Radio.Group>
              )}

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mt="md">
            {isMobile ? (
              <NativeSelect
                label={helpLabel('Obra', 'Obra destino del movimiento.')}
                value={customerWorksiteId}
                onChange={(event) => setCustomerWorksiteId(event.currentTarget.value)}
                data={[
                  { value: '', label: customerId ? 'Selecciona obra' : 'Selecciona cliente primero' },
                  ...worksiteOptions,
                ]}
                disabled={!customerId || worksitesLoading}
              />
            ) : (
              <Select
                label={helpLabel('Obra', 'Obra destino del movimiento.')}
                value={customerWorksiteId}
                onChange={(value) => setCustomerWorksiteId(value ?? '')}
                data={worksiteOptions}
                searchable
                clearable
                placeholder={customerId ? 'Selecciona obra' : 'Selecciona cliente primero'}
                disabled={!customerId || worksitesLoading}
              />
            )}
            {docType === 'REMISSION' && deliveryMode === 'ON_SITE' && (
              isMobile ? (
                <NativeSelect
                  label={helpLabel('Vehículo', 'Vehículo que transporta la remisión on-site.')}
                  value={vehicleId ?? ''}
                  onChange={(event) => setVehicleId(event.currentTarget.value || null)}
                  data={[{ value: '', label: 'Selecciona vehículo' }, ...vehicleOptions]}
                />
              ) : (
                <Select
                  label={helpLabel('Vehículo', 'Vehículo que transporta la remisión on-site.')}
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
                  label={helpLabel('Conductor', 'Persona responsable del transporte de la remisión.')}
                  value={driverId ?? ''}
                  onChange={(event) => setDriverId(event.currentTarget.value || null)}
                  data={[{ value: '', label: 'Selecciona conductor' }, ...employeeOptions]}
                  disabled={isDriverRole}
                />
              ) : (
                <Select
                  label={helpLabel('Conductor', 'Persona responsable del transporte de la remisión.')}
                  value={driverId}
                  onChange={(value) => setDriverId(value)}
                  data={employeeOptions}
                  searchable
                  clearable
                  disabled={isDriverRole}
                />
              )
            )}
            {docType === 'REMISSION' && deliveryMode === 'WAREHOUSE' && (
              isMobile ? (
                <NativeSelect
                  label={helpLabel('Despachador', 'Empleado que entrega el material desde bodega.')}
                  value={dispatcherId ?? ''}
                  onChange={(event) => setDispatcherId(event.currentTarget.value || null)}
                  data={[{ value: '', label: 'Selecciona despachador' }, ...employeeOptions]}
                  disabled={isDriverRole}
                />
              ) : (
                <Select
                  label={helpLabel('Despachador', 'Empleado que entrega el material desde bodega.')}
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
              <Group mt="md" justify="flex-end" className="mobile-actions">
                <Button onClick={goToItemsStep}>Siguiente: Items</Button>
              </Group>
                </>
              ) : null}
            </Tabs.Panel>
          </Tabs>
        </Paper>

        {activeTab === 'generate' && generateStep === 'items' ? (
        <Paper shadow="sm" p="xl" radius="md" withBorder mt="lg">
          <Group justify="space-between" align="center" mb="sm">
            <Title order={4}>Items del documento</Title>
            <Button variant="light" color="gray" onClick={() => setGenerateStep('info')}>
              Volver a info
            </Button>
          </Group>
          <Paper withBorder radius="md" p="sm" bg="gray.1" mb="md">
            <Text size="sm">
              <strong>Resumen:</strong> {selectedCustomer?.name ?? '-'} ·{' '}
              {selectedWorksite
                ? selectedWorksite.alias
                  ? `${selectedWorksite.alias} · ${selectedWorksite.worksite.name}`
                  : selectedWorksite.worksite.name
                : '-'}{' '}
              · {docDate || '-'} ·{' '}
              {docType === 'REMISSION'
                ? deliveryMode === 'ON_SITE'
                  ? `On-site (${selectedDriver?.name ?? '-'})`
                  : `Bodega (${selectedDispatcher?.name ?? '-'})`
                : 'Devolución'}
            </Text>
          </Paper>
          <Text c="dimmed">Busca y agrega; la tabla se llena abajo.</Text>

          <Group mt="md" align="flex-end" wrap="wrap">
            {sourceMode === 'warehouse' && (
              isMobile ? (
                <NativeSelect
                  label={helpLabel('Dueño/a', 'Dueño del inventario a despachar. Este filtro no cambia la bodega de ubicación.')}
                  value={sourceOwnerWarehouseId ?? ''}
                  onChange={(event) => setSourceOwnerWarehouseId(event.currentTarget.value || null)}
                  data={[{ value: '', label: 'Selecciona dueño/a' }, ...ownerWarehouseOptions]}
                  w="100%"
                />
              ) : (
                <Select
                  label={helpLabel('Dueño/a', 'Dueño del inventario a despachar. Este filtro no cambia la bodega de ubicación.')}
                  value={sourceOwnerWarehouseId}
                  onChange={(value) => setSourceOwnerWarehouseId(value)}
                  data={ownerWarehouseOptions}
                  searchable
                  clearable
                  placeholder="Selecciona dueño/a"
                  w={320}
                />
              )
            )}
            {sourceMode === 'on-site' && (
              isMobile ? (
                <NativeSelect
                  label={helpLabel('Obra origen', 'Obra desde donde se devolverán los items a bodega.')}
                  value={sourceWorksiteId ?? ''}
                  onChange={(event) => setSourceWorksiteId(event.currentTarget.value || null)}
                  data={[
                    { value: '', label: customerId ? 'Selecciona obra' : 'Selecciona cliente primero' },
                    ...worksiteOptions,
                  ]}
                  disabled={!customerId || worksitesLoading}
                  w="100%"
                />
              ) : (
                <Select
                  label={helpLabel('Obra origen', 'Obra desde donde se devolverán los items a bodega.')}
                  value={sourceWorksiteId}
                  onChange={(value) => setSourceWorksiteId(value)}
                  data={worksiteOptions}
                  searchable
                  clearable
                  placeholder={customerId ? 'Selecciona obra' : 'Selecciona cliente primero'}
                  disabled={!customerId || worksitesLoading}
                />
              )
            )}
            {useManualWarehouseCapture ? null : (
              <Button onClick={loadInventory} loading={loadingInventory}>
                Cargar items
              </Button>
            )}
          </Group>

          {useManualWarehouseCapture ? (
            <Stack mt="md" gap="sm">
              <Text size="xs" c="dimmed">
                Catálogo base cargado desde bodega principal ({principalTags.length} tags).
              </Text>
              <Group align="flex-end" wrap="wrap">
                <Autocomplete
                  label="Item/s"
                  placeholder={loadingPrincipalTags ? 'Cargando items...' : 'Selecciona o escribe el item'}
                  data={principalTags}
                  value={freeTagInput}
                  onChange={(value) => setFreeTagInput(value)}
                  disabled={loadingPrincipalTags}
                  w={isMobile ? '100%' : 320}
                />
                {freeTagCatalogMatch?.type !== 'serial' ? (
                  <NumberInput
                    label="Cantidad"
                    min={1}
                    value={freeQtyInput}
                    onChange={(value) => setFreeQtyInput(typeof value === 'number' ? value : '')}
                    w={isMobile ? '100%' : 140}
                  />
                ) : (
                  <Text size="sm" c="dimmed" mt={30}>
                    Equipo único: cantidad fija 1
                  </Text>
                )}
                <Button onClick={addFreeItem}>Agregar item</Button>
              </Group>
            </Stack>
          ) : null}

          <Divider my="md" />

          {!isMobile && !useManualWarehouseCapture ? (
            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <Select
                  label={helpLabel('Agregar stock (masivo)', 'Items por cantidad, por ejemplo formaletas o consumibles.')}
                  placeholder={availableBulkItems.length ? 'Busca por nombre o SKU' : 'Sin items disponibles'}
                  searchable
                  clearable
                  value={bulkSelect}
                  onChange={(value) => {
                    const found = availableBulkItems.find((item) => buildBulkKey(item) === value);
                    if (found) {
                      addBulkItem(found);
                      setBulkSelect(null);
                    } else {
                      setBulkSelect(value);
                    }
                  }}
                  data={availableBulkItems.map((item) => ({
                    value: buildBulkKey(item),
                    label: isDriverRole
                      ? `${item.skuName ?? 'SKU'}`
                      : `${item.skuName ?? 'SKU'} · ${item.quantity} · ${item.ownerWarehouseName ?? 'Sin bodega dueña'}`
                  }))}
                />
                <Select
                  label={helpLabel('Agregar equipo (serial)', 'Equipos únicos identificados por serial o motor.')}
                  placeholder={availableSerialItems.length ? 'Busca por serial o asset' : 'Sin equipos disponibles'}
                  searchable
                  clearable
                  value={serialSelect}
                  onChange={(value) => {
                    const found = availableSerialItems.find((item) => item.assetId === value);
                    if (found) {
                      addSerialItem(found);
                      setSerialSelect(null);
                    } else {
                      setSerialSelect(value);
                    }
                  }}
                  data={availableSerialItems.map((item) => ({
                    value: item.assetId,
                    label: buildSerialDisplayName(item)
                  }))}
                />
              </SimpleGrid>
            </Stack>
          ) : useManualWarehouseCapture ? (
            <Text size="sm" c="dimmed">
              Agrega items por descripción.
            </Text>
          ) : (
            <Text size="sm" c="dimmed">
              Pulsa "Cargar items" para abrir el selector de items.
            </Text>
          )}
          <Divider my="md" />

          <Title order={4}>Seleccionados</Title>
          {!isMobile ? (
            <Table striped highlightOnHover mt="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Item</Table.Th>
                  <Table.Th>Cantidad</Table.Th>
                  <Table.Th></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {selectedItems.map((item, index) => (
                  <Table.Tr key={`${item.type}-${item.skuId ?? item.assetId}-${index}`}>
                    <Table.Td>
                      <Text fw={600}>{item.name}</Text>
                      <Badge
                        size="xs"
                        mt={4}
                        variant="light"
                        color={ownerColorById(item.ownerWarehouseId)}
                      >
                        {item.ownerWarehouseId
                          ? warehouses.find((warehouse) => warehouse.id === item.ownerWarehouseId)?.name ?? 'Sin dueño/a'
                          : 'Sin dueño/a'}
                      </Badge>
                      {item.serial && (
                        <Text size="xs" c="dimmed">
                          {item.serial}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {item.type === 'bulk' || item.type === 'free' ? (
                        <NumberInput
                          min={0}
                          value={item.quantity ?? 1}
                          onChange={(value) =>
                            updateSelected(index, {
                              quantity: typeof value === 'number' ? value : 1
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
                          placeholder="Selecciona SKU"
                          searchable
                          clearable
                          data={skuOptions.map((sku) => ({ value: sku.id, label: sku.name }))}
                          onChange={(value) => resolveFreeItemToSku(index, value)}
                        />
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      <Button variant="subtle" color="red" onClick={() => removeSelected(index)}>
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
                      <Badge size="xs" mt={4} variant="light" color={ownerColorById(item.ownerWarehouseId)}>
                        {item.ownerWarehouseId
                          ? warehouses.find((warehouse) => warehouse.id === item.ownerWarehouseId)?.name ?? 'Sin dueño/a'
                          : 'Sin dueño/a'}
                      </Badge>
                      {item.serial && (
                        <Text size="xs" c="dimmed">
                          {item.serial}
                        </Text>
                      )}
                    </div>
                    {item.type === 'bulk' || item.type === 'free' ? (
                      <NumberInput
                        label="Cantidad"
                        min={0}
                        value={item.quantity ?? 1}
                        onChange={(value) =>
                          updateSelected(index, {
                            quantity: typeof value === 'number' ? value : 1
                          })
                        }
                      />
                    ) : (
                      <Text size="sm">Cantidad: 1</Text>
                    )}
                    {canResolveInline && item.type === 'free' ? (
                      <Select
                        label="Resolver a SKU"
                        placeholder="Selecciona SKU"
                        searchable
                        clearable
                        data={skuOptions.map((sku) => ({ value: sku.id, label: sku.name }))}
                        onChange={(value) => resolveFreeItemToSku(index, value)}
                      />
                    ) : null}
                    <Button variant="light" color="red" onClick={() => removeSelected(index)}>
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
        <Paper shadow="sm" p="xl" radius="md" withBorder mt="lg">
          <Group justify="space-between" align="center" mb="sm">
            <Title order={4}>Firma y envío</Title>
            <Button variant="light" color="gray" onClick={() => setGenerateStep('items')}>
              Volver a items
            </Button>
          </Group>

          <Paper withBorder radius="md" p="sm" bg="gray.1" mb="md">
            <Text size="sm">
              <strong>Resumen:</strong> {selectedCustomer?.name ?? '-'} ·{' '}
              {selectedWorksite
                ? selectedWorksite.alias
                  ? `${selectedWorksite.alias} · ${selectedWorksite.worksite.name}`
                  : selectedWorksite.worksite.name
                : '-'}{' '}
              · {docDate || '-'} · {selectedItems.length} item(s)
            </Text>
          </Paper>

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
                  <Table.Td>{item.name}</Table.Td>
                  <Table.Td style={{ textAlign: 'center' }}>
                    {item.type === 'serial' ? 1 : item.quantity ?? 1}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          <Stack gap="xs">
            <Text fw={600}>Firma recibido por</Text>
            <Group justify="space-between" align="center">
              <Text size="sm" c="dimmed">
                {receivedSignature ? 'Firma capturada' : 'Sin firma'}
              </Text>
              <Button
                variant="light"
                onClick={() => {
                  setSignatureDraft(receivedSignature);
                  setSignatureModalOpen(true);
                }}
              >
                Firmar
              </Button>
            </Group>
            {receivedSignature ? (
              <img
                src={receivedSignature}
                alt="Firma recibida"
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

          {error && (
            <Text c="red" mt="sm">
              {error}
            </Text>
          )}
          {submitResult && (
            <Text c="green" mt="sm">
              {submitResult}
            </Text>
          )}

          <Group mt="md">
            <Button onClick={handleSubmit} loading={submitting}>
              {editingRequestId ? 'Guardar cambios' : 'Enviar solicitud'}
            </Button>
          </Group>
        </Paper>
        ) : null}
      </Container>

      <Modal
        opened={signatureModalOpen}
        onClose={() => setSignatureModalOpen(false)}
        title="Firma recibido por"
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
          <Text size="sm">
            {adjustWarningMessage ??
              'Primero debes hacer ajuste de bodega para hacer movimientos.'}
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
        onClose={() => {
          if (resolvingApprove) return;
          setResolveModalOpen(false);
          setResolveDocument(null);
          setResolveSkuByIndex({});
        }}
        title="Resolver tags antes de aprobar"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Esta solicitud tiene tags sin ID. Asigna un SKU a cada uno para continuar.
          </Text>
          {(resolveDocument?.items ?? [])
            .map((item, index) => ({ item, index }))
            .filter(
              ({ item }) =>
                !item.skuId &&
                !item.assetId &&
                Boolean(item.requestedTag?.trim()),
            )
            .map(({ item, index }) => (
              <Paper key={`${item.requestedTag}-${index}`} withBorder p="sm" radius="md">
                <Stack gap={6}>
                  <Text fw={600}>{item.requestedTag}</Text>
                  <Text size="xs" c="dimmed">
                    Cantidad: {Number(item.quantity ?? 1) || 1}
                  </Text>
                  <Select
                    label="SKU destino"
                    placeholder="Selecciona SKU"
                    searchable
                    data={skuOptions.map((sku) => ({ value: sku.id, label: sku.name }))}
                    value={resolveSkuByIndex[index] ?? null}
                    onChange={(value) =>
                      setResolveSkuByIndex((prev) => ({
                        ...prev,
                        [index]: value ?? '',
                      }))
                    }
                  />
                </Stack>
              </Paper>
            ))}

          <Group justify="flex-end" className="mobile-actions">
            <Button
              variant="default"
              onClick={() => {
                setResolveModalOpen(false);
                setResolveDocument(null);
                setResolveSkuByIndex({});
              }}
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

      <Modal
        opened={itemsModalOpen}
        onClose={() => setItemsModalOpen(false)}
        title="Seleccionar items"
        centered
      >
        <Stack gap="md">
          {itemsAddedNotice ? (
            <Alert color="green" variant="light">
              {itemsAddedNotice}
            </Alert>
          ) : null}
          {useManualWarehouseCapture ? (
            <Text size="sm" c="dimmed">
              Usa captura por descripción en la sección principal.
            </Text>
          ) : (
            <>
          <Select
            label={helpLabel('Agregar stock (masivo)', 'Items por cantidad, por ejemplo formaletas o consumibles.')}
            placeholder={availableBulkItems.length ? 'Busca por nombre o SKU' : 'Sin items disponibles'}
            searchable
            clearable
            value={bulkSelect}
            onChange={(value) => {
              const found = availableBulkItems.find((item) => buildBulkKey(item) === value);
              if (found) {
                const added = addBulkItem(found);
                if (added) {
                  setItemsAddedNotice(`${found.skuName ?? 'Item'} agregado a la lista.`);
                  setItemsModalOpen(false);
                }
                setBulkSelect(null);
              } else {
                setBulkSelect(value);
              }
            }}
            data={availableBulkItems.map((item) => ({
              value: buildBulkKey(item),
              label: isDriverRole
                ? `${item.skuName ?? 'SKU'}`
                : `${item.skuName ?? 'SKU'} · ${item.quantity} · ${item.ownerWarehouseName ?? 'Sin bodega dueña'}`
            }))}
          />
          <Select
            label={helpLabel('Agregar equipo (serial)', 'Equipos únicos identificados por serial o motor.')}
            placeholder={availableSerialItems.length ? 'Busca por serial o asset' : 'Sin equipos disponibles'}
            searchable
            clearable
            value={serialSelect}
            onChange={(value) => {
              const found = availableSerialItems.find((item) => item.assetId === value);
              if (found) {
                const added = addSerialItem(found);
                if (added) {
                  setItemsAddedNotice(`${buildSerialDisplayName(found)} agregado a la lista.`);
                  setItemsModalOpen(false);
                }
                setSerialSelect(null);
              } else {
                setSerialSelect(value);
              }
            }}
            data={availableSerialItems.map((item) => ({
              value: item.assetId,
              label: buildSerialDisplayName(item)
            }))}
          />
            </>
          )}
          <Group justify="flex-end" className="mobile-actions">
            <Button variant="default" onClick={() => setItemsModalOpen(false)}>
              Cerrar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </main>
  );
}
