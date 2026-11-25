import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { telemetry, routeHistory } from './tracking-telemetry';
import type { NativePosition } from './tracking-telemetry';
import { TrackingMapService } from './tracking-map.service';
import { splitJourneys } from './tracking-journeys';
import { TraccarLive } from './traccar-live';
import { RoadMatching } from './road-matching';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type TrackingUser = { id: number; email: string; administrator?: boolean; attributes?: Record<string, unknown> };
type TrackingDevice = { id: number; name: string; positionId: number; disabled?: boolean; attributes?: Record<string, unknown> };
const activeDevices = (devices: TrackingDevice[]) => devices.filter(d => !d.disabled && d.attributes?.revRetired !== true);
type TrackingPosition = { id: number; deviceId: number; latitude: number; longitude: number; valid: boolean; fixTime: string };
type TrackingPlace = { id: number; name: string; area: string; attributes: Record<string, unknown> };
export type CreateTrackingPlace = { name: string; deviceId: number; positionId: number; radiusMeters: number; requestId: string };
const MAX_POSITION_AGE = 15 * 60_000;

function circle(place: TrackingPlace) {
  const match = /^CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(place.area);
  if (!match) return null;
  const [latitude, longitude, radiusMeters] = match.slice(1).map(Number);
  if (![latitude, longitude, radiusMeters].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || radiusMeters <= 0) return null;
  return { latitude, longitude, radiusMeters };
}
function validPosition(position?: TrackingPosition) {
  return Boolean(position?.valid && Number.isFinite(position.latitude) && Number.isFinite(position.longitude)
    && Math.abs(position.latitude) <= 90 && Math.abs(position.longitude) <= 180 && Number.isFinite(Date.parse(position.fixTime)));
}
function recentPosition(position?: TrackingPosition) {
  if (!validPosition(position)) return false;
  const age = Date.now() - Date.parse(position!.fixTime);
  return age >= -60_000 && age <= MAX_POSITION_AGE;
}
function distanceMeters(a: TrackingPosition, b: { latitude: number; longitude: number }) {
  const radians = (value: number) => value * Math.PI / 180;
  const h = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export type TrackingIdentity = { sub: string; exp?: number };

@Injectable()
export class TrackingService {
  private live: TraccarLive | undefined;
  private subscribers = 0;
  private readonly lastValid = new Map<number, NativePosition>();
  private readonly lastLookup = new Map<number, number>();
  private fleetCache: { key: string; at: number; value: ReturnType<TrackingService['loadFleet']> } | undefined;
  private readonly pending = new Map<string, Promise<unknown>>();
  constructor(private readonly prisma: PrismaService, private readonly maps: TrackingMapService) {}

  async createSession(identity: TrackingIdentity) {
    const previous = this.pending.get(identity.sub) || Promise.resolve();
    const operation = previous.catch(() => undefined).then(() => this.issueSession(identity));
    this.pending.set(identity.sub, operation);
    try { return await operation; }
    finally { if (this.pending.get(identity.sub) === operation) this.pending.delete(identity.sub); }
  }

  private async issueSession(identity: TrackingIdentity) {
    const revUser = await this.authorize(identity);
    const expiresAt = Math.min(Date.now() + 5 * 60_000, (identity.exp || 0) * 1000);
    if (expiresAt <= Date.now() + 5000) throw new UnauthorizedException('Inicia sesión nuevamente en REV.');
    const { server, admin, integrationPassword } = this.connection();
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
      const devices = activeDevices(await this.request<TrackingDevice[]>(server, '/api/devices?all=true', admin));
      const linked = await this.request<{ id: number }[]>(server, `/api/devices?userId=${user.id}`, admin);
      for (const retired of linked.filter(item => !devices.some(device => device.id === item.id))) {
        await this.request(server, '/api/permissions', admin, { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId:user.id,deviceId:retired.id}) });
      }
      const linkedIds = new Set(linked.map((device) => device.id));
      for (const device of devices) {
        if (!linkedIds.has(device.id)) await this.request(server, '/api/permissions', admin, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, deviceId: device.id }),
        });
      }
      const places = (await this.request<TrackingPlace[]>(server, '/api/geofences?all=true', admin)).filter((place) => place.attributes?.revKnownPlace === true);
      if (places.length) {
        const assigned = await this.request<TrackingPlace[]>(server, `/api/geofences?userId=${user.id}`, admin);
        for (const place of places) {
          if (!assigned.some((item) => item.id === place.id)) await this.link(server, admin, { userId: user.id, geofenceId: place.id });
        }
        for (const device of devices) await this.linkPlacesToDevice(server, admin, device.id, places);
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

  private async authorize(identity: TrackingIdentity) {
    const user = await this.prisma.user.findUnique({ where: { id: identity.sub }, select: { id: true, email: true, role: true, active: true } });
    if (!user?.active || !['ADMIN', 'OFFICE'].includes(user.role)) throw new ForbiddenException('Tu usuario no tiene acceso al seguimiento de camiones.');
    if (!identity.exp || identity.exp * 1000 <= Date.now()) throw new UnauthorizedException('Inicia sesión nuevamente en REV.');
    return user;
  }

  private connection() {
    try {
      const server = new URL(process.env.TRACCAR_WEB_URL || 'https://gps.revcontractorsllc.com');
      const email = process.env.TRACCAR_INTEGRATION_EMAIL;
      const integrationPassword = process.env.TRACCAR_INTEGRATION_PASSWORD;
      if (server.protocol !== 'https:' || server.username || server.password || server.search || server.hash || server.pathname !== '/' || !email || !integrationPassword) throw new Error();
      return { server, integrationPassword, admin: Buffer.from(`${email}:${integrationPassword}`).toString('base64') };
    } catch { throw new ServiceUnavailableException('El acceso al seguimiento no está configurado.'); }
  }

  async getPlacesState(identity: TrackingIdentity) {
    await this.authorize(identity);
    const { server, admin } = this.connection();
    try {
      const [devices, nativePlaces] = await Promise.all([
        this.request<TrackingDevice[]>(server, '/api/devices?all=true', admin).then(activeDevices),
        this.request<TrackingPlace[]>(server, '/api/geofences?all=true', admin),
      ]);
      const places = nativePlaces.filter((place) => place.attributes?.revKnownPlace === true && circle(place));
      const query = new URLSearchParams();
      for (const device of devices) if (device.positionId) query.append('id', String(device.positionId));
      const positions = query.size ? await this.request<TrackingPosition[]>(server, `/api/positions?${query}`, admin) : [];
      const byDevice = new Map(positions.map((position) => [position.deviceId, position]));
      return {
        places: places.map((place) => ({ id: place.id, name: place.name, radiusMeters: circle(place)!.radiusMeters })),
        devices: devices.map((device) => {
          const position = byDevice.get(device.id);
          const usable = validPosition(position);
          return { id: device.id, name: device.name, positionId: usable ? position!.id : null,
            reportedAt: usable ? position!.fixTime : null, recent: recentPosition(position),
            knownPlaces: usable ? places.filter((place) => distanceMeters(position!, circle(place)!) <= circle(place)!.radiusMeters).map((place) => ({ id: place.id, name: place.name })) : [],
          };
        }),
      };
    } catch { throw new ServiceUnavailableException('No fue posible consultar los puntos conocidos. Intenta nuevamente.'); }
  }

  private rememberPosition(position: NativePosition) {
    const previous = this.lastValid.get(position.deviceId);
    if (telemetry(position) && (!previous || Date.parse(position.fixTime) >= Date.parse(previous.fixTime))) this.lastValid.set(position.deviceId, position);
  }

  assertAccess(identity: TrackingIdentity) { return this.authorize(identity); }

  subscribeLive(callback: (event: Record<string, unknown>) => void) {
    if (this.subscribers >= 50) throw new HttpException('Demasiadas vistas de seguimiento abiertas.', 429);
    if (!this.live) {
      const { server, integrationPassword } = this.connection();
      this.live = new TraccarLive({ server: server.origin, email: process.env.TRACCAR_INTEGRATION_EMAIL!, password: integrationPassword,
        invalidate: () => this.invalidateFleetCache(), onPositions: positions => {
          for (const p of positions) this.rememberPosition(p);
        } });
      void this.live.start();
    }
    this.subscribers++;
    const live = this.live;
    live.on('update', callback); callback(live.status());
    let disposed = false;
    return () => {
      if (disposed) return; disposed = true;
      live.off('update', callback); this.subscribers--;
      if (!this.subscribers && this.live === live) { live.stop(); this.live = undefined; }
    };
  }
  onModuleDestroy() { this.live?.stop(); }

  async matchRoads(identity: TrackingIdentity, deviceId: string, from: string, to: string) {
    await this.authorize(identity);
    if (!this.maps.configuration().roadMatchingAvailable) throw new ServiceUnavailableException('El ajuste a calles no está disponible.');
    const end = Date.parse(to), requestedStart = Date.parse(from);
    if (!Number.isFinite(end) || !Number.isFinite(requestedStart) || requestedStart >= end || end-requestedStart>86400_000 || requestedStart<Date.now()-30*86400_000 || end>Date.now()+60_000) throw new BadRequestException('Selecciona un período válido dentro de los últimos 30 días.');
    const start = Math.max(requestedStart, end - 15 * 60_000);
    const history = await this.getHistory(identity, deviceId, new Date(start).toISOString(), to);
    const roads = new RoadMatching({ key: process.env.TRACKING_ROADS_API_KEY, enabled: true,
      reserve: () => this.maps.reserveRoads() });
    return roads.match(history);
  }

  invalidateFleetCache() { this.fleetCache = undefined; }

  async getFleet(identity: TrackingIdentity) {
    await this.authorize(identity);
    const { server, admin } = this.connection();
    const key = server.origin;
    if (this.fleetCache?.key === key && Date.now() - this.fleetCache.at < 3000) return this.fleetCache.value;
    const value = this.loadFleet(server, admin);
    this.fleetCache = { key, at: Date.now(), value };
    try { return await value; }
    catch (error) { if (this.fleetCache?.value === value) this.fleetCache = undefined; throw error; }
  }

  private async loadFleet(server: URL, admin: string) {
    try {
      const [devices, nativePlaces] = await Promise.all([
        this.request<(TrackingDevice & { status?: string; lastUpdate?: string })[]>(server, '/api/devices?all=true', admin).then(value => activeDevices(value) as (TrackingDevice & { status?: string; lastUpdate?: string })[]),
        this.request<TrackingPlace[]>(server, '/api/geofences?all=true', admin),
      ]);
      const places = nativePlaces.filter(p => p.attributes?.revKnownPlace === true && circle(p))
        .map(p => ({ id: p.id, name: p.name, ...circle(p)!, siteType: ['primary', 'secondary'].includes(String(p.attributes?.revSiteType)) ? String(p.attributes.revSiteType) : null }));
      const query = new URLSearchParams();
      for (const d of devices) if (d.positionId) query.append('id', String(d.positionId));
      const positions = query.size ? await this.request<NativePosition[]>(server, `/api/positions?${query}`, admin) : [];
      const now = Date.now();
      return { fetchedAt: new Date(now).toISOString(), refreshSeconds: 5, places,
        devices: await Promise.all(devices.map(async d => {
          const p = positions.find(p => p.deviceId === d.id && p.id === d.positionId);
          const current = telemetry(p, now);
          if (current && p) this.rememberPosition(p);
          if (!current && !this.lastValid.has(d.id) && now - (this.lastLookup.get(d.id) || 0) > 60_000) {
            this.lastLookup.set(d.id, now);
            try {
              const query = new URLSearchParams({ deviceId: String(d.id), from: new Date(now-86400_000).toISOString(), to: new Date(now).toISOString() });
              const history = await this.request<NativePosition[]>(server, `/api/reports/route?${query}`, admin, {headers:{Accept:'application/json'}});
              if (Array.isArray(history) && history.length <= 12000) {
                const previous = history.filter(item => item.deviceId === d.id && telemetry(item,now)).sort((a,b)=>Date.parse(b.fixTime)-Date.parse(a.fixTime))[0];
                if (previous) this.lastValid.set(d.id, previous);
              }
            } catch { /* Latest report remains visible even if historical lookup fails. */ }
          }
          const previous = this.lastValid.get(d.id);
          const fallback = previous && now-Date.parse(previous.fixTime) <= 30*86400_000 ? telemetry(previous,now) : null;
          const position = current ? { ...current, historical:false } : fallback ? { ...fallback, historical:true } : null;
          return { id: d.id, name: d.name, connection: d.status || 'unknown', lastConnectionAt: d.lastUpdate || null, position,
            latestReport: p ? { valid: p.valid === true, reportedAt: p.fixTime, receivedAt: p.serverTime || null,
              ignition: typeof p.attributes?.ignition === 'boolean' ? p.attributes.ignition : null } : null,
            knownPlaces: current ? places.filter(place => distanceMeters(p!, place) <= place.radiusMeters).map(place => ({ id: place.id, name: place.name })) : [] };
        })),
      };
    } catch { throw new ServiceUnavailableException('No fue posible actualizar la flota. Se conserva el último reporte disponible.'); }
  }

  async getHistory(identity: TrackingIdentity, deviceId: string, from: string, to: string) {
    const source = await this.readHistoryPositions(identity, deviceId, from, to);
    return { deviceId: source.deviceId, deviceName: source.deviceName,
      from: new Date(source.start).toISOString(), to: new Date(source.end).toISOString(),
      ...routeHistory(source.positions, source.deviceId, source.start, source.end),
      ...splitJourneys(source.positions, source.deviceId, source.start, source.end),
      archive: { retentionDays:30, parkingMinutes:15, syncing:false, lastSyncAt:new Date().toISOString(),
        earliestReportedAt:source.positions.filter(p=>p.valid).map(p=>p.fixTime).sort()[0] || null,
        storedPoints:source.positions.length, error:null } };
  }

  async readHistoryPositions(identity: TrackingIdentity, deviceId: string, from: string, to: string) {
    await this.authorize(identity);
    const id = Number(deviceId);
    const requestedStart = Date.parse(from), end = Date.parse(to);
    const start = Math.max(requestedStart, Date.now()-30*86400_000);
    if (!/^\d+$/.test(deviceId || '') || !Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(requestedStart) || !Number.isFinite(end)
      || start >= end || end - requestedStart > 24 * 60 * 60_000 || end > Date.now() + 60_000) {
      throw new BadRequestException('Selecciona un camión y un período de hasta 24 horas.');
    }
    const { server, admin } = this.connection();
    try {
      const devices = activeDevices(await this.request<TrackingDevice[]>(server, '/api/devices?all=true', admin));
      const device = devices.find(d => d.id === id);
      if (!device) throw new BadRequestException('El camión no está disponible.');
      const query = new URLSearchParams({ deviceId: String(id), from: new Date(start).toISOString(), to: new Date(end).toISOString() });
      const positions = await this.request<NativePosition[]>(server, `/api/reports/route?${query}`, admin, { headers: { Accept: 'application/json' } });
      if (!Array.isArray(positions) || positions.length > 12_000) throw new BadRequestException('El recorrido es muy extenso. Selecciona un período más corto.');
      return { deviceId: id, deviceName: device.name, positions, start, end };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('No fue posible consultar el recorrido. Intenta nuevamente.');
    }
  }

  async mapConfiguration(identity: TrackingIdentity) {
    await this.authorize(identity);
    return this.maps.mapConfiguration();
  }

  async createPlace(identity: TrackingIdentity, input: CreateTrackingPlace) {
    // Serialize retries of the same save within this API instance.
    const key = `place:${identity.sub}:${input?.requestId}`;
    const previous = this.pending.get(key) || Promise.resolve();
    const operation = previous.catch(() => undefined).then(() => this.savePlace(identity, input));
    this.pending.set(key, operation);
    try { return await operation; }
    finally { if (this.pending.get(key) === operation) this.pending.delete(key); }
  }

  private async savePlace(identity: TrackingIdentity, input: CreateTrackingPlace) {
    const user = await this.authorize(identity);
    if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100
      || !Number.isSafeInteger(input.deviceId) || input.deviceId <= 0 || !Number.isSafeInteger(input.positionId) || input.positionId <= 0
      || !Number.isInteger(input.radiusMeters) || input.radiusMeters < 25 || input.radiusMeters > 2000
      || typeof input.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.requestId)) {
      throw new BadRequestException('Indica un nombre, un camión con ubicación y un radio entre 25 y 2000 metros.');
    }
    const name = input.name.trim();
    const { server, admin } = this.connection();
    try {
      const [devices, places, users] = await Promise.all([
        this.request<TrackingDevice[]>(server, '/api/devices?all=true', admin).then(activeDevices),
        this.request<TrackingPlace[]>(server, '/api/geofences?all=true', admin),
        this.request<TrackingUser[]>(server, '/api/users', admin),
      ]);
      const device = devices.find((item) => item.id === input.deviceId);
      if (!device) throw new BadRequestException('El camión ya no está disponible.');
      let place = places.find((item) => item.attributes?.revRequestId === input.requestId && item.attributes?.revCreatedBy === user.id);
      if (place && (place.name !== name || place.attributes.revSourceDeviceId !== device.id || place.attributes.revSourcePositionId !== input.positionId || circle(place)?.radiusMeters !== input.radiusMeters)) {
        throw new ConflictException('Esta solicitud ya guardó otro punto. Cierra el formulario e intenta nuevamente.');
      }
      if (!place) {
        if (places.some((item) => item.name.trim().toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) throw new ConflictException('Ya existe un punto con ese nombre.');
        if (device.positionId !== input.positionId) throw new ConflictException('El camión recibió otra ubicación. Actualiza y confirma de nuevo antes de guardar.');
        const positions = await this.request<TrackingPosition[]>(server, `/api/positions?id=${device.positionId}`, admin);
        const position = positions.find((item) => item.id === device.positionId && item.deviceId === device.id);
        if (!recentPosition(position)) throw new BadRequestException('La ubicación no es válida o tiene más de 15 minutos. Espera un reporte nuevo antes de guardar.');
        place = await this.request<TrackingPlace>(server, '/api/geofences', admin, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name,
            area: `CIRCLE (${position!.latitude} ${position!.longitude}, ${input.radiusMeters})`,
            attributes: { revKnownPlace: true, revCreatedBy: user.id, revRequestId: input.requestId,
              revSourceDeviceId: device.id, revSourcePositionId: position!.id, color: '#12b886' },
          }),
        });
      }
      for (const item of devices) await this.linkPlacesToDevice(server, admin, item.id, [place]);
      for (const nativeUser of users.filter((item) => item.administrator || item.attributes?.revUserId)) {
        const assigned = await this.request<TrackingPlace[]>(server, `/api/geofences?userId=${nativeUser.id}`, admin);
        if (!assigned.some((item) => item.id === place!.id)) await this.link(server, admin, { userId: nativeUser.id, geofenceId: place.id });
      }
      return { id: place.id, name: place.name, radiusMeters: circle(place)!.radiusMeters };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // A retry with the same requestId completes permissions if the native save already succeeded.
      throw new ServiceUnavailableException('No se pudo completar el guardado. Reintenta con el mismo formulario.');
    }
  }

  private async linkPlacesToDevice(server: URL, admin: string, deviceId: number, places: TrackingPlace[]) {
    const assigned = await this.request<TrackingPlace[]>(server, `/api/geofences?deviceId=${deviceId}`, admin);
    for (const place of places) if (!assigned.some((item) => item.id === place.id)) await this.link(server, admin, { deviceId, geofenceId: place.id });
  }
  private async link(server: URL, admin: string, permission: Record<string, number>) {
    await this.request(server, '/api/permissions', admin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(permission) });
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
