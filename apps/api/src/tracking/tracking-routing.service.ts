import { BadRequestException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type RouteOrigin = { latitude: number; longitude: number; reportedAt: string; id: number };
type Destination = { address: string } | { location: { latLng: { latitude: number; longitude: number } } };

@Injectable()
export class TrackingRoutingService {
  constructor(private readonly prisma: PrismaService) {}

  configuration() {
    const enabled = process.env.TRACKING_ROUTES_ENABLED === 'true';
    return { mapAvailable: enabled && Boolean(process.env.TRACKING_MAPS_BROWSER_KEY),
      routesAvailable: enabled && Boolean(process.env.TRACKING_MAPS_BROWSER_KEY && process.env.TRACKING_ROUTES_API_KEY),
      routeDailyLimit: this.limit('TRACKING_ROUTES_DAILY_LIMIT', 100, 100), mapDailyLimit: this.limit('TRACKING_MAPS_DAILY_LIMIT', 200, 200) };
  }

  private limit(key: string, fallback: number, ceiling: number) {
    const value = Number(process.env[key] || fallback);
    return Number.isInteger(value) && value > 0 ? Math.min(value, ceiling) : fallback;
  }

  private async reserve(kind: 'routes' | 'maps', limit: number) {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const key = `${kind}:${day}`;
    // One atomic statement prevents concurrent requests or replicas from exceeding the ceiling.
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "TrackingUsage" ("key", "count", "updatedAt") VALUES (${key}, 1, NOW())
      ON CONFLICT ("key") DO UPDATE SET "count" = "TrackingUsage"."count" + 1, "updatedAt" = NOW()
      WHERE "TrackingUsage"."count" < ${limit} RETURNING "count"`;
    if (!rows.length) throw new HttpException('Se alcanzó el límite diario compartido. El seguimiento GPS sigue disponible.', 429);
    return { used: rows[0].count, limit };
  }

  async mapConfiguration() {
    const config = this.configuration();
    if (!config.mapAvailable) return { ...config, browserKey: null };
    try {
      const usage = await this.reserve('maps', config.mapDailyLimit);
      return { ...config, browserKey: process.env.TRACKING_MAPS_BROWSER_KEY!, usage };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new ServiceUnavailableException('No fue posible abrir el mapa. El panel Traccar sigue disponible.');
    }
  }

  async calculate(origin: RouteOrigin, destination: Destination, destinationLabel: string) {
    const config = this.configuration();
    if (!config.routesAvailable) throw new ServiceUnavailableException('Las rutas con tráfico todavía no están habilitadas.');
    const age = Date.now() - Date.parse(origin.reportedAt);
    if (age > 300_000 || age < -60_000) throw new BadRequestException('El camión necesita un reporte GPS de los últimos 5 minutos para calcular una ruta.');
    let usage: { used: number; limit: number };
    try { usage = await this.reserve('routes', config.routeDailyLimit); }
    catch (e) {
      if (e instanceof HttpException) throw e;
      throw new ServiceUnavailableException('No se pudo comprobar el límite diario. Intenta nuevamente.');
    }
    try {
      const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.TRACKING_ROUTES_API_KEY!,
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.endLocation' },
        body: JSON.stringify({ origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } }, destination,
          travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', languageCode: 'es', units: 'METRIC', computeAlternativeRoutes: false }),
      });
      if (!response.ok) throw new Error('Routes unavailable');
      const data = await response.json();
      const route = data.routes?.[0];
      if (!route) throw new BadRequestException('No se encontró una ruta para ese destino. Comprueba la dirección y la ciudad.');
      const duration = /^([\d.]+)s$/.exec(route.duration || '');
      const seconds = duration ? Number(duration[1]) : NaN;
      const endpoint = route.legs?.[route.legs.length - 1]?.endLocation?.latLng;
      if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(route.distanceMeters) || route.distanceMeters < 0
        || typeof route.polyline?.encodedPolyline !== 'string' || route.polyline.encodedPolyline.length > 150_000
        || !Number.isFinite(endpoint?.latitude) || Math.abs(endpoint.latitude) > 90 || !Number.isFinite(endpoint?.longitude) || Math.abs(endpoint.longitude) > 180) throw new Error('Invalid route');
      const calculatedAt = new Date().toISOString();
      return { origin, destination: { latitude: endpoint.latitude, longitude: endpoint.longitude, label: destinationLabel },
        distanceMeters: route.distanceMeters, durationSeconds: Math.round(seconds), encodedPolyline: route.polyline.encodedPolyline,
        calculatedAt, arrivalAt: new Date(Date.parse(calculatedAt) + seconds * 1000).toISOString(), traffic: true,
        provider: 'google' as const, usage };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      // Do not refund failed attempts: Google may already have counted a timed-out request.
      throw new ServiceUnavailableException('No fue posible calcular la ruta con tráfico. Intenta nuevamente.');
    }
  }
}
