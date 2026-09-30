// Real Prisma round-trip on an explicitly isolated local target. Always roll back.
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const {
  CommercialProfilesService,
} = require('../dist/src/commercial-profiles/commercial-profiles.service');
const {
  documentCommercialSnapshots,
} = require('../dist/src/commercial-profiles/commercial-history');
const {
  AnnexSourceService,
} = require('../dist/src/annexes/annex-source.service');
const { DocumentsService } = require('../dist/src/documents/documents.service');
const { InventoryService } = require('../dist/src/inventory/inventory.service');
const { locationKey } = require('../dist/src/accessories/accessory-rules');
const { calculateAnnex } = require('../dist/src/annexes/annex-engine');
const { actorEmail } = require('./commercial-qa-target.cjs');
const db = new PrismaClient();
(async () => {
  const rollback = Error('ROLLBACK');
  try {
    await db.$transaction(
      async (tx) => {
        const author = await tx.user.findUniqueOrThrow({
          where: { email: actorEmail },
        });
        const sample = await tx.asset.findFirstOrThrow({
          include: { sku: true },
        });
        const site = await tx.customerWorksite.findFirstOrThrow();
        const warehouse = await tx.warehouse.findFirstOrThrow({
          where: { type: 'OWN', active: true },
        });
        sample.warehouseOwnerId = warehouse.id;
        const sku = await tx.sku.create({
          data: {
            name: `QA GENERIC ${randomUUID()}`,
            assetFamilyId: sample.sku.assetFamilyId,
            price: 100,
            chargeType: 'DAY',
          },
        });
        const parent = await tx.asset.create({
          data: {
            skuId: sku.id,
            publicCode: `QA-${randomUUID()}`,
            internalNumber: 999991,
            warehouseOwnerId: sample.warehouseOwnerId,
            warehouseCurrentId: sample.warehouseOwnerId,
          },
        });
        const makeAccessory = async (name, kind = 'INDIVIDUAL') =>
          tx.accessory.create({
            data: {
              name,
              internalCode: kind === 'INDIVIDUAL' ? `QA-${randomUUID()}` : null,
              kind,
              scope: 'FAMILY',
              familyId: sku.assetFamilyId,
              ownerWarehouseId: sample.warehouseOwnerId,
              creationRequestId: randomUUID(),
              creationFingerprint: 'QA',
              createdBy: author.id,
            },
          });
        const child = await makeAccessory('QA pieza arbitraria');
        const grandchild = await makeAccessory('QA accesorio de accesorio');
        const later = await makeAccessory(
          'QA piezas posteriores',
          'RETURNABLE',
        );
        const proxy = new Proxy(tx, {
          get: (target, key) =>
            key === '$transaction' ? (cb) => cb(tx) : target[key],
        });
        const profiles = new CommercialProfilesService(proxy);
        const groupId = randomUUID(),
          modeId = randomUUID();
        const makeMode = (group, selector) => ({
          groups: [
            {
              id: group,
              name: 'Grupo genérico',
              selectors: [{ kind: 'ACCESSORY', id: selector }],
            },
          ],
          modes: [
            {
              id: randomUUID(),
              name: 'Tarifa del conjunto',
              unit: 'DAY',
              minimum: { value: '0', basis: 'PER_RENTAL' },
              pricing: { source: 'FIXED', amount: '100' },
              conditions: [],
              parts: [{ groupId: group, treatment: 'INCLUDED' }],
            },
          ],
        });
        const config = makeMode(groupId, child.id);
        const dto = {
          scopeType: 'ASSET',
          scopeId: parent.id,
          expectedVersion: 0,
          effectiveFrom: '2026-10-01',
          ...config,
        };
        const saved = await profiles.save(dto, author.id);
        await assert.rejects(() => profiles.save(dto, author.id), /cambiaron/);
        const childConfig = makeMode(randomUUID(), grandchild.id);
        childConfig.groups[0].selectors.push({
          kind: 'ACCESSORY',
          id: later.id,
        });
        await profiles.save(
          {
            scopeType: 'ACCESSORY',
            scopeId: child.id,
            expectedVersion: 0,
            effectiveFrom: '2026-10-01',
            ...childConfig,
          },
          author.id,
        );
        await tx.accessory.update({
          where: { id: grandchild.id },
          data: { scope: 'ACCESSORIES' },
        });
        await tx.accessoryParent.create({
          data: { accessoryId: grandchild.id, parentAccessoryId: child.id },
        });
        await tx.equipmentConfiguration.create({
          data: {
            assetId: parent.id,
            entries: {
              create: { role: 'ACCESSORY', accessoryId: child.id, quantity: 1 },
            },
          },
        });
        await tx.equipmentConfiguration.create({
          data: {
            accessoryId: child.id,
            entries: {
              create: {
                role: 'ACCESSORY',
                accessoryId: grandchild.id,
                quantity: 1,
              },
            },
          },
        });
        const balances = new Map();
        for (const accessory of [child, grandchild])
          balances.set(
            accessory.id,
            await tx.accessoryBalance.create({
              data: {
                accessoryId: accessory.id,
                warehouseId: warehouse.id,
                locationKey: locationKey({ warehouseId: warehouse.id }),
                quantity: 1,
              },
            }),
          );
        await tx.stockLedger.create({
          data: {
            id: randomUUID(),
            assetId: parent.id,
            warehouseId: warehouse.id,
            ownerWarehouseId: warehouse.id,
            movementType: 'IN',
            quantity: 1,
            effectiveAt: new Date('2026-09-30T12:00Z'),
            createdBy: author.id,
          },
        });
        const cache = {
          get: async () => undefined,
          set: async () => {},
          del: async () => {},
        };
        const inventory = new InventoryService(proxy, cache);
        const documentsService = new DocumentsService(
          proxy,
          inventory,
          { sendFinalIfNeeded: async () => {} },
          { sendDraft: async () => {} },
          { refresh: async () => {} },
        );
        await tx.accessory.update({
          where: { id: later.id },
          data: { scope: 'ACCESSORIES' },
        });
        await tx.accessoryParent.create({
          data: { accessoryId: later.id, parentAccessoryId: child.id },
        });
        const laterBalance = await tx.accessoryBalance.create({
          data: {
            accessoryId: later.id,
            warehouseId: warehouse.id,
            locationKey: locationKey({ warehouseId: warehouse.id }),
            quantity: 4,
          },
        });
        const childRecipe = await tx.equipmentConfiguration.findUniqueOrThrow({
          where: { accessoryId: child.id },
        });
        await tx.equipmentConfigurationEntry.create({
          data: {
            configurationId: childRecipe.id,
            role: 'ACCESSORY',
            accessoryId: later.id,
            quantity: 4,
            maximumQuantity: 4,
          },
        });
        const nodeIds = [randomUUID(), randomUUID(), randomUUID()];
        const doc = await tx.document.create({
          data: {
            type: 'REMISSION',
            status: 'DRAFT',
            inventorySourceMode: 'WAREHOUSE',
            docDate: new Date('2026-10-01T12:00Z'),
            customerWorksiteId: site.id,
            warehouseId: sample.warehouseOwnerId,
            createdBy: author.id,
            items: {
              create: [
                {
                  assetId: parent.id,
                  condition: warehouse.id,
                  quantity: 1,
                  compositionNodeId: nodeIds[0],
                },
                {
                  accessoryId: child.id,
                  accessoryName: child.name,
                  accessoryKind: child.kind,
                  accessorySourceBalanceId: balances.get(child.id).id,
                  condition: warehouse.id,
                  quantity: 1,
                  compositionNodeId: nodeIds[1],
                  parentCompositionNodeId: nodeIds[0],
                  componentParentAssetId: parent.id,
                },
                {
                  accessoryId: grandchild.id,
                  accessoryName: grandchild.name,
                  accessoryKind: grandchild.kind,
                  accessorySourceBalanceId: balances.get(grandchild.id).id,
                  condition: warehouse.id,
                  quantity: 1,
                  compositionNodeId: nodeIds[2],
                  parentCompositionNodeId: nodeIds[1],
                  componentParentAssetId: parent.id,
                },
              ],
            },
          },
          include: { items: true },
        });
        const parentItem = doc.items.find((i) => i.assetId),
          childItem = doc.items.find((i) => i.accessoryId === child.id),
          grandchildItem = doc.items.find(
            (i) => i.accessoryId === grandchild.id,
          );
        await documentsService.approveLoadedRequestDocument(doc, author.id);
        const snapshots = await documentCommercialSnapshots(tx, doc.id, true);
        assert.equal(snapshots.get(parentItem.id).basePrice, '100');
        assert.equal(snapshots.get(childItem.id).basePrice, '0.00');
        assert.equal(snapshots.get(grandchildItem.id).basePrice, '0.00');
        await profiles.save(
          {
            ...dto,
            expectedVersion: saved.version,
            modes: [
              { ...dto.modes[0], pricing: { source: 'FIXED', amount: '9000' } },
            ],
          },
          author.id,
        );
        assert.equal(
          (await documentCommercialSnapshots(tx, doc.id)).get(parentItem.id)
            .basePrice,
          '100',
        );
        const prepared = await new AnnexSourceService(proxy).prepare(
          site.id,
          '2026-10-01',
          '2026-10-15',
          '2026-10-03',
        );
        const rentals = prepared.input.rentals.filter(
          (r) =>
            r.assetId === parent.id ||
            [child.id, grandchild.id].includes(r.accessoryId),
        );
        assert.equal(rentals.length, 3);
        const result = calculateAnnex({
          ...prepared.input,
          rentals,
          machineDays: [],
        });
        assert.equal(result.lines.length, 9);
        assert.equal(result.totals.rentalNet, '300.00');
        assert.equal(
          result.lines.filter((l) => l.basePrice === '0.00').length,
          6,
        );
        const old = await tx.document.findFirst({
          where: {
            type: 'REMISSION',
            docDate: { lt: new Date('2026-10-01T05:00Z') },
          },
          include: { items: true },
        });
        if (old) {
          const before = JSON.stringify(
            old.items.map((i) => i.commercialSnapshot),
          );
          await documentCommercialSnapshots(tx, old.id, true);
          const after = await tx.documentItem.findMany({
            where: { documentId: old.id },
            orderBy: { id: 'asc' },
          });
          assert.equal(
            JSON.stringify(after.map((i) => [i.id, i.commercialSnapshot])),
            JSON.stringify(
              [...old.items]
                .sort((a, b) => a.id.localeCompare(b.id))
                .map((i) => [i.id, i.commercialSnapshot]),
            ),
          );
        }
        const lateDoc = await tx.document.create({
          data: {
            type: 'REMISSION',
            status: 'DRAFT',
            inventorySourceMode: 'WAREHOUSE',
            docDate: new Date('2026-10-04T12:00Z'),
            customerWorksiteId: site.id,
            warehouseId: warehouse.id,
            createdBy: author.id,
            items: {
              create: {
                accessoryId: later.id,
                accessoryName: later.name,
                accessoryKind: later.kind,
                accessorySourceBalanceId: laterBalance.id,
                condition: warehouse.id,
                quantity: 4,
                compositionNodeId: randomUUID(),
                parentSourceDocumentItemId: childItem.id,
                componentParentAssetId: parent.id,
              },
            },
          },
          include: { items: true },
        });
        await documentsService.approveLoadedRequestDocument(lateDoc, author.id);
        const onSite = await tx.accessoryBalance.findFirstOrThrow({
          where: {
            accessoryId: later.id,
            assetId: parent.id,
            customerWorksiteId: site.id,
          },
        });
        const returnPayload = (quantity) => ({
          type: 'RETURN',
          status: 'DRAFT',
          docDate: new Date('2026-10-05T12:00Z'),
          customerWorksiteId: site.id,
          warehouseId: warehouse.id,
          createdBy: author.id,
          items: {
            create: {
              accessoryId: later.id,
              accessoryName: later.name,
              accessoryKind: later.kind,
              accessorySourceBalanceId: onSite.id,
              condition: warehouse.id,
              quantity,
              compositionNodeId: randomUUID(),
              sourceDocumentItemId: lateDoc.items[0].id,
              parentSourceDocumentItemId: childItem.id,
              componentParentAssetId: parent.id,
            },
          },
        });
        const partial = await tx.document.create({ data: returnPayload(2) });
        await documentsService.approveLoadedRequestDocument(partial, author.id);
        const over = await tx.document.create({ data: returnPayload(3) });
        await assert.rejects(
          () => documentsService.approveLoadedRequestDocument(over, author.id),
          /supera/,
        );
        const withReturn = await new AnnexSourceService(proxy).prepare(
          site.id,
          '2026-10-01',
          '2026-10-15',
          '2026-10-06',
        );
        const newRentals = withReturn.input.rentals.filter(
          (r) =>
            r.assetId === parent.id ||
            [child.id, grandchild.id, later.id].includes(r.accessoryId),
        );
        const newResult = calculateAnnex({
          ...withReturn.input,
          rentals: newRentals,
          machineDays: [],
        });
        assert.equal(newResult.totals.rentalNet, '600.00');
        const laterRows = newResult.lines.filter((l) => l.label === later.name);
        assert.deepEqual(
          laterRows.map((l) => l.quantity),
          ['4', '4', '2'],
        );
        assert(laterRows.every((l) => l.net === '0.00'));
        console.log(
          'PASS v2 DOCUMENT APPROVAL real DB: ASSET→ACCESSORY→ACCESSORY, 9 explicit lines including 6 zero rows, immutable tariff after edit, 409 stale revision, historical records untouched; later delivery to accessory parent, partial return4→2, excessive return rejected. All QA changes rolled back.',
        );
        throw rollback;
      },
      { timeout: 60000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
})()
  .finally(() => db.$disconnect())
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
