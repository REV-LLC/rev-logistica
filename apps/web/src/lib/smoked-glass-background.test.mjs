import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const css = readFileSync(new URL('../app/dark-glass.css', import.meta.url), 'utf8');

test('smoked glass backdrop is scoped to dark shells without a photographic page background', () => {
  assert.match(css, /html\[data-mantine-color-scheme='dark'\] \.mantine-AppShell-main:not\(:has\(\[data-page-background='dark'\]\)\)::before/);
  assert.match(css, /background: #202326 url\('\/backgrounds\/smoked-glass-horizontal.png'\) center \/ cover no-repeat/);
  assert.ok(existsSync(new URL('../../public/backgrounds/smoked-glass-horizontal.png', import.meta.url)));
});

test('decorative backdrop is fixed, noninteractive, behind content and screen-only', () => {
  const rule = css.slice(css.indexOf('/* Photo-backed'), css.indexOf("html[data-mantine-color-scheme='dark'] :is(.mantine-Paper-root"));
  for (const declaration of ['position: fixed;', 'z-index: -1;', 'pointer-events: none;']) assert.ok(rule.includes(declaration));
  assert.ok(css.indexOf('@media screen') < css.indexOf('smoked-glass-horizontal.png'));
  assert.doesNotMatch(rule, /\.mantine-Modal|data-document-paper|\.mantine-Input/);
});

test('the supplied background is served as a full resolution PNG', async () => {
  const file = readFileSync(new URL('../../public/backgrounds/smoked-glass-horizontal.png', import.meta.url));
  const metadata = await sharp(file).metadata();
  assert.equal(metadata.width, 5504);
  assert.equal(metadata.height, 3072);
  assert.equal(metadata.format, 'png');
});
