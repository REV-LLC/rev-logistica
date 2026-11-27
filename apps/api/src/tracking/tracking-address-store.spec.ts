import { TrackingAddressStoreService } from './tracking-address-store.service';
import { groupAddresses } from './tracking-addresses';
describe('Persisting future address validations',()=>{
 afterEach(()=>{delete process.env.TRACKING_CUSTOMER_GEOCODING_ENABLED;delete process.env.TRACKING_GEOCODING_TOKEN;});
 it('reuses a permanent result for the formatted address and aliases the written address without a provider call',async()=>{
  const formatted='Carrera 22 #5a-07, Cali, Colombia',key=groupAddresses([{address:formatted,name:'address'}])[0].key;
  const row={key,status:'located',latitude:3.44,longitude:-76.53,provider:'mapbox-permanent',resolvedAddress:formatted};
  const upsert=jest.fn().mockResolvedValue(row),db={trackingAddressLocation:{upsert}};
  const service=new TrackingAddressStoreService(db as never);
  expect(await service.rememberValidatedAddress('Cra 22 #5a-07, Cali',formatted)).toBe('located');
  expect(upsert).toHaveBeenCalledTimes(2);
  expect(upsert.mock.calls[1][0].create).toMatchObject({status:'located',latitude:3.44,longitude:-76.53,provider:'mapbox-permanent'});
 });
 it('never promotes an uncertain validation to a plotted point',async()=>{
  const upsert=jest.fn().mockResolvedValue({key:'key',status:'needs_review'});
  const service=new TrackingAddressStoreService({trackingAddressLocation:{upsert}} as never);
  expect(await service.rememberValidatedAddress('Calle 5','Calle 5, Colombia')).toBe('needs_review');
  expect(upsert).toHaveBeenCalledTimes(2);
  expect(upsert.mock.calls[1][0].create).toMatchObject({canonicalKey:'key',status:'needs_review'});
 });
});
