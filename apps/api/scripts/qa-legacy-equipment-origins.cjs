const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { actorEmail } = require('./commercial-qa-target.cjs');
const {
  LegacyEquipmentOriginsService,
} = require('../dist/src/documents/legacy-equipment-origins.service');
const { DocumentsService } = require('../dist/src/documents/documents.service');
const { InventoryService } = require('../dist/src/inventory/inventory.service');
const {
  CommercialProfilesService,
} = require('../dist/src/commercial-profiles/commercial-profiles.service');
const {
  AnnexSourceService,
} = require('../dist/src/annexes/annex-source.service');
const { locationKey } = require('../dist/src/accessories/accessory-rules');
const db = new PrismaClient();
// Explicit opt-in leaves a fictional, isolated example for the user's browser QA.
// Normal invocations always roll back every fixture.
const persistDemo = process.argv.includes('--persist-demo');
const demoCode = 'QA-LEGACY-DAY-METER-20261001';
(async () => {
  if (persistDemo) {
    assert.equal(
      new URL(process.env.DATABASE_URL).pathname,
      '/equipment_commercial_qa_20260930',
    );
    const existing = await db.worksite.findUnique({
      where: { externalCode: demoCode },
      include: { customerWorksites: true },
    });
    if (existing) {
      console.log(
        JSON.stringify({
          demoAlreadyExists: true,
          ...existing.customerWorksites[0],
        }),
      );
      return;
    }
  }
  const rollback = new Error('QA_ROLLBACK');
  try {
    await db.$transaction(
      async (tx) => {
        const author = await tx.user.findUniqueOrThrow({
          where: { email: actorEmail },
        });
        const own = await tx.warehouse.findFirstOrThrow({
          where: { active: true, type: 'OWN' },
        });
        let site = await tx.customerWorksite.findFirstOrThrow();
        let sample = await tx.asset.findFirstOrThrow({
          include: { sku: true },
        });
        if (persistDemo) {
          const customer = await tx.customer.create({
            data: { name: 'QA CONJUNTOS OCTUBRE — NO FACTURAR' },
          });
          const worksite = await tx.worksite.create({
            data: {
              name: 'QA DOS TRAMOS — DÍAS Y METROS',
              externalCode: demoCode,
            },
          });
          site = await tx.customerWorksite.create({
            data: { customerId: customer.id, worksiteId: worksite.id },
          });
          const family = await tx.assetFamily.create({
            data: {
              code: demoCode,
              name: 'QA EQUIPO GENÉRICO DE TRABAJO',
              controlType: 'SERIAL',
            },
          });
          const sku = await tx.sku.create({
            data: {
              name: 'QA EQUIPO DEMO — SIN / CON IMPLEMENTO',
              assetFamilyId: family.id,
              price: 100,
              chargeType: 'DAY',
            },
          });
          sample = { ...sample, skuId: sku.id, sku };
        }
        const parent = await tx.asset.create({
          data: {
            skuId: sample.skuId,
            publicCode: `QA-LEGACY-${randomUUID()}`,
            internalNumber: 999991,
            warehouseOwnerId: own.id,
            warehouseCurrentId: null,
          },
        });
        const original = await tx.document.create({
          data: {
            type: 'CUTOVER',
            status: 'CONFIRMED',
            docDate: new Date('2026-09-29T12:00Z'),
            createdBy: author.id,
          },
        });
        const ledger = await tx.stockLedger.create({
          data: {
            assetId: parent.id,
            ownerWarehouseId: own.id,
            customerWorksiteId: site.id,
            movementType: 'ON_SITE',
            quantity: 1,
            refDocumentId: original.id,
            refDocumentType: 'CUTOVER',
            effectiveAt: original.docDate,
            createdBy: author.id,
          },
        });
        const historic = JSON.stringify({ original, ledger });
        const accessory = await tx.accessory.create({
          data: {
            name: 'QA implemento sin familia quemada',
            kind: 'RETURNABLE',
            scope: 'FAMILY',
            familyId: sample.sku.assetFamilyId,
            ownerWarehouseId: own.id,
            creationRequestId: randomUUID(),
            creationFingerprint: 'QA',
            createdBy: author.id,
          },
        });
        const balance = await tx.accessoryBalance.create({
          data: {
            accessoryId: accessory.id,
            warehouseId: own.id,
            locationKey: locationKey({ warehouseId: own.id }),
            quantity: 3,
          },
        });
        await tx.equipmentConfiguration.create({
          data: {
            assetId: parent.id,
            entries: {
              create: {
                role: 'ACCESSORY',
                accessoryId: accessory.id,
                quantity: 1,
                maximumQuantity: 3,
              },
            },
          },
        });
        const proxy = new Proxy(tx, {
          get: (target, key) =>
            key === '$transaction' ? (callback) => callback(tx) : target[key],
        });
        const groupId = randomUUID();
        const historicalGroupId = randomUUID();
        await new CommercialProfilesService(proxy).save(
          {
            scopeType: 'ASSET',
            scopeId: parent.id,
            expectedVersion: 0,
            effectiveFrom: '2026-10-01',
            groups: [
              {
                id: groupId,
                name: 'Implementos',
                selectors: [{ kind: 'ACCESSORY', id: accessory.id }],
              },
              {
                id: historicalGroupId,
                name: 'Pieza histórica identificada',
                selectors: [{ kind: 'FAMILY', id: sample.sku.assetFamilyId }],
              },
            ],
            modes: ['DAY', 'METER'].map((unit, index) => ({
              id: randomUUID(),
              name: index ? 'Con implemento' : 'Sin implemento',
              unit,
              minimum: { value: '0', basis: 'PER_RENTAL' },
              pricing: { source: 'FIXED', amount: index ? '10' : '100' },
              conditions: [
                {
                  groupId,
                  presence: index ? 'PRESENT' : 'ABSENT',
                  minimumQuantity: 1,
                },
              ],
              parts: [
                { groupId, treatment: 'INCLUDED' },
                { groupId: historicalGroupId, treatment: 'INCLUDED' },
              ],
            })),
          },
          author.id,
        );
        const review = new LegacyEquipmentOriginsService(proxy);
        const inspection = await review.inspect(ledger.id, '2026-10-01');
        const input = {
          sourceLedgerId: ledger.id,
          fingerprint: inspection.fingerprint,
          effectiveFrom: '2026-10-01',
          note: 'QA: origen inicial exacto y ubicación comprobados individualmente.',
        };
        const origin = await review.review(input, author.id);
        assert.equal((await review.review(input, author.id)).id, origin.id);
        assert.equal(origin.commercialSnapshot.frozenProfile.version, 1);
        const oldChild = await tx.asset.create({
          data: {
            skuId: sample.skuId,
            publicCode: `QA-LEGACY-CHILD-${randomUUID()}`,
            internalNumber: 999992,
            warehouseOwnerId: own.id,
            warehouseCurrentId: null,
          },
        });
        const oldChildLedger = await tx.stockLedger.create({
          data: {
            assetId: oldChild.id,
            ownerWarehouseId: own.id,
            customerWorksiteId: site.id,
            movementType: 'ON_SITE',
            quantity: 1,
            refDocumentId: original.id,
            refDocumentType: 'CUTOVER',
            effectiveAt: original.docDate,
            createdBy: author.id,
          },
        });
        const parentConfig = await tx.equipmentConfiguration.findUniqueOrThrow({
          where: { assetId: parent.id },
        });
        await tx.equipmentConfigurationEntry.create({
          data: {
            configurationId: parentConfig.id,
            assetId: oldChild.id,
            role: 'ACCESSORY',
            quantity: 1,
          },
        });
        const childInspection = await review.inspect(
          oldChildLedger.id,
          '2026-10-01',
        );
        const childOrigin = await review.review(
          {
            sourceLedgerId: oldChildLedger.id,
            effectiveFrom: '2026-10-01',
            fingerprint: childInspection.fingerprint,
            parentOriginId: origin.id,
            note: 'QA: relación padre e hijo confirmada explícitamente para este ensayo.',
          },
          author.id,
        );
        assert.equal(childOrigin.parentOriginId, origin.id);
        await assert.rejects(
          () =>
            review.review(
              {
                sourceLedgerId: oldChildLedger.id,
                effectiveFrom: '2026-10-01',
                fingerprint: childInspection.fingerprint,
                note: 'Intento de quitar padre de un empalme guardado.',
              },
              author.id,
            ),
          /padre del empalme/,
        );
        const inventory = new InventoryService(proxy, {
          get: async () => undefined,
          set: async () => {},
          del: async () => {},
        });
        const documents = new DocumentsService(
          proxy,
          inventory,
          { sendFinalIfNeeded: async () => {} },
          { sendDraft: async () => {} },
          { refresh: async () => {} },
        );
        const remission = await documents.createDirectDocument(
          {
            type: 'REMISSION',
            inventorySourceMode: 'WAREHOUSE',
            warehouseId: own.id,
            customerWorksiteId: site.id,
            recipientPhone: '3000000000',
            notes: 'Fecha documento: 2026-10-02',
            items: [
              {
                accessoryId: accessory.id,
                accessorySourceBalanceId: balance.id,
                ownerWarehouseId: own.id,
                quantity: 2,
                compositionNodeId: randomUUID(),
                parentLegacyOriginId: origin.id,
              },
            ],
          },
          author.id,
        );
        const line = await tx.documentItem.findFirstOrThrow({
          where: { documentId: remission.id },
        });
        assert.equal(line.parentLegacyOriginId, origin.id);
        assert.equal(line.componentParentAssetId, parent.id);
        const atWork = await tx.accessoryBalance.findFirstOrThrow({
          where: { accessoryId: accessory.id, customerWorksiteId: site.id },
        });
        const returned = await documents.createDirectDocument(
          {
            type: 'RETURN',
            warehouseId: own.id,
            customerWorksiteId: site.id,
            recipientPhone: '3000000000',
            notes: 'Fecha documento: 2026-10-03',
            items: [
              {
                accessoryId: accessory.id,
                accessorySourceBalanceId: atWork.id,
                ownerWarehouseId: own.id,
                quantity: 1,
                sourceDocumentItemId: line.id,
                compositionNodeId: randomUUID(),
              },
            ],
          },
          author.id,
        );
        assert.equal(
          (
            await tx.documentItem.findFirstOrThrow({
              where: { documentId: returned.id },
            })
          ).parentLegacyOriginId,
          origin.id,
        );
        const prepared = await new AnnexSourceService(proxy).prepare(
          site.id,
          '2026-10-01',
          '2026-10-15',
          '2026-10-03',
        );
        const parentRentals = prepared.input.rentals.filter(
          (row) => row.assetId === parent.id,
        );
        assert(
          parentRentals.every((row) => row.commercial?.status === 'RESOLVED'),
          JSON.stringify(parentRentals.map((row) => row.commercial)),
        );
        assert.deepEqual(
          parentRentals.map((row) => [
            row.commercialInterval.from,
            row.commercialInterval.to,
            row.commercial.mode.unit,
          ]),
          [
            ['2026-10-01', '2026-10-01', 'DAY'],
            ['2026-10-02', '2026-10-03', 'METER'],
          ],
        );
        assert(
          parentRentals.every(
            (row) =>
              row.source.reference === ledger.id &&
              row.deliveredOn === '2026-09-29',
          ),
        );
        const accessoryRentals = prepared.input.rentals.filter(
          (row) => row.accessoryId === accessory.id,
        );
        assert(accessoryRentals.length > 0);
        assert(
          accessoryRentals.every(
            (row) =>
              row.commercial.status === 'RESOLVED' &&
              row.pricing.basePrice === '0.00',
          ),
        );
        assert.equal(
          accessoryRentals[0].returns.reduce(
            (sum, row) => sum + Number(row.quantity),
            0,
          ),
          1,
        );
        assert.equal(
          await tx.documentItem.count({ where: { documentId: original.id } }),
          0,
        );
        assert.equal(
          JSON.stringify({
            original: await tx.document.findUnique({
              where: { id: original.id },
            }),
            ledger: await tx.stockLedger.findUnique({
              where: { id: ledger.id },
            }),
          }),
          historic,
        );
        if (persistDemo) {
          console.log(
            JSON.stringify({
              demo: demoCode,
              customerId: site.customerId,
              customerWorksiteId: site.id,
              assetId: parent.id,
              accessoryId: accessory.id,
              legacyOriginId: origin.id,
              url: `http://127.0.0.1:3159/billing/annexes?customer=${site.customerId}&worksite=${site.id}&from=2026-10-01&to=2026-10-15&through=2026-10-03`,
            }),
          );
          return;
        }
        await tx.stockLedger.create({
          data: {
            assetId: parent.id,
            ownerWarehouseId: own.id,
            warehouseId: own.id,
            movementType: 'IN',
            quantity: 1,
            effectiveAt: new Date('2026-10-04T12:00Z'),
            createdBy: author.id,
          },
        });
        assert(
          !(await review.active(site.id)).some((item) => item.id === origin.id),
        );
        await assert.rejects(
          () => review.inspect(ledger.id, '2026-10-01'),
          /ya no pertenece/,
        );
        console.log(
          'PASS legacy bridge: single review, immutable source, new remission to CUTOVER parent, annex splits DAY/METER from real movements, explicit zero accessory, partial return retains bridge, old origin retires after return. All QA data rolled back.',
        );
        throw rollback;
      },
      { timeout: 60000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
})()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
