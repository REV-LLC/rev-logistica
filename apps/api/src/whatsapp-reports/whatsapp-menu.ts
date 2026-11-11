import type { Employee } from '@prisma/client';
import type { Draft, EquipmentReplyOptions } from './whatsapp-report.types';

export type WhatsappReplyKind =
  | 'TEXT'
  | 'REPORT_MENU'
  | 'ATTENDANCE_MENU'
  | 'CONFIRMATION'
  | 'EQUIPMENT_MENU';
export const REPORT_MENU_ROWS = [
  {
    id: 'report_damage',
    title: 'Reportar daño',
    description: 'Daño o falla de un equipo o vehículo',
  },
  {
    id: 'report_hour_meter',
    title: 'Reportar horómetro',
    description: 'Lectura de horas con foto de evidencia',
  },
  {
    id: 'report_request',
    title: 'Petición general',
    description: 'Solicitud para oficina y gerencia',
  },
  {
    id: 'report_attendance',
    title: 'Entrada o salida',
    description: 'Horario en obra con foto de evidencia',
  },
] as const;

export function employeeGreeting(employee: Pick<Employee, 'name'>) {
  const name = employee.name
    .replace(/[*_~`\r\n]/g, ' ')
    .trim()
    .slice(0, 80)
    .toLocaleLowerCase('es-CO')
    .replace(
      /(^|\s)(\p{L})/gu,
      (_, space: string, letter: string) =>
        space + letter.toLocaleUpperCase('es-CO'),
    );
  return name ? `Hola, ${name} 👋` : 'Hola 👋';
}
export function reportMenuText(
  employee: Pick<Employee, 'name'>,
  pending = false,
) {
  return `${employeeGreeting(employee)}\nSoy el asistente de REV Logística.\n${
    pending
      ? 'Tienes un reporte pendiente. Puedes seguir completándolo o elegir otra opción para iniciar uno nuevo.'
      : '¿Qué necesitas reportar?'
  }\nToca «Ver opciones» o escribe lo que necesitas.`;
}
export function isGreeting(command: string) {
  return /^(hola|buenas|buenos dias|buen dia|buenas tardes|buenas noches)( (bot|asistente))?$/.test(
    command,
  );
}
export function selectionKind(id: string): Draft['kind'] {
  return (
    (
      {
        report_damage: 'DAMAGE',
        report_hour_meter: 'HOUR_METER',
        report_request: 'REQUEST',
        attendance_check_in: 'CHECK_IN',
        attendance_check_out: 'CHECK_OUT',
      } as const
    )[id] ?? null
  );
}
export function selectionPrompt(id: string) {
  return (
    (
      {
        report_damage:
          'Elige la máquina y cuéntame qué daño encontraste. Puedes adjuntar fotos.',
        report_hour_meter:
          'Elige la máquina y envía una foto legible del horómetro. También puedes escribir cuántas horas marca.',
        report_request:
          'Cuéntame qué necesitas solicitar. Crearé la petición para oficina, gerencia y Héctor Ramírez cuando confirmes los datos.',
        attendance_check_in:
          'Vamos a registrar tu entrada. Indica el nombre de la obra y envía una foto de evidencia.',
        attendance_check_out:
          'Vamos a registrar tu salida. Indica el nombre de la obra y envía una foto de evidencia.',
      } as const
    )[id] ?? ''
  );
}

export function whatsappReplyPayload(
  phone: string,
  text: string,
  kind: string = 'TEXT',
  confirmationMessageId?: string,
  options?: EquipmentReplyOptions,
) {
  const base = { messaging_product: 'whatsapp', to: phone };
  if (kind === 'EQUIPMENT_MENU' && options) {
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: options.type,
        body: { text: text.slice(0, 1024) },
        action:
          options.type === 'list'
            ? {
                button: options.button,
                sections: [
                  { title: 'Máquinas disponibles', rows: options.rows },
                ],
              }
            : {
                buttons: options.buttons.map((reply) => ({
                  type: 'reply',
                  reply,
                })),
              },
      },
    };
  }
  if (kind === 'REPORT_MENU')
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: 'REV Logística' },
        body: { text: text.slice(0, 1024) },
        footer: { text: 'También puedes escribir MENÚ para volver.' },
        action: {
          button: 'Ver opciones',
          sections: [
            { title: '¿Qué deseas reportar?', rows: REPORT_MENU_ROWS },
          ],
        },
      },
    };
  const buttons =
    kind === 'ATTENDANCE_MENU'
      ? [
          { id: 'attendance_check_in', title: 'Registrar entrada' },
          { id: 'attendance_check_out', title: 'Registrar salida' },
        ]
      : kind === 'CONFIRMATION' && confirmationMessageId
        ? [
            {
              id: `report_confirm:${confirmationMessageId}`,
              title: 'Sí, registrar',
            },
            { id: 'report_cancel', title: 'Cancelar' },
          ]
        : null;
  if (buttons)
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: text.slice(0, 1024) },
        action: { buttons: buttons.map((reply) => ({ type: 'reply', reply })) },
      },
    };
  return { ...base, type: 'text', text: { body: text.slice(0, 4000) } };
}
