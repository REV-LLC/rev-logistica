import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTransportModule } from './test-support.cjs';

const { addProviderCatalogItem, buildProviderCatalog, getItemOwnerLabel } = loadTransportModule('request-item-owners.ts');
const skus = [
  { id: 'mixer', name: 'MEZCLADORA', assetFamilyId: 'family', controlType: 'SERIAL' },
  { id: 'tube', name: 'TUBO', assetFamilyId: 'scaffold', controlType: 'BULK' },
];

test('los tags de proveedor agregan referencias pendientes, sin inventar activos ni saldos', () => {
  const catalog = buildProviderCatalog(skus, { id: 'provider-a', name: 'Proveedor A', type: 'ALLY' });
  const selected = addProviderCatalogItem([], catalog[0]);
  assert.equal(selected[0].type, 'free');
  assert.equal(selected[0].requestedTag, 'MEZCLADORA');
  assert.equal(selected[0].ownerWarehouseId, 'provider-a');
  assert.equal(selected[0].sourceWarehouseId, 'provider-a');
  assert.equal(selected[0].assetId, undefined);
  assert.equal(selected[0].skuId, undefined);
  assert.equal(selected[0].availableQuantity, undefined);
});

test('agregar el mismo tag para otro proveedor conserva cantidades e identidad de lo anterior', () => {
  const first = buildProviderCatalog(skus, { id: 'a', name: 'A', type: 'ALLY' });
  const second = buildProviderCatalog(skus, { id: 'b', name: 'B', type: 'ALLY' });
  const previous = addProviderCatalogItem([], first[0]);
  previous[0].quantity = 3;
  const next = addProviderCatalogItem(previous, second[0]);
  assert.equal(next.length, 2);
  assert.strictEqual(next[0], previous[0]);
  assert.equal(next[0].quantity, 3);
  assert.equal(next[0].ownerWarehouseId, 'a');
  assert.equal(next[1].ownerWarehouseId, 'b');
  assert.notEqual(next[0].selectionId, next[1].selectionId);
  assert.strictEqual(addProviderCatalogItem(next, second[0]), next);
});

test('las referencias restauradas tampoco se duplican y la opción propia usa el nombre comercial', () => {
  const row = buildProviderCatalog(skus, { id: 'a', name: 'A', type: 'ALLY' })[0];
  const restored = [{ selectionId: 'restored', type: 'free', name: row.skuName, requestedTag: row.skuName, ownerWarehouseId: 'a', sourceWarehouseId: 'a' }];
  assert.strictEqual(addProviderCatalogItem(restored, row), restored);
  assert.equal(getItemOwnerLabel({ id: 'own', type: 'OWN', name: 'Bodega principal de alquiler' }), 'Renta Equipos del Valle');
});
