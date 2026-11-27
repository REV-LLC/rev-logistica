import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
const { LocalMatching } = require('./engine/local-matching.cjs');

@Injectable()
export class TrackingMatchingService {
  private engine: any;
  constructor(private readonly prisma: PrismaService) {
    const baseUrl = process.env.TRACKING_VALHALLA_URL;
    if (!baseUrl) return;
    const url = new URL(baseUrl);
    // The motor remains on Railway's private network; no public GPS submission.
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || !(url.hostname.endsWith('.railway.internal') || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Invalid private matching endpoint');
    this.engine = new LocalMatching({ baseUrl: baseUrl.replace(/\/$/, ''),
      reserve: () => this.increment('match', 1),
      record: async ({httpOk, matched, durationMs}) => {
        await this.increment(httpOk ? 'ok' : 'error', 1);
        if (!matched) await this.increment('unmatched', 1);
        await this.increment('ms', durationMs);
      } });
  }
  private day() { return new Intl.DateTimeFormat('en-CA', {timeZone:'America/Bogota'}).format(new Date()); }
  private async increment(metric: string, amount: number) {
    const key = `valhalla-${metric}:${this.day()}`;
    await this.prisma.$executeRaw`INSERT INTO "TrackingUsage" ("key", "count", "updatedAt") VALUES (${key}, ${amount}, NOW())
      ON CONFLICT ("key") DO UPDATE SET "count" = "TrackingUsage"."count" + ${amount}, "updatedAt" = NOW()`;
  }
  async status() { return this.engine ? this.engine.status() : { available:false }; }
  async usage() {
    const day = this.day();
    const keys = ['match','ok','error','unmatched','ms'].map(key => `valhalla-${key}:${day}`);
    const rows = await this.prisma.trackingUsage.findMany({ where: { key: { in: [...keys, `mapbox-map:${day}`] } } });
    const count = (key: string) => rows.find(row => row.key === key)?.count || 0;
    const requests = count(keys[0]);
    return { day, engine:'valhalla', requestsToday:requests, httpOkToday:count(keys[1]), httpErrorsToday:count(keys[2]),
      noMatchToday:count(keys[3]), averageDurationMs:requests ? Math.round(count(keys[4])/requests) : 0, mapLoadsToday:count(`mapbox-map:${day}`) };
  }
  async match(history: unknown) {
    if (!this.engine) throw new ServiceUnavailableException('El motor de ajuste a calles no está disponible.');
    try { return { ...await this.engine.match(history), usage:await this.usage() }; }
    catch (e) {
      if (typeof e?.getStatus === 'function') throw new HttpException(e.message, e.getStatus());
      throw new ServiceUnavailableException('No se pudo ajustar el recorrido. Se conserva el GPS original.');
    }
  }
}
