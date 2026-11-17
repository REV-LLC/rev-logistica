import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getToken, setToken, clearToken, markSessionExpiredNotice, consumeSessionExpiredNotice } from './auth.ts';
const storage = () => { const entries = new Map(); return {getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)}; };
function browser(t) {
  const previousWindow=globalThis.window;
  const previousEnv=process.env.NEXT_PUBLIC_DEPLOYMENT_ENV;
  process.env.NEXT_PUBLIC_DEPLOYMENT_ENV='production';
  const w={location:{pathname:'/'},localStorage:storage(),sessionStorage:storage()};
  globalThis.window=w;
  t.after(()=>{if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;if(previousEnv===undefined)delete process.env.NEXT_PUBLIC_DEPLOYMENT_ENV;else process.env.NEXT_PUBLIC_DEPLOYMENT_ENV=previousEnv;});
  return w;
}
test('MiREV never inherits the REV session; signing out affects only the current app', t=>{
  const w=browser(t);setToken('rev-fixture');w.location.pathname='/attendance/mobile';
  assert.equal(getToken(),null);setToken('mirev-fixture');assert.equal(getToken(),'mirev-fixture');
  w.location.pathname='/';assert.equal(getToken(),'rev-fixture');clearToken();
  w.location.pathname='/attendance/mobile';assert.equal(getToken(),'mirev-fixture');clearToken();assert.equal(getToken(),null);
});
test('only the MiREV route subtree uses its independent session',t=>{
  const w=browser(t);setToken('rev-fixture');w.location.pathname='/attendance/mobile/child';setToken('mirev-fixture');
  w.location.pathname='/attendance/mobile';assert.equal(getToken(),'mirev-fixture');
  for(const path of ['/attendance','/attendance/mobile-other','/inventory']){w.location.pathname=path;assert.equal(getToken(),'rev-fixture');}
});
test('expired-session notices are independent between apps',t=>{
  const w=browser(t);markSessionExpiredNotice();w.location.pathname='/attendance/mobile';assert.equal(consumeSessionExpiredNotice(),false);markSessionExpiredNotice();
  w.location.pathname='/';assert.equal(consumeSessionExpiredNotice(),true);assert.equal(consumeSessionExpiredNotice(),false);
  w.location.pathname='/attendance/mobile';assert.equal(consumeSessionExpiredNotice(),true);assert.equal(consumeSessionExpiredNotice(),false);
});
