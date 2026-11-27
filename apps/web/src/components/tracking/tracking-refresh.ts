export type TrackingRules = { vehicleIds: number[]; slowSeconds: 30 | 60; workWindows: { days: number[]; start: string; end: string }[]; timeZone: 'America/Bogota' };
const clock = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export function refreshPolicy(rules: TrackingRules | undefined, deviceId: number | null, now = Date.now()) {
 if (!rules) return { intervalSeconds: 0, roadMatching: true, mode: 'continuous' as const };
 const vehicle = deviceId !== null && rules.vehicleIds.includes(deviceId);
 const parts = Object.fromEntries(clock.formatToParts(new Date(now)).map(part => [part.type, part.value]));
 const day = weekdays[parts.weekday], minute = Number(parts.hour) * 60 + Number(parts.minute);
 const minutes = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
 const active = vehicle && rules.workWindows.some(window => {
  const start = minutes(window.start), end = minutes(window.end);
  return start < end ? window.days.includes(day) && minute >= start && minute < end
   : (window.days.includes(day) && minute >= start) || (window.days.includes((day + 6) % 7) && minute < end);
 });
 return { intervalSeconds: active ? 0 : rules.slowSeconds, roadMatching: vehicle, mode: active ? 'continuous' as const : 'reduced' as const };
}
