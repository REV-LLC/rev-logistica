import { attendanceJournalTiming } from "./attendance-journal-timing";
import type { AttendanceJournal } from "@/app/employees/attendance/components/attendance-types";
import type { WorkSchedule } from "./work-schedule";

export type AttendanceCalendarMode = "entry" | "exit";
export type AttendanceCalendarStatus =
  | "early"
  | "on-time"
  | "late"
  | "off"
  | "empty"
  | "review";
export type AttendanceCalendarEvent = {
  at: string;
  journal: AttendanceJournal;
  scheduledAt: string | null;
  difference: number | null;
  invalid: boolean;
};
export type AttendanceCalendarDay = {
  date: string;
  number: number;
  events: AttendanceCalendarEvent[];
  time: string | null;
  status: AttendanceCalendarStatus;
};
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Bogota",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export const attendanceCalendarDate = (value: string | Date) =>
  dateFormat.format(new Date(value));
export const attendanceCalendarTime = (value: string) =>
  timeFormat.format(new Date(value));
export const validAttendanceMonth = (month: string) =>
  /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month);
export function attendanceMonthRange(month: string) {
  if (!validAttendanceMonth(month))
    throw new Error("Selecciona un mes válido.");
  const first = new Date(`${month}-01T12:00:00Z`);
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  return { from: `${month}-01`, to: last.toISOString().slice(0, 10) };
}
export function shiftAttendanceMonth(month: string, amount: number) {
  attendanceMonthRange(month);
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}
const weekday = (date: string) =>
  new Date(`${date}T12:00:00Z`).getUTCDay() || 7;

export function attendanceCalendarDays(
  month: string,
  journals: AttendanceJournal[],
  schedule: WorkSchedule,
  mode: AttendanceCalendarMode,
): AttendanceCalendarDay[] {
  const range = attendanceMonthRange(month);
  const events = new Map<string, AttendanceCalendarEvent[]>();
  for (const journal of journals) {
    const timing = attendanceJournalTiming(journal);
    const at = mode === "entry" ? timing.enteredAt : timing.leftAt;
    if (!at || !Number.isFinite(Date.parse(at))) continue;
    const date = attendanceCalendarDate(at);
    if (date < range.from || date > range.to) continue;
    // Exits are placed on their actual day, but compared with their own shift.
    const shiftDate = attendanceCalendarDate(timing.enteredAt);
    const periods =
      schedule.days.find((day) => day.dayOfWeek === weekday(shiftDate))
        ?.periods ?? [];
    const planned = mode === "entry" ? periods[0]?.start : periods.at(-1)?.end;
    const scheduledAt = planned ? `${shiftDate}T${planned}:00-05:00` : null;
    const rows = events.get(date) ?? [];
    rows.push({
      at,
      journal,
      scheduledAt,
      difference: scheduledAt
        ? Math.floor((Date.parse(at) - Date.parse(scheduledAt)) / 60000)
        : null,
      invalid: Boolean(
        journal.activityNote?.sourceInvalidatedAt ||
        journal.checkInReport?.deletedAt ||
        journal.checkOutReport?.deletedAt ||
        journal.activityNote?.reviewStatus === "DISMISSED" ||
        (["CONFIRMED", "CORRECTED"].includes(
          journal.activityNote?.reviewStatus ?? "",
        ) &&
          (journal.activityNote?.reviewedSourceExitId ?? null) !==
            (journal.checkOutReportId ?? null)),
      ),
    });
    events.set(date, rows);
  }
  return Array.from({ length: Number(range.to.slice(-2)) }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, "0")}`;
    const rows = (events.get(date) ?? []).sort(
      (a, b) => Date.parse(a.at) - Date.parse(b.at),
    );
    const representative = mode === "entry" ? rows[0] : rows.at(-1);
    const periods =
      schedule.days.find((day) => day.dayOfWeek === weekday(date))?.periods ??
      [];
    let status: AttendanceCalendarStatus;
    if (rows.some((row) => row.invalid)) status = "review";
    else if (!representative) status = periods.length ? "empty" : "off";
    else if (representative.difference === null) status = "off";
    else if (mode === "entry")
      status =
        representative.difference < 0
          ? "early"
          : representative.difference >= 5
            ? "late"
            : "on-time";
    else
      status =
        representative.difference < 0
          ? "late"
          : representative.difference >= 5
            ? "early"
            : "on-time";
    return {
      date,
      number: index + 1,
      events: rows,
      time: representative ? attendanceCalendarTime(representative.at) : null,
      status,
    };
  });
}
export function attendanceCalendarStatusLabel(
  status: AttendanceCalendarStatus,
  mode: AttendanceCalendarMode,
) {
  return {
    early: mode === "entry" ? "Temprano" : "Después de la hora",
    "on-time": mode === "entry" ? "A tiempo" : "A la hora",
    late: mode === "entry" ? "Tarde" : "Antes de la hora",
    off: "Sin jornada laboral",
    empty: "Sin registro",
    review: "Por revisar",
  }[status];
}
