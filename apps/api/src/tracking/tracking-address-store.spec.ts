import { TrackingAddressStoreService } from './tracking-address-store.service';
describe('Persisting future Google validations',()=>{
 const result={countryCode:'CO',formattedAddress:'Carrera 22 #5a-07, Cali, Colombia',placeId:'place-id',location:{lat:3.44,lng:-76.53},verdict:{geocodeGranularity:'PREMISE'}};
 it('saves coordinates under both spellings without calling any provider again',async()=>{
  const upsert=jest.fn(),service=new TrackingAddressStoreService({trackingAddressLocation:{upsert}} as never);
  expect(await service.rememberValidatedAddress('Cra 22 #5a-07, Cali',result.formattedAddress,result)).toBe('located');
  expect(upsert).toHaveBeenCalledTimes(2);
  for(const [args]of upsert.mock.calls)expect(args.create).toMatchObject({status:'located',latitude:3.44,longitude:-76.53,provider:'google-address-validation',placeId:'place-id'});
  expect(upsert.mock.calls[0][0].create.expiresAt.getTime()-Date.now()).toBeGreaterThan(29*86400_000);
 });
 it('retains an imprecise result as requiring review',async()=>{
  const upsert=jest.fn(),service=new TrackingAddressStoreService({trackingAddressLocation:{upsert}} as never);
  expect(await service.rememberValidatedAddress('Calle 5','Calle 5, Cali',{...result,verdict:{geocodeGranularity:'ROUTE'}})).toBe('needs_review');
  expect(upsert.mock.calls[0][0].create).toMatchObject({latitude:3.44,longitude:-76.53,status:'needs_review'});
 });
});
