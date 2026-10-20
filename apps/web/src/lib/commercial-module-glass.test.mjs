import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const customers = read('../app/customers/page.tsx');
const prices = read('../app/billing/price-list/page.tsx');

test('customers and prices opt into the approved responsive REV background and shared glass table', () => {
  for (const source of [customers, prices]) {
    assert.match(source, /<EmployeePageBackground src="\/employees\/rev-directory-v1\.webp" mobileSrc="\/employees\/rev-directory-mobile-v1\.webp" variant="brand"/);
    assert.match(source, /<Title order=\{1\} className=\{glass\.title\}>/);
    assert.match(source, /<section className=\{glass\.surface\}/);
    assert.match(source, /<div className=\{tableGlass\.table\}>/);
  }
  assert.doesNotMatch(prices, /PageHeaderCard|<Paper/);
});

test('price type switches keep a local loader after the first load, including an empty catalogue', () => {
  assert.match(prices, /const \[initialLoading, setInitialLoading\] = useState\(true\)/);
  assert.match(prices, /data-page-loading=\{initialLoading \? 'true' : undefined\}/);
  assert.match(prices, /finally\s*\{\s*setLoading\(false\);\s*setInitialLoading\(false\);/);
  assert.equal((prices.match(/setInitialLoading\(true\)/g) ?? []).length, 0);
  assert.match(prices, /aria-label="Tipo de inventario"/);
  assert.match(prices, /aria-label="Buscar referencias"/);
});

test('price query and CSV retain owned-equipment scope and the selected control type', () => {
  assert.match(prices, /new URLSearchParams\(\{ controlType: targetControlType, ownOnly: 'true' \}\)/);
  assert.match(prices, /const rows = filteredItems\.map/);
  assert.match(prices, /lista-precios-propios-\$\{controlType\.toLowerCase\(\)\}\.csv/);
  assert.match(prices, /toNumber\(item\.price\) \?\? ''/);
  assert.match(prices, /text\.replace\(\/"\/g, '""'\)/);
  assert.equal((prices.match(/variant="glass"/g) ?? []).length, 2);
});

test('customer creation keeps its initial worksite, RUT, documents and editable contact fields', () => {
  assert.match(customers, /api<ParsedRutCustomer>\('\/customers\/parse-rut'/);
  assert.match(customers, /initialWorksite: editingCustomer\s*\? undefined/);
  assert.match(customers, /documentsEmail: form\.documentsEmail\.trim\(\)\.toLowerCase\(\)/);
  assert.match(customers, /entityType="CUSTOMER"/);
  assert.match(customers, /href=\{`\/transport\/worksites\/\$\{entry\.id\}`\}/);
  assert.match(customers, /<\/section>[\s\S]*<Modal/);
  assert.match(customers, /aria-label="Buscar clientes"/);
});

test('commercial glass stays page-scoped and does not style the shared billing layout or annexes', () => {
  const billingLayout = read('../app/billing/layout.tsx');
  assert.doesNotMatch(billingLayout, /EmployeePageBackground|GlassDataTable|directory\.module/);
  for (const path of ['../app/customers/customers.module.css', '../app/billing/price-list/price-list.module.css']) {
    assert.doesNotMatch(read(path), /:global\((?:html|body|\.mantine-Modal)|annex/i);
  }
});
