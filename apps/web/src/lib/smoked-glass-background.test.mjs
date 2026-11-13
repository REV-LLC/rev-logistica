import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const css = readFileSync(new URL('../app/dark-glass.css', import.meta.url), 'utf8');

test('smoked glass backdrop is scoped to dark shells without a photographic page background', () => {
  assert.match(css, /html\[data-mantine-color-scheme='dark'\] \.mantine-AppShell-main:not\(:has\(\[data-page-background='dark'\]\)\)::before/);
  assert.match(css, /background: #202326 url\('\/backgrounds\/smoked-glass-v1.webp'\) center \/ cover no-repeat/);
  assert.ok(existsSync(new URL('../../public/backgrounds/smoked-glass-v1.webp', import.meta.url)));
});

test('decorative backdrop is fixed, noninteractive, behind content and screen-only', () => {
  const rule = css.slice(css.indexOf('/* Photo-backed'), css.indexOf("html[data-mantine-color-scheme='dark'] :is(.mantine-Paper-root"));
  for (const declaration of ['position: fixed;', 'z-index: -1;', 'pointer-events: none;']) assert.ok(rule.includes(declaration));
  assert.ok(css.indexOf('@media screen') < css.indexOf('smoked-glass-v1.webp'));
  assert.doesNotMatch(rule, /\.mantine-Modal|data-document-paper|\.mantine-Input/);
});
