import { groupAddresses, customerMapPlaces, mergeCustomerPlaces, googleAddressPoint, automaticAddressParams, sameStreetAddress } from './tracking-addresses';
describe('Automatic customer map points',()=>{
 const source={address:'Cra 22 #5A-07, Cali',name:'Cliente A'};
 it('groups repeated addresses and reuses worksite coordinates without changing the address',()=>{
  const groups=groupAddresses([source,{address:'Carrera 22 5A 07 Cali',name:'Cliente B',latitude:3.44,longitude:-76.53}]);
  expect(groups).toHaveLength(1); expect(groups[0].names).toEqual(['Cliente A','Cliente B']);
  const points=customerMapPlaces(groups,[]);
  expect(points).toHaveLength(1); expect(points[0]).toMatchObject({name:'Cliente A · Cliente B',latitude:3.44,siteType:'customer',radiusMeters:50});
  expect(points[0].id).toBeLessThan(0);
 });
 it('does not mix two cities and removes inactive sources from the projected map',()=>{
  const groups=groupAddresses([source,{...source,address:source.address.replace('Cali','Bogotá')}]);
  expect(groups).toHaveLength(2);
  const rows=groups.map(g=>({key:g.key,status:'located',latitude:3.44,longitude:-76.53}));
  expect(customerMapPlaces([groups[0]],rows)).toHaveLength(1);
  expect(customerMapPlaces([],rows)).toEqual([]);
 });
 it('never plots failed or missing geocodes or invalid coordinates',()=>{
  const groups=groupAddresses([source,{address:' ',name:'Empty'}]);
  for (const row of [{key:groups[0].key,status:'pending',latitude:null,longitude:null},{key:groups[0].key,status:'located',latitude:0,longitude:0}]) expect(customerMapPlaces(groups,[row])).toEqual([]);
 });
 it('omits approximate coordinates instead of plotting an unverified street or city',()=>{const groups=groupAddresses([source]);expect(customerMapPlaces(groups,[{key:groups[0].key,status:'needs_review',latitude:3.44,longitude:-76.53}])).toEqual([]);});
 it('shares a marker for co-located customers while retaining their names',()=>{const groups=groupAddresses([source,{address:'Otra dirección, Cali',name:'Cliente B'}]);const places=customerMapPlaces(groups,groups.map(g=>({key:g.key,status:'located',latitude:3.44,longitude:-76.53})));expect(places).toHaveLength(2);const merged=mergeCustomerPlaces(places);expect(merged).toHaveLength(1);expect(merged[0].name).toBe('Cliente A · Cliente B');});
 const result=(patch:any={})=>({countryCode:'CO',context:{city:'Cali'},googleContext:{city:'Cali'},formattedAddress:'Dirección confirmada',location:{lat:3.44,lng:-76.53},verdict:{geocodeGranularity:'PREMISE'},...patch});
 it('accepts actual Google coordinates and records precision explicitly',()=>{
  expect(googleAddressPoint(result())).toMatchObject({latitude:3.44,precise:true});
  for(const patch of [{countryCode:'US'},{location:null},{location:{lat:0,lng:0}}])expect(googleAddressPoint(result(patch))).toBeNull();
 });
 it('rejects street and city centroids',()=>{
  for(const geocodeGranularity of ['ROUTE','OTHER'])expect(googleAddressPoint(result({verdict:{geocodeGranularity}}))).toBeNull();
 });
 it('rejects another city even when Google declares a precise address',()=>{
  expect(googleAddressPoint(result({googleContext:{city:'Barranquilla'},location:{lat:10.94,lng:-74.78}}))).toBeNull();
  expect(googleAddressPoint(result({location:{lat:7.14,lng:-73.12}}))).toBeNull();
 });
 it('rejects a changed street type or number while allowing formatting changes',()=>{
  expect(sameStreetAddress('CR 22 5A 07','Carrera 22 #5A-07, Cali')).toBe(true);
  expect(sameStreetAddress('CR 2 B 126 A 36','Calle 14 Oeste #126 A 36, Cali')).toBe(false);
  expect(sameStreetAddress('CL 30 B 57 42','Carrera 30B #57-42, Cali')).toBe(false);
 });
 it('uses Cali as explicit context for bare addresses and skips placeholders',()=>{
  expect(automaticAddressParams('CR 22 5A 07')).toMatchObject({city:'Cali',department:'Valle del Cauca'});
  expect(automaticAddressParams('Calle 10 #22A-296, Yumbo, Valle del Cauca')).toMatchObject({city:'Yumbo'});
  for(const address of ['CL NN ALAMEDA','FALTA','CARRERA 22','Calle 5 #1-2, Cúcuta, Norte de Santander'])expect(automaticAddressParams(address)).toBeNull();
 });
});
