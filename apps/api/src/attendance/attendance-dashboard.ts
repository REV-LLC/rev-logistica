type EventState = { at: Date; status: string };
type Shift = { employeeId: string; enteredAt: Date; leftAt: Date | null; punches: { kind: string; status: string; occurredAt: Date }[] };

export function colombiaDay(now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const start = new Date(`${date}T00:00:00-05:00`);
  return { date, start, end: new Date(start.getTime() + 86400000) };
}

export function dailyEmployeeEvents(shifts: Shift[], start: Date, end: Date) {
  const result = new Map<string, { entry: EventState | null; exit: EventState | null }>();
  const rank = (status: string) => ['VERIFIED', 'APPROVED'].includes(status) ? 2 : status === 'PENDING' ? 1 : 0;
  for (const shift of shifts) {
    const row = result.get(shift.employeeId) ?? { entry: null, exit: null };
    for (const [key, kind, at] of [['entry', 'CHECK_IN', shift.enteredAt], ['exit', 'CHECK_OUT', shift.leftAt]] as const) {
      if (!at || at < start || at >= end) continue;
      const punch = shift.punches.find(p => p.kind === kind);
      const event = { at, status: punch?.status ?? 'VERIFIED' };
      const previous = row[key];
      if (!previous || rank(event.status) > rank(previous.status) || (rank(event.status) === rank(previous.status) && at > previous.at)) row[key] = event;
    }
    result.set(shift.employeeId, row);
  }
  return result;
}
