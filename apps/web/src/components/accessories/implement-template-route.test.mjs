import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { loadTransportModule } from '../transport/test-support.cjs';

const { MantineProvider } = createRequire(import.meta.url)('@mantine/core');
const { buildImplementTemplateRoute } = loadTransportModule('../equipment-configuration/implement-template-route.ts');
const Route = loadTransportModule('../equipment-configuration/ImplementTemplateRoute.tsx').default;
const family = (familyId, name, templateParentFamilyId = null) => ({
  id: `entry-${familyId}`, familyId, family: { id: familyId, name, controlType: 'SERIAL' },
  templateParentFamilyId, role: 'ACCESSORY', quantity: 99, required: false, defaultIncluded: false,
});
const renderRoute = (entries, parentName = 'Equipo X #2') => renderToStaticMarkup(React.createElement(MantineProvider, {},
  React.createElement(Route, { entries, parentName, onEdit() {}, onAdd() {} })));

test('arbitrary families form an explicit route independent of business names and array order', () => {
  const entries = [family('z', 'Familia Z', 'y'), family('x', 'Familia X'), family('y', 'Familia Y', 'x')];
  const route = buildImplementTemplateRoute(entries);
  assert.equal(route.issues.length, 0);
  assert.equal(route.roots.length, 1);
  assert.equal(route.roots[0].entry.familyId, 'x');
  assert.equal(route.roots[0].children[0].entry.familyId, 'y');
  assert.equal(route.roots[0].children[0].children[0].entry.familyId, 'z');
  const html = renderRoute(entries);
  assert.match(html, /Equipo X #2/);
  assert.match(html, /Familia X[\s\S]*Familia Y[\s\S]*Familia Z/);
  assert.match(html, /aria-label="Configurar ruta de Familia Y"/);
  assert.doesNotMatch(html, /Cantidad|Unidad individual|Elegir unidad|>99<|<details/);
});

test('existing root recommendations stay separate branches, never an inferred sequence', () => {
  const entries = [family('a', 'Familia A'), family('b', 'Familia B'), family('c', 'Familia C', 'a')];
  const route = buildImplementTemplateRoute(entries);
  assert.deepEqual(route.roots.map(node => node.entry.familyId), ['a', 'b']);
  assert.deepEqual(route.roots[0].children.map(node => node.entry.familyId), ['c']);
  assert.equal(route.roots[1].children.length, 0);
  const html = renderRoute(entries);
  assert.equal((html.match(/aria-label="Equipo principal: Equipo X #2"/g) || []).length, 1);
  assert.match(html, /data-template-family-id="c" data-parent-family-id="a"/);
  assert.doesNotMatch(html, /data-template-family-id="b" data-parent-family-id/);
});

test('the route displays family names only, not compatible physical unit identities or quantities', () => {
  const entries = [family('family', 'Manguera'), {
    id: 'physical', assetId: 'unique-unit', role: 'ACCESSORY', quantity: 88,
    asset: { description: 'Martillo específico #12', publicCode: 'LONG-UNIT-CODE', sku: { name: 'Martillo' } },
  }];
  const html = renderRoute(entries);
  assert.match(html, />Manguera</);
  assert.doesNotMatch(html, /Martillo específico|LONG-UNIT-CODE|>88<|Cantidad|Precio|Tarifa/);
});

test('orphans and cycles remain editable but never acquire a fabricated route to the asset', () => {
  const entries = [family('orphan', 'Huérfana', 'missing'), family('a', 'Ciclo A', 'b'),
    family('b', 'Ciclo B', 'a'), family('child', 'Hijo del ciclo', 'a'), family('good', 'Correcta')];
  const route = buildImplementTemplateRoute(entries);
  assert.deepEqual(route.roots.map(node => node.entry.familyId), ['good']);
  assert.deepEqual(route.issues.map(issue => issue.reason), ['missing-parent', 'cycle', 'cycle', 'cycle']);
  assert.equal(route.invalidEntries.length, 4);
  const html = renderRoute(entries);
  assert.match(html, /Revisa los enlaces de la ruta/);
  assert.match(html, /aria-label="Configurar ruta de Huérfana"/);
  assert.doesNotMatch(html, /data-template-family-id="(?:orphan|a|b|child)"/);
});

test('duplicate family identities do not produce ambiguous edges and the empty route remains useful', () => {
  const route = buildImplementTemplateRoute([family('duplicate', 'Una'), { ...family('duplicate', 'Dos'), id: 'second' },
    family('child', 'Dependiente', 'duplicate')]);
  assert.equal(route.roots.length, 0);
  assert.deepEqual(route.issues.map(issue => issue.reason), ['duplicate', 'missing-parent']);
  const html = renderRoute([]);
  assert.match(html, /Equipo X #2/);
  assert.match(html, /Sin familias en la ruta/);
  assert.match(html, /aria-label="Agregar familia a la ruta"/);
});

test('node actions edit the chosen family and explicitly choose the new family parent', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const InteractiveRoute = loadTransportModule('../equipment-configuration/ImplementTemplateRoute.tsx', {
    '@mantine/core': { ActionIcon: ({ children, variant, size, ...props }) => React.createElement('button', props, children) },
  }).default;
  const entry = family('y', 'Familia Y');
  const actions = [];
  const props = { entries: [entry], parentName: 'Principal', onAdd: parent => actions.push(['add', parent]),
    onEdit: chosen => actions.push(['edit', chosen]) };
  const container = dom.window.document.getElementById('root');
  const root = createRoot(container);
  try {
    await act(() => root.render(React.createElement(InteractiveRoute, props)));
    await act(() => container.querySelector('[aria-label="Agregar familia a la ruta"]').click());
    await act(() => container.querySelector('[aria-label="Agregar familia después de Familia Y"]').click());
    await act(() => container.querySelector('[aria-label="Configurar ruta de Familia Y"]').click());
    assert.deepEqual(actions, [['add', null], ['add', 'y'], ['edit', entry]]);
    await act(() => root.render(React.createElement(InteractiveRoute, { ...props, disabled: true })));
    for (const button of container.querySelectorAll('button')) {
      assert.equal(button.disabled, true);
      await act(() => button.click());
    }
    assert.equal(actions.length, 3);
  } finally {
    await act(() => root.unmount());
    dom.window.close();
    global.window = previous.window;
    global.document = previous.document;
    global.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});
