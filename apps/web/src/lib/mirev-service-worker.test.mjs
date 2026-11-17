import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../public/mirev-sw.js',import.meta.url),'utf8');
function worker() {
 const events={},deleted=[],precached=[];let claimed=0;
 const caches={keys:async()=>['rev-logistica-shell-v6','mirev-shell-v0','mirev-shell-v1','other-app'],delete:async key=>{deleted.push(key);return true;},open:async()=>({addAll:async paths=>precached.push(...paths)}),match:async path=>({offline:path})};
 const context={URL,caches,fetch:async()=>{throw new Error('offline fixture');},self:{location:{origin:'https://staging.example'},addEventListener:(name,handler)=>events[name]=handler,skipWaiting(){},clients:{claim:async()=>{claimed++;}}}};
 vm.runInNewContext(source,context);
 return {events,deleted,precached,claimed:()=>claimed};
}
test('MiREV cache activation preserves REV Logística and other application caches',async()=>{
 const w=worker();let done;w.events.activate({waitUntil:p=>done=p});await done;
 assert.deepEqual(w.deleted,['mirev-shell-v0']);assert.equal(w.claimed(),1);
});
test('precache contains only MiREV offline screen and public brand assets',async()=>{
 const w=worker();let done;w.events.install({waitUntil:p=>done=p});await done;
 assert.ok(w.precached.includes('/mirev-offline.html'));assert.ok(w.precached.includes('/mirev-icon-512.png'));
 assert.ok(w.precached.every(path=>/\.(html|svg|png)$/.test(path)));
 assert.ok(!w.precached.includes('/attendance/mobile'));
});
test('offline navigations use MiREV fallback; POST and API requests are never intercepted',async()=>{
 const w=worker();let response;w.events.fetch({request:{method:'GET',url:'https://staging.example/attendance/mobile',mode:'navigate'},respondWith:p=>response=p});assert.deepEqual(await response,{offline:'/mirev-offline.html'});
 for(const req of [{method:'POST',url:'https://staging.example/attendance/punches',mode:'cors'},{method:'GET',url:'https://staging.example/api/attendance/me',mode:'cors'},{method:'GET',url:'https://api.example/attendance/me',mode:'cors'}]){
 let intercepted=false;w.events.fetch({request:req,respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false);
 }
});
