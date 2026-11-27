import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TrackingMapService {
  constructor(private readonly prisma: PrismaService) {}

  async mapConfiguration() {
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    // Browser maps must never receive a secret token.
    if (!token?.startsWith('pk.')) return { mapAvailable: false, mapboxToken: null };
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    const key = `mapbox-map:${day}`;
    try {
      const rows = await this.prisma.$queryRaw<{ count: number }[]>`
        INSERT INTO "TrackingUsage" ("key", "count", "updatedAt") VALUES (${key}, 1, NOW())
        ON CONFLICT ("key") DO UPDATE SET "count" = "TrackingUsage"."count" + 1, "updatedAt" = NOW()
        RETURNING "count"`;
      if (!rows.length) throw new Error('Counter unavailable');
      return { mapAvailable: true, mapboxToken: token, usage: { mapLoads: rows[0].count } };
    } catch {
      throw new ServiceUnavailableException('No fue posible abrir el mapa. El seguimiento Traccar sigue disponible.');
    }
  }
}
