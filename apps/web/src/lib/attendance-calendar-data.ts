import { api } from "./api";
import { attendanceMonthRange } from "./attendance-calendar";
import { workScheduleError, type WorkScheduleResponse } from "./work-schedule";
import type {
  AttendanceEmployee,
  AttendanceJournal,
} from "@/app/employees/attendance/components/attendance-types";

export async function loadAttendanceCalendar(
  employeeId: string,
  month: string,
  signal: AbortSignal,
  identity?: Pick<AttendanceEmployee, "id" | "name" | "lastName">,
) {
  signal.throwIfAborted();
  const query = new URLSearchParams(attendanceMonthRange(month));
  const [employees, settings, journals] = await Promise.all([
    identity
      ? Promise.resolve({ employees: [identity] })
      : api<{ employees: AttendanceEmployee[] }>(
          `/whatsapp-reports/attendance/employees?${query}`,
          { signal },
        ),
    api<WorkScheduleResponse>("/settings/work-schedule", { signal }),
    loadJournals(employeeId, query, signal),
  ]);
  const validation = workScheduleError(settings.schedule);
  if (validation) throw new Error(validation);
  const employee = employees.employees.find((item) => item.id === employeeId);
  if (!employee)
    throw new Error("No se encontró el empleado en la consulta de asistencia.");
  return { employee, schedule: settings.schedule, journals };
}

async function loadJournals(
  employeeId: string,
  query: URLSearchParams,
  signal: AbortSignal,
) {
  const rows = new Map<string, AttendanceJournal>();
  const visited = new Set<string>();
  let cursor: string | null = null;
  do {
    signal.throwIfAborted();
    const params = new URLSearchParams(query);
    if (cursor) params.set("cursor", cursor);
    const result = await api<{
      journals: AttendanceJournal[];
      nextCursor: string | null;
    }>(
      `/whatsapp-reports/attendance/employees/${encodeURIComponent(employeeId)}?${params}`,
      { signal },
    );
    for (const journal of result.journals) rows.set(journal.id, journal);
    cursor = result.nextCursor;
    if (cursor && visited.has(cursor))
      throw new Error(
        "No se pudo completar la carga del mes. Intenta de nuevo.",
      );
    if (cursor) visited.add(cursor);
  } while (cursor);
  return [...rows.values()];
}
