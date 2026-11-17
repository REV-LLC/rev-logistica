import { test } from 'node:test';
import assert from 'node:assert/strict';
import mainManifest from '../app/manifest.ts';
import { GET } from '../app/attendance/mobile/manifest.webmanifest/route.ts';
test('REV Logística and MiREV have distinct install identities, names and icon sets',async()=>{
 const rev=mainManifest(), response=GET(), mine=await response.json();
 assert.equal(rev.name,'REV Logística');assert.equal(rev.id,'/');assert.equal(rev.start_url,'/');
 assert.equal(mine.name,'MiREV');assert.equal(mine.short_name,'MiREV');assert.notEqual(mine.id,rev.id);
 assert.equal(mine.start_url,'/attendance/mobile');assert.equal(mine.scope,'/attendance/mobile');
 assert.ok(mine.icons.every(icon=>icon.src.startsWith('/mirev-icon-')));
 assert.ok(rev.icons.every(icon=>!icon.src.startsWith('/mirev-')));
 assert.match(response.headers.get('content-type'),/application\/manifest\+json/);
});
