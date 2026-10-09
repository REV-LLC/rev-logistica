import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { loadTransportModule } from '../transport/test-support.cjs';
const { MantineProvider } = createRequire(import.meta.url)('@mantine/core');
const { configurationPayload } = loadTransportModule('../equipment-configuration/types.ts');
const Editor = loadTransportModule('../equipment-configuration/ConfigurationEditor.tsx').default;
const renderEditor = entries => renderToStaticMarkup(React.createElement(MantineProvider, {}, React.createElement(Editor,
  { value: { version: 0, entries }, onChange() {} })));
const section = (html, label) => html.split(`aria-label="${label}"`)[1].split('</section>')[0];

test('default units remain concrete cards while the archived family route is absent', () => {
  const concrete = { id: 'link', role: 'ACCESSORY', assetId: 'unit', quantity: 1, recommendation: true, defaultIncluded: true, required: false,
    asset: { id: 'unit', internalNumber: 2, publicCode: 'HIDDEN-LONG-CODE', description: 'Martillo APT', sku: { name: 'Martillo APT' } } };
  const family = { id: 'template', role: 'ACCESSORY', familyId: 'family', family: { name: 'Mangueras' }, quantity: 1, recommendation: true, required: false };
  const html = renderEditor([concrete, family]);
  const compatible = section(html, 'Implementos compatibles');
  assert.match(compatible, /Martillo APT #2/);
  assert.match(compatible, /Unidad individual/);
  assert.match(compatible, /aria-label="Recomendado por defecto"/);
  assert.doesNotMatch(compatible, /Mangueras|HIDDEN-LONG-CODE/);
  assert.doesNotMatch(html, /Mangueras|Plantilla recomendada|Ruta recomendada|data-template-family-id/);
  assert.equal((html.match(/aria-label="Configurar Martillo APT #2"/g) || []).length, 1);
});
test('recommended bulk implements stay in compatibility cards with quantity control', () => {
  const row = { id: 'bulk', skuId: 'tips', role: 'ACCESSORY', recommendation: true, quantity: 2,
    defaultIncluded: false, required: false, sku: { name: 'Puntas APT', isConsumable: true } };
  const html = renderEditor([row]);
  assert.match(section(html, 'Implementos compatibles'), /Puntas APT[\s\S]*Consumible · Por cantidad/);
  assert.doesNotMatch(html, /Plantilla recomendada|Ruta recomendada/);
});
test('legacy accessory cards identify their actual control type without pretending to be native assets', () => {
  for (const [kind, label] of [['INDIVIDUAL', 'Unidad individual · Registro anterior'],
    ['RETURNABLE', 'Por cantidad · Registro anterior'], ['CONSUMABLE', 'Consumible · Registro anterior']]) {
    const html = renderEditor([{ id: `link-${kind}`, accessoryId: `part-${kind}`, role: 'ACCESSORY', recommendation: true,
      quantity: 1, required: false, defaultIncluded: false, accessory: { name: `Implemento ${kind}`, kind } }]);
    assert.ok(section(html, 'Implementos compatibles').includes(label));
    assert.doesNotMatch(html, /Plantilla recomendada|Ruta recomendada/);
  }
});
test('bulk implement identity and recommendation survive the configuration payload', () => {
  const row = { id: 'bulk', skuId: 'tips', role: 'ACCESSORY', recommendation: true, quantity: 2, defaultIncluded: false, required: false, sku: { name: 'Puntas APT' } };
  const { sku, ...expected } = row;
  assert.deepEqual(configurationPayload({ version: 1, entries: [row] }).entries[0], expected);
});
test('new implement creation uses native asset and bulk inventory, never the old accessory endpoint', () => {
  const source = readFileSync(new URL('../equipment-configuration/NewImplementForm.tsx', import.meta.url), 'utf8');
  assert.match(source, /\/inventory\/serialized-assets/);
  assert.match(source, /\/inventory\/bulk-adjustments/);
  assert.match(source, /isImplement: true, isConsumable: consumable/);
  assert.match(source, /Por cantidad · Se devuelve/);
  assert.match(source, /Por cantidad · Se consume/);
  assert.doesNotMatch(source, /api.*\/accessories/);
});

test('native implement creation defaults to the principal family and supports a separate subfamily', () => {
  const source = readFileSync(new URL('../equipment-configuration/NewImplementForm.tsx', import.meta.url), 'utf8');
  const editor = readFileSync(new URL('../equipment-configuration/ConfigurationEditor.tsx', import.meta.url), 'utf8');
  assert.match(editor, /initialFamilyId=\{value\.parent\?\.familyId\}/);
  assert.match(source, /item\.id === initialFamilyId && item\.controlType === 'SERIAL'/);
  assert.match(source, /subfamily: newSubfamily \? \{ name: subfamilyName\.trim\(\) \} : \{ id: subfamilyId \}/);
  assert.match(source, /Crear subfamilia/);
  assert.doesNotMatch(source, /api.*equipment-configurations/);
});

test('returnable quantity implements are never labelled as consumables', () => {
  const html = renderEditor([{ id: 'hose', skuId: 'hose-sku', role: 'ACCESSORY', quantity: 3,
    required: false, defaultIncluded: false, sku: { name: 'Manguera de succión', isConsumable: false } }]);
  assert.match(section(html, 'Implementos compatibles'), /Manguera de succión[\s\S]*Retornable · Por cantidad/);
  assert.doesNotMatch(html, /Consumible · Por cantidad/);
});

test('archiving the route does not delete its entries or links from the saved configuration', () => {
  const entries = [
    { id: 'family-x', role: 'ACCESSORY', familyId: 'x', templateParentFamilyId: null,
      quantity: 1, required: false, recommendation: true, defaultIncluded: false },
    { id: 'family-y', role: 'ACCESSORY', familyId: 'y', templateParentFamilyId: 'x',
      quantity: 2, required: false, recommendation: true, defaultIncluded: false },
  ];
  assert.doesNotMatch(renderEditor(entries), /Plantilla recomendada|Ruta recomendada|Agregar a la ruta/);
  assert.deepEqual(configurationPayload({ version: 4, entries }).entries, entries);
  const source = readFileSync(new URL('../equipment-configuration/ConfigurationEditor.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /import .*ImplementTemplateRoute|import .*TemplateRouteNodeOptions/);
});
