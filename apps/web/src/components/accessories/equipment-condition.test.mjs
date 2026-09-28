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
      if (reject) throw new Error('El motor asignado cambió.');
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

test('requires explicitly choosing machine or motor before reporting damage', async () => {
  const f = await fixture();
  assert.equal(f.button('Confirmar avería').disabled, true);
  assert.deepEqual(f.calls, []);
});
test('motor damage targets the motor ID and checks its assignment, never the machine ID', async () => {
  const f = await fixture(); await f.select('motor'); await f.note(' No enciende ');
  await act(async () => f.button('Confirmar avería').click());
  assert.deepEqual(f.calls, [{ path: '/assets/motor/condition', method: 'PATCH', json: { isDamaged: true, note: 'No enciende', expectedParentAssetId: 'machine' } }]);
  assert.equal(f.updates[0][1], 'motor'); assert.equal(f.closed, 1);
});
test('machine damage changes only the machine and clears the note on target change', async () => {
  const f = await fixture(); await f.select('motor'); await f.note('Nota del motor'); await f.select('equipment');
  await act(async () => f.button('Confirmar avería').click()); assert.deepEqual(f.calls, []);
  await f.note('Falla del chasis'); await act(async () => f.button('Confirmar avería').click());
  assert.deepEqual(f.calls[0], { path: '/assets/machine/condition', method: 'PATCH', json: { isDamaged: true, note: 'Falla del chasis' } });
  assert.equal(f.updates[0][1], 'equipment');
});
test('a damaged motor offers repair independently of an operational machine', async () => {
  const f = await fixture({ assignedMotor: { id: 'motor', name: 'Honda', isDamaged: true } });
  await f.select('motor'); await f.note('Reparado'); await act(async () => f.button('Confirmar reparación').click());
  assert.equal(f.calls[0].json.isDamaged, false); assert.equal(f.updates[0][1], 'motor');
});
test('stale assignment errors leave the form open and do not change client condition', async () => {
  const f = await fixture({}, true); await f.select('motor'); await f.note('Falla');
  await act(async () => f.button('Confirmar avería').click());
  assert.equal(f.closed, 0); assert.deepEqual(f.updates, []);
  assert.ok(f.container.textContent.includes('El motor asignado cambió.'));
});
test('equipment without an interchangeable motor keeps its direct condition action', async () => {
  const f = await fixture({ assignedMotor: null, isDamaged: true }); await f.note('Reparado');
  await act(async () => f.button('Confirmar reparación').click());
  assert.equal(f.calls[0].path, '/assets/machine/condition'); assert.equal(f.calls[0].json.isDamaged, false);
});
