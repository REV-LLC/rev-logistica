'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Container,
  FileInput,
  Group,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  NumberInput,
} from '@mantine/core';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getCurrentUserRole } from '@/lib/auth';
import { getSerialDisplayName } from '@/lib/serial-assets';
import {
  buildInventoryStockShortageMessage,
  extractInventoryStockShortages,
} from '@/lib/inventory-stock-errors';
import styles from './remdev-print.module.css';
import Image from 'next/image';
import {
  IconArrowLeft,
  IconBrandWhatsapp,
  IconCalendar,
  IconCamera,
  IconCopy,
} from '@tabler/icons-react';
import TableRowActions from '@/components/TableRowActions';
import MixerMotorSelectionModal from '@/components/MixerMotorSelectionModal';
import type { InventoryItemPickerSerialItem } from '@/components/InventoryItemPickerModal';

const PRINT_LINES_PER_PAGE = 20;

type DocumentDetail = {
  id: string;
  type: string;
  status: string;
  consecutive: string | null;
  createdAt: string;
  docDate: string;
  notes: string | null;
  recipientPhone?: string | null;
  warehouse?: { id: string; name: string } | null;
  customerWorksite?: {
    id: string;
    alias: string | null;
    customer?: { id: string; name: string } | null;
    worksite?: { id: string; name: string; address: string | null } | null;
  } | null;
  creator?: { id: string; email: string; name: string | null } | null;
  messageDeliveries?: Array<{
    id: string;
    phone: string;
    status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | string;
    sentAt?: string | null;
    error?: string | null;
    createdAt: string;
  }>;
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
    componentParentAssetId?: string | null;
    quantity?: string | number | null;
    condition?: string | null;
    conditionNote?: string | null;
    requestedTag?: string | null;
    sku?: { id: string; name: string } | null;
    asset?: {
      id: string;
      description?: string | null;
      serialOrEngine?: string | null;
      internalNumber?: number | null;
      sku?: { id: string; name: string } | null;
    } | null;
    billingCutoffDate?: string | null;
    returnedAt?: string | null;
    billingStatus?: 'OPEN' | 'CUT' | 'CLOSED' | string | null;
    billingNote?: string | null;
  }>;
  ledger: Array<{
    id: string;
    createdAt: string;
    movementType: string;
    quantity: string | number;
    ownerWarehouse?: {
      id: string;
      name: string;
      ownerCompany?: { name: string } | null;
    } | null;
    sku?: { id: string; name: string } | null;
    asset?: {
      id: string;
      description?: string | null;
      serialOrEngine?: string | null;
      internalNumber?: number | null;
      sku?: { id: string; name: string } | null;
    } | null;
  }>;
};

type VehicleOption = {
  id: string;
  plate?: string | null;
  brand?: string | null;
  model?: string | null;
};

type EmployeeOption = {
  id: string;
  name: string;
  lastName?: string | null;
};

const getEmployeeFullName = (employee: EmployeeOption) =>
  `${employee.name} ${employee.lastName ?? ''}`.trim();

type WarehouseOption = {
  id: string;
  name: string;
};

type ProviderRemissionRequirement = {
  providerWarehouseId: string;
  providerName: string;
  itemCount: number;
  quantity: number;
  documentUploaded: boolean;
};

type ProviderRemissionRequirements = {
  required: boolean;
  providers: ProviderRemissionRequirement[];
  missingProviders: ProviderRemissionRequirement[];
};

type ProviderRemissionDraft = {
  file: File;
  previewUrl: string;
};

type InventorySerial = {
  assetId: string;
  skuId?: string | null;
  skuName?: string | null;
  description?: string | null;
  serialOrEngine?: string | null;
  internalNumber?: number | null;
  brand?: string | null;
  model?: string | null;
  ownerWarehouseId?: string | null;
};

type SkuOption = {
  id: string;
  name: string;
  assetFamilyId: string;
  controlType: 'BULK' | 'SERIAL';
};

type ResolveInventoryByOwner = Record<string, { serial: InventorySerial[] }>;

type RecoverableApprovalError = {
  code?: string;
  recovery?: {
    type?: string;
    mixerAssetId?: string;
    ownerWarehouseId?: string | null;
  };
};

type MixerMotorRecovery = {
  document: DocumentDetail;
  mixer: InventoryItemPickerSerialItem;
  motors: InventoryItemPickerSerialItem[];
  ownerWarehouseId: string;
};

type CreateSerializedAssetResponse = {
  asset: {
    id: string;
    internalNumber: number;
    skuId: string;
    warehouseOwnerId: string;
    warehouseCurrentId: string;
  };
};

const FUEL_OPTIONS = [
  { value: 'GASOLINA', label: 'Gasolina' },
  { value: 'DIESEL', label: 'Diesel' },
  { value: 'ELECTRICO', label: 'Electrico' },
];

function formatDocType(value: string) {
  if (value === 'REMISSION') return 'RM';
  if (value === 'RETURN') return 'DV';
  return value;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-CO');
}

function toDisplayDateInput(value?: string | null) {
  if (!value) return '';
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-CO');
}

function toPickerDateInput(value?: string | null) {
  if (!value) return '';
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toApiDateInput(value: string, fieldLabel: string) {
  const raw = value.trim();
  if (!raw) return null;
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    throw new Error(`${fieldLabel} debe estar en formato dd/mm/aaaa`);
  }
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-CO');
}

const documentDateFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const documentTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
});

function formatDocumentDateTime(docDateValue: string, createdAtValue: string) {
  const docDate = new Date(docDateValue);
  const createdAt = new Date(createdAtValue);
  if (Number.isNaN(docDate.getTime()) || Number.isNaN(createdAt.getTime())) {
    return formatDateTime(docDateValue);
  }
  return `${documentDateFormatter.format(docDate)}, ${documentTimeFormatter.format(createdAt)}`;
}

function formatWhatsappPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  const national = digits.startsWith('57') && digits.length === 12 ? digits.slice(2) : digits;
  if (national.length !== 10) return value;
  return `+57 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}

function whatsappDeliveryStatus(status: string) {
  if (status === 'SENT') return { label: 'Enviada', color: 'green' };
  if (status === 'FAILED') return { label: 'Fallida', color: 'red' };
  if (status === 'SENDING') return { label: 'Enviando', color: 'blue' };
  return { label: 'Pendiente', color: 'yellow' };
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
    vehicleId: map.get('vehiculo') ?? map.get('vehículo') ?? map.get('vehicle') ?? '',
    driverId: map.get('conductor') ?? '',
    receiverId: map.get('recibe') ?? '',
    dispatcherId: map.get('despachador') ?? '',
    cutOffDate: map.get('fecha corte') ?? map.get('cutoff date') ?? '',
  };
}

function buildObservationText(notes: string | null) {
  if (!notes) return '';
  const hiddenPrefixes = [
    'fecha doc:',
    'fecha documento:',
    'fecha corte:',
    'document date:',
    'cutoff date:',
    'entrega:',
    'vehicle:',
    'vehículo:',
    'vehiculo:',
    'driver:',
    'conductor:',
    'recibe:',
    'dispatcher:',
    'despachador:',
  ];
  return notes
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .filter((part) => !hiddenPrefixes.some((prefix) => part.toLowerCase().startsWith(prefix)))
    .join(' | ');
}

function normalizeTagBase(value?: string | null) {
  return (value ?? '')
    .replace(/#\s*\d+\s*$/i, '')
    .trim()
    .toUpperCase();
}

function parseInternalNumberFromTag(value?: string | null) {
  const match = (value ?? '').match(/#\s*(\d+)\s*$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

const TERMS_TEXT = `TÉRMINOS Y CONDICIONES DEL CONTRATO DE ALQUILER DE EQUIPOS

