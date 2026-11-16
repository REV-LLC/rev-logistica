export type AttendanceSite = {
  id: string;
  alias: string | null;
  customer: { name: string };
  worksite: {
    id: string;
    name: string;
    attendanceLatitude: number | null;
    attendanceLongitude: number | null;
    attendanceRadiusMeters: number;
  };
};
export type AttendancePunch = {
  id: string;
  kind: string;
  status: string;
  reasons: string[];
  occurredAt: string;
  similarity: number | null;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  distanceMeters: number | null;
  reviewNote: string | null;
  employee: { name: string; lastName: string };
  customerWorksite: AttendanceSite;
};
export type AttendanceShift = {
  id: string;
  enteredAt: string;
  leftAt: string | null;
  employee: { name: string; lastName: string };
  customerWorksite: AttendanceSite;
};
export const statusLabels: Record<string, string> = {
  VERIFIED: "Verificada",
  PENDING: "Pendiente de revisión",
  APPROVED: "Aprobada por oficina",
  REJECTED: "Rechazada por oficina",
};
export const reasonLabels: Record<string, string> = {
  NO_APPROVED_REFERENCE: "Sin referencia facial compatible aprobada",
  FACE_MISMATCH: "El rostro no coincidió",
  WORKSITE_LOCATION_MISSING: "Obra sin ubicación configurada",
  OUTSIDE_WORKSITE: "Fuera del radio de la obra",
  LOW_LOCATION_ACCURACY: "Ubicación poco precisa",
  FACE_SERVICE_UNAVAILABLE: "Servicio facial no disponible",
};
export function attendanceDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}
export function siteLabel(site: AttendanceSite) {
  return `${site.alias || site.worksite.name} · ${site.customer.name}`;
}
