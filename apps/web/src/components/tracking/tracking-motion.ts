import type { GpsPosition } from './tracking-types';

export function canAnimate(from: GpsPosition | undefined, to: GpsPosition, now = Date.now()) {
  if (!from || from.id === to.id || from.historical || to.historical) return false;
  const start = Date.parse(from.reportedAt), end = Date.parse(to.reportedAt);
  const age = now - end, elapsed = end - start;
  if (!Number.isFinite(age) || !Number.isFinite(elapsed) || elapsed <= 0 || elapsed > 30_000 || age < -60_000 || age > 30_000) return false;
  const rad = Math.PI / 180;
  const h = Math.sin((to.latitude - from.latitude) * rad / 2) ** 2 + Math.cos(from.latitude * rad) * Math.cos(to.latitude * rad) * Math.sin((to.longitude - from.longitude) * rad / 2) ** 2;
  const distance = 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
  return distance >= 2 && distance <= 300 && distance / (elapsed / 1000) <= 160 / 3.6;
}

export function interpolatePosition(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }, progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  return { latitude: from.latitude + (to.latitude - from.latitude) * t, longitude: from.longitude + (to.longitude - from.longitude) * t };
}
