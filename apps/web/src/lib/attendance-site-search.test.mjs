import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchAttendanceSites} from './attendance-site-search.ts';
const site=(id,name,customer,alias=null)=>({id,alias,customer:{name:customer},worksite:{name}});
const sites=[site('tower','Edificio Los Álamos','Constructora Pérez','TORRE NORTE'),site('lot','Lote','Renta Equipos del Valle'),site('warehouse','Bodega Renta Equipos del Valle','RENTA EQUIPOS DEL VALLE')];
test('bodega comes first without changing original order or automatically selecting it',()=>{
 assert.deepEqual(searchAttendanceSites(sites,'').map(x=>x.id),['warehouse','tower','lot']);assert.equal(sites[0].id,'tower');
});
test('search matches customer, worksite and alias without accents or case',()=>{
 for(const query of ['PEREZ','alamos','torre norte']) assert.deepEqual(searchAttendanceSites(sites,query).map(x=>x.id),['tower']);
});
test('words can combine customer and worksite and results update for empty query',()=>{
 assert.deepEqual(searchAttendanceSites(sites,'  perez   norte  ').map(x=>x.id),['tower']);
 assert.deepEqual(searchAttendanceSites(sites,'renta').map(x=>x.id),['warehouse','lot']);
 assert.equal(searchAttendanceSites(sites,'   ').length,3);
});
test('no matches and no sites return an empty list',()=>{
 assert.deepEqual(searchAttendanceSites(sites,'no-existe'),[]);assert.deepEqual(searchAttendanceSites([],'renta'),[]);
});
