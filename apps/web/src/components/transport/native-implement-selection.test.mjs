import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadTransportModule } from './test-support.cjs';
const { appendNativeImplement, nativeImplementOption } = loadTransportModule('native-implement-selection.ts');
const option = { key: 'native', name: 'Implemento Y', role: 'ACCESSORY', quantity: 1,
  item: { selectionId: '', type: 'serial', assetId: 'implement-y', name: 'Implemento Y', ownerWarehouseId: 'owner', sourceWarehouseId: 'warehouse', parentCompositionNodeId: 'synthetic' } };
test('implemento nativo enlaza una línea real, no duplica stock ni admite padres ausentes', () => {
  const parent = { selectionId: 'parent-line', assetId: 'equipment-x', name: 'Equipo X' };
  const items = [{ ...parent, type: 'serial' }];
  const result = appendNativeImplement(items, option, parent);
  assert.equal(result.length, 2);
  assert.equal(result[1].parentCompositionNodeId, 'parent-line');
  assert.equal(result[1].componentParentAssetId, 'equipment-x');
  assert.equal(result[1].sourceWarehouseId, 'warehouse');
  assert.equal(appendNativeImplement(result, option, parent), result);
  assert.equal(appendNativeImplement([], option, parent).length, 0);
});
test('entrega posterior al equipo en obra usa su origen revisado sin crear línea de equipo ficticia', () => {
  for (const parent of [{ assetId: 'equipment-x', name: 'Equipo X', legacyOriginId: 'reviewed-origin' },
    { assetId: 'equipment-x', name: 'Equipo X', sourceDocumentItemId: 'original-delivery' }]) {
    const result = appendNativeImplement([], option, parent);
    assert.equal(result.length, 1);
    assert.equal(result[0].parentCompositionNodeId, undefined);
    assert.equal(result[0].parentLegacyOriginId, parent.legacyOriginId);
    assert.equal(result[0].parentSourceDocumentItemId, parent.sourceDocumentItemId);
  }
  assert.equal(nativeImplementOption(option, { assetId: 'equipment-x', name: 'Sin origen' }).item, undefined);
});
test('cantidades conservan saldo y origen, y la entrada nueva no crea Accessory anterior', () => {
  const bulk = { ...option, quantity: 2, item: { ...option.item, assetId: undefined, type: 'bulk', skuId: 'hose', bulkKey: 'hose::owner::warehouse', availableQuantity: 2 } };
  const parent = { assetId: 'equipment-x', name: 'Equipo X', legacyOriginId: 'reviewed-origin' };
  const result = appendNativeImplement([], bulk, parent);
  assert.equal(result[0].quantity, 2);
  assert.equal(appendNativeImplement(result, bulk, parent), result);
  assert.equal(appendNativeImplement([], { ...bulk, quantity: 3 }, parent).length, 0);
  assert.equal(appendNativeImplement([], { ...option, item: { ...option.item, type: 'accessory', accessoryId: 'old' } }, parent).length, 0);
});
test('documentos usan entrada nativa y devuelven implementos en pestaña dedicada sin duplicarlos en inventario', () => {
  const workspace = readFileSync(new URL('./TransportRequestsWorkspace.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(workspace, /RequestAccessorySelector/);
  assert.match(workspace, /RequestImplementSelector/);
  const source = readFileSync(new URL('./RequestInventoryPickerModal.tsx', import.meta.url), 'utf8');
  assert.match(source, /label: "Implementos"/);
  assert.match(source, /serialItems=\{picker.serialItems.filter\(item => !item.isImplement\)/);
  assert.match(source, /bulkItems=\{picker.bulkItems.filter\(item => !item.isImplement\)/);
});
