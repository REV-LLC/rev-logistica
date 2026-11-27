const {test}=require('node:test');const assert=require('node:assert/strict');
const {validatePolicy,isWorkingTime,devicePolicy,PublicationCadence}=require('../../src/tracking/engine/tracking-policy.cjs');
// Fixture only; these hours are not REV's configured work schedule.
const config={vehicleIds:[2,3],slowSeconds:60,workWindows:[{days:[1,2,3,4,5],start:'07:00',end:'17:00'}]};
const at=s=>Date.parse(s);
test('requires explicit hours and allowed reduced cadence; never guesses an operating schedule',()=>{
 for(const p of [{...config,slowSeconds:2},{...config,workWindows:[]},{...config,workWindows:[{days:[8],start:'07:00',end:'17:00'}]},{...config,workWindows:[{days:[1],start:'24:00',end:'17:00'}]}])assert.throws(()=>validatePolicy(p));
 assert.deepEqual(validatePolicy(config),config);
});
test('uses Colombia time with inclusive start and exclusive end, respecting weekdays',()=>{
 assert.equal(isWorkingTime(config,at('2026-11-27T11:59:59Z')),false);
 assert.equal(isWorkingTime(config,at('2026-11-27T12:00:00Z')),true);
 assert.equal(isWorkingTime(config,at('2026-11-27T22:00:00Z')),false);
 assert.equal(isWorkingTime(config,at('2026-11-28T15:00:00Z')),false);
});
test('machines are always reduced and keep raw GPS; only vehicles match roads',()=>{
 const now=at('2026-11-27T15:00:00Z');
 assert.equal(devicePolicy(config,3,now).intervalSeconds,0);
 assert.deepEqual(devicePolicy(config,1001,now),{assetKind:'machine',mode:'reduced',intervalSeconds:60,roadMatching:false,timeZone:'America/Bogota'});
 assert.equal(devicePolicy({...config,slowSeconds:30},2,at('2026-11-27T23:00:00Z')).intervalSeconds,30);
});
test('independent device clocks enforce slow cadence and change automatically at shift boundaries',()=>{
 const cadence=new PublicationCadence(config),now=at('2026-11-27T21:59:50Z');
 cadence.mark(3,now);cadence.mark(1001,now);
 assert.equal(cadence.due(3,now+2000),true);assert.equal(cadence.due(1001,now+2000),false);
 assert.equal(cadence.due(3,now+11000),false);assert.equal(cadence.due(1001,now+60000),true);
 assert.equal(cadence.due(2,now),true);
});
test('overnight windows finish on the following day without making all of that day continuous',()=>{
 const overnight={...config,workWindows:[{days:[5],start:'22:00',end:'06:00'}]};
 assert.equal(isWorkingTime(overnight,at('2026-11-28T04:00:00Z')),true);
 assert.equal(isWorkingTime(overnight,at('2026-11-28T10:59:00Z')),true);
 assert.equal(isWorkingTime(overnight,at('2026-11-28T11:00:00Z')),false);
 assert.equal(isWorkingTime(overnight,at('2026-11-29T04:00:00Z')),false);
});
const {FleetPublication,CadencedNotifications}=require('../../src/tracking/engine/tracking-policy.cjs');
const rev=require('../../src/tracking/engine/tracking-policy.json');
test('configured REV schedule respects lunch, Saturday and Sunday with 30-second reduced updates',()=>{
 assert.equal(rev.slowSeconds,30);
 for(const date of ['2026-11-27T07:30:00-05:00','2026-11-27T11:59:59-05:00','2026-11-27T13:00:00-05:00','2026-11-28T07:00:00-05:00'])assert.equal(isWorkingTime(rev,at(date)),true,date);
 for(const date of ['2026-11-27T07:29:59-05:00','2026-11-27T12:00:00-05:00','2026-11-27T16:00:00-05:00','2026-11-28T11:00:00-05:00','2026-11-29T10:00:00-05:00'])assert.equal(isWorkingTime(rev,at(date)),false,date);
});
test('slow asset snapshots cannot update through a fast fleet request for another vehicle',()=>{
 const pub=new FleetPublication(rev),now=at('2026-11-27T09:00:00-05:00');
 const fleet=id=>({devices:[{id:3,position:{id}},{id:1001,position:{id}}],places:[]});
 pub.project(fleet(1),now);let result=pub.project(fleet(2),now+2000);
 assert.equal(result.devices[0].position.id,2);assert.equal(result.devices[1].position.id,1);
 result=pub.project(fleet(3),now+30000);assert.equal(result.devices[1].position.id,3);
 const slow=pub.project(fleet(4),at('2026-11-27T18:00:00-05:00'));assert.equal(slow.refreshSeconds,30);
 const again=pub.project(fleet(5),at('2026-11-27T18:00:02-05:00'));assert.equal(again.devices[0].position.id,4);
});
test('notifications coalesce slow updates without losing the final pending asset notification',()=>{
 const events=[],gate=new CadencedNotifications(rev,ids=>events.push(ids)),now=at('2026-11-27T09:00:00-05:00');
 gate.push([3,1001],now);gate.push([3,1001],now+2000);assert.deepEqual(events,[[3,1001],[3]]);
 gate.flush(now+29999);assert.equal(events.length,2);gate.flush(now+30000);assert.deepEqual(events.at(-1),[1001]);
});
test('client and server use identical schedule boundaries and device classification',()=>{
 require('ts-node').register({transpileOnly:true,project:require('node:path').resolve(__dirname,'../../tsconfig.json')});
 const {refreshPolicy}=require('../../../web/src/components/tracking/tracking-refresh.ts');
 for(const id of [2,3,1001])for(const date of ['2026-11-27T07:29:59-05:00','2026-11-27T07:30:00-05:00','2026-11-27T12:00:00-05:00','2026-11-27T13:00:00-05:00','2026-11-28T10:00:00-05:00','2026-11-29T10:00:00-05:00']){
  const server=devicePolicy(rev,id,at(date)),client=refreshPolicy({...rev,timeZone:'America/Bogota'},id,at(date));assert.equal(client.intervalSeconds,server.intervalSeconds);assert.equal(client.roadMatching,server.roadMatching);
 }
});
