import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { TrackingService } from './tracking.service';

describe('Tracking fleet and history boundaries', () => {
  const identity = { sub: 'office', exp: Math.floor(Date.now() / 1000) + 3600 };
  const prisma = { user: { findUnique: jest.fn() } };
  const maps = { mapConfiguration: jest.fn() };
  let service: TrackingService;
  let mock: jest.SpyInstance;
  let positions: any[];
  let retired = false;
  const response = (value: unknown) => new Response(JSON.stringify(value));
  beforeEach(() => {
    Object.assign(process.env, { TRACCAR_WEB_URL: 'https://gps.revcontractorsllc.com', TRACCAR_INTEGRATION_EMAIL: 'integration', TRACCAR_INTEGRATION_PASSWORD: 'private-password' });
    prisma.user.findUnique.mockResolvedValue({ id: 'office', active: true, role: 'OFFICE' });
    retired = false;
    positions = [{ id: 20, deviceId: 2, valid: true, latitude: 3.44, longitude: -76.53, fixTime: new Date().toISOString(), attributes: { batteryLevel: 50 } }];
    service = new TrackingService(prisma as never, maps as never);
    mock = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = new URL(String(url));
      if (u.pathname === '/api/devices') return response([{ id: 2, name: 'GVU047', positionId: 20, status: 'online', disabled:retired }]);
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
  it('distinguishes a connected tracker with an invalid fix from a current GPS location', async () => {
    positions[0].valid = false;
    positions[0].serverTime = new Date().toISOString();
    positions[0].attributes = { ignition: false };
    const device = (await service.getFleet(identity)).devices[0];
    expect(device.connection).toBe('online');
    expect(device.position).toBeNull();
    expect(device.latestReport).toMatchObject({ valid: false, ignition: false, receivedAt: positions[0].serverTime });
    expect(device.knownPlaces).toEqual([]);
  });
  it('hides a retired tablet and rejects its history in REV without deleting native records', async () => {
    retired = true;
    expect((await service.getFleet(identity)).devices).toEqual([]);
    await expect(service.getHistory(identity,'2',new Date(Date.now()-3600000).toISOString(),new Date().toISOString())).rejects.toBeInstanceOf(BadRequestException);
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
  it('sanitizes native service errors', async () => {
    mock.mockRejectedValue(new Error('private-password and coordinates'));
    service = new TrackingService(prisma as never, maps as never);
    await expect(service.getFleet(identity)).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.getHistory(identity, '2', new Date(Date.now()-3600_000).toISOString(), new Date().toISOString())).rejects.toThrow('No fue posible consultar el recorrido. Intenta nuevamente.');
  });
});
