// REV's agreed schedule is separate from Colombian legal reference values.
// Reports will retain the schedule version used when labor costs are approved.
export const REV_INITIAL_WORK_SCHEDULE = {
  id: 'rev-2026-09',
  timeZone: 'America/Bogota',
  weeklyMinutes: 2490,
  weekdays: [1, 2, 3, 4, 5],
  weekdayIntervals: [['07:30', '12:00'], ['13:00', '16:00']],
  saturdayIntervals: [['07:00', '11:00']],
  label: 'Lunes a viernes 7:30–12:00 y 13:00–16:00; sábado 7:00–11:00 (41,5 horas semanales)',
} as const;
