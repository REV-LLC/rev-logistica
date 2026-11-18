import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { TrackingService } from './tracking.service';

describe('Tracking fleet and history boundaries', () => {
  const identity = { sub: 'office', exp: Math.floor(Date.now() / 1000) + 3600 };
  const prisma = { user: { findUnique: jest.fn() } };
  const routing = { calculate: jest.fn(), mapConfiguration: jest.fn() };
  let service: TrackingService;
  let mock: jest.SpyInstance;
  let positions: any[];
  const response = (value: unknown) => new Response(JSON.stringify(value));
  beforeEach(() => {
    Object.assign(process.env, { TRACCAR_WEB_URL: 'https://gps.revcontractorsllc.com', TRACCAR_INTEGRATION_EMAIL: 'integration', TRACCAR_INTEGRATION_PASSWORD: 'private-password' });
    prisma.user.findUnique.mockResolvedValue({ id: 'office', active: true, role: 'OFFICE' });
    positions = [{ id: 20, deviceId: 2, valid: true, latitude: 3.44, longitude: -76.53, fixTime: new Date().toISOString(), attributes: { batteryLevel: 50 } }];
    service = new TrackingService(prisma as never, routing as never);
    mock = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = new URL(String(url));
      if (u.pathname === '/api/devices') return response([{ id: 2, name: 'GVU047', positionId: 20, status: 'online' }]);
      if (u.pathname === '/api/positions' || u.pathname === '/api/reports/route') return response(positions);
      if (u.pathname === '/api/geofences') return response([{ id: 1, name: 'Sede REV', area: 'CIRCLE (3.44 -76.53, 50)', attributes: { revKnownPlace: true, revSiteType: 'primary' } }]);
      throw new Error('Unexpected native endpoint');
    });
  });
  afterEach(() => { mock.mockRestore(); jest.clearAllMocks(); for (const key of ['TRACCAR_WEB_URL','TRACCAR_INTEGRATION_EMAIL','TRACCAR_INTEGRATION_PASSWORD']) delete process.env[key]; });
  it('coalesces fleet reads but revalidates access even for a cached response', async () => {
    const [a, b] = await Promise.all([service.getFleet(identity), service.getFleet(identity)]);
    expect(a).toEqual(b); expect(mock).toHaveBeenCalledTimes(3);
    expect(a.devices[0]).toMatchObject({ connection: 'online', position: { batteryPercent: 50 }, knownPlaces: [{ name: 'Sede REV' }] });
    prisma.user.findUnique.mockResolvedValue({ active: false, role: 'OFFICE' });
    await expect(service.getFleet(identity)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('does not use another device position as the selected truck location', async () => {
    positions[0].deviceId = 99;
    expect((await service.getFleet(identity)).devices[0].position).toBeNull();
  });
  it('rejects invalid IDs, future ranges and periods longer than 24 hours before native requests', async () => {
    for (const args of [['2/../users', '2026-11-18', '2026-11-19'], ['2', 'invalid', 'invalid'], ['2','2026-11-01','2026-11-03'], ['2',new Date().toISOString(),new Date(Date.now()+3600_000).toISOString()]]) {
      await expect(service.getHistory(identity, args[0], args[1], args[2])).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(mock).not.toHaveBeenCalled();
  });
  it('requests native history as JSON and validates fleet membership', async () => {
    const from = new Date(Date.now()-3600_000).toISOString(), to = new Date(Date.now()+1_000).toISOString();
    const result = await service.getHistory(identity, '2', from, to);
    expect(result.pointCount).toBe(1);
    const call = mock.mock.calls.find(([url]) => String(url).includes('/api/reports/route'))!;
    expect(call[1].headers.Accept).toBe('application/json');
    await expect(service.getHistory(identity, '99', from, to)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('uses the server position as route origin and native known-place coordinates as destination', async () => {
    routing.calculate.mockResolvedValue({ provider: 'google' });
    await service.planRoute(identity, { deviceId: 2, placeId: 1, latitude: 90 } as any);
    expect(routing.calculate).toHaveBeenCalledWith(expect.objectContaining({ latitude: 3.44, longitude: -76.53 }), { location: { latLng: { latitude: 3.44, longitude: -76.53 } } }, 'Sede REV');
  });
  it('rejects unknown destinations and sanitizes provider errors', async () => {
    await expect(service.planRoute(identity, { deviceId: 2, placeId: 99 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.planRoute(identity, { deviceId: 2, address: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    expect(routing.calculate).not.toHaveBeenCalled();
    mock.mockRejectedValue(new Error('private-password and coordinates'));
    service = new TrackingService(prisma as never, routing as never);
    await expect(service.getFleet(identity)).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.getHistory(identity, '2', new Date(Date.now()-3600_000).toISOString(), new Date().toISOString())).rejects.toThrow('No fue posible consultar el recorrido. Intenta nuevamente.');
  });
});
