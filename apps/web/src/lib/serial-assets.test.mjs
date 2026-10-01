import assert from 'node:assert/strict';
import test from 'node:test';
import { getSerialDisplayName } from './serial-assets.ts';

test('reabrir un documento conserva la unidad concreta aunque varias compartan referencia', () => {
  for (const internalNumber of [1, 2, 14]) {
    assert.equal(getSerialDisplayName({ skuName: 'MARTILLO APT 90 LB', internalNumber }),
      `MARTILLO APT 90 LB #${internalNumber}`);
  }
});

test('la descripción de motor mantiene su número y no desaparece al reabrir', () => {
  assert.equal(getSerialDisplayName({ description: 'QA 5 HP MOTOR', skuName: 'Motor genérico', internalNumber: 3 }),
    'QA 5 HP MOTOR #3');
});

test('un activo histórico sin número conserva la identidad disponible', () => {
  assert.equal(getSerialDisplayName({ assetId: 'asset-original', serialOrEngine: 'SER-42' }), 'SER-42');
  assert.equal(getSerialDisplayName({ assetId: 'asset-original' }), 'asset-original');
});
