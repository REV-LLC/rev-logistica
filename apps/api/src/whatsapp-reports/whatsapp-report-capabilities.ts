// Attendance is retired on WhatsApp by default. Historic records remain readable.
// Re-enabling this legacy channel requires an explicit server configuration change.
export const whatsappAttendanceEnabled = () =>
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
    .find((line) => line && !/^Hola(?:,| 👋)|^Foto recibida\./.test(line));
  return /^(Entrada a obra|Salida de obra)(?::|$)/.test(title ?? '');
}
