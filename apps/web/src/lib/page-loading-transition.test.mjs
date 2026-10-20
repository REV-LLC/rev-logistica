import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadingRevealDelay, PAGE_LOADING_ENTER_MS, PAGE_LOADING_REVEAL_MS, PAGE_LOADING_MIN_VISIBLE_MS } from './page-loading-transition.ts';

test('cached pages keep the loader visible for at least a second before revealing the destination', () => {
  assert.equal(PAGE_LOADING_MIN_VISIBLE_MS, 1000);
  assert.ok(PAGE_LOADING_MIN_VISIBLE_MS >= PAGE_LOADING_ENTER_MS);
  assert.equal(loadingRevealDelay(0), 1000);
  assert.equal(loadingRevealDelay(90), 910);
  assert.equal(loadingRevealDelay(220), 780);
  assert.equal(loadingRevealDelay(999), 1);
  assert.equal(loadingRevealDelay(-10), PAGE_LOADING_MIN_VISIBLE_MS);
});

test('slow loads reveal immediately when ready, with no additional holding delay', () => {
  assert.equal(loadingRevealDelay(1000), 0);
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

test('loading logo reserves its frame at the viewport center from first paint through reveal', () => {
  const css = readFileSync(new URL('../components/PageLoadingBoundary.module.css', import.meta.url), 'utf8');
  const message = css.match(/\.message\s*\{([^}]+)\}/)?.[1];
  assert.match(message, /position:\s*fixed;/);
  assert.match(message, /left:\s*calc\(50vw - 78px\);/);
  assert.match(message, /top:\s*calc\(50dvh - 39px\);/);
  assert.match(message, /width:\s*156px;/);
  assert.doesNotMatch(message, /var\(--app-shell|transform:/);
  const reveal = css.match(/\.overlay\[data-phase='revealing'\] \.message\s*\{([^}]+)\}/)?.[1];
  assert.match(reveal, /opacity:\s*0;/);
  assert.doesNotMatch(reveal, /transform|left|top/);
});

test('initial loading HTML reserves viewport positioning before external CSS or fonts arrive', () => {
  const source = readFileSync(new URL('../components/PageLoadingOverlay.tsx', import.meta.url), 'utf8');
  assert.match(source, /const overlayFrame: CSSProperties = \{ position: 'fixed', inset: 0, zIndex: 11000 \}/);
  assert.match(source, /position: 'fixed', left: 'calc\(50vw - 78px\)', top: 'calc\(50dvh - 39px\)', width: 156/);
  assert.match(source, /style=\{logoFrame\}/);
  assert.match(source, /const logoImage: CSSProperties = \{ display: 'block', width: 156, height: 78 \}/);
  assert.match(source, /style=\{logoImage\}/);
});

test('coordinated navigation paints the old page glass before scheduling the destination', () => {
  const source = readFileSync(new URL('../components/PageLoadingBoundary.tsx', import.meta.url), 'utf8');
  assert.match(source, /flushSync\(beginNavigation\);\s*entryFrame\.current = requestAnimationFrame\(\(\) => \{\s*entryTimer\.current = setTimeout\(navigate, PAGE_LOADING_ENTER_MS\);/);
  assert.match(source, /prefers-reduced-motion: reduce[^\n]+\{ navigate\(\); return; \}/);
  assert.match(source, /clearTimeout\(entryTimer\.current\)/);
  assert.match(source, /cancelAnimationFrame\(entryFrame\.current\)/);
});

test('links coordinate only uncanceled Next same-tab navigations, and sidebar search shares the gate', () => {
  const link = readFileSync(new URL('../components/PageTransitionLink.tsx', import.meta.url), 'utf8');
  assert.match(link, /<Link[^\n]+data-page-transition-link="true" onNavigate=/);
  assert.match(link, /if \(canceled \|\| !isPageNavigation/);
  assert.match(link, /event\.preventDefault\(\);\s*navigateAfterEntrance\(/);
  assert.match(link, /router\.replace\(href, \{ scroll \}\)/);
  assert.match(link, /router\.push\(href, \{ scroll \}\)/);
  const search = readFileSync(new URL('../components/SidebarSearch.tsx', import.meta.url), 'utf8');
  assert.match(search, /if \(destination\.pathname !== location\.pathname \|\| destination\.search !== location\.search\)/);
  assert.match(search, /navigateAfterEntrance\(\(\) => startNavigation\(\(\) => router\.push\(href\)\)\)/);
});
