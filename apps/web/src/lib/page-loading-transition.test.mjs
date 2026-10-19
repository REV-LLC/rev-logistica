import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('shared loading glass preserves each page background without a tint or saturation change', () => {
  const css = readFileSync(new URL('../components/PageLoadingBoundary.module.css', import.meta.url), 'utf8');
  const overlay = css.match(/\.overlay\s*\{([^}]+)\}/)?.[1];
  assert.match(overlay, /background:\s*transparent\s*;/);
  assert.match(overlay, /backdrop-filter:\s*blur\(18px\)\s*;/);
  assert.doesNotMatch(css, /saturate\(|:global\((?:html|body)\)|background-color:/);
  for (const name of ['glass-enter', 'glass-reveal']) {
    const frames = css.slice(css.indexOf(`@keyframes ${name}`) + 1).split('@')[0];
    assert.doesNotMatch(frames, /background\s*:/);
    assert.match(frames, /blur\(0px\)/);
    assert.match(frames, /blur\(18px\)/);
  }
});
