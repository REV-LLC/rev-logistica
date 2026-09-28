import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTransportModule } from './test-support.cjs';

const { addReturnAccessories, returnAccessoryAlreadySelected } = loadTransportModule('return-accessory-selection.ts');
const option = {
  accessoryId: 'bucket', sourceBalanceId: 'custody', name: 'Bache', code: 'AC-01', kind: 'RETURNABLE',
  quantity: 1, ownerWarehouseId: 'owner', ownerName: 'Dueño', parentAssetId: 'crane', parentName: 'Pluma #1', sourceLabel: 'Obra',
};

test('devolución de accesorio solo conserva su custodia y relación sin agregar el equipo', () => {
  const items = addReturnAccessories([], [option]);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'accessory');
  assert.equal(items[0].assetId, undefined);
  assert.equal(items[0].accessoryId, option.accessoryId);
  assert.equal(items[0].accessorySourceBalanceId, option.sourceBalanceId);
  assert.equal(items[0].componentParentAssetId, option.parentAssetId);
  assert.equal(items[0].ownerWarehouseId, option.ownerWarehouseId);
  assert.equal(items[0].sourceWarehouseId, undefined);
  assert.equal(items[0].accessoryKind, 'RETURNABLE');
  assert.equal(items[0].quantity, 1);
  assert.match(items[0].name, /Bache · AC-01 · Accesorio de Pluma #1/);
});

test('confirmación conjunta conserva el equipo e inicia consumibles en uno con su máximo real', () => {
  const original = [{ type: 'serial', assetId: 'crane', selectionId: 'machine', name: 'Pluma', quantity: 1 }];
  const items = addReturnAccessories(original, [{ ...option, kind: 'CONSUMABLE', quantity: 7 }]);
  assert.equal(original.length, 1);
  assert.equal(items[0], original[0]);
  assert.equal(items[1].quantity, 1);
  assert.equal(items[1].availableQuantity, 7);
  assert.equal(items[1].accessoryKind, 'CONSUMABLE');
});

test('no duplica accesorios de configuración, selección repetida ni doble confirmación', () => {
  const items = addReturnAccessories([], [option, option]);
  assert.equal(items.length, 1);
  assert.equal(returnAccessoryAlreadySelected(items, option), true);
  assert.deepEqual(addReturnAccessories(items, [option]), items);
});

test('una misma referencia con custodias diferentes conserva ambas relaciones', () => {
  const items = addReturnAccessories([], [option, { ...option, sourceBalanceId: 'other-custody', parentAssetId: 'other-crane' }]);
  assert.equal(items.length, 2);
  assert.notEqual(items[0].selectionId, items[1].selectionId);
  assert.deepEqual(items.map(item => item.componentParentAssetId), ['crane', 'other-crane']);
});

test('no agrega accesorios sin cantidad pendiente', () => {
  assert.deepEqual(addReturnAccessories([], [{ ...option, quantity: 0 }]), []);
});
