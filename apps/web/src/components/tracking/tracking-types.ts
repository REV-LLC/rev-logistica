export type GpsPosition = {
  id: number; latitude: number; longitude: number; reportedAt: string; receivedAt: string | null;
  ageSeconds: number; gpsState: string; speedKph: number | null; course: number | null;
  accuracyMeters: number | null; batteryPercent: number | null; charging: boolean | null; moving: boolean | null;
};
export type FleetDevice = { id: number; name: string; connection: string; lastConnectionAt: string | null; position: GpsPosition | null; knownPlaces: { id: number; name: string }[] };
export type FleetPlace = { id: number; name: string; latitude: number; longitude: number; radiusMeters: number; siteType: string | null };
export type FleetState = { fetchedAt: string; refreshSeconds: number; devices: FleetDevice[]; places: FleetPlace[] };
export type RouteHistory = { deviceId: number; deviceName: string; from: string; to: string; segments: GpsPosition[][]; pointCount: number; gapCount: number; distanceMeters: number; firstReportedAt: string | null; lastReportedAt: string | null };
export type PlannedRoute = { deviceId: number; deviceName: string; origin: GpsPosition; destination: { latitude: number; longitude: number; label: string }; encodedPolyline: string; durationSeconds: number; distanceMeters: number; arrivalAt: string; calculatedAt: string; traffic: boolean; usage: { used: number; limit: number } };
export type TrackingMapConfig = { browserKey: string | null; mapAvailable: boolean; routesAvailable: boolean; routeDailyLimit: number; mapDailyLimit: number };
export const localTime = (value: string) => new Date(value).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });
export function gpsAge(position: GpsPosition | null, now = Date.now()) {
  if (!position) return { text: 'Sin ubicación GPS', color: 'gray', seconds: Infinity };
  const seconds = Math.max(0, Math.floor((now - Date.parse(position.reportedAt)) / 1000));
  const age = seconds < 60 ? `${seconds} s` : seconds < 3600 ? `${Math.floor(seconds / 60)} min` : `${Math.floor(seconds / 3600)} h`;
  return { text: `${seconds <= 90 ? 'GPS hace' : 'Último GPS hace'} ${age}`, color: seconds <= 90 ? 'teal' : seconds <= 300 ? 'orange' : 'red', seconds };
}
