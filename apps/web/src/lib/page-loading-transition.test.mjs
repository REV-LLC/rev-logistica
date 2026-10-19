import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadingRevealDelay, PAGE_LOADING_ENTER_MS, PAGE_LOADING_REVEAL_MS } from './page-loading-transition.ts';

test('cached pages finish the glass entrance before revealing the destination', () => {
  assert.equal(loadingRevealDelay(0), 220);
  assert.equal(loadingRevealDelay(90), 130);
  assert.equal(loadingRevealDelay(-10), PAGE_LOADING_ENTER_MS);
});

test('slow loads reveal immediately when ready, with no additional holding delay', () => {
  assert.equal(loadingRevealDelay(220), 0);
  assert.equal(loadingRevealDelay(15000), 0);
  assert.equal(PAGE_LOADING_REVEAL_MS, 320);
});
