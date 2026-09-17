import assert from 'node:assert/strict';
import test from 'node:test';
import { getRequestInventorySourceMode, getRequestSourceWarehouseId, getRequestItemInventoryKey, loadRequestSourceInventories } from './request-inventory-source.ts';

test('un mismo propietario puede tener ítems de dos ubicaciones sin mezclar existencias', async () => {
  const doc = { type: 'REMISSION', inventorySourceMode: 'WAREHOUSE', warehouse: { id: 'own' }, items: [
    { condition: 'provider', sourceWarehouseId: 'own' },
    { condition: 'provider', sourceWarehouseId: 'provider' },
  ] };
  const calls = [];
  const result = await loadRequestSourceInventories(doc, ['provider'], async id => {
    calls.push(id);
    return { bulk: [{ skuId: 'shared', ownerWarehouseId: 'provider', quantity: id === 'own' ? 2 : 3 }], serial: [] };
  });
  assert.deepEqual(calls.sort(), ['own', 'provider']);
  assert.equal(result[getRequestItemInventoryKey(doc, doc.items[0])].bulk[0].quantity, 2);
  assert.equal(result[getRequestItemInventoryKey(doc, doc.items[1])].bulk[0].quantity, 3);
  assert.equal(getRequestSourceWarehouseId(doc, 'provider', 'own'), 'own');
});

test('la ubicación física explícita no cambia por entregar en obra ni por el propietario', () => {
  const doc = { type: 'REMISSION', inventorySourceMode: 'WAREHOUSE', warehouse: { id: 'principal' }, notes: 'Entrega: ON_SITE' };
  assert.equal(getRequestInventorySourceMode(doc), 'WAREHOUSE');
  assert.equal(getRequestSourceWarehouseId(doc, 'tecnireparaciones'), 'principal');
});
test('salida directa usa cada propietario sin sustituirlo por bodega principal', () => {
  const doc = { type: 'REMISSION', inventorySourceMode: 'OWNER_WAREHOUSES', warehouse: { id: 'principal' }, notes: 'Entrega: WAREHOUSE' };
  assert.equal(getRequestSourceWarehouseId(doc, 'tecnireparaciones'), 'tecnireparaciones');
  assert.equal(getRequestSourceWarehouseId(doc, 'motavita'), 'motavita');
});
test('documentos antiguos y devoluciones mantienen su interpretación', () => {
  assert.equal(getRequestInventorySourceMode({ notes: 'Fecha doc: 2026-09-02 | Entrega: ON_SITE' }), 'OWNER_WAREHOUSES');
  assert.equal(getRequestInventorySourceMode({ notes: 'Entrega: WAREHOUSE' }), 'WAREHOUSE');
  assert.equal(getRequestInventorySourceMode({ notes: null }), 'WAREHOUSE');
  assert.equal(getRequestInventorySourceMode({ notes: 'entrega: on_site | Entrega: WAREHOUSE' }), 'OWNER_WAREHOUSES');
  assert.equal(getRequestSourceWarehouseId({ type: 'RETURN', inventorySourceMode: 'WAREHOUSE', warehouse: { id: 'principal' } }, 'owner'), 'owner');
});
test('bodega común se consulta una vez y nunca mezcla propietarios al resolver', async () => {
  const calls = [];
  const result = await loadRequestSourceInventories({ type: 'REMISSION', inventorySourceMode: 'WAREHOUSE', warehouse: { id: 'principal' } }, ['tecnireparaciones', 'motavita', 'tecnireparaciones'], async (id) => {
    calls.push(id);
    return { bulk: [{ ownerWarehouseId: 'motavita', skuId: 'panel' }], serial: [
      { ownerWarehouseId: 'tecnireparaciones', assetId: 'mixer' },
      { ownerWarehouseId: 'motavita', assetId: 'skid' },
      { ownerWarehouseId: 'other', assetId: 'not-ours' },
    ] };
  });
  assert.deepEqual(calls, ['principal']);
  assert.deepEqual(result.tecnireparaciones.serial.map((item) => item.assetId), ['mixer']);
  assert.deepEqual(result.motavita.serial.map((item) => item.assetId), ['skid']);
  assert.equal(result.tecnireparaciones.bulk.length, 0);
});
test('error de consulta o salida ausente no se presenta como inventario vacío', async () => {
  await assert.rejects(loadRequestSourceInventories({ inventorySourceMode: 'WAREHOUSE' }, ['owner'], async () => ({})), /bodega de salida/);
  await assert.rejects(loadRequestSourceInventories({ inventorySourceMode: 'OWNER_WAREHOUSES' }, ['owner'], async () => { throw new Error('network'); }), /network/);
});
