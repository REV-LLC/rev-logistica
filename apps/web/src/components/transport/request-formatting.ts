import { Employee } from './request-types';
export const getEmployeeFullName = (
  employee: Pick<Employee, 'name' | 'lastName'>,
) => `${employee.name} ${employee.lastName ?? ''}`.trim();

export const MAX_EVIDENCE_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

export const MAX_EVIDENCE_PHOTO_COUNT = 12;

export const ALLOWED_EVIDENCE_PHOTO_TYPES = new Set([
  'image/png',
  'image/webp',
  'image/jpeg',
]);

export const createSelectionId = () => globalThis.crypto.randomUUID();

export const buildBulkKey = (item: {
  skuId: string;
  ownerWarehouseId: string | null;
}) => `${item.skuId}::${item.ownerWarehouseId ?? 'none'}`;

export const normalizeTagBase = (value?: string | null) =>
  (value ?? '')
    .replace(/#\s*\d+\s*$/i, '')
    .trim()
    .toUpperCase();

export const parseInternalNumberFromTag = (value?: string | null) => {
  const match = (value ?? '').match(/#\s*(\d+)\s*$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export function withDocPrefix(value: string, docType: 'REMISSION' | 'RETURN') {
  const prefix = docType === 'REMISSION' ? 'RM' : 'DV';
  const cleaned = value.trim().replace(/^(RM|DV)[\s\-_]*/i, '');
  return `${prefix}${cleaned}`;
}

export function formatDocType(value: string) {
  return value === 'REMISSION' ? 'RM' : value === 'RETURN' ? 'DV' : value;
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-CO');
}

export function getTodayDateInput() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function requestTypeColor(type: string) {
  return type === 'REMISSION' ? 'green' : type === 'RETURN' ? 'red' : 'gray';
}

export const FUEL_OPTIONS = [
  { value: 'GASOLINA', label: 'Gasolina' },
  { value: 'DIESEL', label: 'Diesel' },
  { value: 'ELECTRICO', label: 'Electrico' },
];

export function normalizeQuantityInput(value: string | number, fallback = 1) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeLocalWhatsappPhone(value?: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (/^\d{10}$/.test(digits)) return digits;
  if (/^57\d{10}$/.test(digits)) return digits.slice(2);
  return null;
}

export function parseNotes(notes: string | null) {
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
    vehicleId: map.get('vehículo') ?? map.get('vehiculo') ?? '',
    driverId: map.get('conductor') ?? '',
    receiverId: map.get('recibe') ?? '',
    dispatcherId: map.get('despachador') ?? '',
  };
}

export const SYSTEM_NOTE_KEYS = new Set([
  'fecha documento',
  'fecha doc',
  'fecha corte',
  'document date',
  'cutoff date',
  'entrega',
  'vehicle',
  'vehiculo',
  'conductor',
  'driver',
  'recibe',
  'dispatcher',
  'despachador',
]);

export function normalizeNoteKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function extractUserObservations(notes: string | null) {
  if (!notes) return '';
  return notes
    .split('|')
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((part) => {
      const separatorIndex = part.indexOf(':');
      if (separatorIndex < 0) return true;
      return !SYSTEM_NOTE_KEYS.has(
        normalizeNoteKey(part.slice(0, separatorIndex)),
      );
    })
    .join(' | ');
}

export function buildRequestNotes({
  observations,
  documentTimestamp,
  docType,
  deliveryMode,
  vehicleId,
  driverId,
  dispatcherId,
}: {
  observations: string;
  documentTimestamp: string | null;
  docType: 'REMISSION' | 'RETURN';
  deliveryMode: 'WAREHOUSE' | 'ON_SITE';
  vehicleId: string | null;
  driverId: string | null;
  dispatcherId: string | null;
}) {
  return [
    observations.trim() || null,
    documentTimestamp ? `Fecha documento: ${documentTimestamp}` : null,
    `Entrega: ${deliveryMode}`,
    deliveryMode === 'ON_SITE' && vehicleId ? `Vehiculo: ${vehicleId}` : null,
    deliveryMode === 'ON_SITE' && driverId ? `Conductor: ${driverId}` : null,
    docType === 'RETURN' && driverId ? `Recibe: ${driverId}` : null,
    docType === 'REMISSION' && deliveryMode === 'WAREHOUSE' && dispatcherId
      ? `Despachador: ${dispatcherId}`
      : null,
  ]
    .filter(Boolean)
    .join(' | ');
}
