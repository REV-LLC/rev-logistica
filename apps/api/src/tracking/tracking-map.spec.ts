import { ServiceUnavailableException } from '@nestjs/common';
import { TrackingMapService } from './tracking-map.service';

describe('Fleet map consumption controls', () => {
  const prisma = { $queryRaw: jest.fn() };
  let service: TrackingMapService;
  beforeEach(() => {
    Object.assign(process.env, { TRACKING_MAP_ENABLED: 'true', TRACKING_MAPS_BROWSER_KEY: 'restricted-browser-test' });
    prisma.$queryRaw.mockResolvedValue([{ count: 1 }]);
    service = new TrackingMapService(prisma as never);
  });
  afterEach(() => {
    jest.clearAllMocks();
    for (const key of ['TRACKING_MAP_ENABLED', 'TRACKING_MAPS_BROWSER_KEY', 'TRACKING_MAPS_DAILY_LIMIT']) delete process.env[key];
  });
  it('does not reserve usage when disabled or the browser key is missing', async () => {
    delete process.env.TRACKING_MAP_ENABLED;
    expect((await service.mapConfiguration()).browserKey).toBeNull();
    process.env.TRACKING_MAP_ENABLED = 'true';
    delete process.env.TRACKING_MAPS_BROWSER_KEY;
    expect((await service.mapConfiguration()).browserKey).toBeNull();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('fails closed if the shared daily ceiling is reached or the counter is unavailable', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.mapConfiguration()).rejects.toMatchObject({ status: 429 });
    prisma.$queryRaw.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.mapConfiguration()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('caps map usage and reserves the Colombia day before exposing the browser key', async () => {
    process.env.TRACKING_MAPS_DAILY_LIMIT = '9999';
    const config = await service.mapConfiguration();
    expect(config).toMatchObject({ browserKey: 'restricted-browser-test', usage: { used: 1, limit: 200 } });
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    expect(prisma.$queryRaw.mock.calls[0][1]).toBe(`maps:${day}`);
  });
});

describe('Roads global daily budget',()=>{
 it('uses a distinct Colombia-day counter and a hard ceiling of 100, failing closed',async()=>{
  const query=jest.fn().mockResolvedValueOnce([{count:100}]).mockResolvedValueOnce([]);
  const service=new TrackingMapService({$queryRaw:query} as never);
  await expect(service.reserveRoads()).resolves.toBe(true);
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  expect(query.mock.calls[0][1]).toBe(`roads:${day}`);
  expect(query.mock.calls[0][2]).toBe(100);
  await expect(service.reserveRoads()).rejects.toMatchObject({status:429});
 });
});
