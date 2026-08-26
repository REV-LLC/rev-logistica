import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRequestItems } from './request-items.ts';

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
