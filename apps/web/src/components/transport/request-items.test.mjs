import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRequestItems } from './request-items.ts';

test('las mangueras retornables conservan la cantidad parcial en el documento', () => {
  const [item] = buildRequestItems([{ type: 'accessory', accessoryKind: 'RETURNABLE', accessoryId: 'mangueras',
    accessorySourceBalanceId: 'saldo-obra', componentParentAssetId: 'compresor', quantity: 2,
    name: 'Mangueras', ownerWarehouseId: 'own' }]);
  assert.equal(item.quantity, 2);
  assert.equal(item.accessoryId, 'mangueras');
  assert.equal(item.componentParentAssetId, 'compresor');
  assert.equal(item.skuId, undefined);
});

test('el accesorio conserva origen, equipo, cantidad y daño sin convertirse en equipo o tag libre', () => {
  const [item] = buildRequestItems([{ type: 'accessory', accessoryId: 'puntas', accessorySourceBalanceId: 'saldo-obra', componentParentAssetId: 'martillo', quantity: 4, name: 'Puntas', ownerWarehouseId: 'own', isDamaged: true, damageDescription: ' Dos melladas ' }]);
  assert.deepEqual(item, { accessoryId: 'puntas', accessorySourceBalanceId: 'saldo-obra', componentParentAssetId: 'martillo', quantity: 4, ownerWarehouseId: 'own', conditionNote: 'Dos melladas' });
  assert.equal(item.assetId, undefined);
  assert.equal(item.skuId, undefined);
  assert.equal(item.requestedTag, undefined);
});

test('permite enviar un item consolidado con asignación de dueño pendiente', () => {
  const [item] = buildRequestItems([
    {
      type: 'bulk',
      skuId: 'sku-cuna',
      name: 'CUÑA',
      quantity: 5,
      ownerWarehouseId: null,
    },
  ]);

  assert.deepEqual(item, {
    skuId: 'sku-cuna',
    quantity: 5,
    componentParentAssetId: undefined,
    ownerWarehouseId: undefined,
    conditionNote: undefined,
  });
});

test('conserva el dueño cuando el item pertenece a una sola bodega', () => {
  const [item] = buildRequestItems([
    {
      type: 'bulk',
      skuId: 'sku-mezcladora',
      name: 'MEZCLADORA',
      quantity: 1,
      ownerWarehouseId: 'provider-a',
    },
  ]);

  assert.equal(item.ownerWarehouseId, 'provider-a');
});

test('conserva el vínculo de un implemento serializado y su bodega propietaria', () => {
  const [item] = buildRequestItems([{
    type: 'serial', assetId: 'balde-1', name: 'Balde para minicargador',
    componentParentAssetId: 'minicargador-1', ownerWarehouseId: 'vereal',
  }]);
  assert.equal(item.assetId, 'balde-1');
  assert.equal(item.componentParentAssetId, 'minicargador-1');
  assert.equal(item.ownerWarehouseId, 'vereal');
});
