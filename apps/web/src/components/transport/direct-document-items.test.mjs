import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDirectDocumentItems } from './direct-document-items.ts';

test('la confirmación directa conserva propietarios mixtos e identidad de los equipos', () => {
  const selected = [
    { type: 'serial', name: 'Mezcladora', assetId: 'mixer', ownerWarehouseId: 'provider', quantity: 1 },
    { type: 'serial', name: 'Vibrador', assetId: 'vibrator', ownerWarehouseId: 'own' },
  ];
  const before = structuredClone(selected);
  assert.deepEqual(buildDirectDocumentItems(selected), [
    { assetId: 'mixer', ownerWarehouseId: 'provider' },
    { assetId: 'vibrator', ownerWarehouseId: 'own' },
  ]);
  assert.deepEqual(selected, before);
});

test('los ítems masivos conservan cantidad y propietario; no adoptan la bodega física', () => {
  assert.deepEqual(buildDirectDocumentItems([
    { type: 'bulk', name: 'Alineadores', skuId: 'aligner', quantity: 15, ownerWarehouseId: 'provider' },
    { type: 'bulk', name: 'Panel', skuId: 'panel', ownerWarehouseId: 'own' },
  ]), [
    { skuId: 'aligner', quantity: 15, ownerWarehouseId: 'provider' },
    { skuId: 'panel', quantity: 1, ownerWarehouseId: 'own' },
  ]);
});

test('un propietario faltante bloquea el payload antes de guardar, con el nombre legible', () => {
  assert.throws(() => buildDirectDocumentItems([
    { type: 'serial', name: 'Mezcladora #31', assetId: 'mixer' },
  ]), { message: 'Selecciona el propietario de Mezcladora #31.' });
});

for (const type of ['bulk', 'serial']) {
  test(`un ítem ${type} sin referencia o identidad impide construir el envío`, () => {
    assert.throws(() => buildDirectDocumentItems([
      { type, name: 'Equipo de prueba', ownerWarehouseId: 'provider' },
    ]), { message: 'Selecciona la referencia o el equipo de Equipo de prueba.' });
  });
}

for (const quantity of [0, -1, NaN, Infinity, -Infinity]) {
  test(`cantidad bulk inválida ${String(quantity)} se rechaza sin convertirla en una unidad`, () => {
    const item = { type: 'bulk', name: 'Alineador de 1,50 m', skuId: 'aligner', ownerWarehouseId: 'provider', quantity };
    assert.throws(() => buildDirectDocumentItems([item]), {
      message: 'Ingresa una cantidad válida mayor que cero para Alineador de 1,50 m.',
    });
    assert.ok(Object.is(item.quantity, quantity));
  });
}

for (const quantity of [0.5, 1.25, 15]) {
  test(`cantidad bulk válida ${quantity} se conserva exactamente`, () => {
    assert.deepEqual(buildDirectDocumentItems([
      { type: 'bulk', name: 'Material', skuId: 'material', ownerWarehouseId: 'provider', quantity },
    ]), [{ skuId: 'material', ownerWarehouseId: 'provider', quantity }]);
  });
}

test('cantidad bulk undefined mantiene la unidad predeterminada de una selección nueva', () => {
  assert.deepEqual(buildDirectDocumentItems([
    { type: 'bulk', name: 'Panel', skuId: 'panel', ownerWarehouseId: 'own', quantity: undefined },
  ]), [{ skuId: 'panel', ownerWarehouseId: 'own', quantity: 1 }]);
});
