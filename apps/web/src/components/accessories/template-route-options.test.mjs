import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { loadTransportModule } from '../transport/test-support.cjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const mounts = [];
afterEach(async () => {
  for (const { root, container } of mounts.splice(0)) {
    await act(() => root.unmount()); container.remove();
  }
});
const Box = ({ children }) => React.createElement('div', {}, children);
const Options = loadTransportModule('../equipment-configuration/TemplateRouteNodeOptions.tsx', {
  '@mantine/core': {
    Modal: Box, Stack: Box, Group: Box, Text: ({ children, role }) => React.createElement('p', { role }, children),
    Button: ({ children, onClick, disabled }) => React.createElement('button', { onClick, disabled }, children),
    Select: ({ label, data, value, onChange, disabled }) => React.createElement('label', {}, label,
      React.createElement('select', { value, disabled, onChange: event => onChange(event.currentTarget.value) },
        data.map(option => React.createElement('option', { key: option.value, value: option.value }, option.label)))),
  },
}).default;
const { configurationPayload, configurationError } = loadTransportModule('../equipment-configuration/types.ts');
const family = (id, parent = null) => ({ id: `entry-${id}`, familyId: id,
  family: { id, name: `Familia ${id}`, controlType: 'BULK' }, role: 'ACCESSORY',
  templateParentFamilyId: parent, recommendation: true, quantity: 4, required: false, defaultIncluded: false });
async function mount(entry, entries, creating = false) {
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container); mounts.push({ container, root });
  const applied = [], cancelled = [];
  await act(() => root.render(React.createElement(Options, { entry, entries, creating, parentName: 'Equipo X #2',
    onApply: row => applied.push(row), onCancel: () => cancelled.push(true), onRemove() {} })));
  return { container, applied, cancelled,
    select: value => act(() => { const select = container.querySelector('select'); select.value = value; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }),
    click: text => act(() => [...container.querySelectorAll('button')].find(button => button.textContent === text).click()),
  };
}

test('route options edit a family predecessor without choosing units, quantities or costs', async () => {
  const a = family('A'), b = family('B');
  const f = await mount(b, [a, b]);
  assert.doesNotMatch(f.container.textContent, /Cantidad|unidad|tarifa|Máximo/i);
  assert.equal(f.container.querySelectorAll('input[type=number]').length, 0);
  await f.select('A'); await f.click('Aplicar');
  assert.equal(f.applied[0].templateParentFamilyId, 'A');
  assert.equal(f.applied[0].familyId, 'B');
  assert.equal(f.applied[0].quantity, 4, 'presentation does not rewrite existing configuration quantities');
  assert.equal('assetId' in f.applied[0], false);
  assert.equal(b.templateParentFamilyId, null, 'editing is local draft only');
});

test('cycles are rejected locally and cancellation never changes the configuration', async () => {
  const a = family('A'), b = family('B', 'A');
  const f = await mount(a, [a, b]);
  await f.select('B'); await f.click('Aplicar');
  assert.deepEqual(f.applied, []);
  assert.match(f.container.querySelector('[role=alert]').textContent, /ciclos/);
  await f.click('Cancelar');
  assert.equal(f.cancelled.length, 1);
  assert.equal(a.templateParentFamilyId, null);
});

test('payload preserves explicit routes and null root links, never maps them to unit custody', () => {
  const config = { version: 3, entries: [family('A'), family('B', 'A'), family('C', 'B')] };
  assert.equal(configurationError(config), null);
  const payload = configurationPayload(config);
  assert.deepEqual(payload.entries.map(row => row.templateParentFamilyId), [null, 'A', 'B']);
  assert.equal(payload.entries.some(row => row.assetId || row.accessoryId || row.skuId || row.parentCompositionNodeId), false);
  assert.match(configurationError({ ...config, entries: [family('A', 'absent')] }), /misma ruta|esta ruta/);
});
