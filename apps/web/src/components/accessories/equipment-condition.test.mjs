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
const mounted = [];
afterEach(async () => { for (const { root, container } of mounted.splice(0)) {
  await act(() => root.unmount()); container.remove();
} });

async function fixture(overrides = {}, reject = false) {
  const controls = {}, calls = [], updates = [];
  let closed = 0;
  const box = ({ children }) => React.createElement('div', {}, children);
  const Radio = box;
  Radio.Group = props => { controls.target = props.onChange; return box(props); };
  const Component = loadTransportModule('../serialized-assets/AssetConditionAction.tsx', {
    '@mantine/core': { Alert: box, Group: box, Modal: box, Stack: box, Text: box, Radio,
      Textarea: props => { controls.note = props.onChange; return null; },
      Button: ({ children, onClick, disabled }) => React.createElement('button', { onClick, disabled }, children) },
    '@/lib/api': { api: async (path, options) => {
      calls.push({ path, ...options });
      if (reject) throw new Error('No se pudo registrar.');
      return { isDamaged: options.json.isDamaged, damageNote: options.json.isDamaged ? options.json.note : null, conditionEvents: [] };
    } },
  }).default;
  const props = { assetId: 'machine', name: 'Mezcladora #1', isDamaged: false,
    assignedMotor: { id: 'motor', name: 'Honda #1', isDamaged: false }, opened: true,
    onOpen() {}, onClose() { closed++; }, onUpdated(...args) { updates.push(args); }, ...overrides };
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container); mounted.push({ root, container });
  await act(() => root.render(React.createElement(Component, props)));
  return { calls, updates, container, get closed() { return closed; },
    select: value => act(() => controls.target(value)),
    note: value => act(() => controls.note({ currentTarget: { value } })),
    button: label => [...container.querySelectorAll('button')].find(b => b.textContent === label),
  };
}

test('una avería se registra solo sobre la mezcladora, sin seleccionar motor', async () => {
 const f = await fixture(); await f.note(' No enciende ');
 await act(async () => f.button('Confirmar avería').click());
 assert.deepEqual(f.calls, [{ path: '/assets/machine/condition', method: 'PATCH', json: { isDamaged: true, note: 'No enciende' } }]);
 assert.equal(f.updates.length, 1); assert.equal(f.closed, 1);
});
test('sin descripción no cambia ninguna condición', async () => {
 const f = await fixture(); await act(async () => f.button('Confirmar avería').click());
 assert.deepEqual(f.calls, []); assert.equal(f.closed, 0);
});
test('un error conserva el formulario y no modifica el cliente', async () => {
 const f = await fixture({}, true); await f.note('Falla');
 await act(async () => f.button('Confirmar avería').click());
 assert.equal(f.closed, 0); assert.deepEqual(f.updates, []);
 assert.ok(f.container.textContent.includes('No se pudo registrar.'));
});
test('reparar registra el historial del mismo equipo', async () => {
 const f = await fixture({ isDamaged: true }); await f.note('Reparado');
 await act(async () => f.button('Confirmar reparación').click());
 assert.equal(f.calls[0].path, '/assets/machine/condition'); assert.equal(f.calls[0].json.isDamaged, false);
});
