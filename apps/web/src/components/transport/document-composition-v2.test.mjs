import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTransportModule } from './test-support.cjs';

const { buildRequestItems, restoreDocumentComposition } = loadTransportModule('request-items.ts');
const { buildDirectDocumentItems } = loadTransportModule('direct-document-items.ts');
const { groupRequestItems, removeRequestItem } = loadTransportModule('request-item-groups.ts');
const { inventoryWithReturnOrigins } = loadTransportModule('return-document-origins.ts');
const { addReturnAccessories, returnAccessoryKey } = loadTransportModule('return-accessory-selection.ts');
const { availableForDocument } = loadTransportModule('request-equipment-configuration.ts', { '@/lib/api': { api: () => { throw Error('No I/O'); } } });
const root = { selectionId: 'machine-node', type: 'serial', assetId: 'machine', name: 'Equipo', ownerWarehouseId: 'owner' };
const attachment = { selectionId: 'attachment-node', type: 'accessory', accessoryId: 'attachment',
  accessorySourceBalanceId: 'attachment-stock', name: 'Implemento', quantity: 1, ownerWarehouseId: 'owner',
  componentParentAssetId: 'machine', parentCompositionNodeId: 'machine-node' };
const tip = { ...attachment, selectionId: 'tip-node', accessoryId: 'tip', accessorySourceBalanceId: 'tip-stock',
  parentCompositionNodeId: 'attachment-node', quantity: 3, name: 'Puntas' };

test('payload y reapertura conservan el padre inmediato en tres niveles, sin convertirlo al equipo raíz', () => {
  const input = [root, attachment, tip];
  const payload = buildRequestItems(input);
  assert.equal(payload[2].compositionNodeId, 'tip-node');
  assert.equal(payload[2].parentCompositionNodeId, 'attachment-node');
  assert.equal(payload[2].componentParentAssetId, 'machine');
  const restored = payload.map((item, i) => ({ ...input[i], ...restoreDocumentComposition({ ...item, id: `row-${i}` }) }));
  assert.deepEqual(buildRequestItems(restored), payload);
  const groups = groupRequestItems([tip, root, attachment]);
  assert.equal(groups[0].children[0].children[0].item.selectionId, 'tip-node');
  assert.deepEqual(removeRequestItem(input, 'attachment-node'), [root]);
});

test('registro directo usa el mismo contrato de conjunto y de remisión de origen', () => {
  const returned = { ...tip, parentCompositionNodeId: undefined, sourceDocumentItemId: 'original-tip', parentSourceDocumentItemId: 'original-attachment' };
  const payload = buildDirectDocumentItems([root, attachment, returned]);
  assert.equal(payload[1].parentCompositionNodeId, 'machine-node');
  assert.equal(payload[2].sourceDocumentItemId, 'original-tip');
  assert.equal(payload[2].parentSourceDocumentItemId, 'original-attachment');
});

test('los ciclos explícitos y los padres externos no seleccionados no ocultan filas', () => {
  const a = { ...attachment, parentCompositionNodeId: 'tip-node' };
  assert.equal(groupRequestItems([a, tip]).length, 2);
  assert.equal(groupRequestItems([{ ...tip, parentCompositionNodeId: undefined, parentSourceDocumentItemId: 'elsewhere' }]).length, 1);
});

test('devolución masiva distingue lotes documentales del saldo histórico', () => {
  const stock = { serial: [], bulk: [{ skuId: 'sku', quantity: 9, ownerWarehouseId: 'owner' }] };
  const lots = [{ sourceDocumentItemId: 'first', skuId: 'sku', quantity: 3, ownerWarehouseId: 'owner', consecutive: 'RM1' },
    { sourceDocumentItemId: 'second', skuId: 'sku', quantity: 4, ownerWarehouseId: 'owner', consecutive: 'RM2' }];
  const result = inventoryWithReturnOrigins(stock, lots);
  assert.deepEqual(result.bulk.map(item => [item.sourceDocumentItemId, item.quantity]), [['first', 3], ['second', 4], [undefined, 2]]);
  assert.deepEqual(stock.bulk[0].quantity, 9);
  assert.throws(() => inventoryWithReturnOrigins({ ...stock, bulk: [{ ...stock.bulk[0], quantity: 6 }] }, lots), /conciliar/);
});

test('devolución serial no elige arbitrariamente entre dos orígenes pendientes', () => {
  const stock = { serial: [{ assetId: 'machine', quantity: 1 }], bulk: [] };
  const origin = { sourceDocumentItemId: 'source', assetId: 'machine', quantity: 1 };
  assert.equal(inventoryWithReturnOrigins(stock, [origin]).serial[0].sourceDocumentItemId, 'source');
  assert.throws(() => inventoryWithReturnOrigins(stock, [origin, { ...origin, sourceDocumentItemId: 'another' }]), /conciliar/);
});

test('un mismo saldo de accesorios admite devoluciones de dos remisiones, con claves y cupos separados', () => {
  const first = { accessoryId: 'tip', sourceBalanceId: 'stock', name: 'Puntas', kind: 'CONSUMABLE',
    quantity: 3, physicalQuantity: 7, parentAssetId: 'machine', ownerWarehouseId: 'owner',
    sourceDocumentItemId: 'source1', parentSourceDocumentItemId: 'parent1' };
  const second = { ...first, quantity: 4, sourceDocumentItemId: 'source2' };
  assert.notEqual(returnAccessoryKey(first), returnAccessoryKey(second));
  const selected = addReturnAccessories([], [first, second]);
  assert.equal(selected.length, 2);
  assert.equal(selected[1].parentSourceDocumentItemId, 'parent1');
  assert.equal(availableForDocument(selected[1], [{ ...selected[0], quantity: 3 }]), 4);
  assert.equal(availableForDocument({ ...selected[1], physicalAvailableQuantity: 5 }, [{ ...selected[0], quantity: 3 }]), 2);
  assert.equal(addReturnAccessories(selected, [first]).length, 2);
});
