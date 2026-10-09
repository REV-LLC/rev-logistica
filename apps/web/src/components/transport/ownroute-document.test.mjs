import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { loadTransportModule } from './test-support.cjs';

const { documentTemplateRouteStatus } = loadTransportModule('request-equipment-configuration.ts', {
  '@/lib/api': { api: () => { throw Error('The diagnostic must not perform I/O'); } },
});
const root = { selectionId: 'root', type: 'serial', assetId: 'machine', name: 'Equipo X', sourceWarehouseId: 'origin' };
const hose = { selectionId: 'hose', type: 'bulk', skuId: 'hose-sku', bulkKey: 'hose-stock', quantity: 1, name: 'Unidad Y', parentCompositionNodeId: 'root' };
const tool = { selectionId: 'tool', type: 'serial', assetId: 'tool-asset', name: 'Unidad Z', parentCompositionNodeId: 'root' };
const tip = { selectionId: 'tip', type: 'bulk', skuId: 'tip-sku', bulkKey: 'tip-stock', quantity: 1, name: 'Unidad W', parentCompositionNodeId: 'tool' };
const familyOption = (familyId, familyName, item, templateParentFamilyId = null) => ({
  key: familyId, name: item?.name ?? familyName, role: 'ACCESSORY', defaultIncluded: false, required: false,
  quantity: 20, templateFamilyId: familyId, templateFamilyName: familyName, templateParentFamilyId, item,
});
const route = [familyOption('family-y', 'Familia Y', hose), familyOption('family-z', 'Familia Z', tool, 'family-y'),
  familyOption('family-w', 'Familia W', tip, 'family-z')];

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const mounted = [];
afterEach(async () => { for (const renderer of mounted.splice(0)) await act(() => renderer.unmount()); });

test('familias arbitrarias definen ruta completa sin usar nombres de negocio ni cantidades', () => {
  const status = documentTemplateRouteStatus(root, route, [root, hose, tool, tip]);
  assert.deepEqual(status, { status: 'COMPLETE', complete: true, present: 3, total: 3, missingFamilyNames: [], unknownItemCount: 0 });
  // Family arrows never reparent the bulk hose, tool or document lines.
  assert.equal(tool.parentCompositionNodeId, 'root');
  assert.equal(tip.parentCompositionNodeId, 'tool');
});

test('ruta parcial enumera familias faltantes una vez, sin exigir cantidad recomendada', () => {
  const options = [...route, familyOption('family-y', 'Familia Y', { ...hose, skuId: 'another-hose-sku' })];
  const status = documentTemplateRouteStatus(root, options, [root, hose, { ...hose, selectionId: 'hose-2' }]);
  assert.equal(status.status, 'PARTIAL');
  assert.equal(status.present, 1);
  assert.equal(status.total, 3);
  assert.deepEqual(status.missingFamilyNames, ['Familia Z', 'Familia W']);
});

test('unidades bajo otro equipo o sin vínculo no completan la ruta', () => {
  const other = { ...root, selectionId: 'other', assetId: 'other-machine' };
  const elsewhere = [root, other, { ...hose, parentCompositionNodeId: 'other' },
    { ...tool, parentCompositionNodeId: 'other' }, { ...tip, parentCompositionNodeId: undefined }];
  const status = documentTemplateRouteStatus(root, route, elsewhere);
  assert.equal(status.status, 'PARTIAL');
  assert.equal(status.present, 0);
  assert.equal(status.unknownItemCount, 0);
});

test('ascendencia legacy funciona, pero un vínculo de línea explícito nunca cae a otro padre', () => {
  const legacyTool = { ...tool, parentCompositionNodeId: undefined, componentParentAssetId: root.assetId };
  const legacyTip = { ...tip, parentCompositionNodeId: undefined, componentParentAssetId: tool.assetId };
  assert.equal(documentTemplateRouteStatus(root, route, [root, hose, legacyTool, legacyTip]).complete, true);
  const dangling = { ...tool, parentCompositionNodeId: 'missing', componentParentAssetId: root.assetId };
  assert.equal(documentTemplateRouteStatus(root, route, [root, hose, dangling]).present, 1);
});

test('ciclos documentales, rutas cíclicas y referencias huérfanas no causan bucles ni mutaciones', () => {
  const items = [root, { ...tool, parentCompositionNodeId: 'tip' }, { ...tip, parentCompositionNodeId: 'tool' }];
  const options = route.map(option => ({ ...option, templateParentFamilyId: option.templateFamilyId }));
  const snapshot = JSON.stringify({ items, options });
  const status = documentTemplateRouteStatus(root, options, items);
  assert.equal(status.present, 0);
  assert.equal(status.status, 'PARTIAL');
  assert.equal(JSON.stringify({ items, options }), snapshot);
});

test('sin plantilla no hay diagnóstico; cantidad cero y equipo ausente no cuentan', () => {
  assert.equal(documentTemplateRouteStatus(root, [{ item: hose }], [root, hose]), null);
  assert.equal(documentTemplateRouteStatus(root, route, [root, { ...hose, quantity: 0 }]).present, 0);
  assert.equal(documentTemplateRouteStatus(root, route, [hose, tool, tip]).present, 0);
});

