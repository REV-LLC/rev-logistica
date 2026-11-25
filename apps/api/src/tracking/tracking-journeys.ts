import { metersBetween, routeHistory } from './tracking-telemetry';
import type { NativePosition, telemetry } from './tracking-telemetry';

type Point = NonNullable<ReturnType<typeof telemetry>>;
export const PARKING_MINUTES = 15;
const PARKING_MS = PARKING_MINUTES * 60_000;
const GAP_MS = 10 * 60_000;
type Journey = {
  id: string; startedAt: string; endedAt: string | null; lastReportedAt: string;
  start: Point; end: Point; status: 'closed' | 'active' | 'unknown' | 'gap';
  startReason: 'pause' | 'window' | 'gap'; endReason: 'pause' | 'gap' | null;
  distanceMeters: number; pointCount: number; segments: Point[][];
};
type Stop = { startedAt: string; resumedAt: string | null; lastReportedAt: string; point: Point; confirmedMinutes: number };

// Derived only from reported GPS. Silence never confirms parking, and inaccurate
// fixes cannot turn drift into a 15-minute stop or an invented departure.
export function splitJourneys(positions: NativePosition[], deviceId: number, from: number, to: number, now = Date.now()) {
  const history = routeHistory(positions, deviceId, from, to, now);
  const points = history.segments.flat().filter(p => p.accuracyMeters === null || p.accuracyMeters <= 100);
  const journeys: Journey[] = [];
  const stops: Stop[] = [];
  let active: Point[] | null = null;
  let candidate: Point | null = null;
  let parked: Stop | null = null;
  let previous: Point | null = null;
  let reason: Journey['startReason'] = 'window';
  let activeReason: Journey['startReason'] = reason;
  const time = (p: Point) => Date.parse(p.reportedAt);
  const close = (end: Point, status: Journey['status'], endReason: Journey['endReason']) => {
    if (!active?.length) return;
    const path = active.filter(p => time(p) <= time(end));
    const first = path[0];
    let distance = 0;
    for (let i = 1; i < path.length; i++) distance += metersBetween(path[i - 1], path[i]);
    if (path.some(p => metersBetween(first, p) >= 50)) journeys.push({ id: `${deviceId}:${first.id}`, startedAt: first.reportedAt,
      endedAt: endReason ? end.reportedAt : null, lastReportedAt: end.reportedAt,
      start: first, end, status, startReason: activeReason, endReason,
      distanceMeters: Math.round(distance), pointCount: path.length, segments: [path] });
    active = null;
  };
  for (const point of points) {
    if (previous) {
      const elapsed = time(point) - time(previous);
      const distance = metersBetween(previous, point);
      if (elapsed > GAP_MS || (distance > 300 && distance / (elapsed / 1000) > 160 / 3.6)) {
        close(previous, 'gap', 'gap'); candidate = null; parked = null; reason = 'gap'; previous = null;
      }
    }
    const anchor = candidate || parked?.point || point;
    const distance = metersBetween(anchor, point);
    const speed = point.speedKph;
    const stationary = (speed !== null ? speed <= 3 : point.moving === false) && distance <= 50;
    const displaced = previous && metersBetween(previous, point) > 50
      && (previous.accuracyMeters === null || previous.accuracyMeters <= 50)
      && (point.accuracyMeters === null || point.accuracyMeters <= 50);
    const moving = (speed !== null && speed > 3) || Boolean(displaced);
    if (active) {
      active.push(point);
      if (stationary) {
        candidate ||= point;
        if (time(point) - time(candidate) >= PARKING_MS) {
          close(candidate, 'closed', 'pause');
          parked = { startedAt: candidate.reportedAt, resumedAt: null, lastReportedAt: point.reportedAt,
            point: candidate, confirmedMinutes: Math.floor((time(point) - time(candidate)) / 60_000) };
          stops.push(parked); candidate = null; reason = 'pause';
        }
      } else candidate = null;
    } else if (moving) {
      if (parked) parked.resumedAt = point.reportedAt;
      parked = null; candidate = null; activeReason = reason; active = [point];
    } else if (parked && stationary) {
      parked.lastReportedAt = point.reportedAt;
      parked.confirmedMinutes = Math.floor((time(point) - Date.parse(parked.startedAt)) / 60_000);
    }
    previous = point;
  }
  if (active && previous) close(previous, now - time(previous) > 300_000 ? 'unknown' : 'active', null);
  return { journeys, stops, parkingMinutes: PARKING_MINUTES };
}