Entre los suscritos a saber JESUS ALVARO GUERRERO VILLAMICENCIO, quien obra en este acto en representación de la empresa persona natural JESUS ALVARO GUERRERO VILLAMICENCIO, con establecimiento comercial denominado RENTA EQUIPOS DEL VALLE, identificada con la cédula de ciudadanía No 94.371.184, que en lo sucesivo para los efectos de este contrato se denominará LA ARRENDADORA, por una parte y quien firma el presente documento en nombre propio o en representación de la obra donde se remisiona el equipo en adelante se denominará LA ARRENDATARIA, acuerdan por medio del presente documento celebrar un contrato de arrendamiento de equipos para la construcción el cual se regirá por las siguientes cláusulas:

PRIMERA: LA ARRENDADORA entrega a título de arrendamiento a LA ARRENDATARIA y esta recibe al mismo título los materiales o elementos para construcción que se relacionan en la remisión.

SEGUNDA: El término de duración de este contrato será a partir del recibido de los equipos mediante la forma “remisión de equipos” y su terminación será hasta la devolución de los mismos.

TERCERA: LA ARRENDATARIA declara recibir el equipo a entera satisfacción, perfectas condiciones y apto para el trabajo a que está destinado y se obliga a restituirlo en las mismas condiciones, salvo el deterioro normal por buen uso.

CUARTA: Los equipos dados en arrendamiento deberán permanecer en la obra para la cual fueron contratados, en el caso en que LA ARRENDATARIA desee trasladar el lugar de los equipos deberá notificar a LA ARRENDADORA.

QUINTA: LA ARRENDADORA se compromete a hacer el mantenimiento debido al equipo, con el fin de que este cumpla el servicio para el cual fue contratado.

SEXTA: LA ARRENDATARIA es la única y directa responsable, así actúe como intermediaria o por contrato de administración delegada, de los equipos dados en arrendamiento y pagará el valor del respectivo equipo en caso de faltantes, hurto, pérdida parcial o total del equipo; de igual forma será de su cargo las reparaciones que deban efectuarse fuera del deterioro normal.

SÉPTIMA: LA ARRENDADORA no asume ninguna responsabilidad por retrasos o demoras por estar el equipo en mantenimiento, ni se hace responsable de accidentes o daños por el mal uso o descuido en el manejo de equipos.

OCTAVA: El equipo deberá ser devuelto una vez concluida la obra o en la fecha de terminación del presente contrato en las instalaciones de LA ARRENDADORA; los gastos de transporte serán por cuenta de LA ARRENDATARIA.

PARÁGRAFO: LA ARRENDATARIA a quien LA ARRENDADORA designe, a retirar el equipo entregado en calidad de arrendamiento, del lugar donde este se encuentre, sin previa orden judicial o policiva, en los siguientes casos. LA ARRENDATARIA mediante el presente contrato acepta todas las facturas que se generen como consecuencia del arrendamiento de los equipos, prestación de servicios, faltantes, reparaciones e intereses por mora en el pago de dichas facturas.

