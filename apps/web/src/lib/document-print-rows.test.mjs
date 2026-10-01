import assert from 'node:assert/strict';
import test from 'node:test';
import { documentPrintRows, documentItemDescription, documentItemCode } from './document-print-rows.ts';

const equipment = { id: 'item-equipment', assetId: 'equipment', asset: { internalNumber: 1, sku: { name: 'Compresor' } } };
const movement = { ...equipment, id: 'physical-movement', ownerWarehouse: { name: 'Bodega confirmada' } };
const accessory = { id: 'item-accessory', accessoryId: 'accessory', accessoryName: 'Mangueras', accessoryCode: 'ACC-123', quantity: 4 };

test('la remisión confirmada incluye accesorios sin duplicar los equipos del ledger', () => {
  const rows = documentPrintRows({ type: 'REMISSION', items: [equipment, accessory], ledger: [movement] });
  assert.deepEqual(rows, [movement, accessory]);
  assert.equal(documentItemDescription(rows[1]), 'Mangueras');
  assert.equal(documentItemCode(rows[1]), 'ACC-123');
  assert.equal(rows[1].quantity, 4);
});

test('borradores y devoluciones usan todas las líneas documentales, sin sumar dos veces', () => {
  for (const document of [
    { type: 'REMISSION', items: [equipment, accessory], ledger: [] },
    { type: 'RETURN', items: [equipment, accessory], ledger: [movement] },
  ]) assert.deepEqual(documentPrintRows(document), [equipment, accessory]);
});

test('documentos antiguos conservan sus filas físicas y propietario resuelto', () => {
  assert.deepEqual(documentPrintRows({ type: 'REMISSION', items: [equipment], ledger: [movement] }), [movement]);
  assert.equal(documentItemCode(movement), '#1');
});

test('un accesorio usa su nombre congelado y no necesita requestedTag ni un SKU ficticio', () => {
  assert.equal(documentItemDescription({ ...accessory, requestedTag: null }), 'Mangueras');
  assert.equal(documentItemDescription({ accessoryId: 'old', requestedTag: 'Nombre histórico' }), 'Nombre histórico');
});