test('cantidades no finitas no confirman familias ni crean diagnósticos de familia desconocida', () => {
  for (const quantity of [NaN, Infinity, -Infinity]) {
    const status = documentTemplateRouteStatus(root, route, [root, { ...hose, quantity },
      { selectionId: 'unknown', type: 'bulk', skuId: 'unknown-sku', name: 'Desconocido', parentCompositionNodeId: 'root', quantity }]);
    assert.equal(status.status, 'PARTIAL');
    assert.equal(status.present, 0);
    assert.equal(status.unknownItemCount, 0);
  }
});

test('familia desconocida vinculada requiere verificación y nunca se infiere por el nombre', () => {
  const unknown = { selectionId: 'custom', type: 'serial', assetId: 'old-asset', name: 'Familia W', parentCompositionNodeId: root.selectionId };
  const status = documentTemplateRouteStatus(root, route, [root, hose, tool, unknown]);
  assert.equal(status.status, 'UNVERIFIED');
  assert.equal(status.present, 2);
  assert.equal(status.unknownItemCount, 1);
  assert.deepEqual(status.missingFamilyNames, ['Familia W']);
  // Once every required family is known to be covered, extra unknown lines do not undo completeness.
  assert.equal(documentTemplateRouteStatus(root, route, [root, hose, tool, tip, unknown]).status, 'COMPLETE');
  assert.equal(documentTemplateRouteStatus(root, route, [root, hose, { ...unknown, parentCompositionNodeId: 'another-equipment' }]).status, 'PARTIAL');
});

test('unidad conocida de otra familia no cuenta como desconocida ni completa familias faltantes', () => {
  const extra = { selectionId: 'extra', type: 'serial', assetId: 'extra-asset', name: 'Extra', parentCompositionNodeId: 'root' };
  const options = [...route, { key: 'extra', item: extra, itemFamilyId: 'unrelated-family' }];
  const status = documentTemplateRouteStatus(root, options, [root, hose, extra]);
  assert.equal(status.status, 'PARTIAL');
  assert.equal(status.unknownItemCount, 0);
  assert.equal(status.present, 1);
});

test('cargar opciones conserva topología aun sin stock y propone una unidad sin elegirla', async () => {
  const { loadDocumentConfiguration } = loadTransportModule('request-equipment-configuration.ts', {
    '@/lib/api': { api: async url => {
      if (url === '/equipment-configurations/assets/machine') return { entries: [
        { id: 'hose-route', familyId: 'family-y', family: { name: 'Familia Y' }, recommendation: true, role: 'ACCESSORY', quantity: 50, required: false },
        { id: 'tip-route', familyId: 'family-w', family: { name: 'Familia W' }, templateParentFamilyId: 'family-y', recommendation: true, role: 'ACCESSORY', quantity: 99, required: false },
      ] };
      assert.equal(url, '/inventory/warehouse/origin');
      return { serial: [], bulk: [{ skuId: 'hose-sku', assetFamilyId: 'family-y', skuName: 'Unidad Y', quantity: 1 }] };
    } },
  });
  const selected = [root];
  const options = await loadDocumentConfiguration(root, { docType: 'REMISSION', customerWorksiteId: 'site' });
  assert.equal(options[0].templateFamilyId, 'family-y');
  assert.equal(options[0].quantity, 1);
  assert.equal(options[0].defaultIncluded, false);
  assert.equal(options[1].templateParentFamilyId, 'family-y');
  assert.equal(options[1].templateFamilyName, 'Familia W');
  assert.equal(options[1].item, undefined);
  assert.equal(documentTemplateRouteStatus(root, options, selected).total, 2);
  assert.deepEqual(selected, [root]);
});

test('badge reacciona a las líneas actuales sin mutarlas y no aparece en devoluciones', async () => {
  const elements = Object.fromEntries(['Alert', 'Badge', 'Button', 'Checkbox', 'Group', 'Loader', 'Stack', 'Text']
    .map(name => [name, ({ children, label, title }) => React.createElement('div', { title }, label, children)]));
  const { default: Configurator } = loadTransportModule('RequestEquipmentConfiguration.tsx', {
    '@mantine/core': elements,
    './request-equipment-configuration': {
      documentTemplateRouteStatus,
      loadDocumentConfiguration: async () => route,
      sameDocumentPart: () => false,
      availableForDocument: () => 100,
      addDocumentParts: () => { throw Error('Diagnostic must not add units'); },
    },
  });
  const container = document.createElement('div');
  const renderer = createRoot(container);
  mounted.push(renderer);
  const base = { parent: root, customerWorksiteId: 'site', setSelectedItems: () => { throw Error('Diagnostic must not change selection'); } };
  const render = async (selectedItems, docType = 'REMISSION') => {
    await act(async () => renderer.render(React.createElement(Configurator, { ...base, docType, selectedItems })));
  };
  await render([root, hose]);
  assert.match(container.textContent, /Ruta parcial 1\/3/);
  await render([root, hose, tool, tip]);
  assert.match(container.textContent, /Ruta completa/);
  await render([root, hose, { selectionId: 'unknown', type: 'serial', assetId: 'custom', name: 'Desconocido', parentCompositionNodeId: 'root' }]);
  assert.match(container.textContent, /Ruta por verificar/);
  await render([root, hose], 'RETURN');
  assert.doesNotMatch(container.textContent, /Ruta (completa|parcial|por verificar)/);
});
