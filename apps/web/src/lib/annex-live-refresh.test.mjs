import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startAnnexLiveRefresh } from './annex-live-refresh.ts';
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function setup(t, load) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const window = new EventTarget(), document = new EventTarget();
  document.visibilityState = 'visible';
  const applied = [], errors = [];
  const stop = startAnnexLiveRefresh({ window, document, load, apply: v => applied.push(v), onError: e => errors.push(e) });
  t.after(stop);
  return { window, document, applied, errors, stop };
}
test('focus and visibility share a request; periodic refresh never overlaps it', async t => {
  let calls = 0, finish;
  const s = setup(t, () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  assert.equal(calls, 0);
  s.window.dispatchEvent(new Event('focus'));
  s.document.dispatchEvent(new Event('visibilitychange'));
  t.mock.timers.tick(150);
  assert.equal(calls, 1);
  t.mock.timers.tick(60_000);
  assert.equal(calls, 1);
  finish({ total: 123 }); await flush();
  assert.deepEqual(s.applied, [{ total: 123 }]);
  t.mock.timers.tick(60_000);
  assert.equal(calls, 2);
});
test('editing or changing context stops requests and ignores a late response', async t => {
  let finish, signal, calls = 0;
  const s = setup(t, value => { calls++; signal = value; return new Promise(resolve => { finish = resolve; }); });
  s.window.dispatchEvent(new Event('focus')); t.mock.timers.tick(150);
  s.stop();
  assert.equal(signal.aborted, true);
  finish('old data'); await flush();
  s.window.dispatchEvent(new Event('focus')); t.mock.timers.tick(120_000);
  assert.deepEqual(s.applied, []);
  assert.equal(calls, 1);
});
test('hidden tabs do not poll and returning to them refreshes', async t => {
  let calls = 0;
  const s = setup(t, async () => ++calls);
  s.document.visibilityState = 'hidden';
  t.mock.timers.tick(120_000); await flush();
  assert.equal(calls, 0);
  s.document.visibilityState = 'visible';
  s.document.dispatchEvent(new Event('visibilitychange')); t.mock.timers.tick(150); await flush();
  assert.deepEqual(s.applied, [1]);
});
test('connection failures keep retrying without replacing displayed data', async t => {
  let calls = 0;
  const s = setup(t, async () => { if (++calls === 1) throw new Error('offline'); return 'fresh'; });
  t.mock.timers.tick(60_000); await flush();
  assert.equal(s.errors.length, 1); assert.deepEqual(s.applied, []);
  t.mock.timers.tick(60_000); await flush();
  assert.deepEqual(s.applied, ['fresh']);
});
