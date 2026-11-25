// Attendance is retired on WhatsApp by default. Historic records remain readable.
// Re-enabling this legacy channel requires an explicit server configuration change.
export const whatsappAttendanceEnabled = () =>
  extendedEmployeeReportsEnabled() &&
  process.env.WHATSAPP_ATTENDANCE_ENABLED === 'true';
export const ATTENDANCE_RETIRED_MESSAGE =
  'La entrada y salida ya no se registran por WhatsApp. Registra tu asistencia en MiREV: https://mirev.revcontractorsllc.com';
export function isAttendanceSelection(id: string | null | undefined) {
  return [
    'report_attendance',
    'attendance_check_in',
    'attendance_check_out',
  ].includes(id ?? '');
}
export function isAttendanceStart(command: string) {
  return /^(?:(?:registrar|reportar|marcar|registro|reporte|marcacion)\s+)?(?:mi\s+)?(?:entrada|salida)(?:\s|$)/.test(
    command,
  );
}

export function isRetiredAttendanceReply(kind: string, text: string) {
  if (kind === 'ATTENDANCE_MENU' || kind === 'WORKSITE_MENU') return true;
  if (kind !== 'CONFIRMATION') return false;
  const title = text
    .split('\n')
    .map((line) => line.trim())
    .find(
      (line) =>
        line &&
        !/^(?:Hola|Buenos días|Buenas tardes)(?:,| 👋)|^Foto recibida\./.test(
          line,
        ),
    );
  return /^(Entrada a obra|Salida de obra)(?::|$)/.test(title ?? '');
}

// Employee WhatsApp accepts requests only unless a legacy regression environment
// explicitly opts into the retired equipment flows. Historical data stays readable.
export const extendedEmployeeReportsEnabled = () =>
  process.env.WHATSAPP_EMPLOYEE_EXTENDED_REPORTS_ENABLED === 'true';
export const REQUESTS_ONLY_MESSAGE =
  'Por WhatsApp ahora solo recibimos peticiones de empleados. Cuéntame qué necesitas solicitar a oficina.';
export const isEquipmentReport = (kind: string | null | undefined) =>
  kind === 'DAMAGE' || kind === 'HOUR_METER';
export function isRetiredEquipmentReply(kind: string, text: string) {
  if (kind === 'EQUIPMENT_MENU') return true;
  if (
    kind === 'TEXT' &&
    /^(?:Máquina seleccionada:|Elige la máquina y|Cuántas horas marca)/.test(
      text,
    )
  )
    return true;
  if (kind !== 'CONFIRMATION') return false;
  const title = text
    .split('\n')
    .map((line) => line.trim())
    .find(
      (line) =>
        line &&
        !/^(?:Hola|Buenos días|Buenas tardes)(?:,| 👋)|^Foto recibida\./.test(
          line,
        ),
    );
  return /^(Daño|Horómetro)(?::|$)/.test(title ?? '');
}
