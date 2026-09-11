import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInventoryStockShortageMessage, extractInventoryStockShortages, getStockShortageReviewAction } from '../../lib/inventory-stock-errors.ts';

const shortage = { skuId: 'panel', ownerWarehouseId: 'provider', requestedQuantity: 5, availableQuantity: 0, missingQuantity: 5, existsInWarehouse: false };
const names = (id) => ({ provider: 'TECNIREPARACIONES', principal: 'BODEGA PRINCIPAL' })[id];
test('faltantes distinguen dueño y ubicación física real', () => {
  const parsed = extractInventoryStockShortages({ code: 'INSUFFICIENT_STOCK', shortages: [{ ...shortage, warehouseId: 'principal' }] });
  const message = buildInventoryStockShortageMessage(parsed, () => 'PANEL', names);
  assert.match(message, /propietario: TECNIREPARACIONES/);
  assert.match(message, /sin existencias en "BODEGA PRINCIPAL"/);
  assert.doesNotMatch(message, /sin existencias en "TECNIREPARACIONES"/);
});
test('faltantes históricos no usan dueño como ubicación por defecto', () => {
  const message = buildInventoryStockShortageMessage([shortage], () => 'PANEL', names);
  assert.match(message, /en el origen físico del documento/);
  assert.doesNotMatch(message, /sin existencias en "TECNIREPARACIONES"/);
});
test('no lleva a crear stock en la bodega del proveedor cuando falta físicamente en la nuestra', () => {
  const action = getStockShortageReviewAction({ ownerWarehouseId: 'provider', warehouseId: 'principal', warehouseType: 'OWN' });
  assert.equal(action.href, '/inventory/warehouse?scope=own&view=bulk');
  assert.equal(getStockShortageReviewAction({ ownerWarehouseId: 'provider' }).href, null);
  assert.match(getStockShortageReviewAction({ ownerWarehouseId: 'provider', warehouseId: 'provider' }).href, /^\/inventory\/bulk-adjustments/);
});
