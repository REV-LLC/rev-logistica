import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTransportModule } from '../components/transport/test-support.cjs';
const { buildLedgerQuery, buildLedgerLocation, readLedgerLocation, createInitialLedgerFilters, ledgerCustomerOptions, ledgerWorksiteOptions } = loadTransportModule('../../lib/ledger-filters.ts');
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

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
test('round-trips every applied filter and search through a reloadable ledger URL', () => {
  const filters = { warehouseId: uuid(1), customerId: uuid(2), customerWorksiteId: uuid(3), skuId: uuid(4), assetId: uuid(5), movementType: 'OUT', from: '2026-10-01T10:30', to: '2026-10-25T19:00' };
  const search = 'SIGO / Las Mercedes & tablón';
  const href = buildLedgerLocation(filters, search, '30');
  const state = readLedgerLocation(new URL(href, 'http://localhost').searchParams);
  assert.deepEqual(state, { filters, search, dateRange: '30' });
  const api = new URLSearchParams(buildLedgerQuery(state.filters, state.search));
  assert.equal(api.get('customerId'), uuid(2));assert.equal(api.get('customerWorksiteId'), uuid(3));
  assert.equal(api.has('range'), false);assert.equal(api.has('cursor'), false);
});
test('restores fixed dates rather than recalculating the preset on Back or reload', () => {
  const params = new URLSearchParams({ from: '2025-01-01T10:00', range: '7' });
  assert.equal(readLedgerLocation(params).filters.from, '2025-01-01T10:00');
  assert.equal(readLedgerLocation(params).dateRange, '7');
  params.delete('range');assert.equal(readLedgerLocation(params).dateRange, 'custom');
});
test('ignores invalid filters, untrusted navigation params and stale cursors in a shared URL', () => {
  const params = new URLSearchParams({ customerId: 'invalid', movementType: 'DELETE', from: 'not-a-date', to: '2026-99-99T00:00', range: '30', search: 'x'.repeat(220), cursor: 'stale', take: '200', returnTo: 'https://untrusted.test' });
  const state = readLedgerLocation(params);
  assert.deepEqual(state.filters, createInitialLedgerFilters());assert.equal(state.search.length, 200);assert.equal(state.dateRange, 'all');
  const href = buildLedgerLocation(state.filters, state.search, state.dateRange);
  assert.equal(new URL(href, 'http://localhost').searchParams.size, 1);
});
test('clearing the view removes the URL query instead of restoring old scope on a later visit', () => {
  const href = buildLedgerLocation(createInitialLedgerFilters(), '', 'all');
  assert.equal(href, '/inventory/ledger');
  assert.deepEqual(readLedgerLocation(new URLSearchParams()), { filters: createInitialLedgerFilters(), search: '', dateRange: 'all' });
});
