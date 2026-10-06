import assert from 'node:assert/strict';
import test from 'node:test';
import { addBulkKitPieces, kitSourceKey } from './bulk-kit-selection.ts';
const inventory = [
  { skuId: 'platform', skuName: 'Plataforma', quantity: 10, ownerWarehouseId: 'own', sourceWarehouseId: 'warehouse' },
  { skuId: 'yoyo', skuName: 'Yoyo', quantity: 8, ownerWarehouseId: 'own', sourceWarehouseId: 'warehouse' },
];
const pieces = [{ skuId: 'platform', name: 'Plataforma', quantity: 1 }, { skuId: 'yoyo', name: 'Yoyo', quantity: 2 }];
let counter = 0;
const id = () => `selection-${++counter}`;
test('multiplica la receta y crea solo líneas de piezas reales, sin un SKU ficticio del conjunto', () => {
  const result = addBulkKitPieces([], pieces, 3, inventory, id);
  assert.deepEqual(result.map(item => [item.skuId, item.quantity]), [['platform', 3], ['yoyo', 6]]);
  assert.ok(result.every(item => item.type === 'bulk' && !item.parentCompositionNodeId));
  assert.equal(result[0].ownerWarehouseId, 'own');
  assert.equal(result[0].sourceWarehouseId, 'warehouse');
});
test('falta una pieza: no agrega parcialmente, ni modifica el documento ni inventario', () => {
  const current = [{ selectionId: 'old', type: 'free', name: 'Otro', quantity: 1 }];
  const before = structuredClone({ current, inventory });
  assert.throws(() => addBulkKitPieces(current, pieces, 5, inventory, id), /Yoyo/);
  assert.deepEqual({ current, inventory }, before);
});
test('un propietario ambiguo requiere elección explícita; nunca mezcla existencias de proveedores', () => {
  const mixed = [...inventory, { ...inventory[0], ownerWarehouseId: 'ally', quantity: 7 }];
  assert.throws(() => addBulkKitPieces([], pieces, 1, mixed, id), /procedencia/);
  const result = addBulkKitPieces([], [{ ...pieces[0], sourceKey: kitSourceKey(mixed[2]) }, pieces[1]], 1, mixed, id);
  assert.equal(result[0].ownerWarehouseId, 'ally');
  assert.equal(result[1].ownerWarehouseId, 'own');
});
test('al repetir un conjunto combina piezas existentes sin duplicarlas y respeta el saldo total', () => {
  const first = addBulkKitPieces([], pieces, 2, inventory, id);
  const second = addBulkKitPieces(first, pieces, 1, inventory, id);
  assert.equal(second.length, 2);
  assert.deepEqual(second.map(item => item.quantity), [3, 6]);
  assert.deepEqual(first.map(item => item.quantity), [2, 4]);
  assert.throws(() => addBulkKitPieces(second, pieces, 2, inventory, id), /Yoyo/);
});
for (const count of [0, -1, 1.5, NaN, Infinity, 10001]) test(`rechaza cantidad de conjuntos ${count}`, () => {
  assert.throws(() => addBulkKitPieces([], pieces, count, inventory, id), /cantidad entera/);
});
test('no toma una procedencia que ya no aparece, ni existencias negativas o no finitas', () => {
  assert.throws(() => addBulkKitPieces([], [{ ...pieces[0], sourceKey: 'obsolete' }], 1, inventory, id), /procedencia/);
  for (const quantity of [-1, 0, NaN, Infinity]) assert.throws(() => addBulkKitPieces([], [pieces[0]], 1, [{ ...inventory[0], quantity }], id));
});
test('no fusiona piezas que pertenecen a otro equipo; cuenta igualmente sus cantidades para disponibilidad', () => {
  const current = [{ selectionId: 'child', type: 'bulk', skuId: 'yoyo', name: 'Yoyo', quantity: 3, ownerWarehouseId: 'own', sourceWarehouseId: 'warehouse', parentCompositionNodeId: 'asset' }];
  const result = addBulkKitPieces(current, pieces, 1, inventory, id);
  assert.equal(result[0].quantity, 3);
  assert.equal(result.length, 3);
  assert.throws(() => addBulkKitPieces(current, pieces, 3, inventory, id), /Yoyo/);
});
test('rechaza piezas repetidas y multiplicaciones inválidas', () => {
  assert.throws(() => addBulkKitPieces([], [pieces[0], pieces[0]], 1, inventory, id), /repite/);
  assert.throws(() => addBulkKitPieces([], [{ ...pieces[0], quantity: 0.5 }], 1, inventory, id), /inválida/);
});
