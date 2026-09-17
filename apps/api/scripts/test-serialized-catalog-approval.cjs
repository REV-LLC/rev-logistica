// Build the API and run prisma db push against the disposable database first.
// DATABASE_URL must point to localhost/rev_serial_catalog_test_20260908.
// Uses the real catalogue creation, document approval, inventory and PostgreSQL
// paths. Only cache and external delivery/PDF integrations are disabled.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const databaseUrl = new URL(process.env.DATABASE_URL || 'file:///missing');
if (
  !['postgres:', 'postgresql:'].includes(databaseUrl.protocol)
  || databaseUrl.hostname !== 'localhost'
  || databaseUrl.pathname !== '/rev_serial_catalog_test_20260908'
  || [...databaseUrl.searchParams.keys()].some((key) => key !== 'schema')
  || (databaseUrl.searchParams.has('schema') && databaseUrl.searchParams.get('schema') !== 'public')
) {
  throw new Error('Refusing to run: use the dedicated localhost/rev_serial_catalog_test_20260908 database');
}

const { PrismaClient } = require('@prisma/client');
const { InventoryService } = require('../dist/src/inventory/inventory.service');
const { DocumentsService } = require('../dist/src/documents/documents.service');
const prisma = new PrismaClient();
const cache = { get: async () => undefined, set: async () => {}, del: async () => {} };
const inventory = new InventoryService(prisma, cache);
const sentFinalEmails = [];
const documents = new DocumentsService(
  prisma,
  inventory,
  { sendFinalIfNeeded: async (id) => { sentFinalEmails.push(id); } },
  {},
  {},
);
const registered = new Date('2026-09-04T17:08:33.125Z');
const delivered = new Date('2026-09-01T12:00:00.000Z');
const laterDate = new Date('2026-09-05T12:00:00.000Z');

