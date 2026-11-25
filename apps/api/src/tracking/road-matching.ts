import { HttpException } from '@nestjs/common';
type RoadPoint = { latitude:number; longitude:number; reportedAt:string };
type RoadHistory = { deviceId:number; to:string; segments:RoadPoint[][] };
// Optional Google Roads adapter. No requests are made without explicit server
// enablement and a dedicated private key. Google geometry is never written to disk.
export const ROADS_DAILY_LIMIT = 100;
const radians = Math.PI / 180;
function meters(a: {latitude:number;longitude:number}, b: {latitude:number;longitude:number}) {
  const h = Math.sin((b.latitude-a.latitude)*radians/2)**2 + Math.cos(a.latitude*radians)*Math.cos(b.latitude*radians)*Math.sin((b.longitude-a.longitude)*radians/2)**2;
  return 6371000*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
function failure(status: number, message: string) { return new HttpException(message, status); }
export function trails(history: RoadHistory) {
  const cutoff = Date.parse(history.to) - 15 * 60_000;
  const result: RoadPoint[][] = [];
  let remaining = 100;
  // Use only recorded valid GPS, with short temporal and spatial gaps.
  for (const segment of [...history.segments].reverse()) {
    const recent = segment.filter(p => Date.parse(p.reportedAt) >= cutoff);
    // Google can collapse repeated fixes while parked. Deduplicate only provider
    // input; raw GPS history, timestamps and stop detection remain unchanged.
    const distinct = recent.filter((point, index) => index === 0 || point.latitude !== recent[index-1].latitude || point.longitude !== recent[index-1].longitude);
    const points = distinct.slice(-remaining);
    remaining -= points.length;
    let current: RoadPoint[] = [];
    for (const p of points) {
      const previous = current.at(-1);
      if (previous && (Date.parse(p.reportedAt)-Date.parse(previous.reportedAt)>30_000 || meters(previous,p)>300)) {
        if (current.length >= 3) result.unshift(current);
        current = [];
      }
      current.push(p);
    }
    if (current.length >= 3) result.unshift(current);
    if (!remaining) break;
  }
  return result.filter(points => points.some(p => meters(points[0],p) >= 50)).slice(-10);
}
export class RoadMatching {
  private key: string | undefined; enabled: boolean; private reserve: () => Promise<boolean>;
  private fetcher: typeof fetch; private busy = false;
  constructor({ key, enabled, reserve, fetcher = fetch }: {key?:string;enabled:boolean;reserve:()=>Promise<boolean>;fetcher?:typeof fetch}) { this.key = key; this.enabled = enabled === true && Boolean(key); this.reserve = reserve; this.fetcher = fetcher; this.busy = false; }
  async match(history: RoadHistory) {
    if (!this.enabled) throw failure(503,'El ajuste a calles está preparado, pendiente de activar Google Roads con autorización.');
    if (this.busy) throw failure(429,'Hay otro ajuste en curso. Espera a que termine.');
    const groups = trails(history);
    if (!groups.length) throw failure(400,'No hay suficientes posiciones continuas con desplazamiento en los últimos 15 minutos del período. Se conserva el GPS original.');
    this.busy = true;
    try {
      const segments: {latitude:number;longitude:number}[][] = []; let matchedPointCount = 0, skipped = 0;
      for (const points of groups) {
        if (!await this.reserve()) { skipped++; continue; }
        try {
          const query = new URLSearchParams({ path: points.map(p=>`${p.latitude},${p.longitude}`).join('|'), interpolate:'true', key:this.key! });
          const response = await this.fetcher(`https://roads.googleapis.com/v1/snapToRoads?${query}`, { signal:AbortSignal.timeout(8000), redirect:'error' });
          if (!response.ok) throw new Error('Provider unavailable');
          const data = await response.json();
          const snapped = data.snappedPoints;
          if (!Array.isArray(snapped) || !snapped.length || snapped.length > 10_000) throw new Error('Invalid geometry');
          if (data.warningMessage) throw new Error('Unreliable provider warning');
          const accepted = new Set<number>();
          const groupSegments: {latitude:number;longitude:number}[][] = [];
          let path: {latitude:number;longitude:number}[] = [], anchors: number[] = [];
          let interpolated: {latitude:number;longitude:number}[] = [], previousIndex: number | null = null;
          const finish = () => {
            if (anchors.length >= 2) { groupSegments.push(path); for (const index of anchors) accepted.add(index); }
            path = []; anchors = []; interpolated = []; previousIndex = null;
          };
          let lastIndex = -1;
          for (const point of snapped) {
            const coordinate = { latitude:point.location?.latitude, longitude:point.location?.longitude };
            if (!Number.isFinite(coordinate.latitude) || !Number.isFinite(coordinate.longitude) || Math.abs(coordinate.latitude)>90 || Math.abs(coordinate.longitude)>180) throw new Error('Invalid coordinate');
            if (point.originalIndex === undefined) {
              if (previousIndex !== null) interpolated.push(coordinate);
              continue;
            }
            const index = point.originalIndex;
            if (!Number.isInteger(index) || !points[index] || index <= lastIndex) throw new Error('Invalid original index');
            lastIndex = index;
            if (meters(points[index],coordinate)>100) { finish(); skipped++; continue; }
            // An omitted measured point is a gap, never permission to draw a
            // road connection through it. Only contiguous original indices join.
            if (previousIndex !== null && index !== previousIndex+1) { finish(); skipped++; }
            if (previousIndex === null) path = [coordinate];
            else path.push(...interpolated,coordinate);
            anchors.push(index); previousIndex = index; interpolated = [];
          }
          finish();
          if (!accepted.size) throw new Error('No reliable continuous match');
          segments.push(...groupSegments);
          matchedPointCount += accepted.size;
          if (accepted.size < points.length) skipped++;
        } catch { skipped++; }
      }
      if (!segments.length) throw failure(503,'No se pudo obtener un ajuste confiable o se agotó el cupo diario. Se conserva el recorrido GPS original.');
      return { deviceId:history.deviceId, through:history.to, source:'google-roads', segments, matchedPointCount,
        message:`Trazado estimado sobre calles, últimos 15 min del período. ${skipped ? 'Ajuste parcial; algunos tramos no se ajustaron. ' : ''}El GPS original permanece disponible.` };
    } finally { this.busy = false; }
  }
}

