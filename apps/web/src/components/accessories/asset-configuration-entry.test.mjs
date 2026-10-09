import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('asset detail uses one configuration panel without a second inventory workspace', () => {
  const source = readFileSync(new URL('../../app/inventory/serialized-assets/[assetId]/page.tsx', import.meta.url), 'utf8');
  assert.equal((source.match(/<ConfigurationPanel\b/g) ?? []).length, 1);
  assert.doesNotMatch(source, /AccessoriesWorkspace/);
  assert.doesNotMatch(source, /\/inventory\/accessories\/equipment\//);
  assert.match(source, /onClick=\{\(\) => changeTab\('accessories'\)\}/);
  assert.match(source, /value="accessories" leftSection=\{<IconPuzzle /);
  assert.match(source, /value="maintenance" leftSection=\{<IconTool /);
});

test('asset prices have a direct tab, lazy loading and protection for unsaved or busy tariffs', () => {
  const source = readFileSync(new URL('../../app/inventory/serialized-assets/[assetId]/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /value="pricing" leftSection=\{<IconCoin /);
  assert.match(source, /const CommercialProfilePanel = dynamic/);
  assert.match(source, /<ConfigurationPanel assetId=\{asset.id\} physicalOnly/);
  assert.match(source, /if \(pricingBusy\) return false/);
  assert.match(source, /pricingDirty && !window.confirm/);
  assert.match(source, /onDirtyChange=\{setPricingDirty\} onBusyChange=\{setPricingBusy\}/);
});

test('the obsolete accessories catalogue redirects to native inventory', () => {
  const source = readFileSync(new URL('../../../next.config.js', import.meta.url), 'utf8');
  assert.match(source, /source: '\/inventory\/accessories'/);
  assert.match(source, /destination: '\/inventory\/warehouse'/);
  assert.match(source, /destination: '\/inventory\/serialized-assets\/:assetId\?tab=accessories'/);
  const card = readFileSync(new URL('../SerialAssetCard.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(card, /\/inventory\/accessories\/equipment\//);
  assert.match(card, /Configurar implementos/);
});
