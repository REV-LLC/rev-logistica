import { ServiceUnavailableException } from '@nestjs/common';
import { TrackingMapService } from './tracking-map.service';
describe('Mapbox map configuration', () => {
 const prisma = { $queryRaw: jest.fn() };
 beforeEach(() => { prisma.$queryRaw.mockResolvedValue([{ count: 1 }]); });
 afterEach(() => { delete process.env.MAPBOX_ACCESS_TOKEN; jest.clearAllMocks(); });
 it('only exposes public map tokens and does not reserve a map without one', async () => {
  const service = new TrackingMapService(prisma as never);
  for (const token of ['', 'sk.secret']) {
   process.env.MAPBOX_ACCESS_TOKEN = token;
   expect(await service.mapConfiguration()).toEqual({ mapAvailable: false, mapboxToken: null });
  }
  expect(prisma.$queryRaw).not.toHaveBeenCalled();
 });
 it('records one map opening on the Colombia day without a daily ceiling', async () => {
  process.env.MAPBOX_ACCESS_TOKEN = 'pk.public';
  const result = await new TrackingMapService(prisma as never).mapConfiguration();
  expect(result).toMatchObject({ mapboxToken: 'pk.public', usage: { mapLoads: 1 } });
  expect(prisma.$queryRaw.mock.calls[0][1]).toMatch(/^mapbox-map:/);
 });
 it('returns a safe message when consumption storage is unavailable', async () => {
  process.env.MAPBOX_ACCESS_TOKEN = 'pk.public'; prisma.$queryRaw.mockRejectedValue(new Error('private internals'));
  await expect(new TrackingMapService(prisma as never).mapConfiguration()).rejects.toBeInstanceOf(ServiceUnavailableException);
 });
});
