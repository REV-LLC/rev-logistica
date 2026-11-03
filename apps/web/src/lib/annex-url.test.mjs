import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readAnnexLocation,annexLocationUrl,newAnnexPeriod} from './annex-url.ts';
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

test('new October monthly cut replaces the hidden November boundary in either edit order',()=>{
 for (const order of [['from','through'],['through','from']]) {
  let selected={from:'2026-11-01',to:'2026-11-15',through:'2026-11-01'};
  for(const key of order) selected=newAnnexPeriod(key==='from'?'2026-10-01':selected.from,key==='through'?'2026-10-31':selected.through);
  assert.deepEqual(selected,{from:'2026-10-01',to:'2026-10-31',through:'2026-10-31'});
  const state={customer:'client',worksite:'site',period:selected};
  assert.deepEqual(readAnnexLocation(new URL(annexLocationUrl('http://localhost/billing/annexes',state),'http://localhost').search,selected),state);
 }
 assert.throws(()=>readAnnexLocation('?from=2026-10-01&to=2026-11-01&through=2026-11-01',period));
});

test('folder links prefilter a customer or worksite without generating an annex',async()=>{
 const {annexBrowseUrl}=await import('./annex-url.ts');
 assert.deepEqual(readAnnexLocation(annexBrowseUrl({customer:'client',worksite:'site'}).split('?')[1],period),{customer:'client',worksite:'site',period,browse:true});
 assert.equal(readAnnexLocation(annexBrowseUrl({customer:'client'}).split('?')[1],period).worksite,null);
 const url=annexBrowseUrl({customer:'client',worksite:'site',draft:'saved',period});
 assert.equal(readAnnexLocation(url.split('?')[1],period).draft,'saved');
 assert.throws(()=>readAnnexLocation('?draft=saved',period));
 const folder=annexLocationUrl('http://localhost/billing/annexes?draft=old',{customer:'client',worksite:'site',period,browse:true});
 assert.equal(new URL(folder,'http://localhost').searchParams.has('draft'),false);
});
