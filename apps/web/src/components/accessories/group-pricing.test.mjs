import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { loadTransportModule } from '../transport/test-support.cjs';

const { commercialPayload, commercialError } = loadTransportModule('../commercial-profiles/types.ts');
const profile = { id: 'profile', scopeType: 'ASSET', scopeId: 'equipment-x', version: 4,
  effectiveFrom: '2026-10-07', groups: [{ id: 'group-y', name: 'Implemento Y', selectors: [{ kind: 'SKU', id: 'y' }] }],
  modes: [
    { id: 'without', name: 'Sin Y', unit: 'DAY', minimum: { value: '3', basis: 'PER_RENTAL' },
      pricing: { source: 'FIXED', amount: '25000' }, conditions: [{ groupId: 'group-y', presence: 'ABSENT' }],
      parts: [{ groupId: 'group-y', treatment: 'INCLUDED' }] },
    { id: 'with', name: 'Con Y', unit: 'METER', minimum: { value: '40', basis: 'PER_RENTAL' },
      pricing: { source: 'FIXED', amount: '1500' }, conditions: [{ groupId: 'group-y', presence: 'PRESENT', minimumQuantity: 1 }],
      parts: [{ groupId: 'group-y', treatment: 'INCLUDED' }] },
  ] };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
const mounts = [];
afterEach(async () => {
  for (const { root, container } of mounts.splice(0)) { await act(() => root.unmount()); container.remove(); }
});

async function fixture(initial = profile) {
  let value; const controls = new Map();
  const box = ({ children }) => React.createElement('div', {}, children);
  const field = props => { const rows = controls.get(props.label) ?? []; rows.push(props); controls.set(props.label, rows); return null; };
  const Editor = loadTransportModule('../commercial-profiles/CommercialProfileEditor.tsx', {
    '@mantine/core': { Card: box, Group: box, SimpleGrid: box, Stack: box, Text: box,
      Select: field, MultiSelect: field, NumberInput: field, TextInput: field,
      Button: ({ children, onClick, disabled }) => React.createElement('button', { onClick, disabled }, children) },
  }).default;
  function App() {
    const [current, setCurrent] = useState(structuredClone(initial)); value = current; controls.clear();
    return React.createElement(Editor, { value: current, entries: [{ skuId: 'y', sku: { name: 'Y' } }], onChange: setCurrent });
  }
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container); mounts.push({ root, container });
  await act(() => root.render(React.createElement(App)));
  return { container, controls, get value() { return value; },
    change: (label, index, next) => act(() => controls.get(label)[index].onChange(next)),
    click: (label, index = 0) => act(() => [...container.querySelectorAll('button')].filter(button => button.textContent === label)[index].click()),
  };
}

test('one general editor keeps group IDs, automatic sources and minimum bases when changing a price c/u', async () => {
  const f = await fixture();
  assert.equal(f.controls.get('Precio c/u').length, 2);
  assert.ok(!/Opciones avanzadas|Unidad de cobro|Reemplaza/.test(f.container.textContent));
  await f.change('Precio c/u', 1, 1700);
  const expected = structuredClone(profile); expected.modes[1].pricing.amount = '1700';
  assert.deepEqual(commercialPayload(f.value), commercialPayload(expected));
  assert.equal(commercialError(f.value), null);
  // Choosing the current calculation must not erase existing values.
  await f.change('De dónde sale la cantidad', 1, 'METER');
  assert.deepEqual(f.value, expected);
});

test('changing one automatic source clears only that combination and does not reinterpret old prices', async () => {
  const f = await fixture();
  await f.change('De dónde sale la cantidad', 1, 'HOUR');
  assert.deepEqual(f.value.modes[0], profile.modes[0]);
  assert.equal(f.value.modes[1].unit, 'HOUR');
  assert.deepEqual(f.value.modes[1].minimum, { value: '0', basis: 'PER_REPORTED_DAY' });
  assert.equal(f.value.modes[1].pricing.amount, '');
  assert.ok(commercialError(f.value));
  await f.change('Precio c/u', 1, 0);
  assert.equal(commercialError(f.value), null);
});

test('adding groups and combinations is additive and preserves all previously configured rules', async () => {
  const f = await fixture();
  await f.click('Agregar grupo');
  assert.deepEqual(f.value.modes, profile.modes);
  assert.deepEqual(f.value.groups[0], profile.groups[0]);
  await f.change('Nombre del grupo', 1, { currentTarget: { value: 'Z' } });
  await f.change('Elementos del grupo', 1, ['SKU:y']);
  await f.click('Crear alternativas con / sin', 1);
  assert.deepEqual(f.value.modes.slice(0, 2), profile.modes);
  assert.equal(f.value.modes.length, 4);
  assert.ok(f.value.modes.slice(2).every(mode => mode.unit === 'DAY' && mode.pricing.amount === ''));
  assert.deepEqual(f.value.modes.slice(2).map(mode => mode.conditions[0].presence), ['ABSENT', 'PRESENT']);
  await f.click('Agregar combinación');
  assert.equal(f.value.modes.length, 5);
  assert.deepEqual(f.value.modes.slice(0, 2), profile.modes);
});

test('a multi-group combination is rendered exactly once and retains every condition and treatment', async () => {
  const initial = structuredClone(profile);
  initial.groups.push({ id: 'z', name: 'Z', selectors: [{ kind: 'ASSET', id: 'z' }] });
  initial.modes[1].conditions.push({ groupId: 'z', presence: 'ABSENT' });
  initial.modes[1].parts.push({ groupId: 'z', treatment: 'INDEPENDENT' });
  const f = await fixture(initial);
  assert.equal(f.controls.get('Precio c/u').length, 2);
  assert.deepEqual(commercialPayload(f.value), commercialPayload(initial));
});
