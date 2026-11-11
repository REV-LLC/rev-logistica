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
export type Draft = Extraction & {
  occurredAt: string;
  evidenceFileIds: string[];
  sourceMessageIds: string[];
  ready?: boolean;
  targetKey?: string;
  menuStage?: 'ATTENDANCE';
  confirmationMessageId?: string;
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
  'Puedes reportar:\n1. Daño de equipo o vehículo.\n2. Horómetro con foto.\n3. Petición para oficina y gerencia.\n4. Entrada o salida de obra con foto.\nEscribe lo que necesitas y el código del equipo, placa o nombre de la obra. Envía un reporte a la vez. Escribe CANCELAR para empezar de nuevo.';
