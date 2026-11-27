import type { TrackingRules } from './tracking-refresh';
export type GpsPosition = {
  id: number; latitude: number; longitude: number; reportedAt: string; receivedAt: string | null;
  ageSeconds: number; gpsState: string; speedKph: number | null; course: number | null;
  accuracyMeters: number | null; batteryPercent: number | null; charging: boolean | null; moving: boolean | null;
  historical?: boolean;
};
export type FleetDevice = { trackingPolicy?: { assetKind: 'vehicle' | 'machine'; mode: 'continuous' | 'reduced'; intervalSeconds: number; roadMatching: boolean };  trackingProtocol?: string | null; id: number; name: string; connection: string; lastConnectionAt: string | null; position: GpsPosition | null; latestReport?: { valid: boolean; reportedAt: string; receivedAt: string | null; ignition: boolean | null; batteryPercent?: number | null; batterySource?: string | null; batteryProvisional?: boolean; charging?: boolean | null } | null; knownPlaces: { id: number; name: string }[] };
export type FleetPlace = { id: number; name: string; latitude: number; longitude: number; radiusMeters: number; siteType: string | null };
export type FleetState = { fetchedAt: string; refreshSeconds: number; devices: FleetDevice[]; places: FleetPlace[] };
export type Journey = { id: string; startedAt: string; endedAt: string | null; lastReportedAt: string;
  start: GpsPosition; end: GpsPosition; status: 'closed' | 'active' | 'unknown' | 'gap';
  startReason: 'pause' | 'window' | 'gap'; endReason: 'pause' | 'gap' | null;
  distanceMeters: number; pointCount: number; segments: GpsPosition[][] };
export type RouteHistory = { deviceId: number; deviceName: string; from: string; to: string; segments: GpsPosition[][]; pointCount: number; gapCount: number; distanceMeters: number; firstReportedAt: string | null; lastReportedAt: string | null;
  journeys?: Journey[]; stops?: { startedAt: string; resumedAt: string | null; lastReportedAt: string; confirmedMinutes: number; point: GpsPosition }[];
  archive?: { retentionDays: number; parkingMinutes: number; syncing: boolean; lastSyncAt: string | null; earliestReportedAt: string | null; storedPoints: number; error: string | null } };
export type TrackingMapConfig = { mapboxToken: string | null; mapAvailable: boolean; mapMatchingAvailable?: boolean; mapMatchingEngine?: 'valhalla'; trackingPolicy?: TrackingRules };
export const localTime = (value: string) => new Date(value).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });
export function gpsAge(position: GpsPosition | null, now = Date.now()) {
  if (!position) return { text: 'Sin ubicación GPS', color: 'gray', seconds: Infinity };
  const seconds = Math.max(0, Math.floor((now - Date.parse(position.reportedAt)) / 1000));
  const age = seconds < 60 ? `${seconds} s` : seconds < 3600 ? `${Math.floor(seconds / 60)} min` : `${Math.floor(seconds / 3600)} h`;
  return { text: `${position.historical ? 'Último GPS válido hace' : seconds <= 90 ? 'GPS hace' : 'Último GPS hace'} ${age}`, color: position.historical ? 'orange' : seconds <= 90 ? 'teal' : seconds <= 300 ? 'orange' : 'red', seconds };
}

export type MapMatch = { usage?: MatchingUsage; journeyId?: string; partial?: boolean; pending?: boolean; requests?: number; deviceId: number; through: string | null; segments: { latitude: number; longitude: number }[][]; source: 'valhalla'; matchedPointCount: number; message: string };

export type MatchingUsage = { engine: 'valhalla'; requestsToday: number; httpOkToday: number; httpErrorsToday: number; averageDurationMs: number; mapLoadsToday: number };
