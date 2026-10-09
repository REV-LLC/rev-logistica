import { BadRequestException, ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { TrackingService } from './tracking.service';

describe('Tracking known places', () => {
  const identity = { sub: 'office', exp: Math.floor(Date.now() / 1000) + 3600 };
  const input = { name: ' Vereal SA ', deviceId: 2, positionId: 20, radiusMeters: 50, requestId: 'a1d27d56-78c7-4dd3-b773-2d45d50fbe8d' };
  const position = { id: 20, deviceId: 2, latitude: 4.7, longitude: -74.1, valid: true, fixTime: new Date().toISOString() };
  const place = { id: 3, name: 'Vereal SA', area: 'CIRCLE (4.7 -74.1, 50)', attributes: { revKnownPlace: true, revCreatedBy: 'office', revRequestId: input.requestId, revSourceDeviceId: 2, revSourcePositionId: 20 } };
  const prisma = { user: { findUnique: jest.fn() } };
  let service: TrackingService;
  let mock: jest.SpyInstance;
  let places: typeof place[];
  let devices: { id: number; name: string; positionId: number }[];
  let positions: typeof position[];
  const reply = (data: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status });
  beforeEach(() => {
    process.env.TRACCAR_WEB_URL = 'https://gps.revcontractorsllc.com';
    process.env.TRACCAR_INTEGRATION_EMAIL = 'integration@rev.invalid';
    process.env.TRACCAR_INTEGRATION_PASSWORD = 'test-private';
    prisma.user.findUnique.mockResolvedValue({ id: 'office', active: true, role: 'OFFICE' });
    places = [];
    devices = [{ id: 1, name: 'ZNN938', positionId: 10 }, { id: 2, name: 'GVU047', positionId: 20 }];
    positions = [position];
    service = new TrackingService(prisma as never);
    mock = jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const u = new URL(String(url));
      if (u.pathname === '/api/devices') return reply(devices);
      if (u.pathname === '/api/users') return reply([{ id: 1, email: 'integration', administrator: true }, { id: 2, email: 'owner', administrator: true }, { id: 7, email: 'rev-office', attributes: { revUserId: 'office' } }]);
      if (u.pathname === '/api/positions') return reply(positions);
      if (u.pathname === '/api/geofences') {
        if (init?.method === 'POST') { const body = JSON.parse(String(init.body)); places.push({ id: 3, ...body }); return reply(places[places.length - 1]); }
        return reply(u.searchParams.has('all') ? places : []);
      }
      if (u.pathname === '/api/permissions') return reply(null, 204);
      throw new Error('Unexpected URL');
    });
  });
  afterEach(() => { mock.mockRestore(); jest.clearAllMocks(); delete process.env.TRACCAR_WEB_URL; delete process.env.TRACCAR_INTEGRATION_EMAIL; delete process.env.TRACCAR_INTEGRATION_PASSWORD; });
  it('uses server coordinates and links a 50m native geofence to the fleet and authorized accounts', async () => {
    const result = await service.createPlace(identity, { ...input, latitude: 0, longitude: 0 } as typeof input);
    expect(result).toEqual({ id: 3, name: 'Vereal SA', radiusMeters: 50 });
    expect(places[0].area).toBe('CIRCLE (4.7 -74.1, 50)');
    const links = mock.mock.calls.filter(([url]) => new URL(String(url)).pathname === '/api/permissions').map(([, init]) => JSON.parse(String(init!.body)));
    expect(links).toEqual(expect.arrayContaining([{ deviceId: 1, geofenceId: 3 }, { deviceId: 2, geofenceId: 3 }, { userId: 7, geofenceId: 3 }, { userId: 2, geofenceId: 3 }]));
  });
  it.each([{ valid: false }, { latitude: 91 }, { fixTime: new Date(Date.now() - 16 * 60_000).toISOString() }, { fixTime: new Date(Date.now() + 5 * 60_000).toISOString() }])('rejects unusable positions %j without creating a point', async (patch) => {
    positions = [{ ...position, ...patch }];
    await expect(service.createPlace(identity, input)).rejects.toBeInstanceOf(BadRequestException);
    expect(places).toHaveLength(0);
  });
  it('requires confirmation again when the truck has a newer position', async () => {
    devices[1].positionId = 21;
    await expect(service.createPlace(identity, input)).rejects.toBeInstanceOf(ConflictException);
    expect(places).toHaveLength(0);
  });
  it.each([0, 24, 2001, 50.5, '50'])('rejects invalid radius %j', async (radiusMeters) => {
    await expect(service.createPlace(identity, { ...input, radiusMeters } as typeof input)).rejects.toBeInstanceOf(BadRequestException);
    expect(mock).not.toHaveBeenCalled();
  });
  it('rejects revoked access for both reads and writes before contacting Traccar', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'office', active: false, role: 'OFFICE' });
    await expect(service.getPlacesState(identity)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createPlace(identity, input)).rejects.toBeInstanceOf(ForbiddenException);
    expect(mock).not.toHaveBeenCalled();
  });
  it('does not duplicate a point when completing a retry after partially assigned permissions', async () => {
    places = [place];
    devices[1].positionId = 21;
    await service.createPlace(identity, input);
    expect(places).toHaveLength(1);
    expect(mock.mock.calls.some(([, init]) => init?.method === 'POST' && String(init.body).includes('CIRCLE'))).toBe(false);
  });
  it('refuses a different point using the same request id', async () => {
    places = [place];
    await expect(service.createPlace(identity, { ...input, name: 'Otro lugar' })).rejects.toBeInstanceOf(ConflictException);
  });
  it('marks an old known-location match as stale and distinguishes a truck outside the radius', async () => {
    places = [place];
    positions = [{ ...position, fixTime: new Date(Date.now() - 16 * 60_000).toISOString() }, { ...position, id: 10, deviceId: 1, latitude: 4.71 }];
    const state = await service.getPlacesState(identity);
    expect(state.devices.find((d) => d.id === 2)).toMatchObject({ recent: false, knownPlaces: [{ id: 3, name: 'Vereal SA' }] });
    expect(state.devices.find((d) => d.id === 1)?.knownPlaces).toEqual([]);
  });
  it('sanitizes native errors', async () => {
    mock.mockRejectedValue(new Error('private-password-and-coordinates'));
    await expect(service.createPlace(identity, input)).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.getPlacesState(identity)).rejects.toThrow('No fue posible consultar los puntos conocidos. Intenta nuevamente.');
  });
});
