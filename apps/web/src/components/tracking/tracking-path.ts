import type { GpsPosition } from './tracking-types';

// Display-only Douglas–Peucker simplification, in metres. Each GPS segment is
// processed separately; retained vertices are real fixes, never invented points.
export function simplifyGpsPath<T extends Pick<GpsPosition, 'latitude' | 'longitude'>>(points: readonly T[], toleranceMeters = 8): T[] {
  if (points.length < 3 || toleranceMeters <= 0) return [...points];
  const scaleY = 6371000 * Math.PI / 180;
  const scaleX = scaleY * Math.cos(points[0].latitude * Math.PI / 180);
  const origin = points[0];
  const xy = points.map(p => ({ x: (p.longitude - origin.longitude) * scaleX, y: (p.latitude - origin.latitude) * scaleY }));
  const keep = new Set([0, points.length - 1]);
  const pending = [[0, points.length - 1]];
  while (pending.length) {
    const [start, end] = pending.pop()!;
    const a = xy[start], b = xy[end], dx = b.x - a.x, dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    let maximum = toleranceMeters * toleranceMeters, farthest = -1;
    for (let i = start + 1; i < end; i++) {
      const p = xy[i];
      const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
      const distance2 = (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
      if (distance2 > maximum) { maximum = distance2; farthest = i; }
    }
    if (farthest !== -1) { keep.add(farthest); pending.push([start, farthest], [farthest, end]); }
  }
  return points.filter((_, i) => keep.has(i));
}
