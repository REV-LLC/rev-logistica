import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canAnimate,interpolatePosition} from '../components/tracking/tracking-motion.ts';
const now=Date.parse('2026-11-25T12:00:00Z');
const a={id:1,latitude:3.44,longitude:-76.53,reportedAt:new Date(now-10000).toISOString()};
const b={...a,id:2,latitude:3.4401,reportedAt:new Date(now).toISOString()};
test('truck animation accepts fresh measured fixes and rejects history, outages and impossible jumps',()=>{
 assert.equal(canAnimate(a,b,now),true);
 for(const target of [{...b,id:1},{...b,historical:true},{...b,latitude:4},{...b,reportedAt:'invalid'}])assert.equal(canAnimate(a,target,now),false);
 assert.equal(canAnimate({...a,historical:true},b,now),false);
 assert.equal(canAnimate({...a,reportedAt:new Date(now-60000).toISOString()},b,now),false);
 assert.equal(canAnimate(a,b,now+60000),false);
});
test('visual interpolation stops at the measured endpoint and never extrapolates',()=>{
 assert.deepEqual(interpolatePosition(a,b,-1),{latitude:a.latitude,longitude:a.longitude});
 assert.deepEqual(interpolatePosition(a,b,2),{latitude:b.latitude,longitude:b.longitude});
 assert.equal(interpolatePosition(a,b,.5).latitude,(a.latitude+b.latitude)/2);
});
