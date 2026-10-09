import { ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type TrackingUser = { id: number; email: string; attributes?: Record<string, unknown> };
export type TrackingIdentity = { sub: string; exp?: number };

@Injectable()
export class TrackingService {
  private readonly pending = new Map<string, Promise<unknown>>();
  constructor(private readonly prisma: PrismaService) {}

  async createSession(identity: TrackingIdentity) {
    const previous = this.pending.get(identity.sub) || Promise.resolve();
    const operation = previous.catch(() => undefined).then(() => this.issueSession(identity));
    this.pending.set(identity.sub, operation);
    try { return await operation; }
    finally { if (this.pending.get(identity.sub) === operation) this.pending.delete(identity.sub); }
  }

  private async issueSession(identity: TrackingIdentity) {
    const revUser = await this.prisma.user.findUnique({ where: { id: identity.sub }, select: { id: true, email: true, role: true, active: true } });
    if (!revUser?.active || !['ADMIN', 'OFFICE'].includes(revUser.role)) {
      throw new ForbiddenException('Tu usuario no tiene acceso al seguimiento de camiones.');
    }
    const expiresAt = Math.min(Date.now() + 5 * 60_000, (identity.exp || 0) * 1000);
    if (expiresAt <= Date.now() + 5000) throw new UnauthorizedException('Inicia sesión nuevamente en REV.');
    const server = new URL(process.env.TRACCAR_WEB_URL || 'https://gps.revcontractorsllc.com');
    const integrationEmail = process.env.TRACCAR_INTEGRATION_EMAIL;
    const integrationPassword = process.env.TRACCAR_INTEGRATION_PASSWORD;
    if (server.protocol !== 'https:' || server.username || server.password || server.search || server.hash || server.pathname !== '/' || !integrationEmail || !integrationPassword) {
      throw new ServiceUnavailableException('El acceso al seguimiento no está configurado.');
    }
    const admin = Buffer.from(`${integrationEmail}:${integrationPassword}`).toString('base64');
    const email = `rev-${revUser.id}@rev.invalid`;
    const password = createHmac('sha256', integrationPassword).update(`rev-tracking:${revUser.id}`).digest('hex');
    try {
      const users = await this.request<TrackingUser[]>(server, '/api/users', admin);
      let user = users.find((item) => item.email === email);
      if (user && user.attributes?.revUserId !== revUser.id) throw new Error('Unmanaged tracking identity');
      const profile = {
        name: `REV ${revUser.email}`, email, password,
        administrator: false, readonly: true, deviceReadonly: true, limitCommands: true,
        disabled: false, userLimit: 0, deviceLimit: 0, expirationTime: null,
        attributes: { ...user?.attributes, revUserId: revUser.id, language: 'es' },
      };
      user = await this.request<TrackingUser>(server, user ? `/api/users/${user.id}` : '/api/users', admin, {
        method: user ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...user, ...profile }),
      });
      const devices = await this.request<{ id: number }[]>(server, '/api/devices?all=true', admin);
      const linked = await this.request<{ id: number }[]>(server, `/api/devices?userId=${user.id}`, admin);
      const linkedIds = new Set(linked.map((device) => device.id));
      for (const device of devices) {
        if (!linkedIds.has(device.id)) await this.request(server, '/api/permissions', admin, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, deviceId: device.id }),
        });
      }
      const token = await this.request<string>(server, '/api/session/token', Buffer.from(`${email}:${password}`).toString('base64'), {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ expiration: new Date(expiresAt).toISOString() }).toString(),
      });
      if (typeof token !== 'string' || !token) throw new Error('Missing session token');
      const sessionUrl = new URL('/api/session', server);
      sessionUrl.searchParams.set('token', token);
      return { sessionUrl: sessionUrl.href, panelUrl: server.href, expiresAt: new Date(expiresAt).toISOString() };
    } catch {
      // Never expose native tokens, passwords, response bodies or request URLs.
      throw new ServiceUnavailableException('No fue posible abrir el seguimiento. Intenta nuevamente.');
    }
  }

  private async request<T>(server: URL, path: string, authorization: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(new URL(path, server), {
      ...init, headers: { ...init.headers, Authorization: `Basic ${authorization}` },
      signal: AbortSignal.timeout(15_000), redirect: 'error',
    });
    if (!response.ok) throw new Error('Tracking request failed');
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    try { return JSON.parse(text) as T; } catch { return text as T; }
  }
}
