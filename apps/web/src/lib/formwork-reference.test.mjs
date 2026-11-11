import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFormaletaSkuName } from './formwork-reference.ts';

test('rinconeras retain both angle sides and length in the reference', () => {
  assert.equal(buildFormaletaSkuName('RINCONERA', 0.1, 0.1, 0.3), 'RINCONERA (0.10 M X 0.10 M X 0.30 M)');
  assert.equal(buildFormaletaSkuName('RINCONERA', 0.1, 0.15, 1.2), 'RINCONERA (0.10 M X 0.15 M X 1.20 M)');
});

test('incomplete or invalid rinconera geometry cannot produce a reference', () => {
  for (const z of [undefined, 0, -1, NaN, Infinity, 0.001]) {
    assert.equal(buildFormaletaSkuName('RINCONERA', 0.1, 0.1, z), null);
  }
  assert.equal(buildFormaletaSkuName('RINCONERA', 0, 0.1, 0.3), null);
});

test('panel and sardinel references keep their two dimensions', () => {
  assert.equal(buildFormaletaSkuName('FORMALETA', 0.05, 0.3), 'FORMALETA (0.05 M X 0.30 M)');
  assert.equal(buildFormaletaSkuName('FORMALETA_SARDINEL', 0.2, 1.2), 'FORMALETA SARDINEL (0.20 M X 1.20 M)');
});
