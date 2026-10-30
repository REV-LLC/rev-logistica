import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('own bulk inventory uses the same full-width layout and adaptive grid as assets', () => {
  const view = readFileSync(new URL('../components/WarehouseBulkView.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../components/WarehouseInventoryPageClient.tsx', import.meta.url), 'utf8');
  const display = readFileSync(new URL('../components/InventoryDisplay.tsx', import.meta.url), 'utf8');
  assert.match(view, /WarehouseAssetsView.module.css/);
  assert.match(view, /classes.page/);
  assert.match(view, /classes.header/);
  assert.match(view, /classes.toolbar/);
  assert.match(view, /classes.content/);
  assert.match(view, /bulkCatalogLayout/);
  assert.match(page, /isOwnInventory && inventoryView === 'BULK' \? \(/);
  assert.match(page, /<WarehouseBulkView[\s\S]*?onAddStock=\{openAddStock\}[\s\S]*?onAdjust=\{openAdjust\}/);
  assert.match(display, /BulkFamilySection key=\{group.id\} catalog=\{bulkCatalogLayout\}/);
  assert.match(display, /<div className=\{assetGrid.grid\}>/);
});

test('bulk catalog keeps stock actions available for empty or filtered results', () => {
  const display = readFileSync(new URL('../components/InventoryDisplay.tsx', import.meta.url), 'utf8');
  assert.match(display, /\(showBulkSection \|\| bulkCatalogLayout\)/);
  assert.match(display, /onClick=\{onAddStock\}/);
  assert.match(display, /onClick=\{onAdjust\}/);
});
