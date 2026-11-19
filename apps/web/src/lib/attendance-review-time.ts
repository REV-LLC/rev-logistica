export function attendanceLocalTime(value?: string | null): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function attendanceCorrectionIso(
  value: string,
  original?: string | null,
): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Selecciona una fecha y hora válidas.");
  const parsed = new Date(`${value}:00-05:00`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    attendanceLocalTime(parsed.toISOString()) !== value
  )
    throw new Error("Selecciona una fecha y hora válidas.");
  return original && attendanceLocalTime(original) === value
    ? original
    : parsed.toISOString();
}
