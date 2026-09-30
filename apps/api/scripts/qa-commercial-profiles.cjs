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
          },
        });
        const makeAccessory = async (name) =>
          tx.accessory.create({
            data: {
              name,
              internalCode: `QA-${randomUUID()}`,
              kind: 'INDIVIDUAL',
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
        const nodeIds = [randomUUID(), randomUUID(), randomUUID()];
        const doc = await tx.document.create({
          data: {
            type: 'REMISSION',
            status: 'CONFIRMED',
            docDate: new Date('2026-10-01T12:00Z'),
            customerWorksiteId: site.id,
            warehouseId: sample.warehouseOwnerId,
            createdBy: author.id,
            items: {
              create: [
                { assetId: parent.id, compositionNodeId: nodeIds[0] },
                {
                  accessoryId: child.id,
                  accessoryName: child.name,
                  accessoryKind: child.kind,
                  accessorySourceBalanceId: randomUUID(),
                  quantity: 1,
                  compositionNodeId: nodeIds[1],
                  parentCompositionNodeId: nodeIds[0],
                  componentParentAssetId: parent.id,
                },
                {
                  accessoryId: grandchild.id,
                  accessoryName: grandchild.name,
                  accessoryKind: grandchild.kind,
                  accessorySourceBalanceId: randomUUID(),
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
        await tx.stockLedger.create({
          data: {
            id: randomUUID(),
            createdBy: author.id,
            assetId: parent.id,
            ownerWarehouseId: sample.warehouseOwnerId,
            customerWorksiteId: site.id,
            movementType: 'ON_SITE',
            quantity: 1,
            refDocumentId: doc.id,
            refDocumentType: 'REMISSION',
            effectiveAt: doc.docDate,
          },
        });
        for (const item of [childItem, grandchildItem])
          await tx.accessoryMovement.create({
            data: {
              accessoryId: item.accessoryId,
              requestId: `document:${doc.id}:item:${item.id}`,
              documentId: doc.id,
              fingerprint: 'QA',
              type: 'TRANSFER',
              quantity: 1,
              from: { warehouseId: sample.warehouseOwnerId },
              to: { assetId: parent.id, customerWorksiteId: site.id },
              note: 'QA',
              createdBy: author.id,
            },
          });
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
        console.log(
          'PASS v2 real DB: ASSET→ACCESSORY→ACCESSORY, 9 explicit lines including 6 zero rows, immutable tariff after edit, 409 stale revision, historical records untouched. All QA changes rolled back.',
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
