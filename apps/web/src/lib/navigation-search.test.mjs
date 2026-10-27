import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadTransportModule } from '../components/transport/test-support.cjs';

const { buildNavigationSearchEntries, searchNavigation } = loadTransportModule('../../lib/navigation-search.ts');
const entries = buildNavigationSearchEntries([
  { title: 'Accesos rápidos', links: [
    { href: '/employees', label: 'Empleados' },
    { href: '/transport/tracking', label: 'Mapa' },
  ] },
  { title: 'Gestión', links: [
    { href: '/employees', label: 'Empleados', children: [
      { href: '/employees', label: 'Directorio' },
      { href: '/employees/payroll', label: 'Nómina' },
    ] },
    { href: '/providers', label: 'Proveedores' },
  ] },
]);

test('includes nested pages once and keeps parent context searchable', () => {
  assert.equal(entries.filter(entry => entry.href === '/employees').length, 1);
  assert.equal(searchNavigation(entries, 'empleados nomina')[0].href, '/employees/payroll');
  assert.equal(searchNavigation(entries, 'directorio')[0].href, '/employees');
});

test('matches accents, capitalization, whitespace and familiar aliases', () => {
  assert.equal(searchNavigation(entries, '  NOMINA  ')[0].label, 'Nómina');
  assert.equal(searchNavigation(entries, 'ubicación camiones')[0].label, 'Mapa');
});

test('does not introduce routes outside the authorized sidebar entries', () => {
  const driver = buildNavigationSearchEntries([{ title: 'Operación', links: [
    { href: '/transport/generate', label: 'Generar documento' },
  ] }]);
  assert.equal(searchNavigation(driver, 'nomina').length, 0);
  assert.equal(searchNavigation(driver, 'mapa').length, 0);
  assert.equal(searchNavigation(driver, 'remision')[0].href, '/transport/generate');
});

test('empty and unknown queries have predictable results', () => {
  assert.equal(searchNavigation(entries, '').length, entries.length);
  assert.deepEqual(searchNavigation(entries, 'zzzz'), []);
  assert.equal(searchNavigation(entries, 'empleados')[0].label, 'Empleados');
});

test('Mapa is a visible Operations link for Admin and Office, not only an unrendered quick link', () => {
  const nav = readFileSync(new URL('../components/Nav.tsx', import.meta.url), 'utf8');
  const operations = nav.slice(nav.indexOf('title: "Operación"'), nav.indexOf('title: "Inventario"'));
  assert.match(operations, /href: "\/transport\/tracking",\s+label: "Mapa",\s+icon: IconMap2,\s+roles: \["ADMIN", "OFFICE"\]/);
  assert.equal((nav.match(/label: "Mapa"/g) ?? []).length, 1);
});
