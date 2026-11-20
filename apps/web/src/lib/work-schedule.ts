export type WorkPeriod = { start: string; end: string };
export type WorkSchedule = {
  days: { dayOfWeek: number; periods: WorkPeriod[] }[];
};
export type WorkScheduleResponse = {
  schedule: WorkSchedule;
  timeZone: string;
  updatedAt: string | null;
};
export const WORK_DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

export function workScheduleError(schedule: WorkSchedule): string | null {
  if (
    !Array.isArray(schedule?.days) ||
    schedule.days.length !== 7 ||
    new Set(schedule.days.map((day) => day.dayOfWeek)).size !== 7
  )
    return "No se pudo leer el horario semanal.";
  for (const day of schedule.days) {
    if (
      !Number.isInteger(day.dayOfWeek) ||
      day.dayOfWeek < 1 ||
      day.dayOfWeek > 7 ||
      !Array.isArray(day.periods) ||
      day.periods.length > 2
    )
      return "El horario contiene un día inválido.";
    let previousEnd = "";
    for (const period of day.periods) {
      if (
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(period.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(period.end)
      )
        return `${WORK_DAYS[day.dayOfWeek - 1]}: completa las horas de entrada y salida.`;
      if (period.start >= period.end || period.start < previousEnd)
        return `${WORK_DAYS[day.dayOfWeek - 1]}: revisa el orden de las franjas; no pueden cruzarse.`;
      previousEnd = period.end;
    }
  }
  return null;
}

export function workScheduleMinutes(schedule: WorkSchedule): number {
  const minutes = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  return schedule.days.reduce(
    (total, day) =>
      total +
      day.periods.reduce(
        (sum, period) => sum + minutes(period.end) - minutes(period.start),
        0,
      ),
    0,
  );
}
