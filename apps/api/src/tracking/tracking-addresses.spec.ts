import { groupAddresses, customerMapPlaces, permanentAddressResult } from './tracking-addresses';
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
  for (const row of [{key:groups[0].key,status:'needs_review',latitude:3.44,longitude:-76.53},{key:groups[0].key,status:'located',latitude:0,longitude:0}]) expect(customerMapPlaces(groups,[row])).toEqual([]);
 });
 const feature=(patch:any={})=>({geometry:{type:'Point'},properties:{feature_type:'address',coordinates:{latitude:3.44,longitude:-76.53,accuracy:'rooftop'},context:{country:{country_code:'CO'}},match_code:{confidence:'high',street:'matched',address_number:'matched',place:'matched'},full_address:'Dirección confirmada',...patch}});
 it('accepts only an actual address in Colombia with a matched city and number',()=>{
  expect(permanentAddressResult({features:[feature()]})).toMatchObject({latitude:3.44});
  for(const patch of [{feature_type:'street'},{context:{country:{country_code:'US'}}},{coordinates:{latitude:3.44,longitude:-76.53,accuracy:'approximate'}},{match_code:{confidence:'low'}},{match_code:{confidence:'high',street:'matched',address_number:'matched',place:'inferred'}}])expect(permanentAddressResult({features:[feature(patch)]})).toBeNull();
 });
 it('does not silently choose one of two distant plausible locations',()=>{
  expect(permanentAddressResult({features:[feature(),feature({coordinates:{latitude:4.7,longitude:-74.1,accuracy:'rooftop'}})]})).toBeNull();
 });
});
