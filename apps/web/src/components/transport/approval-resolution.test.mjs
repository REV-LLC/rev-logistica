import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInitialResolveState,
  buildResolvedItemsPayload,
  isResolvePendingItem,
  parseInternalNumberFromTag,
  validateApprovalResolution,
} from './approval-resolution.ts';

const skus = [
  { id: 'bulk-1', name: 'CUÑA', controlType: 'BULK' },
  { id: 'serial-1', name: 'MEZCLADORA', controlType: 'SERIAL' },
];
const inventory = {
  'warehouse-1': {
    bulk: [{ skuId: 'bulk-1', quantity: 4 }],
    serial: [{ skuId: 'serial-1', assetId: 'asset-7', internalNumber: 7 }],
  },
};

test('identifica tags libres y SKU seriales pendientes', () => {
  assert.equal(isResolvePendingItem({ requestedTag: 'CUÑA' }, skus), true);
  assert.equal(isResolvePendingItem({ skuId: 'serial-1' }, skus), true);
  assert.equal(isResolvePendingItem({ skuId: 'bulk-1' }, skus), false);
});

test('sugiere SKU y activo serial a partir del tag', () => {
  assert.equal(parseInternalNumberFromTag('MEZCLADORA #7'), 7);
  assert.deepEqual(
    buildInitialResolveState(
      [{ requestedTag: 'MEZCLADORA #7', condition: 'warehouse-1' }],
      inventory,
      skus,
    ),
    { initialSkuMap: { 0: 'serial-1' }, initialAssetMap: { 0: 'asset-7' } },
  );
});

test('exige activo cuando el SKU resuelto es serial', () => {
  assert.equal(
    validateApprovalResolution(
      [{ requestedTag: 'MEZCLADORA #7' }],
      { 0: 'serial-1' },
      {},
      skus,
    ),
    'Falta seleccionar o crear equipo para uno o mas tags seriales.',
  );
});

test('construye el payload final sin volver obligatorio el dueño pendiente', () => {
  assert.deepEqual(
    buildResolvedItemsPayload(
      [{ requestedTag: 'CUÑA', quantity: 2, condition: null }],
      { 0: 'bulk-1' },
      {},
      skus,
    ),
    [{
      skuId: 'bulk-1',
      componentParentAssetId: undefined,
      ownerWarehouseId: undefined,
      conditionNote: undefined,
      quantity: 2,
      requestedTag: 'CUÑA',
    }],
  );
});
