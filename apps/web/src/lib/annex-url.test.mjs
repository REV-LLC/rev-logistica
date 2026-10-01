import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readAnnexLocation,annexLocationUrl} from './annex-url.ts';
const period={from:'2026-09-16',to:'2026-09-30',through:'2026-09-27'};
test('round trip preserves selected client worksite and dates plus unrelated params',()=>{
 const state={customer:'client-1',worksite:'site-2',period};
 const url=annexLocationUrl('http://localhost/billing/annexes?extra=1#sheet',state);
 assert.deepEqual(readAnnexLocation(new URL(url,'http://localhost').search,period),state);
 assert.ok(url.includes('extra=1'));assert.ok(url.endsWith('#sheet'));
});
test('invalid and incomplete links do not silently choose other dates',()=>{
 for(const search of ['?customer=a&worksite=b&from=2026-09-31&to=2026-10-15&through=2026-10-02','?from=2026-09-16','?worksite=x','?customer=../../foo','?from=2026-09-16&to=2026-09-30&through=2026-10-01'])assert.throws(()=>readAnnexLocation(search,period));
 assert.equal(readAnnexLocation('',period),null);
 assert.equal(readAnnexLocation('?customer=a',period).customer,'a');
});
