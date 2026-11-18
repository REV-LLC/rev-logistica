export type NativePosition = {
  id: number; deviceId: number; latitude: number; longitude: number; valid: boolean;
  fixTime: string; serverTime?: string; speed?: number; course?: number; accuracy?: number;
  attributes?: Record<string, unknown>;
};

const bounded = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;

export function telemetry(position: NativePosition | undefined, now = Date.now()) {
  if (!position?.valid || bounded(position.latitude, -90, 90) === null || bounded(position.longitude, -180, 180) === null) return null;
  const time = Date.parse(position.fixTime);
  if (!Number.isFinite(time) || time > now + 60_000) return null;
  const attributes = position.attributes || {};
  const speed = bounded(position.speed, 0, 300);
  return {
    id: position.id, latitude: position.latitude, longitude: position.longitude,
    reportedAt: new Date(time).toISOString(), receivedAt: position.serverTime || null,
    ageSeconds: Math.max(0, Math.floor((now - time) / 1000)),
    gpsState: now - time <= 90_000 ? 'live' : now - time <= 300_000 ? 'delayed' : 'stale',
    speedKph: speed === null ? null : Math.round(speed * 1.852),
    course: bounded(position.course, 0, 360), accuracyMeters: position.accuracy === 0 ? null : bounded(position.accuracy, 0, 100_000),
    batteryPercent: bounded(attributes.batteryLevel, 0, 100),
    charging: typeof attributes.charge === 'boolean' ? attributes.charge : null,
    moving: typeof attributes.motion === 'boolean' ? attributes.motion : null,
  };
}

export function metersBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function routeHistory(positions: NativePosition[], deviceId: number, from: number, to: number, now = Date.now()) {
  const seen = new Set<number>();
  const points = positions.filter(p => p.deviceId === deviceId).map(p => telemetry(p, now))
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .filter(p => { const time = Date.parse(p.reportedAt); return time >= from && time <= to; })
    .sort((a, b) => Date.parse(a.reportedAt) - Date.parse(b.reportedAt) || a.id - b.id)
    .filter(p => { const time = Date.parse(p.reportedAt); if (seen.has(time)) return false; seen.add(time); return true; });
  const segments: typeof points[] = [];
  let gapCount = 0;
  let distanceMeters = 0;
  for (const point of points) {
    const current = segments[segments.length - 1];
    const previous = current?.[current.length - 1];
    if (!previous) { segments.push([point]); continue; }
    const elapsed = Date.parse(point.reportedAt) - Date.parse(previous.reportedAt);
    const distance = metersBetween(previous, point);
    // Leave a visible gap across outages and implausible GPS jumps; never invent a road path.
    if (elapsed > 10 * 60_000 || (distance > 300 && distance / (elapsed / 1000) > 160 / 3.6)) {
      segments.push([point]); gapCount += 1;
    } else {
      current.push(point); distanceMeters += distance;
    }
  }
  return { segments, pointCount: points.length, gapCount, distanceMeters: Math.round(distanceMeters),
    firstReportedAt: points[0]?.reportedAt || null, lastReportedAt: points[points.length - 1]?.reportedAt || null };
}