NOVENA: Este contrato junto con las facturas dejadas de cancelar prestan mérito ejecutivo y LA ARRENDADORA podrá iniciar acción judicial contra LA ARRENDATARIA por incumplimiento de algunas de las cláusulas pactadas en él.`;

export default function DocumentDetailPage() {
  const router = useRouter();
  const params = useParams<{ documentId: string }>();
  const documentId = params?.documentId;
  const userRole = useMemo(() => getCurrentUserRole(), []);
  const isDriverRole = userRole === 'DRIVER';
  const canDecide = userRole === 'ADMIN' || userRole === 'OFFICE';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [skuOptions, setSkuOptions] = useState<SkuOption[]>([]);
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [billingItemId, setBillingItemId] = useState<string | null>(null);
  const [billingCutoffDate, setBillingCutoffDate] = useState('');
  const [billingReturnedAt, setBillingReturnedAt] = useState('');
  const [billingNote, setBillingNote] = useState('');
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [decisionLoading, setDecisionLoading] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [providerRemissionRequirements, setProviderRemissionRequirements] =
    useState<ProviderRemissionRequirements | null>(null);
  const [providerRemissionDrafts, setProviderRemissionDrafts] = useState<
    Record<string, ProviderRemissionDraft>
  >({});
  const [providerRemissionUploading, setProviderRemissionUploading] = useState(false);
  const [providerRemissionError, setProviderRemissionError] = useState<string | null>(null);
  const [motorRecovery, setMotorRecovery] = useState<MixerMotorRecovery | null>(null);
  const [motorRecoveryLoading, setMotorRecoveryLoading] = useState(false);
  const [motorRecoveryError, setMotorRecoveryError] = useState<string | null>(null);
  const [emailRetryLoading, setEmailRetryLoading] = useState(false);
  const [emailRetryMessage, setEmailRetryMessage] = useState<string | null>(null);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolveDocument, setResolveDocument] = useState<DocumentDetail | null>(null);
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
  const [printAudience, setPrintAudience] = useState<'internal' | 'customer'>('internal');
  const billingCutoffPickerRef = useRef<HTMLInputElement | null>(null);
  const billingReturnedPickerRef = useRef<HTMLInputElement | null>(null);
  const providerRemissionDraftsRef = useRef<Record<string, ProviderRemissionDraft>>({});

  useEffect(() => {
    providerRemissionDraftsRef.current = providerRemissionDrafts;
  }, [providerRemissionDrafts]);

  useEffect(
    () => () => {
      Object.values(providerRemissionDraftsRef.current).forEach((draft) =>
        URL.revokeObjectURL(draft.previewUrl),
      );
    },
    [],
  );

  useEffect(() => {
    if (!documentId) return;
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [docData, vehiclesData, employeesData, warehousesData] = await Promise.all([
          api<DocumentDetail>(`/documents/${documentId}`, { method: 'GET' }),
          api<VehicleOption[]>('/vehicles', { method: 'GET' }),
          api<EmployeeOption[]>('/employees', { method: 'GET' }),
          api<WarehouseOption[]>('/warehouses', { method: 'GET' }),
        ]);
        if (!mounted) return;
        setDocument(docData);
        setVehicles(vehiclesData);
        setEmployees(employeesData);
        setWarehouses(warehousesData);
      } catch (err) {
        if (!mounted) return;
        if (err instanceof ApiError) {
          setError(`${err.status}: ${err.message}`);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Error cargando documento');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [documentId]);

  useEffect(() => {
    let mounted = true;
    const loadSkuOptions = async () => {
      if (!canDecide) return;
      try {
        const data = await api<
          Array<{ id: string; name: string; assetFamilyId: string; controlType: 'BULK' | 'SERIAL' }>
        >('/skus', { method: 'GET' });
        if (!mounted) return;
        setSkuOptions(
          data.map((item) => ({
            id: item.id,
            name: item.name,
            assetFamilyId: item.assetFamilyId,
            controlType: item.controlType,
          })),
        );
      } catch {
        if (!mounted) return;
      }
    };
    void loadSkuOptions();
    return () => {
      mounted = false;
    };
  }, [canDecide]);

  const title = useMemo(() => {
    if (!document) return 'Documento';
    if (document.consecutive) return document.consecutive.trim();
    return `${formatDocType(document.type)} ${document.id.slice(0, 8)}`;
  }, [document]);
  const selectedBillingItem = useMemo(
    () => document?.items.find((item) => item.id === billingItemId) ?? null,
    [billingItemId, document?.items],
  );

  const parsedNotes = useMemo(() => parseNotes(document?.notes ?? null), [document?.notes]);
  const observationText = useMemo(() => buildObservationText(document?.notes ?? null), [document?.notes]);
  const vehicleDisplay = useMemo(() => {
    const vehicleId = parsedNotes.vehicleId ?? '';
    if (!vehicleId) return '-';
    const found = vehicles.find(
      (vehicle) => vehicle.id.toLowerCase() === vehicleId.toLowerCase(),
    );
    if (!found) return '-';
    const details = [found.plate, found.brand, found.model].filter(Boolean).join(' ');
    return details || '-';
  }, [parsedNotes.vehicleId, vehicles]);
  const vehiclePlateDisplay = useMemo(() => {
    const vehicleId = parsedNotes.vehicleId ?? '';
    if (!vehicleId) return '-';
    const found = vehicles.find(
      (vehicle) => vehicle.id.toLowerCase() === vehicleId.toLowerCase(),
    );
    return found?.plate ?? '-';
  }, [parsedNotes.vehicleId, vehicles]);
  const driverDisplay = useMemo(() => {
    const driverId = parsedNotes.driverId ?? '';
    if (!driverId) return '-';
    const found = employees.find(
      (employee) => employee.id.toLowerCase() === driverId.toLowerCase(),
    );
    return found ? getEmployeeFullName(found) : '-';
  }, [parsedNotes.driverId, employees]);
  const dispatcherDisplay = useMemo(() => {
    const dispatcherId = parsedNotes.dispatcherId ?? '';
    if (!dispatcherId) return '-';
    const found = employees.find(
      (employee) => employee.id.toLowerCase() === dispatcherId.toLowerCase(),
    );
    return found ? getEmployeeFullName(found) : '-';
  }, [parsedNotes.dispatcherId, employees]);
  const receiverDisplay = useMemo(() => {
    const receiverId = parsedNotes.receiverId ?? parsedNotes.driverId ?? '';
    if (receiverId) {
      const found = employees.find(
        (employee) => employee.id.toLowerCase() === receiverId.toLowerCase(),
      );
      if (found) return getEmployeeFullName(found);
    }
    return document?.creator?.name ?? document?.creator?.email ?? '-';
  }, [document?.creator?.email, document?.creator?.name, employees, parsedNotes.driverId, parsedNotes.receiverId]);
  const transportadoPorDisplay = useMemo(() => {
    const driver = driverDisplay && driverDisplay !== '-' ? driverDisplay : '';
    const plate = vehiclePlateDisplay && vehiclePlateDisplay !== '-' ? vehiclePlateDisplay : '';
    if (driver && plate) return `${driver} | ${plate}`;
    if (driver) return driver;
    if (plate) return plate;
    return '-';
  }, [driverDisplay, vehiclePlateDisplay]);
  const isRemission = document?.type === 'REMISSION';
  const isReturn = document?.type === 'RETURN';
  const isChange = document?.type === 'CUTOVER' || document?.type === 'CHANGE';
  const receivedSignature =
    document?.files?.find((file) => file.fileType === 'SIGNATURE_RECEIVED')?.storageKey ?? null;
  const evidenceFiles = useMemo(
    () => document?.files?.filter((file) => file.fileType === 'PHOTO_EVIDENCE') ?? [],
    [document?.files],
  );
  const hasRenderableSignature = Boolean(receivedSignature?.startsWith('data:image/'));
  const deliveredByDisplay = document?.creator?.name ?? document?.creator?.email ?? dispatcherDisplay ?? '-';
  const warehouseNameById = useMemo(
    () => new Map(warehouses.map((warehouse) => [warehouse.id.toLowerCase(), warehouse.name])),
    [warehouses],
  );

  const linePages = useMemo(() => {
    const sourceRows = document?.type === 'RETURN'
      ? document?.items ?? []
      : (document?.ledger?.length ? document.ledger : document?.items ?? []);
    const rows = sourceRows.map((entry: any) => {
      const qty = entry.assetId && entry.quantity == null
        ? 1
        : Math.abs(Number(entry.quantity || 0));
      const baseDesc =
        entry.asset?.description ??
        entry.asset?.sku?.name ??
        entry.sku?.name ??
        entry.requestedTag ??
        '-';
      const damageNote = entry.conditionNote?.trim();
      const desc = damageNote ? `${baseDesc} | Averia: ${damageNote}` : baseDesc;
      const eq = entry.asset?.internalNumber != null ? `#${entry.asset.internalNumber}` : '';
      const origin = entry.ownerWarehouse
        ? entry.ownerWarehouse.ownerCompany?.name
          ? `${entry.ownerWarehouse.ownerCompany.name} | ${entry.ownerWarehouse.name}`
          : entry.ownerWarehouse.name
        : (() => {
            const raw = (entry.condition ?? '').trim();
            if (!raw) return '';
            return warehouseNameById.get(raw.toLowerCase()) ?? raw;
          })();
      return { qty, desc, eq, origin };
    });
    if (!rows.length) {
      rows.push({ qty: 0, desc: '', eq: '', origin: '' });
    }

    const pages: Array<Array<{ qty: number; desc: string; eq: string; origin: string }>> = [];
    for (let index = 0; index < rows.length; index += PRINT_LINES_PER_PAGE) {
      const page = rows.slice(index, index + PRINT_LINES_PER_PAGE);
      while (page.length < PRINT_LINES_PER_PAGE) {
        page.push({ qty: 0, desc: '', eq: '', origin: '' });
      }
      pages.push(page);
    }
    return pages;
  }, [document?.items, document?.ledger, document?.type, warehouseNameById]);

  useEffect(() => {
    const resetPrintAudience = () => setPrintAudience('internal');
    window.addEventListener('afterprint', resetPrintAudience);
    return () => window.removeEventListener('afterprint', resetPrintAudience);
  }, []);

  const exportPdf = (audience: 'internal' | 'customer') => {
    setPrintAudience(audience);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  };

  const describeItem = (item: DocumentDetail['items'][number]) => {
    return (
      item.asset?.description ??
      item.asset?.sku?.name ??
      item.sku?.name ??
      item.requestedTag ??
      '-'
    );
  };
  const displayQuantity = (value?: string | number | null) => {
    if (value == null) return '-';
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return String(value);
    return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2);
  };
  const billingStatusColor = (status?: string | null) => {
    if (status === 'CUT') return 'yellow';
    if (status === 'CLOSED') return 'gray';
    return 'green';
  };
  const formatBillingStatus = (status?: string | null) => {
    if (status === 'CUT') return 'Corte definido';
    if (status === 'CLOSED') return 'Cerrado';
    return 'Abierto';
  };
  const getEffectiveBillingCutoffDate = (item: DocumentDetail['items'][number]) =>
    item.billingCutoffDate ?? (document?.type === 'RETURN' ? document.docDate : null);
  const getEffectiveBillingStatus = (item: DocumentDetail['items'][number]) =>
    item.billingStatus ?? (getEffectiveBillingCutoffDate(item) ? 'CUT' : 'OPEN');
  const isResolvePendingItem = (item: DocumentDetail['items'][number]) => {
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
  const openBillingModal = (item: DocumentDetail['items'][number]) => {
    const defaultReturnedAt =
      document?.type === 'RETURN'
        ? toPickerDateInput(item.returnedAt ?? document.docDate ?? document.createdAt)
        : toPickerDateInput(item.returnedAt);
    setBillingItemId(item.id);
    setBillingCutoffDate(toPickerDateInput(getEffectiveBillingCutoffDate(item)));
    setBillingReturnedAt(defaultReturnedAt);
    setBillingNote(item.billingNote ?? '');
    setBillingError(null);
    setBillingModalOpen(true);
  };
  const reloadDocumentOnly = async () => {
    if (!documentId) return;
    const docData = await api<DocumentDetail>(`/documents/${documentId}`, { method: 'GET' });
    setDocument(docData);
  };
  const saveBilling = async () => {
    if (!document?.id || !selectedBillingItem) return;
    setBillingLoading(true);
    setBillingError(null);
    try {
      const cutoffValue = toApiDateInput(billingCutoffDate, 'Fecha corte');
      const returnedValue = toApiDateInput(billingReturnedAt, 'Fecha real de devolución');
      await api(`/documents/${document.id}/items/${selectedBillingItem.id}/billing`, {
        method: 'PATCH',
        json: {
          billingCutoffDate: cutoffValue,
          returnedAt: returnedValue,
          note: billingNote || undefined,
        },
      });
      await reloadDocumentOnly();
      setBillingModalOpen(false);
      setBillingItemId(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setBillingError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setBillingError(err.message);
      } else {
        setBillingError('Error guardando corte del item');
      }
    } finally {
      setBillingLoading(false);
    }
  };

  const applyBillingCutoffToAll = async () => {
    if (!document?.id || !billingCutoffDate) return;
    setBillingLoading(true);
    setBillingError(null);
    try {
      const cutoffValue = toApiDateInput(billingCutoffDate, 'Fecha corte');
      if (!cutoffValue) {
        setBillingError('Selecciona una fecha de corte');
        return;
      }
      await api(`/documents/${document.id}/items/billing-cutoff`, {
        method: 'PATCH',
        json: { billingCutoffDate: cutoffValue },
      });
      await reloadDocumentOnly();
      setBillingModalOpen(false);
      setBillingItemId(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setBillingError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setBillingError(err.message);
      } else {
        setBillingError('Error aplicando la fecha de corte a los ítems');
      }
    } finally {
      setBillingLoading(false);
    }
  };


  const openMixerMotorRecovery = async (
    documentId: string,
    recovery: NonNullable<RecoverableApprovalError['recovery']>,
  ) => {
    if (!recovery.mixerAssetId) return;
    setMotorRecoveryLoading(true);
    setMotorRecoveryError(null);
    try {
      const doc = await api<DocumentDetail>(`/documents/${documentId}`, { method: 'GET' });
      const mixerItem = doc.items.find((item) => item.assetId === recovery.mixerAssetId);
      const ownerWarehouseId = recovery.ownerWarehouseId ?? mixerItem?.condition?.trim();
      if (!mixerItem?.asset || !ownerWarehouseId) {
        throw new Error('No se pudo identificar la mezcladora o su bodega de origen.');
      }
      const inventory = await api<{ serial: InventoryItemPickerSerialItem[] }>(
        `/inventory/warehouse/${ownerWarehouseId}`,
        { method: 'GET' },
      );
      const mixer: InventoryItemPickerSerialItem = {
        assetId: mixerItem.asset.id,
        skuId: mixerItem.skuId ?? mixerItem.asset.sku?.id ?? null,
        skuName: mixerItem.asset.sku?.name ?? mixerItem.sku?.name ?? 'Mezcladora',
        description: mixerItem.asset.description ?? null,
        serialOrEngine: mixerItem.asset.serialOrEngine ?? null,
        internalNumber: mixerItem.asset.internalNumber ?? null,
        quantity: 1,
        ownerWarehouseId,
      };
      const motors = (inventory.serial ?? []).filter(
        (item) => item.kind === 'MOTOR'
          && item.ownerWarehouseId === ownerWarehouseId
          && (!item.assignedMixerId || item.assignedMixerId === mixer.assetId),
      );
      setMotorRecovery({ document: doc, mixer, motors, ownerWarehouseId });
      setError(null);
    } catch (recoveryError) {
      setError(recoveryError instanceof Error ? recoveryError.message : 'No se pudieron cargar los motores disponibles.');
    } finally {
      setMotorRecoveryLoading(false);
    }
  };

  const handleApprovalError = (err: unknown) => {
    if (!(err instanceof ApiError)) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al procesar solicitud');
      }
      return;
    }

    const recoverable = err.data as RecoverableApprovalError | null | undefined;
    if (
      document?.id
      && recoverable?.code === 'MISSING_MIXER_MOTOR'
      && recoverable.recovery?.type === 'SELECT_MIXER_MOTOR'
    ) {
      void openMixerMotorRecovery(document.id, recoverable.recovery);
      return;
    }

    const messages = normalizeApiErrorMessages(err);
    const hasAssetUnavailableError = messages.some((message) =>
      /asset\s+[0-9a-f-]{36}\s+is not available in owner warehouse/i.test(message),
    );
    if (hasAssetUnavailableError) {
      setError(
        'No se puede aprobar: el equipo no está disponible en la bodega de origen. Revisa si está en obra o selecciona/carga el equipo correcto antes de aprobar.',
      );
      return;
    }

    const stockShortages = extractInventoryStockShortages(err.data);
    const hasStockError =
      stockShortages.length > 0 ||
      messages.some((message) => /insufficient stock|stock insuficiente/i.test(message));
    if (hasStockError && canDecide) {
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
                (warehouse) => warehouse.id.toLowerCase() === warehouseId.toLowerCase(),
              )?.name ?? 'bodega sin identificar',
          ),
        );
        setAdjustWarningModalOpen(true);
        setError(null);
        return;
      }
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
        `No se puede aprobar la remisión porque "${warehouseLabel}" no tiene stock suficiente.${missingItemsBlock}`,
      );
      setAdjustWarningModalOpen(true);
      setError(null);
      return;
    }

    setError(`${err.status}: ${err.message}`);
  };

  const confirmRecoveredMixerMotor = async (motor: InventoryItemPickerSerialItem) => {
    if (!motorRecovery) return;
    const { document: doc, mixer, ownerWarehouseId } = motorRecovery;
    setMotorRecoveryLoading(true);
    setMotorRecoveryError(null);
    try {
      await api(`/assets/${mixer.assetId}/assigned-motor`, {
        method: 'PATCH',
        json: { motorId: motor.assetId },
      });
      await api(`/documents/${doc.id}/request`, {
        method: 'PATCH',
        json: {
          type: doc.type,
          number: doc.consecutive ?? undefined,
          warehouseId: doc.warehouse?.id ?? undefined,
          customerWorksiteId: doc.customerWorksite?.id ?? undefined,
          notes: doc.notes ?? undefined,
          recipientPhone: doc.recipientPhone ?? undefined,
          items: [
            ...doc.items.filter((item) => item.assetId !== motor.assetId).map((item) => ({
              skuId: item.assetId ? undefined : item.skuId ?? undefined,
              assetId: item.assetId ?? undefined,
              componentParentAssetId: item.componentParentAssetId ?? undefined,
              quantity: item.assetId ? undefined : Number(item.quantity ?? 1) || 1,
              ownerWarehouseId: item.condition ?? undefined,
              requestedTag: item.requestedTag ?? undefined,
              conditionNote: item.conditionNote ?? undefined,
            })),
            { assetId: motor.assetId, componentParentAssetId: mixer.assetId, ownerWarehouseId },
          ],
        },
      });
      setMotorRecovery(null);
      await api(`/documents/${doc.id}/decision`, {
        method: 'POST',
        json: { action: 'APPROVE' },
      });
      await reloadDocumentOnly();
      router.refresh();
    } catch (recoveryError) {
      setMotorRecoveryError(recoveryError instanceof Error ? recoveryError.message : 'No se pudo guardar el motor seleccionado.');
    } finally {
      setMotorRecoveryLoading(false);
    }
  };

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
    doc: DocumentDetail,
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
    } catch (err) {
      if (err instanceof ApiError) {
        setCreateSerialError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setCreateSerialError(err.message);
      } else {
        setCreateSerialError('Error creating equipment.');
      }
    } finally {
      setCreateSerialSaving(false);
    }
  };

  const selectProviderRemission = (providerWarehouseId: string, file: File | null) => {
    setProviderRemissionDrafts((current) => {
      const previous = current[providerWarehouseId];
      if (previous) URL.revokeObjectURL(previous.previewUrl);
      if (!file) {
        const next = { ...current };
        delete next[providerWarehouseId];
        return next;
      }
      return {
        ...current,
        [providerWarehouseId]: {
          file,
          previewUrl: URL.createObjectURL(file),
        },
      };
    });
  };

  const clearProviderRemissionModal = () => {
    Object.values(providerRemissionDraftsRef.current).forEach((draft) =>
      URL.revokeObjectURL(draft.previewUrl),
    );
    setProviderRemissionDrafts({});
    setProviderRemissionRequirements(null);
    setProviderRemissionError(null);
  };

  const missingProvidersFromError = (err: unknown) => {
    if (!(err instanceof ApiError) || !err.data || typeof err.data !== 'object') {
      return null;
    }
    const response = err.data as Record<string, unknown>;
    const payload =
      response.message && typeof response.message === 'object'
        ? (response.message as Record<string, unknown>)
        : response;
    if (payload.code !== 'PROVIDER_REMISSION_REQUIRED' || !Array.isArray(payload.providers)) {
      return null;
    }
    return payload.providers as ProviderRemissionRequirement[];
  };

  const approveWithDecision = async (docId: string) => {
    setDecisionLoading('APPROVE');
    setError(null);
    try {
      const requirements = await api<ProviderRemissionRequirements>(
        `/documents/${docId}/provider-remission-requirements`,
        { method: 'GET' },
      );
      if (requirements.missingProviders.length) {
        setProviderRemissionRequirements(requirements);
        setProviderRemissionError(null);
        return false;
      }
      await api(`/documents/${docId}/decision`, {
        method: 'POST',
        json: { action: 'APPROVE' },
      });
      await reloadDocumentOnly();
      router.refresh();
      return true;
    } catch (err) {
      const missingProviders = missingProvidersFromError(err);
      if (missingProviders?.length) {
        setProviderRemissionRequirements({
          required: true,
          providers: missingProviders,
          missingProviders,
        });
        setProviderRemissionError(null);
        return false;
      }
      handleApprovalError(err);
      return false;
    } finally {
      setDecisionLoading(null);
    }
  };

  const uploadProviderRemissionsAndApprove = async () => {
    if (!document?.id || !providerRemissionRequirements) return;
    const missingFile = providerRemissionRequirements.missingProviders.find(
      (provider) => !providerRemissionDrafts[provider.providerWarehouseId],
    );
    if (missingFile) {
      setProviderRemissionError(`Adjunta la remisión física de ${missingFile.providerName}.`);
      return;
    }

    setProviderRemissionUploading(true);
    setProviderRemissionError(null);
    try {
      await Promise.all(
        providerRemissionRequirements.missingProviders.map((provider) => {
          const draft = providerRemissionDrafts[provider.providerWarehouseId];
          const formData = new FormData();
          formData.append('category', 'COMPROBANTE_SALIDA_PROVEEDOR');
          formData.append('displayName', `Remisión física de ${provider.providerName}`);
          formData.append('providerWarehouseId', provider.providerWarehouseId);
          formData.append('files', draft.file);
          return api(`/files/entities/DOCUMENT/${document.id}`, {
            method: 'POST',
            body: formData,
          });
        }),
      );
      const approved = await approveWithDecision(document.id);
      if (approved) clearProviderRemissionModal();
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

  const decideDocument = async (action: 'APPROVE' | 'REJECT') => {
    if (!document?.id) return;
    if (action === 'REJECT') {
      const reason = window.prompt('Motivo de rechazo (opcional):') ?? undefined;
      if (!window.confirm('¿Rechazar esta solicitud?')) return;
      setDecisionLoading('REJECT');
      setError(null);
      try {
        await api(`/documents/${document.id}/decision`, {
          method: 'POST',
          json: {
            action,
            reason,
          },
        });
        await reloadDocumentOnly();
        router.refresh();
      } catch (err) {
        if (err instanceof ApiError) {
          setError(`${err.status}: ${err.message}`);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Error procesando la solicitud');
        }
      } finally {
        setDecisionLoading(null);
      }
      return;
    }

    try {
      const doc = await api<DocumentDetail>(`/documents/${document.id}`, { method: 'GET' });
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

      if (!window.confirm('Approve this request and execute the inventory movement?')) return;
      await approveWithDecision(document.id);
    } catch (err) {
      handleApprovalError(err);
    }
  };

  const resendFinalCustomerEmail = async () => {
    if (!document?.id) return;
    if (!window.confirm('¿Reenviar el correo final de este documento al cliente?')) return;

    setEmailRetryLoading(true);
    setEmailRetryMessage(null);
    setError(null);
    try {
      const result = await api<{ sent: boolean; reason?: string }>(
        `/documents/${document.id}/customer-email/final`,
        { method: 'POST' },
      );
      if (!result.sent) {
        throw new Error(
          result.reason === 'already-sent'
            ? 'El correo final ya había sido enviado.'
            : `No se pudo reenviar el correo final${result.reason ? `: ${result.reason}` : '.'}`,
        );
      }
      setEmailRetryMessage('Correo final enviado correctamente.');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('No se pudo reenviar el correo final.');
      }
    } finally {
      setEmailRetryLoading(false);
    }
  };

  const resolveAndApprove = async () => {
    if (!resolveDocument) return;
    const unresolved = resolveDocument.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => isResolvePendingItem(item));

    const missing = unresolved.filter(({ index }) => !resolveSkuByIndex[index]);
    if (missing.length > 0) {
      setError('Resuelve todos los tags pendientes antes de aprobar.');
      return;
    }

    const serialMissingAsset = unresolved.filter(({ item, index }) => {
      const skuId = resolveSkuByIndex[index];
      const sku = skuOptions.find((entry) => entry.id === skuId);
      if (sku?.controlType !== 'SERIAL') return false;
      return !resolveAssetByIndex[index];
    });
    if (serialMissingAsset.length > 0) {
      setError('Falta seleccionar o crear el equipo para uno o más tags seriales.');
      return;
    }

    setResolvingApprove(true);
    setError(null);
    try {
      const itemsPayload = resolveDocument.items.map((item, index) => {
        const ownerWarehouseId = item.condition ?? undefined;
        if (item.assetId) {
          return {
            assetId: item.assetId,
            componentParentAssetId: item.componentParentAssetId ?? undefined,
            ownerWarehouseId,
            conditionNote: item.conditionNote ?? undefined,
          };
        }
        if (item.skuId && !item.assetId) {
          const existingSku = skuOptions.find((entry) => entry.id === item.skuId);
          if (existingSku?.controlType === 'SERIAL') {
            return {
              assetId: resolveAssetByIndex[index],
              componentParentAssetId: item.componentParentAssetId ?? undefined,
              ownerWarehouseId,
              requestedTag: item.requestedTag ?? undefined,
              conditionNote: item.conditionNote ?? undefined,
            };
          }
        }
        if (item.skuId) {
          return {
            skuId: item.skuId,
            componentParentAssetId: item.componentParentAssetId ?? undefined,
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
            componentParentAssetId: item.componentParentAssetId ?? undefined,
            ownerWarehouseId,
            requestedTag: item.requestedTag ?? undefined,
            conditionNote: item.conditionNote ?? undefined,
          };
        }
        return {
          skuId: resolvedSkuId,
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

  return (
    <main>
      <Container
        size="lg"
        py="xl"
        className={`${styles.printContainer}${printAudience === 'customer' ? ` ${styles.customerCopy}` : ''}`}
      >
        <ActionIcon
          variant="light"
          size="lg"
          mb="sm"
          aria-label="Volver"
          onClick={() => {
            if (isDriverRole) {
              router.push('/transport/requests');
              return;
            }
            router.back();
          }}
          className={styles.noPrint}
        >
          <IconArrowLeft size={18} />
        </ActionIcon>
        <Paper
          shadow="sm"
          p={{ base: 'md', sm: 'xl' }}
          radius="md"
          withBorder
          className={styles.noPrint}
        >
          <Group justify="space-between" className="mobile-stack">
            <div>
              <Title order={2}>{title}</Title>
              <Text c="dimmed">
                Estado: {document?.status ?? '-'} | Creado: {document ? formatDate(document.createdAt) : '-'}
              </Text>
            </div>
            <Group>
              {canDecide && document?.status === 'DRAFT' ? (
                <>
                  <Button
                    color="green"
                    loading={decisionLoading === 'APPROVE'}
                    onClick={() => void decideDocument('APPROVE')}
                  >
                    Aprobar
                  </Button>
                  <Button
                    color="red"
                    variant="light"
                    loading={decisionLoading === 'REJECT'}
                    onClick={() => void decideDocument('REJECT')}
                  >
                    Rechazar
                  </Button>
                </>
              ) : null}
              {canDecide && document?.status === 'CONFIRMED' ? (
                <Button
                  variant="light"
                  loading={emailRetryLoading}
                  onClick={() => void resendFinalCustomerEmail()}
                >
                  Reenviar correo final
                </Button>
              ) : null}
              <Button
                variant="light"
                onClick={() => exportPdf('internal')}
                disabled={!document}
              >
                PDF interno
              </Button>
              <Button onClick={() => exportPdf('customer')} disabled={!document}>
                PDF para cliente
              </Button>
            </Group>
          </Group>

          {document?.recipientPhone || document?.messageDeliveries?.length ? (
            <Paper withBorder radius="md" p="sm" mt="md" bg="green.0">
              <Group align="flex-start" wrap="nowrap">
                <ThemeIcon color="green" variant="light" radius="xl">
                  <IconBrandWhatsapp size={17} />
                </ThemeIcon>
                <Stack gap={6} style={{ minWidth: 0 }}>
                  <Text fw={700} size="sm">Copia por WhatsApp</Text>
                  {document.messageDeliveries?.length ? (
                    document.messageDeliveries.map((delivery) => {
                      const deliveryStatus = whatsappDeliveryStatus(delivery.status);
                      return (
                        <Group key={delivery.id} gap="xs" wrap="wrap">
                          <Text size="sm" fw={600}>{formatWhatsappPhone(delivery.phone)}</Text>
                          <Badge size="sm" variant="light" color={deliveryStatus.color}>
                            {deliveryStatus.label}
                          </Badge>
                          {delivery.sentAt ? (
                            <Text size="xs" c="dimmed">{formatDateTime(delivery.sentAt)}</Text>
                          ) : null}
                        </Group>
                      );
                    })
                  ) : (
                    <Group gap="xs" wrap="wrap">
                      <Text size="sm" fw={600}>{formatWhatsappPhone(document.recipientPhone ?? '')}</Text>
                      <Badge size="sm" variant="light" color="yellow">Sin registro de entrega</Badge>
                    </Group>
                  )}
                </Stack>
              </Group>
            </Paper>
          ) : null}

          {loading ? <Text mt="md">Cargando...</Text> : null}
          {error ? (
            <Text c="red" mt="md">
              {error}
            </Text>
          ) : null}
          {emailRetryMessage ? (
            <Text c="green" mt="md">
              {emailRetryMessage}
            </Text>
          ) : null}
          {document?.type === 'RETURN' ? (
            <Paper withBorder p={{ base: 'sm', sm: 'md' }} mt="md" className={styles.billingSection}>
              <Title order={5}>Corte de items</Title>
              <div className={styles.desktopBillingTable}>
                <Table.ScrollContainer minWidth={820} mt="sm">
                  <Table striped>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Item</Table.Th>
                        <Table.Th>Cantidad</Table.Th>
                        <Table.Th>Fecha de corte</Table.Th>
                        <Table.Th>Fecha real de devolución</Table.Th>
                        <Table.Th>Estado</Table.Th>
                        {canDecide ? <Table.Th ta="right">Acciones</Table.Th> : null}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {document.items.map((item) => {
                        const cutoffDate = getEffectiveBillingCutoffDate(item);
                        const billingStatus = getEffectiveBillingStatus(item);
                        return (
                          <Table.Tr key={`billing-${item.id}`}>
                            <Table.Td>
                              <Text>{describeItem(item)}</Text>
                              {item.conditionNote ? (
                                <Text size="xs" c="red">
                                  Averia: {item.conditionNote}
                                </Text>
                              ) : null}
                            </Table.Td>
                            <Table.Td>{displayQuantity(item.quantity)}</Table.Td>
                            <Table.Td>{cutoffDate ? formatDate(cutoffDate) : '-'}</Table.Td>
                            <Table.Td>{item.returnedAt ? formatDate(item.returnedAt) : '-'}</Table.Td>
                            <Table.Td>
                              <Badge size="sm" variant="light" color={billingStatusColor(billingStatus)}>
                                {formatBillingStatus(billingStatus)}
                              </Badge>
                            </Table.Td>
                            {canDecide ? (
                              <Table.Td>
                                <TableRowActions
                                  actions={[
                                    {
                                      key: 'cutoff',
                                      label: `Definir corte de ${describeItem(item)}`,
                                      icon: <IconCalendar size={16} />,
                                      color: 'blue',
                                      onClick: () => openBillingModal(item),
                                    },
                                  ]}
                                />
                              </Table.Td>
                            ) : null}
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </div>
              <Stack gap="sm" mt="sm" className={styles.mobileBillingList}>
                {document.items.map((item) => {
                  const cutoffDate = getEffectiveBillingCutoffDate(item);
                  const billingStatus = getEffectiveBillingStatus(item);
                  return (
                    <Paper key={`billing-mobile-${item.id}`} withBorder radius="md" p="sm">
                      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
                        <Text fw={700} size="sm" className={styles.mobileItemName}>
                          {describeItem(item)}
                        </Text>
                        {canDecide ? (
                          <TableRowActions
                            actions={[
                              {
                                key: 'cutoff',
                                label: `Definir corte de ${describeItem(item)}`,
                                icon: <IconCalendar size={16} />,
                                color: 'blue',
                                onClick: () => openBillingModal(item),
                              },
                            ]}
                          />
                        ) : null}
                      </Group>
                      {item.conditionNote ? (
                        <Text size="xs" c="red" mt={4}>
                          Avería: {item.conditionNote}
                        </Text>
                      ) : null}
                      <SimpleGrid cols={2} spacing="xs" mt="sm">
                        <div>
                          <Text size="xs" c="dimmed">Cantidad</Text>
                          <Text size="sm" fw={600}>{displayQuantity(item.quantity)}</Text>
                        </div>
                        <div>
                          <Text size="xs" c="dimmed">Estado</Text>
                          <Badge size="sm" variant="light" color={billingStatusColor(billingStatus)}>
                            {formatBillingStatus(billingStatus)}
                          </Badge>
                        </div>
                        <div>
                          <Text size="xs" c="dimmed">Fecha de corte</Text>
                          <Text size="sm">{cutoffDate ? formatDate(cutoffDate) : '-'}</Text>
                        </div>
                        <div>
                          <Text size="xs" c="dimmed">Devolución real</Text>
                          <Text size="sm">{item.returnedAt ? formatDate(item.returnedAt) : '-'}</Text>
                        </div>
                      </SimpleGrid>
                    </Paper>
                  );
                })}
              </Stack>
            </Paper>
          ) : null}
          {evidenceFiles.length ? (
            <Paper withBorder p="md" mt="md">
              <Title order={5}>Evidencias visuales</Title>
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm" mt="sm">
                {evidenceFiles.map((file, index) => (
                  <a
                    key={file.id}
                    href={file.storageKey}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                  >
                    <Paper withBorder radius="md" p={6}>
                      <img
                        src={file.storageKey}
                        alt={`Evidencia ${index + 1}`}
                        style={{
                          width: '100%',
                          aspectRatio: '4 / 3',
                          objectFit: 'cover',
                          borderRadius: 6,
                          display: 'block',
                        }}
                      />
                      <Text size="xs" c="dimmed" mt={4}>
                        {formatDateTime(file.createdAt)}
                      </Text>
                    </Paper>
                  </a>
                ))}
              </SimpleGrid>
            </Paper>
          ) : null}
        </Paper>

        {document ? (
          linePages.map((lines, pageIndex) => (
          <div
            key={`${document.id}-page-${pageIndex + 1}`}
            className={`${styles.sheet}${pageIndex < linePages.length - 1 ? ` ${styles.pageBreakAfter}` : ''}`}
          >
            <header className={styles.header}>
              <div>
                <div className={styles.logoWrap}>
                  <Image
                    src="/rev-logo-clean.svg"
                    alt="Renta Equipos del Valle"
                    width={240}
                    height={74}
                    className={styles.logoImage}
                    style={{ height: 'auto' }}
                    priority
                  />
                </div>
                <div className={styles.company}>RENTA EQUIPOS DEL VALLE S.A.S</div>
                <div className={styles.meta}>
                  NIT 901.062.058-0 | Cra. 22 No. 5A-07 B/ Alameda | 310 533 2297
                </div>
              </div>
              <div className={styles.statusBox}>
                <div className={styles.statusLine}>
                  <span className={styles.checkbox}>{isRemission ? 'X' : ''}</span> REMISION
                </div>
                <div className={styles.statusLine}>
                  <span className={styles.checkbox}>{isReturn ? 'X' : ''}</span> DEVOLUCION
                </div>
                <div className={styles.statusLine}>
                  <span className={styles.checkbox}>{isChange ? 'X' : ''}</span> CAMBIO
                </div>
              </div>
            </header>

            <div className={styles.topRow}>
              <div>
                <strong>Fecha:</strong>{' '}
                {formatDocumentDateTime(document.docDate, document.createdAt)}
              </div>
              <div>
                <strong>Consecutivo:</strong> {title}
                {linePages.length > 1 ? ` | Página ${pageIndex + 1} de ${linePages.length}` : ''}
              </div>
            </div>

            <section className={styles.block}>
              <div className={styles.blockTitle}>INFORMACION DE CLIENTE</div>
              <div className={styles.grid2}>
                <div>
                  <strong>Razon social:</strong> {document.customerWorksite?.customer?.name ?? '-'}
                </div>
                <div>
                  <strong>Obra:</strong> {document.customerWorksite?.worksite?.name ?? '-'}
                </div>
                <div>
                  <strong>Direccion de entrega:</strong>{' '}
                  {document.customerWorksite?.worksite?.address ?? '-'}
                </div>
                <div>
                  <strong>Bodega:</strong> {document.warehouse?.name ?? '-'}
                </div>
              </div>
            </section>

            <section className={styles.block}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: '12%' }}>CANTIDAD</th>
                    <th>DESCRIPCION</th>
                    <th style={{ width: '10%' }}># EQ</th>
                    <th className={styles.originColumn} style={{ width: '20%' }}>ORIGEN</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={`${line.desc}-${idx}`}>
                      <td>{line.qty > 0 ? line.qty : ''}</td>
                      <td>{line.desc}</td>
                      <td>{line.eq}</td>
                      <td className={styles.originColumn}>{line.origin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className={styles.termsBlock}>
              <div className={styles.termsTitle}>TERMINOS Y CONDICIONES DEL CONTRATO DE ALQUILER DE EQUIPOS</div>
              <div className={styles.termsText}>{TERMS_TEXT}</div>
            </section>

            <section className={styles.block}>
              <div className={styles.blockTitle}>OBSERVACIONES</div>
              <div className={styles.observations}>
                {observationText || 'Sin observaciones.'}
                {parsedNotes.deliveryMode ? ` | Entrega: ${parsedNotes.deliveryMode}` : ''}
                {parsedNotes.vehicleId ? ` | Vehiculo: ${vehicleDisplay}` : ''}
                {parsedNotes.driverId ? ` | Conductor: ${driverDisplay}` : ''}
                {parsedNotes.receiverId ? ` | Recibido por: ${receiverDisplay}` : ''}
                {parsedNotes.dispatcherId ? ` | Despachador: ${dispatcherDisplay}` : ''}
                {parsedNotes.cutOffDate ? ` | Fecha corte: ${parsedNotes.cutOffDate}` : ''}
              </div>
            </section>

            <section className={styles.signatures}>
              <div>ELABORADO POR<br />{document.creator?.name ?? document.creator?.email ?? '-'}</div>
              <div>TRANSPORTADO POR<br />{transportadoPorDisplay}</div>
              <div>
                ENTREGADO POR
                <br />
                {isReturn ? (
                  hasRenderableSignature ? (
                    <img
                      src={receivedSignature ?? undefined}
                      alt="Firma de quien entrega"
                      className={styles.signatureImage}
                    />
                  ) : (
                    '_____________________'
                  )
                ) : deliveredByDisplay}
              </div>
              <div>
                RECIBIDO POR
                <br />
                {isReturn ? (
                  receiverDisplay
                ) : hasRenderableSignature ? (
                  <img
                    src={receivedSignature ?? undefined}
                    alt="Firma de recibido"
                    className={styles.signatureImage}
                  />
                ) : (
                  '_____________________'
                )}
              </div>
            </section>
          </div>
          ))
        ) : null}
      </Container>
      <Modal
        opened={Boolean(providerRemissionRequirements)}
        onClose={() => {
          if (!providerRemissionUploading) clearProviderRemissionModal();
        }}
        title="Remisión física requerida"
        centered
        size="lg"
        closeOnClickOutside={!providerRemissionUploading}
        closeOnEscape={!providerRemissionUploading}
      >
        <Stack gap="md">
          <Alert color="orange" variant="light">
            No puedes aprobar esta solicitud hasta adjuntar una remisión física por cada
            proveedor pendiente.
          </Alert>
          {(providerRemissionRequirements?.missingProviders ?? []).map((provider) => {
            const draft = providerRemissionDrafts[provider.providerWarehouseId];
            return (
              <Paper key={provider.providerWarehouseId} withBorder radius="md" p="md">
                <Stack gap="sm">
                  <div>
                    <Text fw={700}>{provider.providerName}</Text>
                    <Text size="sm" c="dimmed">
                      Tienes {provider.quantity} item{provider.quantity === 1 ? '' : 's'} de este
                      proveedor
                      {provider.itemCount !== provider.quantity
                        ? ` en ${provider.itemCount} línea${provider.itemCount === 1 ? '' : 's'}`
                        : ''}
                      .
                    </Text>
                  </div>
                  <FileInput
                    label={`Remisión física de ${provider.providerName}`}
                    placeholder="Tomar o seleccionar foto"
                    accept="image/png,image/jpeg,image/webp"
                    capture="environment"
                    clearable
                    value={draft?.file ?? null}
                    onChange={(file) =>
                      selectProviderRemission(provider.providerWarehouseId, file)
                    }
                    leftSection={<IconCamera size={16} />}
                  />
                  {draft ? (
                    <img
                      src={draft.previewUrl}
                      alt={`Remisión física de ${provider.providerName}`}
                      style={{
                        width: '100%',
                        maxWidth: 360,
                        aspectRatio: '4 / 3',
                        objectFit: 'cover',
                        borderRadius: 8,
                      }}
                    />
                  ) : null}
                </Stack>
              </Paper>
            );
          })}
          {providerRemissionError ? (
            <Alert color="red" variant="light">
              {providerRemissionError}
            </Alert>
          ) : null}
          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={providerRemissionUploading}
              onClick={clearProviderRemissionModal}
            >
              Cancelar
            </Button>
            <Button
              loading={providerRemissionUploading}
              onClick={() => void uploadProviderRemissionsAndApprove()}
            >
              Subir y aprobar
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={billingModalOpen}
        onClose={() => {
          if (billingLoading) return;
          setBillingModalOpen(false);
        }}
        title="Definir corte por item"
        centered
      >
        <Stack gap="sm">
          <Text size="sm" fw={600}>
            {selectedBillingItem ? describeItem(selectedBillingItem) : '-'}
          </Text>
          <TextInput
            label="Fecha de corte (opcional)"
            value={billingCutoffDate ? toDisplayDateInput(billingCutoffDate) : ''}
            placeholder="dd/mm/aaaa"
            readOnly
            rightSection={
              <ActionIcon
                variant="subtle"
                aria-label="Seleccionar fecha de corte"
                onClick={() => billingCutoffPickerRef.current?.showPicker?.()}
              >
                <IconCalendar size={16} />
              </ActionIcon>
            }
          />
          <input
            ref={billingCutoffPickerRef}
            type="date"
            value={billingCutoffDate}
            onChange={(event) => setBillingCutoffDate(event.currentTarget.value)}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
            tabIndex={-1}
            aria-hidden="true"
          />
          <Button
            variant="light"
            leftSection={<IconCopy size={16} />}
            onClick={applyBillingCutoffToAll}
            loading={billingLoading}
            disabled={!billingCutoffDate}
            fullWidth
          >
            Aplicar esta fecha a los {document?.items.length ?? 0} ítems
          </Button>
          <Text size="xs" c="dimmed">
            Replica únicamente la fecha de corte. Las fechas reales de devolución y las notas se conservan.
          </Text>
          <TextInput
            label="Fecha real de devolución (opcional)"
            value={billingReturnedAt ? toDisplayDateInput(billingReturnedAt) : ''}
            placeholder="dd/mm/aaaa"
            readOnly
            rightSection={
              <ActionIcon
                variant="subtle"
                aria-label="Seleccionar fecha real de devolucion"
                onClick={() => billingReturnedPickerRef.current?.showPicker?.()}
              >
                <IconCalendar size={16} />
              </ActionIcon>
            }
          />
          <input
            ref={billingReturnedPickerRef}
            type="date"
            value={billingReturnedAt}
            onChange={(event) => setBillingReturnedAt(event.currentTarget.value)}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
            tabIndex={-1}
            aria-hidden="true"
          />
          <TextInput
            label="Nota (opcional)"
            value={billingNote}
            onChange={(event) => setBillingNote(event.currentTarget.value)}
          />
          {billingError ? <Text c="red">{billingError}</Text> : null}
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setBillingModalOpen(false)}
              disabled={billingLoading}
            >
              Cancelar
            </Button>
            <Button onClick={saveBilling} loading={billingLoading}>
              Guardar
            </Button>
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
              'Primero ajusta el stock de la bodega antes de hacer movimientos.'}
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
                            The tag requests #{expectedInternal}, but it does not exist in that warehouse.
                          </Text>
                        ) : null}
                        {!serialOptions.length || (expectedInternal != null && !hasExpected) ? (
                          <Button size="xs" variant="light" onClick={() => openCreateSerialForRow(index)}>
                            Crear equipo faltante
                          </Button>
                        ) : null}
                      </Stack>
                    );
                  })()}
                </Stack>
              </Paper>
            ))}

          <Group justify="flex-end">
            <Button variant="default" onClick={closeResolveModal} disabled={resolvingApprove}>
              Cancelar
            </Button>
            <Button onClick={resolveAndApprove} loading={resolvingApprove}>
              Resolver y aprobar
            </Button>
          </Group>
        </Stack>
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
    </main>
  );
}
