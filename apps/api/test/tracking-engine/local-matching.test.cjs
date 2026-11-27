const {test}=require('node:test');const assert=require('node:assert/strict');
const {LocalMatching,matchingGroups,parseMatch,decodeShape}=require('../../src/tracking/engine/local-matching.cjs');
const now=Date.parse('2026-11-25T18:00:00Z');
const make=(count=10,interval=10000)=>Array.from({length:count},(_,i)=>({id:i+1,latitude:3.44+i*.0001,longitude:-76.53,reportedAt:new Date(now+i*interval).toISOString()}));
function encode(points){let last=[0,0],result='';for(const p of points){const current=[Math.round(p.latitude*1e6),Math.round(p.longitude*1e6)];for(let i=0;i<2;i++){let delta=current[i]-last[i];let value=delta<0?~(delta<<1):delta<<1;while(value>=32){result+=String.fromCharCode((32|(value&31))+63);value>>>=5;}result+=String.fromCharCode(value+63);}last=current;}return result;}
const data=points=>({shape:encode(points),confidence_score:.9,matched_points:points.map(p=>({lat:p.latitude,lon:p.longitude,type:'matched',edge_index:0})),edges:[{begin_shape_index:0,end_shape_index:points.length-1}]});
const reply=(value,ok=true)=>({ok,status:ok?200:503,json:async()=>value});
function echo(url,options){assert.equal(url,'http://127.0.0.1:8002/trace_attributes');const body=JSON.parse(options.body);return reply(data(body.shape.map(p=>({longitude:p.lon,latitude:p.lat}))));}
test('GPS matching is POSTed only to our loopback engine, with actual times and no access token',async()=>{
 let calls=0;const points=make();const engine=new LocalMatching({fetcher:async(url,options)=>{calls++;assert.equal(url,'http://127.0.0.1:8002/trace_attributes');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');const body=JSON.parse(options.body);assert.equal(body.shape_match,'map_snap');assert.deepEqual(body.shape.map(p=>p.time),points.map(p=>Date.parse(p.reportedAt)/1000));assert.equal(body.access_token,undefined);return reply(data(points));}});
 const history={deviceId:3,segments:[points]};const [a,b]=await Promise.all([engine.match(history),engine.match(history)]);assert.equal(a,b);assert.equal(a.source,'valhalla');assert.equal(a.coverage,1);await engine.match(history);assert.equal(calls,1);
});
test('new fixes update only the tail, immediately, for dense GPS and sparse tablet reports',async()=>{
 let calls=0;const engine=new LocalMatching({fetcher:async(...args)=>{calls++;return echo(...args);}});
 assert.equal((await engine.match({deviceId:3,segments:[make(120)]})).requests,2);
 const next=await engine.match({deviceId:3,segments:[make(121)]});assert.equal(next.requests,1);assert.equal(next.pending,false);assert.equal(next.matchedPointCount,121);assert.equal(calls,3);
 assert.equal((await engine.match({deviceId:2,segments:[make(10,152000)]})).coverage,1);assert.equal(calls,4);
});
test('splits outages, batches at 100 with shared endpoints and never mutates GPS data',()=>{
 const points=make(120),before=JSON.stringify(points),groups=matchingGroups({segments:[points]});assert.equal(groups.length,2);assert.equal(groups[0].at(-1),groups[1][0]);assert.equal(JSON.stringify(points),before);
 assert.deepEqual(matchingGroups({segments:[[points[0],{...points[1],reportedAt:new Date(now+700000).toISOString()}]]}),[]);
 assert.deepEqual(matchingGroups({segments:[points.map(p=>({...p,latitude:3.44}))]}),[]);
});
test('no usable match is not presented as a successful route; no paid fallback is called',async()=>{
 for(const fetcher of [async()=>reply({error_code:444,error:'No matching'}),async()=>{throw new Error('offline');},async()=>reply({},false)]){
  let outcome;const engine=new LocalMatching({fetcher,record:value=>{outcome=value;}});const result=await engine.match({deviceId:2,segments:[make()]});assert.deepEqual(result.segments,[]);assert.equal(result.coverage,0);assert.equal(result.through,null);assert.equal(outcome.matched,false);assert.ok(outcome.durationMs>=0);
 }
});
test('rejects malformed shapes, low confidence and distant snapped positions',()=>{
 const points=make();for(const mutate of [d=>{d.shape='?';},d=>{d.confidence_score=.4;},d=>{d.matched_points[0].lat=0;},d=>{d.shape=encode([{latitude:0,longitude:0},points.at(-1)]);}]){const value=data(points);mutate(value);assert.deepEqual(parseMatch(value,points).segments,[]);}
 assert.throws(()=>decodeShape('~~~~~~~'));assert.throws(()=>decodeShape('\u0000'));
 const roundtrip=decodeShape(encode(points));assert.equal(roundtrip.length,points.length);assert.ok(Math.abs(roundtrip[0].latitude-points[0].latitude)<.000001);
});
test('never draws a straight connector across a Valhalla discontinuity',()=>{
 const points=make(4),value=data(points);value.matched_points[1].begin_route_discontinuity=true;value.matched_points[2].end_route_discontinuity=true;value.matched_points[2].edge_index=1;value.matched_points[3].edge_index=1;value.edges=[{begin_shape_index:0,end_shape_index:1},{begin_shape_index:2,end_shape_index:3}];
 const result=parseMatch(value,points);assert.equal(result.segments.length,2);assert.equal(result.partial,true);
 delete value.edges;assert.deepEqual(parseMatch(value,points).segments,[]);
});
test('continues remaining batches immediately and reuses earlier geometry',async()=>{
 let calls=0;const engine=new LocalMatching({maxRequests:1,fetcher:async(...args)=>{calls++;return echo(...args);}});const h={deviceId:3,segments:[make(120)]};assert.equal((await engine.match(h)).pending,true);const result=await engine.match(h);assert.equal(result.pending,false);assert.equal(result.matchedPointCount,120);assert.equal(calls,2);
});
test('health checks stay local and do not claim availability before tiles are ready',async()=>{
 for(const has_tiles of [true,false]){const engine=new LocalMatching({fetcher:async url=>{assert.equal(url,'http://127.0.0.1:8002/status');return reply({has_tiles,version:'3.test'});}});assert.equal((await engine.status()).available,has_tiles);}
 assert.equal((await new LocalMatching({fetcher:async()=>{throw new Error('offline');}}).status()).available,false);
});

test('normal Valhalla status uses loaded tileset timestamp without requesting disabled verbose mode',async()=>{
 for(const tileset_last_modified of [0,1795787181]){
  const engine=new LocalMatching({fetcher:async url=>{assert.equal(url,'http://127.0.0.1:8002/status');return reply({version:'3.9.3',tileset_last_modified,available_actions:['trace_attributes']});}});
  assert.equal((await engine.status()).available,tileset_last_modified>0);
 }
});
