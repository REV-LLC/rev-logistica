import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { loadTransportModule } from './test-support.cjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const mounted = [];
afterEach(async () => { for (const root of mounted.splice(0)) await act(() => root.unmount()); });
const flush = (ms = 10) => act(() => new Promise(resolve => setTimeout(resolve, ms)));

async function mount(api, site = 'worksite') {
  const { useReturnAccessoryOptions } = loadTransportModule('use-return-accessory-options.ts', { '@/lib/api': { api } });
  let current;
  function Harness({ site }) { current = useReturnAccessoryOptions(site); return null; }
  const root = createRoot(document.createElement('div'));
  mounted.push(root);
  const update = site => act(() => root.render(React.createElement(Harness, { site })));
  await update(site);
  await flush();
  return { get current() { return current; }, update };
}

test('consulta todos los accesorios de obra sin exigir equipo; búsqueda reinicia paginación', async () => {
  const calls = [];
  const hook = await mount(async url => { calls.push(new URL(url, 'http://localhost')); return { items: [{ accessoryId: 'one' }], hasMore: true }; });
  assert.equal(calls[0].searchParams.get('type'), 'RETURN');
  assert.equal(calls[0].searchParams.get('customerWorksiteId'), 'worksite');
  assert.equal(calls[0].searchParams.has('assetId'), false);
  await act(() => hook.current.onPage(1)); await flush();
  assert.equal(calls.at(-1).searchParams.get('page'), '1');
  await act(() => hook.current.onSearch('manguera'));
  assert.equal(hook.current.loading, true); assert.deepEqual(hook.current.items, []);
  await flush(280);
  assert.equal(calls.at(-1).searchParams.get('page'), '0');
  assert.equal(calls.at(-1).searchParams.get('search'), 'manguera');
  assert.equal(hook.current.loading, false);
});

test('un fallo ofrece reintento y no se presenta como inventario vacío', async () => {
  let attempts = 0;
  const hook = await mount(async () => { if (!attempts++) throw new Error('Sin conexión'); return { items: [{ accessoryId: 'one' }], hasMore: false }; });
  assert.equal(hook.current.error, 'Sin conexión');
  await act(() => hook.current.retry()); await flush();
  assert.equal(hook.current.error, ''); assert.equal(hook.current.items.length, 1);
});

test('cambiar de obra cancela la consulta anterior e ignora su respuesta tardía', async () => {
  let resolveOld, oldSignal;
  const hook = await mount((url, { signal }) => {
    if (url.includes('customerWorksiteId=old')) { oldSignal = signal; return new Promise(resolve => { resolveOld = resolve; }); }
    return Promise.resolve({ items: [{ accessoryId: 'new' }], hasMore: false });
  }, 'old');
  await hook.update('new'); await flush();
  assert.equal(oldSignal.aborted, true);
  await act(() => resolveOld({ items: [{ accessoryId: 'old' }], hasMore: true }));
  assert.deepEqual(hook.current.items, [{ accessoryId: 'new' }]);
  assert.equal(hook.current.hasMore, false);
});
