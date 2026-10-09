import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTransportModule } from './test-support.cjs';

const { groupRequestItems, removeRequestItem } = loadTransportModule('request-item-groups.ts');
const root = { selectionId: 'root', type: 'serial', assetId: 'machine', name: 'Equipo', sourceWarehouseId: 'physical-origin' };
const child = { selectionId: 'child', type: 'serial', assetId: 'motor', name: 'Motor', componentParentAssetId: 'machine' };
const tip = { selectionId: 'tip', type: 'accessory', accessoryId: 'tip-ref', accessorySourceBalanceId: 'balance', quantity: 2,
  availableQuantity: 5, componentParentAssetId: 'motor' };
const context = { docType: 'REMISSION', customerWorksiteId: 'site' };
const moduleWithApi = api => loadTransportModule('request-equipment-configuration.ts', { '@/lib/api': { api } });
const { addDocumentParts, availableForDocument, sameDocumentPart } = moduleWithApi(() => { throw Error('Unexpected I/O'); });

test('devolución reconoce piezas seleccionadas por pestañas bajo su padre documental original', async () => {
  const parent = { ...root, sourceDocumentItemId: 'shipment-root' };
  const { loadDocumentConfiguration } = moduleWithApi(async url => {
    if (url.startsWith('/accessories/document-options?')) return { items: [{
      accessoryId: 'tip-ref', sourceBalanceId: 'balance', name: 'Piezas', code: 'ACC-LONG-CODE', kind: 'RETURNABLE', quantity: 2,
      sourceDocumentItemId: 'shipment-child', parentSourceDocumentItemId: 'shipment-root',
    }], hasMore: false };
    if (url.startsWith('/inventory/on-site/')) return { serial: [], bulk: [] };
    if (url.includes('/return-parts?')) return [];
    if (url.includes('/return-origins?')) return [];
    throw Error(`Unexpected ${url}`);
  });
  const [option] = await loadDocumentConfiguration(parent, { ...context, docType: 'RETURN' });
  const fromTabs = { ...option.item, selectionId: 'selected-child' };
  assert.equal(option.item.name, 'Piezas');
  assert.equal(option.item.parentCompositionNodeId, undefined);
  assert.equal(option.item.parentSourceDocumentItemId, 'shipment-root');
  assert.equal(sameDocumentPart(fromTabs, option.item), true);
  assert.deepEqual(addDocumentParts([parent, fromTabs], parent, [option]), [parent, fromTabs]);
  assert.deepEqual(removeRequestItem([parent, fromTabs], 'selected-child'), [parent]);
  assert.equal(sameDocumentPart(fromTabs, { ...option.item, sourceDocumentItemId: 'another-lot' }), false);
});

test('agrupación conserva índices y lista plana sin mutar el documento', () => {
  const items = [tip, root, child];
  const groups = groupRequestItems(items);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].index, 1);
  assert.equal(groups[0].children[0].index, 2);
  assert.equal(groups[0].children[0].children[0].index, 0);
  assert.deepEqual(items, [tip, root, child]);
});

test('referencias huérfanas y ciclos nunca ocultan líneas históricas', () => {
  const orphan = { ...child, componentParentAssetId: 'missing' };
  assert.equal(groupRequestItems([orphan]).length, 1);
  const cycle = [{ ...root, componentParentAssetId: 'motor' }, child];
  assert.equal(groupRequestItems(cycle).length, 2);
});

test('quitar un padre quita sus descendientes; quitar hijo no elimina el equipo', () => {
  assert.deepEqual(removeRequestItem([root, child, tip], 'root'), []);
  assert.deepEqual(removeRequestItem([root, child, tip], 'child'), [root]);
  assert.deepEqual(removeRequestItem([root, child, tip], 'tip'), [root, child]);
});

test('agregar predeterminados es idempotente y respeta cantidades editadas', () => {
  const option = { key: 'tip', item: tip, quantity: 1 };
  const existing = [root, child, tip];
  assert.deepEqual(addDocumentParts(existing, child, [option]), existing);
  assert.deepEqual(addDocumentParts([root], child, [option]), [root]);
});

test('un mismo saldo se comparte entre padres sin superar existencias', () => {
  const elsewhere = { ...tip, componentParentAssetId: 'other', quantity: 4 };
  assert.equal(availableForDocument(tip, [elsewhere]), 1);
  assert.equal(sameDocumentPart(tip, elsewhere), false);
  assert.deepEqual(addDocumentParts([child, elsewhere], child, [{ item: tip, quantity: 2 }]), [child, elsewhere]);
});

test('una unidad serial no se duplica aunque se configure bajo otro equipo', () => {
  assert.equal(availableForDocument(child, [{ ...child, componentParentAssetId: 'another' }]), 0);
  assert.deepEqual(addDocumentParts([root, child], root, [{ item: child, quantity: 1 }]), [root, child]);
});

