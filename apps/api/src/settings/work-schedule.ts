import { BadRequestException } from '@nestjs/common';

export type WorkPeriod = { start: string; end: string };
export type WorkSchedule = {
  days: { dayOfWeek: number; periods: WorkPeriod[] }[];
};
export const WORK_SCHEDULE_KEY = 'attendance.work_schedule';
export const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
  days: [
    {
      dayOfWeek: 1,
      periods: [
        { start: '07:00', end: '12:00' },
        { start: '13:00', end: '16:00' },
      ],
    },
    ...[2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      periods: [
        { start: '07:30', end: '12:00' },
        { start: '13:00', end: '16:00' },
      ],
    })),
    { dayOfWeek: 6, periods: [{ start: '07:00', end: '11:00' }] },
    { dayOfWeek: 7, periods: [] },
  ],
};

function record(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key)),
  );
}

export function validateWorkSchedule(
  value: unknown,
): asserts value is WorkSchedule {
  if (
    !record(value, ['days']) ||
    !Array.isArray(value.days) ||
    value.days.length !== 7
  )
    throw new BadRequestException(
      'El horario debe incluir los siete días de la semana.',
    );
  const seen = new Set<number>();
  for (const day of value.days) {
    if (
      !record(day, ['dayOfWeek', 'periods']) ||
      !Number.isInteger(day.dayOfWeek) ||
      Number(day.dayOfWeek) < 1 ||
      Number(day.dayOfWeek) > 7 ||
      seen.has(Number(day.dayOfWeek))
    )
      throw new BadRequestException(
        'Cada día de la semana debe aparecer una sola vez.',
      );
    seen.add(Number(day.dayOfWeek));
    if (!Array.isArray(day.periods) || day.periods.length > 2)
      throw new BadRequestException(
        'Cada día admite hasta dos franjas de trabajo.',
      );
    let previousEnd = '';
    for (const period of day.periods) {
      if (
        !record(period, ['start', 'end']) ||
        typeof period.start !== 'string' ||
        typeof period.end !== 'string' ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(period.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(period.end)
      )
        throw new BadRequestException(
          'Ingresa las horas en formato de 24 horas.',
        );
      if (period.start >= period.end || period.start < previousEnd)
        throw new BadRequestException(
          'Las franjas deben estar ordenadas, sin cruces, y terminar después de comenzar.',
        );
      previousEnd = period.end;
    }
  }
}
