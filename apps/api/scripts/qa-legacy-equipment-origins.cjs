const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { actorEmail } = require('./commercial-qa-target.cjs');
const { LegacyEquipmentOriginsService } = require('../dist/src/documents/legacy-equipment-origins.service');
const { DocumentsService } = require('../dist/src/documents/documents.service');
const { InventoryService } = require('../dist/src/inventory/inventory.service');
const { CommercialProfilesService } = require('../dist/src/commercial-profiles/commercial-profiles.service');
const { locationKey } = require('../dist/src/accessories/accessory-rules');
const db = new PrismaClient();
(async () => {
  const rollback = new Error('QA_ROLLBACK');
  try {
    await db.$transaction(async tx => {
      const author = await tx.user.findUniqueOrThrow({ where: { email: actorEmail } });
      const own = await tx.warehouse.findFirstOrThrow({ where: { active: true, type: 'OWN' } });
      const site = await tx.customerWorksite.findFirstOrThrow();
      const sample = await tx.asset.findFirstOrThrow({ include: { sku: true } });
      const parent = await tx.asset.create({ data: { skuId: sample.skuId, publicCode: `QA-LEGACY-${randomUUID()}`,
        internalNumber: 999991, warehouseOwnerId: own.id, warehouseCurrentId: null } });
      const original = await tx.document.create({ data: { type: 'CUTOVER', status: 'CONFIRMED',
        docDate: new Date('2026-09-29T12:00Z'), createdBy: author.id } });
      const ledger = await tx.stockLedger.create({ data: { assetId: parent.id, ownerWarehouseId: own.id,
        customerWorksiteId: site.id, movementType: 'ON_SITE', quantity: 1,
        refDocumentId: original.id, refDocumentType: 'CUTOVER', effectiveAt: original.docDate, createdBy: author.id } });
      const historic = JSON.stringify({ original, ledger });
      const accessory = await tx.accessory.create({ data: { name: 'QA implemento sin familia quemada', kind: 'RETURNABLE',
        scope: 'FAMILY', familyId: sample.sku.assetFamilyId, ownerWarehouseId: own.id,
        creationRequestId: randomUUID(), creationFingerprint: 'QA', createdBy: author.id } });
      const balance = await tx.accessoryBalance.create({ data: { accessoryId: accessory.id, warehouseId: own.id,
        locationKey: locationKey({ warehouseId: own.id }), quantity: 3 } });
      await tx.equipmentConfiguration.create({ data: { assetId: parent.id, entries: {
        create: { role: 'ACCESSORY', accessoryId: accessory.id, quantity: 1, maximumQuantity: 3 },
      } } });
      const proxy = new Proxy(tx, { get: (target, key) => key === '$transaction' ? callback => callback(tx) : target[key] });
      const groupId = randomUUID();
      await new CommercialProfilesService(proxy).save({ scopeType: 'ASSET', scopeId: parent.id, expectedVersion: 0,
        effectiveFrom: '2026-10-01', groups: [{ id: groupId, name: 'Implementos', selectors: [{ kind: 'ACCESSORY', id: accessory.id }] }],
        modes: [{ id: randomUUID(), name: 'Uso por días', unit: 'DAY', minimum: { value: '0', basis: 'PER_RENTAL' },
          pricing: { source: 'FIXED', amount: '100' }, conditions: [], parts: [{ groupId, treatment: 'INCLUDED' }] }],
      }, author.id);
      const review = new LegacyEquipmentOriginsService(proxy);
      const inspection = await review.inspect(ledger.id, '2026-10-01');
      const input = { sourceLedgerId: ledger.id, fingerprint: inspection.fingerprint, effectiveFrom: '2026-10-01',
        note: 'QA: origen inicial exacto y ubicación comprobados individualmente.' };
      const origin = await review.review(input, author.id);
      assert.equal((await review.review(input, author.id)).id, origin.id);
      assert.equal(origin.commercialSnapshot.frozenProfile.version, 1);
      const oldChild = await tx.asset.create({ data: { skuId: sample.skuId, publicCode: `QA-LEGACY-CHILD-${randomUUID()}`,
        internalNumber: 999992, warehouseOwnerId: own.id, warehouseCurrentId: null } });
      const oldChildLedger = await tx.stockLedger.create({ data: { assetId: oldChild.id, ownerWarehouseId: own.id,
        customerWorksiteId: site.id, movementType: 'ON_SITE', quantity: 1, refDocumentId: original.id,
        refDocumentType: 'CUTOVER', effectiveAt: original.docDate, createdBy: author.id } });
      const parentConfig = await tx.equipmentConfiguration.findUniqueOrThrow({ where: { assetId: parent.id } });
      await tx.equipmentConfigurationEntry.create({ data: { configurationId: parentConfig.id, assetId: oldChild.id,
        role: 'ACCESSORY', quantity: 1 } });
      const childInspection = await review.inspect(oldChildLedger.id, '2026-10-01');
      const childOrigin = await review.review({ sourceLedgerId: oldChildLedger.id, effectiveFrom: '2026-10-01',
        fingerprint: childInspection.fingerprint, parentOriginId: origin.id,
        note: 'QA: relación padre e hijo confirmada explícitamente para este ensayo.' }, author.id);
      assert.equal(childOrigin.parentOriginId, origin.id);
      await assert.rejects(() => review.review({ sourceLedgerId: oldChildLedger.id, effectiveFrom: '2026-10-01',
        fingerprint: childInspection.fingerprint, note: 'Intento de quitar padre de un empalme guardado.' }, author.id), /padre del empalme/);
      const inventory = new InventoryService(proxy, { get: async () => undefined, set: async () => {}, del: async () => {} });
      const documents = new DocumentsService(proxy, inventory, { sendFinalIfNeeded: async () => {} },
        { sendDraft: async () => {} }, { refresh: async () => {} });
      const remission = await documents.createDirectDocument({ type: 'REMISSION', inventorySourceMode: 'WAREHOUSE', warehouseId: own.id,
        customerWorksiteId: site.id, recipientPhone: '3000000000', notes: 'Fecha documento: 2026-10-02', items: [{
          accessoryId: accessory.id, accessorySourceBalanceId: balance.id, ownerWarehouseId: own.id, quantity: 2,
          compositionNodeId: randomUUID(), parentLegacyOriginId: origin.id,
        }] }, author.id);
      const line = await tx.documentItem.findFirstOrThrow({ where: { documentId: remission.id } });
      assert.equal(line.parentLegacyOriginId, origin.id);
      assert.equal(line.componentParentAssetId, parent.id);
      const atWork = await tx.accessoryBalance.findFirstOrThrow({ where: { accessoryId: accessory.id, customerWorksiteId: site.id } });
      const returned = await documents.createDirectDocument({ type: 'RETURN', warehouseId: own.id,
        customerWorksiteId: site.id, recipientPhone: '3000000000', notes: 'Fecha documento: 2026-10-03', items: [{
          accessoryId: accessory.id, accessorySourceBalanceId: atWork.id, ownerWarehouseId: own.id, quantity: 1,
          sourceDocumentItemId: line.id, compositionNodeId: randomUUID(),
        }] }, author.id);
      assert.equal((await tx.documentItem.findFirstOrThrow({ where: { documentId: returned.id } })).parentLegacyOriginId, origin.id);
      assert.equal(await tx.documentItem.count({ where: { documentId: original.id } }), 0);
      assert.equal(JSON.stringify({ original: await tx.document.findUnique({ where: { id: original.id } }), ledger: await tx.stockLedger.findUnique({ where: { id: ledger.id } }) }), historic);
      await tx.stockLedger.create({ data: { assetId: parent.id, ownerWarehouseId: own.id, warehouseId: own.id,
        movementType: 'IN', quantity: 1, effectiveAt: new Date('2026-10-04T12:00Z'), createdBy: author.id } });
      assert(!(await review.active(site.id)).some(item => item.id === origin.id));
      await assert.rejects(() => review.inspect(ledger.id, '2026-10-01'), /ya no pertenece/);
      console.log('PASS legacy bridge: single review, immutable source, new remission to CUTOVER parent, partial return retains bridge, old origin retires after return. All QA data rolled back.');
      throw rollback;
    }, { timeout: 60000 });
  } catch (error) { if (error !== rollback) throw error; }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
