import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAvailableMixerMotors,
  getAvailableRequestInventory,
  getSelectedInventoryKeys,
} from './request-inventory.ts';

test('oculta inventario masivo y serial que ya fue seleccionado', () => {
  const { bulkKeys, serialIds } = getSelectedInventoryKeys([
    { selectionId: '1', type: 'bulk', name: 'Andamio', bulkKey: 'sku-1::owner-1' },
    { selectionId: '2', type: 'serial', name: 'Mezcladora', assetId: 'asset-1' },
  ]);
  const available = getAvailableRequestInventory({
    bulkItems: [
      { skuId: 'sku-1', ownerWarehouseId: 'owner-1' },
      { skuId: 'sku-2', ownerWarehouseId: 'owner-1' },
    ],
    serialItems: [
      { assetId: 'asset-1', kind: 'STANDARD' },
      { assetId: 'asset-2', kind: 'STANDARD' },
    ],
    selectedBulkKeys: bulkKeys,
    selectedSerialIds: serialIds,
    documentType: 'REMISSION',
  });

  assert.deepEqual(available.bulk.map((item) => item.skuId), ['sku-2']);
  assert.deepEqual(available.serial.map((item) => item.assetId), ['asset-2']);
});

test('oculta motores del selector general de remisión pero los permite en devolución', () => {
  const inventory = {
    bulkItems: [],
    serialItems: [{ assetId: 'motor-1', kind: 'MOTOR' }],
    selectedBulkKeys: new Set(),
    selectedSerialIds: new Set(),
  };
  assert.equal(
    getAvailableRequestInventory({ ...inventory, documentType: 'REMISSION' }).serial.length,
    0,
  );
  assert.equal(
    getAvailableRequestInventory({ ...inventory, documentType: 'RETURN' }).serial.length,
    1,
  );
});

test('ofrece únicamente motores libres o asociados a la mezcladora activa', () => {
  const motors = getAvailableMixerMotors({
    mixerAssetId: 'mixer-1',
    selectedSerialIds: new Set(['motor-selected']),
    serialItems: [
      { assetId: 'motor-free', kind: 'MOTOR', quantity: 1, assignedMixerId: null },
      { assetId: 'motor-own', kind: 'MOTOR', quantity: 1, assignedMixerId: 'mixer-1' },
      { assetId: 'motor-other', kind: 'MOTOR', quantity: 1, assignedMixerId: 'mixer-2' },
      { assetId: 'motor-selected', kind: 'MOTOR', quantity: 1, assignedMixerId: null },
      { assetId: 'standard', kind: 'STANDARD', quantity: 1, assignedMixerId: null },
    ],
  });
  assert.deepEqual(motors.map((item) => item.assetId), ['motor-free', 'motor-own']);
});