test('familia requerida ofrece unidades del origen de la fila, sin elegirlas automáticamente', async () => {
  const calls = [];
  const { loadDocumentConfiguration } = moduleWithApi(async url => {
    calls.push(url);
    if (url.startsWith('/equipment-configurations/')) return { entries: [{ id: 'family-rule', familyId: 'motors',
      family: { id: 'motors', name: 'Motores' }, role: 'COMPONENT', required: true, defaultIncluded: false, quantity: 1 }] };
    if (url === '/inventory/warehouse/physical-origin') return { serial: [
      { assetId: 'motor', skuName: 'Motor', assetFamily: { id: 'motors' }, ownerWarehouseId: 'provider', quantity: 1 },
      { assetId: 'unavailable', assetFamily: { id: 'motors' }, quantity: 0 },
      { assetId: 'wrong-family', assetFamily: { id: 'other' }, quantity: 1 },
    ], bulk: [] };
    throw Error(`Unexpected ${url}`);
  });
  const options = await loadDocumentConfiguration(root, context);
  assert.equal(options.length, 1);
  assert.equal(options[0].defaultIncluded, false);
  assert.equal(options[0].required, true);
  assert.equal(options[0].item.assetId, 'motor');
  assert.equal(options[0].item.componentParentAssetId, 'machine');
  assert.equal(options[0].item.sourceWarehouseId, 'physical-origin');
  assert.equal(options[0].item.ownerWarehouseId, 'provider');
  assert.equal(calls.length, 2);
});

test('devolución usa piezas históricas y saldo actual, no la configuración vigente', async () => {
  const calls = [];
  const { loadDocumentConfiguration } = moduleWithApi(async url => {
    calls.push(url);
    if (url.includes('/return-parts?')) return [{ assetId: 'motor', skuId: 'motor-sku' }, { assetId: 'already-returned' }];
    if (url.startsWith('/accessories/document-options?')) return { items: [], hasMore: false };
    if (url.startsWith('/inventory/on-site/')) return { serial: [
      { assetId: 'motor', skuName: 'Motor histórico', quantity: 1 },
      { assetId: 'unrelated', skuName: 'Ajeno', quantity: 1 },
      { assetId: 'already-returned', quantity: 0 },
    ], bulk: [] };
    throw Error(`Unexpected ${url}`);
  });
  const options = await loadDocumentConfiguration(root, { ...context, docType: 'RETURN' });
  assert.equal(options.length, 1);
  assert.equal(options[0].item.assetId, 'motor');
  assert.equal(options[0].item.sourceWarehouseId, undefined);
  assert.ok(options.every(option => !option.defaultIncluded && !option.required));
  assert.ok(calls.every(url => url !== '/equipment-configurations/assets/machine'));
});

test('saldo insuficiente no se inventa para cumplir un predeterminado', async () => {
  const { loadDocumentConfiguration } = moduleWithApi(async url => {
    if (url.startsWith('/equipment-configurations/')) return { entries: [{ id: 'rule', accessoryId: 'tip-ref',
      accessory: { name: 'Puntas' }, role: 'ACCESSORY', defaultIncluded: true, required: false, quantity: 3 }] };
    assert.match(url, /configuredOnly=true/);
    return { items: [{ accessoryId: 'tip-ref', sourceBalanceId: 'balance', name: 'Puntas', kind: 'CONSUMABLE', quantity: 2 }], hasMore: false };
  });
  const options = await loadDocumentConfiguration(root, context);
  assert.deepEqual(addDocumentParts([root], root, options), [root]);
});

test('una asignación histórica ya no agrega ni bloquea motores en una remisión', async () => {
  const { loadDocumentConfiguration } = moduleWithApi(async url => {
    assert.equal(url, '/equipment-configurations/assets/machine');
    return { entries: [], deliveryFuelSelectable: true, motor: { configuration: 'INTERCHANGEABLE', assignedMotorId: 'motor' } };
  });
  let selectable = false;
  const options = await loadDocumentConfiguration(root, { ...context, onDeliveryFuelSelectable: enabled => { selectable = enabled; } });
  assert.equal(selectable, true);
  assert.deepEqual(options, []);
  assert.deepEqual(addDocumentParts([root], root, options), [root]);
});
test('tablet consulta la elección sin cargar implementos privados', async () => {
  const { loadDocumentConfiguration } = moduleWithApi(async url => {
    assert.equal(url, '/equipment-configurations/assets/machine');
    return { entries: [{ accessoryId: 'private-catalog' }], deliveryFuelSelectable: true };
  });
  let selectable = false;
  const options = await loadDocumentConfiguration(root, { ...context, includeImplements: false, onDeliveryFuelSelectable: enabled => { selectable = enabled; } });
  assert.equal(selectable, true);
  assert.deepEqual(options, []);
});
