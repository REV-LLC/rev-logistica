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

async function fixture(defaults = { initialOwnerWarehouseId: 'own', initialWarehouseId: 'other' }) {
  const controls = {}, calls = [], created = [];
  const box = ({ children }) => React.createElement('div', {}, children);
  const field = props => { controls[props.label] = props; return null; };
  const Form = loadTransportModule('../equipment-configuration/NewImplementForm.tsx', {
    '@mantine/core': { Alert: box, Stack: box, TextInput: field, Select: field, NumberInput: field,
      Button: ({ children, onClick, disabled }) => React.createElement('button', { onClick, disabled }, children) },
    '@/lib/api': { api: async (path, options = {}) => {
      calls.push({ path, ...options });
      if (path === '/asset-families') return [
        { id: 'shared', name: 'Familia X', controlType: 'SERIAL', subfamilies: [{ id: 'machines', name: 'Equipos', active: true }] },
        { id: 'bulk', name: 'Familia Z', controlType: 'BULK', subfamilies: [] },
      ];
      if (path === '/warehouses') return [{ id: 'own', name: 'Bodega propia' }, { id: 'other', name: 'Otra bodega' }];
      if (path === '/inventory/serialized-assets') return { asset: { id: 'implement', internalNumber: 1 } };
      if (path === '/inventory/bulk-adjustments') return { sku: { id: 'quantity-implement' } };
      throw new Error(`Unexpected request: ${path}`);
    } },
  }).default;
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container); mounts.push({ root, container });
  await act(() => root.render(React.createElement(Form, { initialFamilyId: 'shared', ...defaults,
    onCreated: entry => created.push(entry), onBusyChange() {} })));
  const change = (label, value) => act(() => controls[label].onChange(value));
  const input = (label, value) => change(label, { currentTarget: { value } });
  const click = label => act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === label).click());
  return { controls, calls, created, change, input, click };
}

test('individual implement creation sends the principal family and a new subfamily, without provider cost or automatic links', async () => {
  const f = await fixture();
  assert.equal(f.controls['Familia de inventario'].value, 'shared');
  assert.equal(f.controls.Subfamilia.value, null);
  await f.input('Nombre', 'Balde Y');
  assert.equal(f.controls['Bodega propietaria'].value, 'own');
  assert.equal(f.controls['Ubicación inicial'].value, 'other');
  await f.click('Crear subfamilia');
  await f.input('Nueva subfamilia', 'Baldes');
  await f.click('Crear implemento');
  const posts = f.calls.filter(call => call.method === 'POST');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].path, '/inventory/serialized-assets');
  assert.deepEqual(posts[0].json, { family: { id: 'shared' }, subfamily: { name: 'Baldes' }, sku: { name: 'Balde Y' },
    asset: { description: 'Balde Y', isImplement: true }, ownerWarehouseId: 'own', warehouseCurrentId: 'other' });
  assert.equal(f.created[0].asset.warehouseOwner.name, 'Bodega propia');
  assert.equal(f.created[0].assetId, 'implement');
  assert.equal(f.calls.some(call => call.path.includes('equipment-configurations')), false);
});

test('quantity implement switches to BULK without borrowing the serial family, preserving returnability', async () => {
  const f = await fixture();
  await f.change('Cómo se controla', 'RETURNABLE');
  assert.equal(f.controls['Familia de inventario'].value, null);
  assert.deepEqual(f.controls['Familia de inventario'].data, [{ value: 'bulk', label: 'Familia Z' }]);
  await f.change('Familia de inventario', 'bulk');
  await f.input('Nombre', 'Manguera Z');
  assert.equal(f.controls['Bodega propietaria'].value, 'own');
  assert.equal(f.controls['Ubicación inicial'].value, 'other');
  await f.change('Bodega propietaria', 'other');
  await f.change('Ubicación inicial', 'own');
  await f.change('Cantidad inicial', 4);
  await f.click('Crear implemento');
  const posts = f.calls.filter(call => call.method === 'POST');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].path, '/inventory/bulk-adjustments');
  assert.deepEqual(posts[0].json, { family: { id: 'bulk' }, sku: { name: 'Manguera Z', isImplement: true, isConsumable: false },
    ownerWarehouseId: 'other', warehouseId: 'own', quantity: 4 });
  assert.equal(f.created[0].skuId, 'quantity-implement');
  assert.equal(f.calls.some(call => call.path.includes('equipment-configurations')), false);
});

test('a principal on a worksite does not invent an initial warehouse or create inventory before one is selected', async () => {
  const f = await fixture({ initialOwnerWarehouseId: 'own', initialWarehouseId: null });
  assert.equal(f.controls['Bodega propietaria'].value, 'own');
  assert.equal(f.controls['Ubicación inicial'].value, null);
  await f.input('Nombre', 'Implemento en prueba');
  await f.change('Subfamilia', 'machines');
  await f.click('Crear implemento');
  assert.equal(f.calls.some(call => call.method === 'POST'), false);
  await f.change('Ubicación inicial', 'other');
  await f.click('Crear implemento');
  assert.equal(f.calls.find(call => call.method === 'POST').json.warehouseCurrentId, 'other');
});

test('unknown inherited warehouses stay unselected instead of borrowing an unrelated location', async () => {
  const f = await fixture({ initialOwnerWarehouseId: 'missing', initialWarehouseId: 'missing' });
  assert.equal(f.controls['Bodega propietaria'].value, null);
  assert.equal(f.controls['Ubicación inicial'].value, null);
});
