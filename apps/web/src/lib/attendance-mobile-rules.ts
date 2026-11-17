import type { AttendanceSite } from './attendance';

export function attendanceDay(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Bogota' }).formatToParts(date);
  const part = (type: string) => parts.find(value => value.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function hasPriorDayShift(enteredAt: string, now: Date) {
  const entered = attendanceDay(enteredAt);
  return Boolean(entered && entered < attendanceDay(now));
}

function distance(a: number, b: number, c: number, d: number) {
  const rad = Math.PI / 180;
  const hav = Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(Math.max(0, 1 - hav)));
}

/** Suggest only one unambiguous site containing the entire GPS uncertainty circle. */
export function suggestAttendanceSite(sites: AttendanceSite[], position: {
  latitude: number; longitude: number; accuracy: number; timestamp: number;
}, now = Date.now()): string | null {
  const { latitude, longitude, accuracy, timestamp } = position;
  if (![latitude, longitude, accuracy, timestamp].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy <= 0 || accuracy > 50 || now - timestamp > 60000 || timestamp - now > 5000) return null;
  const possible: { id: string; contained: boolean }[] = [];
  for (const site of sites) {
    const { attendanceLatitude: lat, attendanceLongitude: lng, attendanceRadiusMeters: radius } = site.worksite;
    if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !Number.isFinite(radius) || radius <= 0) continue;
    const meters = distance(latitude, longitude, lat, lng);
    if (meters - accuracy <= radius) possible.push({ id: site.id, contained: meters + accuracy <= radius });
  }
  return possible.length === 1 && possible[0].contained ? possible[0].id : null;
}
