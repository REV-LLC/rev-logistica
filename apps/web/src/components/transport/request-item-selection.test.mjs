import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addBulkSelection,
  addFreeSelection,
  removeSelection,
  resolveFreeSelection,
  splitSelection,
  updateSelectionOwner,
} from './request-item-selection.ts';

test('evita duplicar el mismo SKU del mismo dueño', () => {
  const existing = [{
    selectionId: 'one',
    type: 'bulk',
    bulkKey: 'sku-1::owner-1',
    skuId: 'sku-1',
    name: 'Andamio',
  }];
  const next = addBulkSelection({
    items: existing,
    inventoryItem: { skuId: 'sku-1', skuName: 'Andamio', ownerWarehouseId: 'owner-1', quantity: 5 },
    sourceMode: 'warehouse',
    createSelectionId: () => 'two',
  });
  assert.equal(next, existing);
});

test('la captura libre evita duplicados por referencia y dueño', () => {
  const existing = [{
    selectionId: 'one',
    type: 'free',
    name: 'MOTOR #10',
    requestedTag: 'MOTOR #10',
    ownerWarehouseId: 'owner-1',
  }];
  const next = addFreeSelection({
    items: existing,
    requestedReference: 'MOTOR #10',
    ownerWarehouseId: 'owner-1',
    createSelectionId: () => 'two',
  });
  assert.equal(next, existing);
});

test('resolver una referencia conserva cantidad, dueño y daño', () => {
  const [resolved] = resolveFreeSelection({
    items: [{
      selectionId: 'one',
      type: 'free',
      name: 'ANDAMIO',
      quantity: 3,
      ownerWarehouseId: 'owner-1',
      isDamaged: true,
      damageDescription: 'Golpe',
    }],
    index: 0,
    skuId: 'sku-1',
    skuName: 'Andamio certificado',
  });
  assert.equal(resolved.type, 'bulk');
  assert.equal(resolved.bulkKey, 'sku-1::owner-1');
  assert.equal(resolved.quantity, 3);
  assert.equal(resolved.damageDescription, 'Golpe');
});

test('actualizar dueño regenera la clave y dividir conserva las cantidades', () => {
  const original = [{
    selectionId: 'one',
    type: 'bulk',
    bulkKey: 'sku-1::owner-1',
    skuId: 'sku-1',
    name: 'Andamio',
    quantity: 4,
    ownerWarehouseId: 'owner-1',
  }];
  const moved = updateSelectionOwner(original, 0, 'owner-2');
  assert.equal(moved[0].bulkKey, 'sku-1::owner-2');
  const split = splitSelection(moved, 0, () => 'two');
  assert.equal(split[0].quantity, 1);
  assert.equal(split[1].quantity, 3);
  assert.equal(split[1].ownerWarehouseId, null);
  assert.equal(split[1].bulkKey, 'sku-1::owner-2');
});

test('retirar un padre elimina sus componentes', () => {
  const remaining = removeSelection([
    { selectionId: 'parent', type: 'serial', name: 'Mezcladora', assetId: 'mixer-1' },
    { selectionId: 'component', type: 'serial', name: 'Motor', assetId: 'motor-1', componentParentAssetId: 'mixer-1' },
    { selectionId: 'other', type: 'serial', name: 'Vibrador', assetId: 'asset-2' },
  ], 'parent');
  assert.deepEqual(remaining.map((item) => item.selectionId), ['other']);
});

test('retirar mezcladora o motor asociado elimina la pareja', () => {
  const pair = [
    { selectionId: 'mixer', type: 'serial', name: 'Mezcladora', assetId: 'mixer-1' },
    { selectionId: 'motor', type: 'serial', name: 'Motor', assetId: 'motor-1', associatedMixerId: 'mixer-1' },
    { selectionId: 'other', type: 'serial', name: 'Vibrador', assetId: 'asset-2' },
  ];
  assert.deepEqual(removeSelection(pair, 'mixer').map((item) => item.selectionId), ['other']);
  assert.deepEqual(removeSelection(pair, 'motor').map((item) => item.selectionId), ['other']);
});
