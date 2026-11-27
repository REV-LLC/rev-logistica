import { TrackingMatchingService } from './tracking-matching.service';
import { TrackingService } from './tracking.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
describe('Private matching and authorization', () => {
 afterEach(() => { delete process.env.TRACKING_VALHALLA_URL; });
 it('never accepts public provider URLs or credentials', () => {
  for (const url of ['https://api.mapbox.com', 'http://user:secret@tracking-valhalla.railway.internal:8002', 'http://tracking-valhalla.railway.internal:8002?key=secret']) {
   process.env.TRACKING_VALHALLA_URL = url;
   expect(() => new TrackingMatchingService({} as never)).toThrow('Invalid private matching endpoint');
  }
 });
 it('reports unavailable when the private motor is unconfigured', async () => {
  const service = new TrackingMatchingService({} as never);
  expect(await service.status()).toEqual({available:false});
  await expect(service.match({})).rejects.toThrow('no está disponible');
 });
 it('denies matching to inactive accounts and machinery before engine calls', async () => {
  const prisma = { user:{findUnique:jest.fn().mockResolvedValue({active:false,role:'OFFICE'})} };
  const matching = {match:jest.fn()};
  const service = new TrackingService(prisma as never, {} as never, matching as never);
  const identity = {sub:'office',exp:Math.floor(Date.now()/1000)+300};
  await expect(service.matchRoads(identity,'3','','','')).rejects.toBeInstanceOf(ForbiddenException);
  prisma.user.findUnique.mockResolvedValue({active:true,role:'OFFICE'});
  await expect(service.matchRoads(identity,'1001','','','')).rejects.toBeInstanceOf(BadRequestException);
  expect(matching.match).not.toHaveBeenCalled();
 });
 it('rejects a journey outside the selected device and period', async () => {
  const matching = {match:jest.fn()};
  const service = new TrackingService({user:{findUnique:async()=>({active:true,role:'OFFICE'})}} as never, {} as never, matching as never);
  jest.spyOn(service,'getHistory').mockResolvedValue({deviceId:3,journeys:[{id:'3:1',segments:[]}]} as never);
  await expect(service.matchRoads({sub:'office',exp:Math.floor(Date.now()/1000)+300},'3','','','2:1')).rejects.toBeInstanceOf(BadRequestException);
  expect(matching.match).not.toHaveBeenCalled();
 });
});
