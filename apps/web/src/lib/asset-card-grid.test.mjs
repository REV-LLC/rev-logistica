import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('asset collections share an adaptive grid that preserves empty tracks for filtered results', () => {
  const css = readFileSync(new URL('../components/AssetCardGrid.module.css', import.meta.url), 'utf8');
  assert.match(css, /repeat\(auto-fill, minmax\(min\(100%, 20rem\), 1fr\)\)/);
  for (const component of ['WarehouseAssetsView', 'InventoryDisplay']) {
    const source = readFileSync(new URL(`../components/${component}.tsx`, import.meta.url), 'utf8');
    assert.match(source, /import assetGrid from '@\/components\/AssetCardGrid.module.css'/);
    assert.match(source, /<div className=\{assetGrid.grid\}>/);
  }
});

test('equipment photos remain complete and centered with breathing room inside the fixed image area', () => {
  const source = readFileSync(new URL('../components/SerialAssetCard.tsx', import.meta.url), 'utf8');
  assert.match(source, /objectFit: "contain"/);
  assert.doesNotMatch(source, /objectFit:.*"cover"/);
  assert.match(source, /objectPosition: "center"/);
  assert.match(source, /padding: showcase \? 16 : 8/);
  assert.match(source, /boxSizing: "border-box"/);
});

test('asset and bulk photo areas stay solid white independently of the glass theme', () => {
  for (const component of ['SerialAssetCard', 'BulkInventoryCard']) {
    const source = readFileSync(new URL(`../components/${component}.tsx`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /var\(--inventory-image-bg/);
    assert.match(source, /background: ["']#ffffff["']/);
    assert.match(source, /#667085/);
  }
});
