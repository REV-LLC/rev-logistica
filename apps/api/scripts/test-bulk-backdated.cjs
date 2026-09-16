// Run after API build and prisma db push against a disposable local database.
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { InventoryService } = require('../dist/src/inventory/inventory.service');
const url = new URL(process.env.DATABASE_URL);
if (url.hostname !== 'localhost' || !url.pathname.startsWith('/rev_bulk_backdate_test_')) {
  throw new Error('This test requires a dedicated local rev_bulk_backdate_test_ database');
}
const p = new PrismaClient();
const service = new InventoryService(p, { del: async () => {} });
const date = new Date('2026-09-03T12:00:00Z');
const adjusted = new Date('2026-09-07T16:17:00Z');
async function run() {
  const tag = Date.now().toString();
  const user = await p.user.create({ data: { email: `bulk-${tag}@example.test`, passwordHash: 'unused', role: 'ADMIN' } });
  const owner = await p.owner.create({ data: { name: 'Bulk test' } });
  const warehouse = await p.warehouse.create({ data: { name: 'Own stock', type: 'OWN', ownerCompanyId: owner.id } });
  const provider = await p.warehouse.create({ data: { name: 'Provider stock', type: 'ALLY', ownerCompanyId: owner.id } });
  const customer = await p.customer.create({ data: { name: 'Test customer' } });
  const project = await p.worksite.create({ data: { name: 'Test site' } });
  const site = await p.customerWorksite.create({ data: { customerId: customer.id, worksiteId: project.id } });
  const family = await p.assetFamily.create({ data: { code: `BULK_${tag}`, name: 'Bulk test', controlType: 'BULK' } });
  async function fixture(type = 'REMISSION', ownerId = warehouse.id) {
    const sku = await p.sku.create({ data: { name: `Item ${Math.random()}`, assetFamilyId: family.id } });
    const doc = await p.document.create({ data: { type, docDate: date, createdBy: user.id, customerWorksiteId: site.id, warehouseId: warehouse.id } });
    const payload = { documentId: doc.id, warehouseId: warehouse.id, customerWorksiteId: site.id,
      items: [{ skuId: sku.id, ownerWarehouseId: ownerId, quantity: 2 }] };
    return { sku, doc, payload };
  }
  async function entry(skuId, movementType, quantity, extra = {}) {
    return p.stockLedger.create({ data: { skuId, movementType, quantity, ownerWarehouseId: warehouse.id,
      warehouseId: warehouse.id, createdBy: user.id, effectiveAt: adjusted, ...extra } });
  }
  // Reproduce the reported correction: existing item, later +2 stock correction.
  for (const method of ['moveOut', 'moveOnSite']) {
    const f = await fixture();
    await entry(f.sku.id, 'ADJUST', 3, { effectiveAt: new Date('2026-08-01') });
    await entry(f.sku.id, 'OUT', -3, { customerWorksiteId: site.id, effectiveAt: new Date('2026-08-25') });
    await entry(f.sku.id, 'ADJUST', 2);
    const result = await service[method](f.payload, user.id);
    assert.equal(result.count, 1);
    const row = await p.stockLedger.findFirst({ where: { refDocumentId: f.doc.id } });
    assert.equal(row.effectiveAt.toISOString(), date.toISOString());
  }
  // Returns also use aggregate stock at the source site, not entry-date lots.
  for (const method of ['moveIn', 'moveReturnTransit']) {
    const ownerId = method === 'moveReturnTransit' ? provider.id : warehouse.id;
    const f = await fixture('RETURN', ownerId);
    await entry(f.sku.id, 'ON_SITE', 2, { warehouseId: null, customerWorksiteId: site.id, ownerWarehouseId: ownerId });
    const result = await service[method](f.payload, user.id);
    assert.equal(result.count, 1);
  }
  // Another owner's stock must never satisfy this owner's request.
  const shortage = await fixture();
  await entry(shortage.sku.id, 'ADJUST', 100, { ownerWarehouseId: provider.id });
  await assert.rejects(service.moveOut(shortage.payload, user.id), e => e.response?.code === 'INSUFFICIENT_STOCK');
  assert.equal(await p.stockLedger.count({ where: { refDocumentId: shortage.doc.id } }), 0);

  // Both requests see the same SKU; only one can consume its last two units.
  const concurrent = await fixture();
  await entry(concurrent.sku.id, 'ADJUST', 2);
  const second = await p.document.create({ data: { type: 'REMISSION', docDate: date, createdBy: user.id } });
  const results = await Promise.allSettled([
    service.moveOut(concurrent.payload, user.id),
    service.moveOut({ ...concurrent.payload, documentId: second.id }, user.id),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.response.code, 'INSUFFICIENT_STOCK');
  const total = await p.stockLedger.aggregate({ where: { skuId: concurrent.sku.id }, _sum: { quantity: true } });
  assert.equal(Number(total._sum.quantity), 0);
  console.log('PASS: historical OUT/ON_SITE/IN/TRANSIT, owner isolation, stock shortage, concurrent approvals, document dates');
}
run().finally(() => p.$disconnect());
