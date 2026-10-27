import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTransportModule } from '../components/transport/test-support.cjs';
const { buildLedgerQuery, createInitialLedgerFilters, ledgerCustomerOptions, ledgerWorksiteOptions } = loadTransportModule('../../lib/ledger-filters.ts');
const sites = [
  { id: 'a', alias: 'Alias distinto', customer: { id: '1', name: 'Cliente Uno' }, worksite: { name: 'Obra compartida' } },
  { id: 'b', alias: 'Otra obra', customer: { id: '1', name: 'Cliente Uno' }, worksite: { name: 'Otra obra' } },
  { id: 'c', alias: null, customer: { id: '2', name: 'Cliente Dos' }, worksite: { name: 'Obra compartida' } },
];
test('deduplicates customers by identity and keeps worksites scoped to the selected customer', () => {
  assert.equal(ledgerCustomerOptions(sites).length, 2);
  assert.deepEqual(ledgerWorksiteOptions(sites, '1').map(o => o.value).sort(), ['a', 'b']);
  assert.equal(ledgerWorksiteOptions(sites, 'missing').length, 0);
});
test('shows real worksite names and aliases, disambiguates customers without repeating names', () => {
  assert.equal(ledgerWorksiteOptions(sites, '1').find(o => o.value === 'a').label, 'Obra compartida · Alias distinto');
  assert.equal(ledgerWorksiteOptions(sites, '1').find(o => o.value === 'b').label, 'Otra obra');
  assert.match(ledgerWorksiteOptions(sites, '').find(o => o.value === 'c').label, /Cliente Dos/);
});
test('sends the same exact filters and text to the server for every page', () => {
  const filters = { ...createInitialLedgerFilters(), customerId: '1', customerWorksiteId: 'a', warehouseId: 'w', movementType: 'OUT', from: '2026-01-01' };
  const params = new URLSearchParams(buildLedgerQuery(filters, '  SIGO Mercedes  ', 'next'));
  for (const [k, v] of Object.entries(filters).filter(([, v]) => v)) assert.equal(params.get(k), v);
  assert.equal(params.get('search'), 'SIGO Mercedes'); assert.equal(params.get('cursor'), 'next');
  assert.equal(params.get('take'), '30'); assert.equal(params.has('skuId'), false);
});
test('clearing filters returns to all history with no cursor or residual scope', () => {
  assert.equal(buildLedgerQuery(createInitialLedgerFilters(), ''), 'take=30');
});
