import { z } from 'zod';

export const extractionSchema = z.object({
  kind: z
    .enum(['DAMAGE', 'HOUR_METER', 'REQUEST', 'CHECK_IN', 'CHECK_OUT'])
    .nullable(),
  subjectType: z.enum(['ASSET', 'VEHICLE']).nullable(),
  subjectReference: z.string().max(160).nullable(),
  worksiteReference: z.string().max(160).nullable(),
  customerReference: z.string().max(160).nullable(),
  description: z.string().max(3000).nullable(),
  hours: z.number().finite().min(0).max(9999999999.99).nullable(),
  photoHours: z.number().finite().min(0).max(9999999999.99).nullable(),
});
export type Extraction = z.infer<typeof extractionSchema>;
export type EquipmentReference = { type: 'ASSET' | 'VEHICLE'; id: string };
export type EquipmentMenu = {
  token: string;
  kind: 'DAMAGE' | 'HOUR_METER';
  choices: EquipmentReference[];
  page: number;
  recent: boolean;
};
export type EquipmentReplyOptions =
  | {
      type: 'list';
      button: string;
      rows: { id: string; title: string; description?: string }[];
    }
  | { type: 'button'; buttons: { id: string; title: string }[] };
export const locationCoordinatesSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});
export const locationEvidenceSchema = locationCoordinatesSchema.extend({
  receivedAt: z.string().datetime(),
  sentAt: z.string().datetime(),
  sourceMessageId: z.string().min(1).max(250),
});
export type LocationEvidence = z.infer<typeof locationEvidenceSchema>;
export const isAttendance = (kind: Draft['kind']) =>
  kind === 'CHECK_IN' || kind === 'CHECK_OUT';
export type Draft = Extraction & {
  occurredAt: string;
  location?: LocationEvidence;
  evidenceFileIds: string[];
  sourceMessageIds: string[];
  ready?: boolean;
  targetKey?: string;
  menuStage?: 'ATTENDANCE';
  confirmationMessageId?: string;
  selectedWorksiteId?: string;
  worksiteMenu?: {
    token: string;
    page: number;
    choices: string[];
    suggested?: boolean;
  };
  selectedEquipment?: EquipmentReference;
  equipmentMenu?: EquipmentMenu;
};
export const emptyDraft = (): Draft => ({
  kind: null,
  subjectType: null,
  subjectReference: null,
  worksiteReference: null,
  customerReference: null,
  description: null,
  hours: null,
  photoHours: null,
  evidenceFileIds: [],
  sourceMessageIds: [],
  occurredAt: new Date().toISOString(),
});
export interface IncomingWhatsappMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string };
  location?: { latitude?: number; longitude?: number };
  interactive?: {
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
}
export function normalizePhone(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  let digits = value.replace(/[^0-9]/g, '');
  if (/^3\d{9}$/.test(digits)) digits = `57${digits}`;
  return /^\d{10,15}$/.test(digits) ? digits : null;
}
export function normalized(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
export const REPORT_LABELS = {
  DAMAGE: 'Daño',
  HOUR_METER: 'Horómetro',
  REQUEST: 'Petición',
  CHECK_IN: 'Entrada a obra',
  CHECK_OUT: 'Salida de obra',
};
export const HELP =
  'Puedes reportar:\n1. Daño de equipo o vehículo.\n2. Horómetro con foto.\n3. Petición para oficina y gerencia.\n4. Entrada o salida de obra con ubicación o foto (solo una).\nElige la máquina en la lista o escribe su nombre. Para asistencia, indica el nombre de la obra. Envía un reporte a la vez. Escribe CANCELAR para empezar de nuevo.';
