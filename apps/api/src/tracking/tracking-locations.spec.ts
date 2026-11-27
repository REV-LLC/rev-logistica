import { TrackingAddressStoreService } from './tracking-address-store.service';
import { TrackingLocationsService } from './tracking-locations.service';
describe('Customer point synchronization',()=>{
 let rows:any[],prisma:any,fetcher:jest.SpyInstance;
 beforeEach(()=>{
  rows=[];
  prisma={customer:{findMany:jest.fn().mockResolvedValue([{name:'Cliente',billingAddress:'Carrera 22 #5a-07, Cali'}])},worksite:{findMany:jest.fn().mockResolvedValue([])},trackingAddressLocation:{
   createMany:jest.fn(async({data})=>{for(const r of data)if(!rows.some(x=>x.key===r.key))rows.push({...r,status:'pending',latitude:null,longitude:null,attempts:0});}),
   findMany:jest.fn(async()=>rows),
   findUnique:jest.fn(async({where})=>rows.find(r=>r.key===where.key)),
   upsert:jest.fn(async({where,create,update})=>{let row=rows.find(r=>r.key===where.key);if(!row){row={...create,status:create.status||'pending',attempts:0};rows.push(row);}else Object.assign(row,update);return row;}),
   updateMany:jest.fn(async({where})=>{const row=rows.find(r=>r.key===where.key);if(!row||row.status!=='pending')return {count:0};row.status='processing';row.attempts++;return {count:1};}),
   update:jest.fn(async({where,data})=>Object.assign(rows.find(r=>r.key===where.key),data)),
  }};
  fetcher=jest.spyOn(global,'fetch');
 });
 afterEach(()=>{fetcher.mockRestore();delete process.env.TRACKING_CUSTOMER_GEOCODING_ENABLED;delete process.env.GOOGLE_MAPS_API_KEY;});
 it('performs no external request without explicit enablement and still plots saved coordinates',async()=>{
  prisma.worksite.findMany.mockResolvedValue([{name:'Obra',address:'Carrera 22 #5a-07, Cali',attendanceLatitude:3.44,attendanceLongitude:-76.53,customerWorksites:[{customer:{name:'Cliente'},alias:null}]}]);
  const service=new TrackingLocationsService(prisma,new TrackingAddressStoreService(prisma));await service.refresh();
  expect(fetcher).not.toHaveBeenCalled();expect(service.snapshot().places).toHaveLength(1);expect(service.snapshot().summary.located).toBe(1);
 });
 it('stores a Google response once per address and never consults on map openings',async()=>{
  process.env.TRACKING_CUSTOMER_GEOCODING_ENABLED='true';process.env.GOOGLE_MAPS_API_KEY='test-key';
  fetcher.mockImplementation(async url=>{expect(new URL(String(url)).hostname).toBe('addressvalidation.googleapis.com');return new Response(JSON.stringify({result:{address:{formattedAddress:'Carrera 22 #5a-07, Cali',postalAddress:{regionCode:'CO'}},geocode:{location:{latitude:3.44,longitude:-76.53},placeId:'place'},verdict:{geocodeGranularity:'PREMISE'}}}));});
  const service=new TrackingLocationsService(prisma,new TrackingAddressStoreService(prisma));await service.refresh();await service.refresh();service.snapshot();service.snapshot();
  expect(fetcher).toHaveBeenCalledTimes(1);expect(rows[0]).toMatchObject({status:'located',attempts:1,provider:'google-address-validation'});expect(rows[0].expiresAt).toBeInstanceOf(Date);expect(service.snapshot().places).toHaveLength(1);
 });
 it('does not repeatedly query ambiguous addresses',async()=>{
  process.env.TRACKING_CUSTOMER_GEOCODING_ENABLED='true';process.env.GOOGLE_MAPS_API_KEY='test-key';fetcher.mockResolvedValue(new Response(JSON.stringify({result:{address:{formattedAddress:'Carrera 22 #5a-07, Cali',postalAddress:{regionCode:'CO'}},geocode:{location:{latitude:3.44,longitude:-76.53}},verdict:{geocodeGranularity:'ROUTE'}}})));
  const service=new TrackingLocationsService(prisma,new TrackingAddressStoreService(prisma));await service.refresh();await service.refresh();
  expect(fetcher).toHaveBeenCalledTimes(1);expect(service.snapshot().summary.needsReview).toBe(1);
 });
 it('halts the batch and subsequent cycles when a provider key is rejected',async()=>{
  process.env.TRACKING_CUSTOMER_GEOCODING_ENABLED='true';process.env.GOOGLE_MAPS_API_KEY='test-key';fetcher.mockImplementation(async()=>new Response('{}',{status:403}));
  prisma.customer.findMany.mockResolvedValue([{name:'A',billingAddress:'Carrera 22 #5a-07, Cali'},{name:'B',billingAddress:'Calle 8a #22-29, Cali'}]);
  const service=new TrackingLocationsService(prisma,new TrackingAddressStoreService(prisma));await service.refresh();await service.refresh();expect(fetcher).toHaveBeenCalledTimes(2);expect(rows.filter(r=>r.status==='pending')).toHaveLength(1);
 });
});
