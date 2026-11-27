import { groupAddresses, customerMapPlaces, mergeCustomerPlaces, googleAddressPoint } from './tracking-addresses';
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
 it('marks a general Google coordinate as approximate for display, rather than a confirmed known site',()=>{const groups=groupAddresses([source]);expect(customerMapPlaces(groups,[{key:groups[0].key,status:'needs_review',latitude:3.44,longitude:-76.53}])[0]).toMatchObject({approximate:true});});
 it('shares a marker for co-located customers while retaining their names',()=>{const groups=groupAddresses([source,{address:'Otra dirección, Cali',name:'Cliente B'}]);const places=customerMapPlaces(groups,groups.map(g=>({key:g.key,status:'located',latitude:3.44,longitude:-76.53})));expect(places).toHaveLength(2);const merged=mergeCustomerPlaces(places);expect(merged).toHaveLength(1);expect(merged[0].name).toBe('Cliente A · Cliente B');});
 const result=(patch:any={})=>({countryCode:'CO',formattedAddress:'Dirección confirmada',location:{lat:3.44,lng:-76.53},verdict:{geocodeGranularity:'PREMISE'},...patch});
 it('accepts actual Google coordinates and records precision explicitly',()=>{
  expect(googleAddressPoint(result())).toMatchObject({latitude:3.44,precise:true});
  for(const patch of [{countryCode:'US'},{location:null},{location:{lat:0,lng:0}}])expect(googleAddressPoint(result(patch))).toBeNull();
 });
 it('retains general coordinates for review without declaring a building-level fix',()=>{
  for(const geocodeGranularity of ['ROUTE','OTHER'])expect(googleAddressPoint(result({verdict:{geocodeGranularity}}))).toMatchObject({latitude:3.44,precise:false});
 });
});
