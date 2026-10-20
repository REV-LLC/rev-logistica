import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const page = read('../app/transport/vehicles/page.tsx');
const css = read('../components/tables/GlassDataTable.module.css');
const stat = read('../components/dashboard/StatCard.tsx');

test('vehicles uses the approved shared glass surface and existing truck background', () => {
  assert.match(page, /import glass from '\.\.\/\.\.\/employees\/directory\.module\.css'/);
  assert.match(page, /<EmployeePageBackground src="\/employees\/transport-v1\.webp" variant="transport"/);
  assert.match(page, /<Title order=\{1\} className=\{glass\.title\}>Vehículos<\/Title>/);
  assert.match(page, /<section className=\{glass\.surface\} aria-label="Flota de vehículos">/);
  assert.doesNotMatch(page, /PageHeaderCard/);
});

test('initial vehicle loading uses a measurable marker without white loading cards', () => {
  assert.match(page, /data-page-loading=\{loading && vehicles\.length === 0 \? 'true' : undefined\}/);
  assert.match(page, /loading && vehicles\.length === 0 \? <div className=\{glass\.loadingSpace\} role="status" aria-label="Cargando vehículos"/);
});

test('glass statistics are opt-in and preserve the default appearance in other modules', () => {
  assert.match(stat, /variant\?: 'default' \| 'glass'/);
  assert.match(stat, /variant = 'default'/);
  assert.match(stat, /withBorder=\{variant !== 'glass'\}/);
  assert.match(stat, /background: variant === 'glass' \? 'transparent' :/);
  assert.equal((page.match(/variant="glass"/g) ?? []).length, 4);
});

test('vehicle table styling is transparent and scoped away from shared modals', () => {
  assert.match(css, /\.table :global\(\.mantine-Table-th\),\s*\.table :global\(\.mantine-Table-td\)\s*\{\s*background: transparent;/);
  assert.match(css, /\.table :global\(\.mantine-Paper-root\)\s*\{\s*background: transparent;/);
  assert.match(css, /\.table :global\(\.mantine-Table-table\)\s*\{[^}]*--table-hover-color: rgb\(255 255 255 \/ 3%\)/);
  assert.match(css, /\.mantine-ScrollArea-scrollbar\):active/);
  assert.doesNotMatch(css, /:global\((?:html|body|\.mantine-Modal)|position:\s*sticky|backdrop-filter:/);
});
