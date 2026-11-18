import { BadRequestException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { TrackingRoutingService } from './tracking-routing.service';

describe('Traffic routing consumption controls', () => {
  let service: TrackingRoutingService;
  let fetchMock: jest.SpyInstance;
  const prisma = { $queryRaw: jest.fn() };
  const origin = () => ({ id: 20, latitude: 3.44, longitude: -76.53, reportedAt: new Date().toISOString() });
  const destination = { address: 'Calle 10 #25-30, Cali' };
  beforeEach(() => {
    Object.assign(process.env, { TRACKING_ROUTES_ENABLED: 'true', TRACKING_MAPS_BROWSER_KEY: 'public-restricted-test', TRACKING_ROUTES_API_KEY: 'private-key-test' });
    prisma.$queryRaw.mockResolvedValue([{ count: 1 }]);
    service = new TrackingRoutingService(prisma as never);
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ routes: [{ distanceMeters: 5000, duration: '900s', polyline: { encodedPolyline: 'test-polyline' }, legs: [{ endLocation: { latLng: { latitude: 3.45, longitude: -76.54 } } }] }] })));
  });
  afterEach(() => { fetchMock.mockRestore(); jest.clearAllMocks(); for (const key of ['TRACKING_ROUTES_ENABLED','TRACKING_MAPS_BROWSER_KEY','TRACKING_ROUTES_API_KEY','TRACKING_ROUTES_DAILY_LIMIT','TRACKING_MAPS_DAILY_LIMIT']) delete process.env[key]; });
  it('does not spend anything until explicitly enabled and keys configured', async () => {
    delete process.env.TRACKING_ROUTES_ENABLED;
    expect((await service.mapConfiguration()).browserKey).toBeNull();
    await expect(service.calculate(origin(), destination, 'Obra')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects stale origins before reserving budget', async () => {
    await expect(service.calculate({ ...origin(), reportedAt: new Date(Date.now()-301_000).toISOString() }, destination, 'Obra')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('fails closed when the daily ceiling is reached or the counter is unavailable', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.calculate(origin(), destination, 'Obra')).rejects.toMatchObject({ status: 429 });
    prisma.$queryRaw.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.calculate(origin(), destination, 'Obra')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('uses traffic-aware routes and a narrow field mask, never returns the private key', async () => {
    const result = await service.calculate(origin(), destination, 'Obra');
    expect(result).toMatchObject({ durationSeconds: 900, distanceMeters: 5000, traffic: true, usage: { used: 1, limit: 100 } });
    expect(JSON.stringify(result)).not.toContain('private-key-test');
    const options = fetchMock.mock.calls[0][1]!;
    expect(JSON.parse(String(options.body))).toMatchObject({ travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', computeAlternativeRoutes: false });
    expect(String((options.headers as any)['X-Goog-FieldMask'])).not.toContain('*');
  });
  it('counts provider errors conservatively and redacts provider responses', async () => {
    fetchMock.mockResolvedValue(new Response('secret provider payload', { status: 403 }));
    await expect(service.calculate(origin(), destination, 'Obra')).rejects.toThrow('No fue posible calcular la ruta con tráfico. Intenta nuevamente.');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('caps configured ceilings and only exposes the restricted browser key in map config', async () => {
    process.env.TRACKING_ROUTES_DAILY_LIMIT = '9999'; process.env.TRACKING_MAPS_DAILY_LIMIT = '9999';
    expect(service.configuration()).toMatchObject({ routeDailyLimit: 100, mapDailyLimit: 200 });
    const config = await service.mapConfiguration();
    expect(config.browserKey).toBe('public-restricted-test'); expect(JSON.stringify(config)).not.toContain('private-key-test');
    expect(prisma.$queryRaw.mock.calls[0][1]).toMatch(/^maps:/);
  });
  it('handles an empty route result as a destination error', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ routes: [] })));
    await expect(service.calculate(origin(), destination, 'Obra')).rejects.toBeInstanceOf(HttpException);
  });
});