async function run() {
  const tag = randomUUID().replaceAll('-', '').slice(0, 12);
  const user = await prisma.user.create({
    data: { email: `serial-approval-${tag}@example.test`, passwordHash: 'unused', role: 'ADMIN' },
  });
  const owner = await prisma.owner.create({ data: { name: `Serial approval test ${tag}` } });
  const own = await prisma.warehouse.create({
    data: { name: `Own ${tag}`, type: 'OWN', ownerCompanyId: owner.id },
  });
  const provider = await prisma.warehouse.create({
    data: { name: `Provider ${tag}`, type: 'ALLY', ownerCompanyId: owner.id },
  });
  const customer = await prisma.customer.create({ data: { name: `Synthetic customer ${tag}` } });
  const worksite = await prisma.worksite.create({ data: { name: `Synthetic worksite ${tag}` } });
  const site = await prisma.customerWorksite.create({
    data: { customerId: customer.id, worksiteId: worksite.id },
  });
  const family = await prisma.assetFamily.create({
    data: { code: `SERIAL_TEST_${tag.toUpperCase()}`, name: `Test equipment ${tag}`, controlType: 'SERIAL' },
  });
  const subfamily = await prisma.assetSubfamily.create({
    data: { assetFamilyId: family.id, code: 'STANDARD', name: 'Standard' },
  });
  const sku = await prisma.sku.create({
    data: { name: `ECOMAX test reference ${tag}`, assetFamilyId: family.id, assetSubfamilyId: subfamily.id },
  });
  let sequence = 0;

  async function createAsset(label, ownerWarehouse = own, currentWarehouse = ownerWarehouse) {
    const created = await inventory.createSerializedAsset({
      family: { id: family.id },
      subfamily: { id: subfamily.id },
      sku: { id: sku.id },
      asset: { brand: 'ECOMAX', description: label },
      ownerWarehouseId: ownerWarehouse.id,
      warehouseCurrentId: currentWarehouse.id,
    }, user.id);
    const opening = await prisma.stockLedger.findUniqueOrThrow({ where: { id: created.ledger.id } });
    assert.equal(opening.isOpeningBalance, true, `${label}: real catalogue creation must classify its opening`);
    assert.equal(opening.movementType, 'ADJUST');
    assert.equal(Number(opening.quantity), 1);
    assert.equal(opening.refDocumentId, null);
    assert.equal(opening.customerWorksiteId, null);
    assert.equal(opening.ownerWarehouseId, ownerWarehouse.id);
    assert.equal(opening.warehouseId, currentWarehouse.id);

    // Fixture dates model Sep 4 catalogue entry; production audit dates must
    // survive approval unchanged. No service/database logic is replaced.
    await prisma.asset.update({ where: { id: created.asset.id }, data: { createdAt: registered } });
    await prisma.stockLedger.update({
      where: { id: opening.id }, data: { createdAt: registered, effectiveAt: registered },
    });
    return { assetId: created.asset.id, openingId: opening.id, ownerWarehouse, currentWarehouse };
  }

  async function createDraft(fixture, mode = 'ON_SITE', docDate = delivered) {
    const doc = await prisma.document.create({
      data: {
        type: 'REMISSION', status: 'DRAFT', consecutive: `TEST-${tag}-${++sequence}`,
        createdBy: user.id, createdAt: registered, docDate,
        customerWorksiteId: site.id, warehouseId: fixture.currentWarehouse.id,
        notes: `entrega: ${mode}`,
        items: { create: { assetId: fixture.assetId, condition: fixture.ownerWarehouse.id } },
      },
    });
    if (fixture.ownerWarehouse.type === 'ALLY') {
      // Approval checks provider evidence metadata. The external file is never
      // fetched, uploaded or emailed by this integration test.
      await prisma.fileObject.create({
        data: {
          documentId: doc.id, createdBy: user.id,
          fileType: 'COMPROBANTE_SALIDA_PROVEEDOR', category: 'COMPROBANTE_SALIDA_PROVEEDOR',
          providerWarehouseId: fixture.ownerWarehouse.id,
          storageKey: `local-test/${tag}/${doc.id}.jpg`, mimeType: 'image/jpeg',
        },
      });
    }
    return doc;
  }

  async function assertOpeningUnchanged(fixture) {
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: fixture.assetId } });
    const opening = await prisma.stockLedger.findUniqueOrThrow({ where: { id: fixture.openingId } });
    assert.equal(asset.createdAt.toISOString(), registered.toISOString());
    assert.equal(opening.createdAt.toISOString(), registered.toISOString());
    assert.equal(opening.effectiveAt.toISOString(), registered.toISOString());
    assert.equal(opening.isOpeningBalance, true);
    assert.equal(Number(opening.quantity), 1);
    assert.equal(opening.ownerWarehouseId, fixture.ownerWarehouse.id);
    assert.equal(opening.warehouseId, fixture.currentWarehouse.id);
    assert.equal(opening.refDocumentId, null);
  }

  async function assertApproved(fixture, doc, movementType) {
    const saved = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    assert.equal(saved.status, 'CONFIRMED');
    assert.equal(saved.docDate.toISOString(), doc.docDate.toISOString());
    assert.equal(saved.createdAt.toISOString(), registered.toISOString());
    const movements = await prisma.stockLedger.findMany({ where: { refDocumentId: doc.id } });
    assert.equal(movements.length, 1, 'approval creates exactly one real serialized movement');
    assert.equal(movements[0].assetId, fixture.assetId);
    assert.equal(movements[0].movementType, movementType);
    assert.equal(movements[0].effectiveAt.toISOString(), doc.docDate.toISOString());
    assert.equal(movements[0].isOpeningBalance, false);
    assert.equal(movements[0].ownerWarehouseId, fixture.ownerWarehouse.id);
    assert.equal(movements[0].customerWorksiteId, site.id);
    assert.equal(Number(movements[0].quantity), movementType === 'OUT' ? -1 : 1);
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: fixture.assetId } });
    assert.equal(asset.warehouseCurrentId, null);
    await assertOpeningUnchanged(fixture);
    const onsite = await inventory.getOnSiteInventory(site.id);
    const onsiteAsset = onsite.serial.find((row) => row.assetId === fixture.assetId);
    assert.ok(onsiteAsset, 'real inventory projection must show the asset at the destination');
    assert.equal(onsiteAsset.quantity, 1);
    const warehouse = await inventory.getWarehouseInventory(fixture.currentWarehouse.id);
    assert.ok(!warehouse.serial.some((row) => row.assetId === fixture.assetId && row.quantity > 0),
      'later catalogue registration must not restore warehouse availability');
    assert.equal(sentFinalEmails.filter((id) => id === doc.id).length, 1);
  }

  // RM019144: OWN equipment registered Sep 4, delivered Sep 1. Exercise both
  // delivery modes and supplier stock physically held at a different warehouse.
  for (const [label, ownerWarehouse, currentWarehouse, mode] of [
    ['OWN historical on-site approval', own, own, 'ON_SITE'],
    ['OWN historical warehouse approval', own, own, 'WAREHOUSE'],
    ['ALLY historical on-site approval', provider, provider, 'ON_SITE'],
    ['ALLY custody historical warehouse approval', provider, own, 'WAREHOUSE'],
  ]) {
    const fixture = await createAsset(label, ownerWarehouse, currentWarehouse);
    const draft = await createDraft(fixture, mode);
    const result = await documents.approveRequestDocument(draft.id, user.id);
    assert.equal(result.id, draft.id);
    assert.equal(result.status, 'CONFIRMED');
    await assertApproved(fixture, draft, mode === 'ON_SITE' ? 'ON_SITE' : 'OUT');
    await assert.rejects(documents.approveRequestDocument(draft.id, user.id),
      (error) => error.getStatus?.() === 400 && error.message.includes('DRAFT'));
    assert.equal(await prisma.stockLedger.count({ where: { refDocumentId: draft.id } }), 1);
    assert.equal(sentFinalEmails.filter((id) => id === draft.id).length, 1);
    console.log(`PASS: ${label}, dates, location, retry without duplicate`);
  }

  // A physical dispatch is not catalogue registration. A backdated request
  // must remain a draft when it conflicts with that serialized history.
  const conflicting = await createAsset('Later real serialized movement');
  const laterDoc = await createDraft(conflicting, 'ON_SITE', laterDate);
  await documents.approveRequestDocument(laterDoc.id, user.id);
  const earlierDoc = await createDraft(conflicting);
  const beforeConflict = await prisma.stockLedger.findMany({
    where: { assetId: conflicting.assetId }, orderBy: { id: 'asc' },
  });
  await assert.rejects(documents.approveRequestDocument(earlierDoc.id, user.id),
    (error) => error.response?.code === 'RETROACTIVE_INVENTORY_MOVEMENT');
  assert.equal((await prisma.document.findUniqueOrThrow({ where: { id: earlierDoc.id } })).status, 'DRAFT');
  assert.equal(await prisma.stockLedger.count({ where: { refDocumentId: earlierDoc.id } }), 0);
  assert.deepEqual(await prisma.stockLedger.findMany({
    where: { assetId: conflicting.assetId }, orderBy: { id: 'asc' },
  }), beforeConflict);
  assert.equal(sentFinalEmails.filter((id) => id === earlierDoc.id).length, 0);
  await assertOpeningUnchanged(conflicting);
  console.log('PASS: later physical movement still blocks approval without partial inventory writes');

  // Two documents cannot both assign the same serialized asset to a worksite.
  const competing = await createAsset('Competing serialized approvals');
  const first = await createDraft(competing);
  const second = await createDraft(competing);
  const results = await Promise.allSettled([
    documents.approveRequestDocument(first.id, user.id),
    documents.approveRequestDocument(second.id, user.id),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.equal(rejected.reason.response?.code, 'ASSET_LOCATION_CONFLICT');
  const competingDocs = await prisma.document.findMany({ where: { id: { in: [first.id, second.id] } } });
  assert.equal(competingDocs.filter((doc) => doc.status === 'CONFIRMED').length, 1);
  assert.equal(competingDocs.filter((doc) => doc.status === 'DRAFT').length, 1);
  assert.equal(await prisma.stockLedger.count({ where: { assetId: competing.assetId, isOpeningBalance: false } }), 1);
  await assertOpeningUnchanged(competing);
  console.log('PASS: concurrent full approvals consume the serialized asset only once');
}

run()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
