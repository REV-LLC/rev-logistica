import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TrackingMapService {
  constructor(private readonly prisma: PrismaService) {}

  configuration() {
    const enabled = process.env.TRACKING_MAP_ENABLED === 'true';
    return { mapAvailable: enabled && Boolean(process.env.TRACKING_MAPS_BROWSER_KEY),
      roadMatchingAvailable: process.env.TRACKING_ROADS_ENABLED === 'true' && Boolean(process.env.TRACKING_ROADS_API_KEY),
      roadMatchingDailyLimit:100,
      mapDailyLimit: this.limit('TRACKING_MAPS_DAILY_LIMIT', 200, 200) };
  }

  private limit(key: string, fallback: number, ceiling: number) {
    const value = Number(process.env[key] || fallback);
    return Number.isInteger(value) && value > 0 ? Math.min(value, ceiling) : fallback;
  }

  private async reserve(limit: number, product = 'maps') {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const key = `${product}:${day}`;
    // One atomic statement prevents concurrent requests or replicas from exceeding the ceiling.
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "TrackingUsage" ("key", "count", "updatedAt") VALUES (${key}, 1, NOW())
      ON CONFLICT ("key") DO UPDATE SET "count" = "TrackingUsage"."count" + 1, "updatedAt" = NOW()
      WHERE "TrackingUsage"."count" < ${limit} RETURNING "count"`;
    if (!rows.length) throw new HttpException('Se alcanzó el límite diario compartido. El seguimiento GPS sigue disponible.', 429);
    return { used: rows[0].count, limit };
  }

  async reserveRoads() {
    await this.reserve(100, 'roads');
    return true;
  }

  async mapConfiguration() {
    const config = this.configuration();
    if (!config.mapAvailable) return { ...config, browserKey: null };
    try {
      const usage = await this.reserve(config.mapDailyLimit);
      return { ...config, browserKey: process.env.TRACKING_MAPS_BROWSER_KEY!, usage };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new ServiceUnavailableException('No fue posible abrir el mapa. El panel Traccar sigue disponible.');
    }
  }

}
