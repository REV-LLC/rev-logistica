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
test('transport totals and VAT match the server, preserving equipment discounts', async () => {
  const {annexAmounts,annexTransportTotals}=await import('./annex-totals.ts');
  const transport={outbound:{quantity:'3',unitPrice:'12.34'},return:{quantity:'1',unitPrice:'0.01'}};
  assert.deepEqual(annexAmounts({rentalGross:'100.00',rentalDiscount:'10.00',rentalNet:'90.00'},transport,19),{
    base:'137.03',discount:'10.00',subtotal:'127.03',vat:'24.14',total:'151.17',transport:{outbound:'37.02',return:'0.01',total:'37.03'}
  });
  assert.deepEqual(annexTransportTotals(),{outbound:'0.00',return:'0.00',total:'0.00'});
  assert.throws(()=>annexTransportTotals({outbound:{quantity:'1.5',unitPrice:'10'},return:{quantity:'0',unitPrice:'0'}}));
});
