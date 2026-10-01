// Clone one real historical return inside a local transaction, then roll back.
// This checks stock approval, not the original driver's signature/submission UI.
const { PrismaClient } = require('@prisma/client');
const assert = require('node:assert/strict');
const { actorEmail } = require('./commercial-qa-target.cjs');
const { DocumentsService } = require('../dist/src/documents/documents.service');
const { InventoryService } = require('../dist/src/inventory/inventory.service');
const { inspectLegacyEquipmentOrigin } = require('../dist/src/documents/legacy-equipment-origin');
const { resolveLatestSerializedMovements } = require('../dist/src/inventory/serialized-ledger-location');
const { usesCommercialV2, commercialBusinessDate } = require('../dist/src/commercial-profiles/commercial-cutoff');
const index = process.argv.indexOf('--return');
const consecutive = index >= 0 ? process.argv[index + 1] : null;
assert(/^DV\d+$/.test(consecutive || ''), 'Usage: node scripts/qa-backdated-cutover-flow.cjs --return DV019508');
const db = new PrismaClient();
(async () => {
  const rollback = Error('QA_ROLLBACK');
  const original = await db.document.findUniqueOrThrow({ where: { consecutive }, include: { items: true } });
  assert.equal(original.type, 'RETURN');
  assert(!usesCommercialV2(original.docDate), 'Only pre-cutoff document dates are permitted');
  assert(original.customerWorksiteId && original.warehouseId, 'Original worksite and destination must be explicit');
  assert(original.items.length && original.items.every(i => i.assetId && !i.accessoryId && !i.skuId), 'This scenario requires only serialized equipment');
  const originalJson = JSON.stringify(original);
  const originalLedgerCount = await db.stockLedger.count();
  let cloneId;
  try {
    await db.$transaction(async tx => {
      const author = await tx.user.findUniqueOrThrow({ where: { email: actorEmail } });
      const proxy = new Proxy(tx, { get: (target, key) => key === '$transaction' ? cb => cb(tx) : target[key] });
      const cache = { get: async () => undefined, set: async () => {}, del: async () => {} };
      const inventory = new InventoryService(proxy, cache);
      const documents = new DocumentsService(proxy, inventory, { sendFinalIfNeeded: async () => {} }, { sendDraft: async () => {} }, { refresh: async () => {} });
      const sourceIds = [];
      for (const item of original.items) {
        const history = await tx.stockLedger.findMany({ where: { assetId: item.assetId, reversedByDocumentId: null } });
        const current = resolveLatestSerializedMovements(history).get(item.assetId)?.locationMovement;
        assert.equal(current?.customerWorksiteId, original.customerWorksiteId, 'Equipment must still belong to the documented worksite');
        await inspectLegacyEquipmentOrigin(tx, current.id, '2026-10-01');
        sourceIds.push(current.id);
      }
      const clone = await tx.document.create({ data: {
        type: 'RETURN', status: 'DRAFT', createdBy: author.id,
        docDate: original.docDate, customerWorksiteId: original.customerWorksiteId,
        warehouseId: original.warehouseId, inventorySourceMode: original.inventorySourceMode,
        notes: 'QA BACKDATED CUTOVER — TEMPORARY CLONE, ALWAYS ROLLED BACK',
        items: { create: original.items.map(i => ({
          assetId: i.assetId, quantity: i.quantity, condition: i.condition,
          conditionNote: i.conditionNote, componentParentAssetId: i.componentParentAssetId,
          requestedTag: i.requestedTag, sourceWarehouseId: i.sourceWarehouseId,
        })) },
      } });
      cloneId = clone.id;
      const approved = await documents.approveRequestDocument(clone.id, author.id);
      assert.equal(approved.status, 'CONFIRMED');
      const moved = await tx.stockLedger.findMany({ where: { refDocumentId: clone.id } });
      assert(moved.length, 'A physical movement must exist');
      for (const row of moved) assert.equal(row.effectiveAt.toISOString(), original.docDate.toISOString(), 'Do not replace effective date with approval time');
      const saved = await tx.document.findUniqueOrThrow({ where: { id: clone.id }, include: { items: true } });
      for (const item of saved.items) {
        assert.equal(item.billingCutoffDate.toISOString(), original.docDate.toISOString());
        assert.equal(item.billingStatus, 'CUT');
        assert.equal(item.compositionNodeId, null);
        assert.equal(item.commercialSnapshot, null);
      }
      for (const sourceId of sourceIds) await assert.rejects(inspectLegacyEquipmentOrigin(tx, sourceId, '2026-10-01'), /ya no pertenece/);
      assert.equal(JSON.stringify(await tx.document.findUniqueOrThrow({ where: { id: original.id }, include: { items: true } })), originalJson);
      console.log(`PASS ${consecutive}: approval of local clone preserves ${commercialBusinessDate(original.docDate)} for physical movements and billing; legacy source retires; original document remains untouched.`);
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal(await db.document.findUnique({ where: { id: cloneId } }), null);
  assert.equal(await db.stockLedger.count(), originalLedgerCount);
  assert.equal(JSON.stringify(await db.document.findUniqueOrThrow({ where: { id: original.id }, include: { items: true } })), originalJson);
  console.log('PASS rollback: no clone, stock movement or source-document change persisted.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
