import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const page = read('../app/providers/page.tsx');
const vehicles = read('../app/transport/vehicles/page.tsx');
const css = read('../components/tables/GlassDataTable.module.css');

test('providers uses the approved responsive REV background and one glass surface', () => {
  assert.match(page, /<EmployeePageBackground src="\/employees\/rev-directory-v1\.webp" mobileSrc="\/employees\/rev-directory-mobile-v1\.webp" variant="brand"/);
  assert.match(page, /<Title order=\{1\} className=\{glass\.title\}>Proveedores<\/Title>/);
  assert.match(page, /<section className=\{glass\.surface\} aria-label="Directorio de proveedores">/);
  assert.equal((page.match(/variant="glass"/g) ?? []).length, 3);
  assert.doesNotMatch(page, /PageHeaderCard/);
});

test('providers and vehicles opt into the same glass table without changing table defaults elsewhere', () => {
  for (const source of [page, vehicles]) {
    assert.match(source, /import tableGlass from '@\/components\/tables\/GlassDataTable\.module\.css'/);
    assert.match(source, /<div className=\{tableGlass\.table\}>/);
  }
  assert.doesNotMatch(css, /:global\((?:html|body|\.mantine-Modal)/);
  assert.match(css, /\.mantine-ActionIcon-root\):not\(\[aria-hidden='true'\]\)/);
});

test('providers retains its filters, owner API contract and modal boundaries', () => {
  assert.match(page, /provider\.category === 'PROVIDER'/);
  assert.match(page, /aria-label="Buscar proveedores"/);
  assert.match(page, /aria-label="Filtrar proveedores por estado"/);
  assert.match(page, /api<Provider\[\]>\('\/owners'\)/);
  assert.match(page, /api<Warehouse\[\]>\('\/warehouses'\)/);
  assert.match(page, /method: isEditing \? 'PATCH' : 'POST'/);
  assert.match(page, /href=\{`\/inventory\/warehouse\/provider\/\$\{warehouse\.id\}`\}/);
  assert.match(page, /<\/section>[\s\S]*<Modal/);
});

test('provider initial loading has no nested white loading cards', () => {
  assert.match(page, /data-page-loading=\{loading && providers\.length === 0 \? 'true' : undefined\}/);
  assert.match(page, /loading && providers\.length === 0 \? <div className=\{glass\.loadingSpace\} role="status" aria-label="Cargando proveedores"/);
});
