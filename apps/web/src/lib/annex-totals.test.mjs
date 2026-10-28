import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annexTaxTotals } from './annex-totals.ts';
test('IVA is applied to the discounted subtotal, using cents', () => {
  assert.deepEqual(annexTaxTotals('900.00', 19), {vat:'171.00',total:'1071.00'});
  assert.deepEqual(annexTaxTotals('0.00', 19), {vat:'0.00',total:'0.00'});
  assert.deepEqual(annexTaxTotals('0.50', 19), {vat:'0.10',total:'0.60'});
  assert.deepEqual(annexTaxTotals('123.45', 0), {vat:'0.00',total:'123.45'});
});
test('rejects malformed amounts and invalid tax rates', () => {
  assert.throws(() => annexTaxTotals('not an amount', 19));
  assert.throws(() => annexTaxTotals('10.00', -1));
});
