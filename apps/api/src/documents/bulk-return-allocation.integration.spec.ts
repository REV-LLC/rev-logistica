import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { DocumentsService } from './documents.service';
import { EquipmentConfigurationService } from '../accessories/equipment-configuration.service';
import { AccessoriesService } from '../accessories/accessories.service';

const url = process.env.BULK_RETURN_QA_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(target.hostname) ||
    !/^\/(?:accessory_qa_|employees_production_qa_)[a-z0-9_]+$/.test(target.pathname))
    throw new Error('BULK return integration tests require an explicitly selected local QA database.');
}
(url ? describe : describe.skip)('BULK return FIFO, real PostgreSQL, complete rollback', () => {
  const db = new PrismaService({ datasources: { db: { url: url ?? 'postgresql://unused@127.0.0.1:1/accessory_qa_unused' } } });
  afterAll(() => db.$disconnect());
  it('creates, autosaves, edits, approves, splits and returns without changing original deliveries or prices', async () => {
    const counts = () => Promise.all([db.document.count(), db.documentItem.count(), db.stockLedger.count(), db.sku.count()]);
    const before = await counts();
    const rollback = new Error('QA_BULK_RETURN_COMPLETE_ROLLBACK');
    await expect(db.$transaction(async tx => {
      const office = await tx.user.findFirstOrThrow({ where: { role: 'ADMIN', active: true } });
      const driver = await tx.user.findFirstOrThrow({ where: { role: 'DRIVER', active: true } });
      const warehouse = await tx.warehouse.findFirstOrThrow({ where: { type: 'OWN', active: true } });
      const prefix = 'QA_BULK_FIFO_' + randomUUID().slice(0, 8);
      const customer = await tx.customer.create({ data: { name: prefix } });
      const worksite = await tx.worksite.create({ data: { name: prefix } });
      const site = await tx.customerWorksite.create({ data: { customerId: customer.id, worksiteId: worksite.id } });
      const family = await tx.assetFamily.create({ data: { code: prefix, name: prefix, controlType: 'BULK' } });
      const sku = await tx.sku.create({ data: { name: prefix, assetFamilyId: family.id, price: 3000, chargeType: 'DAY' } });
      await tx.stockLedger.create({ data: { skuId: sku.id, warehouseId: warehouse.id, ownerWarehouseId: warehouse.id,
        movementType: 'ADJUST', quantity: 100, createdBy: office.id, isOpeningBalance: true } });
      let step = 0;
      const proxy = { ...tx, $transaction: async (run: (client: typeof tx) => unknown) => {
        const name = 'qa_bulk_fifo_' + ++step;
        await tx.$executeRawUnsafe('SAVEPOINT ' + name);
        try { const result = await run(tx); await tx.$executeRawUnsafe('RELEASE SAVEPOINT ' + name); return result; }
        catch (error) { await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT ' + name); await tx.$executeRawUnsafe('RELEASE SAVEPOINT ' + name); throw error; }
      } } as unknown as PrismaService;
      const config = new EquipmentConfigurationService(proxy, new AccessoriesService(proxy));
      const inventory = new InventoryService(proxy, { get: async () => undefined, set: async () => undefined, del: async () => undefined } as any, config);
      const documents = new DocumentsService(proxy, inventory, { sendFinalIfNeeded: async () => undefined } as any,
        { sendDraft: async () => undefined } as any, { refresh: async () => undefined } as any);
      const base = { warehouseId: warehouse.id, customerWorksiteId: site.id, recipientPhone: '3001234567' };
      const item = { skuId: sku.id, ownerWarehouseId: warehouse.id };
      const deliveries = [] as string[];
      for (const [day, quantity] of [[1, 8], [2, 6]]) {
        const delivery = await documents.createDirectDocument({ ...base, type: 'REMISSION', inventorySourceMode: 'WAREHOUSE',
          notes: `Fecha documento: 2026-10-0${day}`, items: [{ ...item, quantity }] }, office.id);
        deliveries.push(delivery.id);
      }
      const original = await tx.documentItem.findMany({ where: { documentId: { in: deliveries } }, orderBy: { document: { docDate: 'asc' } } });
      const form = await documents.createAutosavedRequestDocument({ ...base, type: 'RETURN',
        notes: 'Fecha documento: 2026-10-03', createdBy: driver.id, requesterRole: 'DRIVER', items: [{ ...item, quantity: 9 }] });
      await documents.updateAutosavedRequestDocument(form.id, { ...base, type: 'RETURN',
        notes: 'Fecha documento: 2026-10-03', items: [{ ...item, quantity: 10, conditionNote: 'Golpe leve' }] }, { sub: driver.id, role: 'DRIVER' });
      expect(await tx.stockLedger.count({ where: { refDocumentId: form.id } })).toBe(0);
      // Signature transport is outside this inventory test; use the normal pending-approval state.
      await tx.document.update({ where: { id: form.id }, data: { status: 'DRAFT' } });
      await documents.approveRequestDocument(form.id, office.id);
      const portions = await tx.documentItem.findMany({ where: { documentId: form.id } });
      expect(portions).toHaveLength(2);
      expect(portions.find(i => i.sourceDocumentItemId === original[0].id)?.quantity?.toString()).toBe('8');
      expect(portions.find(i => i.sourceDocumentItemId === original[1].id)?.quantity?.toString()).toBe('2');
      expect(portions.every(i => i.conditionNote === 'Golpe leve' && i.billingCutoffDate && i.billingStatus === 'CUT')).toBe(true);
      const movements = await tx.stockLedger.findMany({ where: { refDocumentId: form.id } });
      expect(movements).toHaveLength(1); expect(movements[0].quantity.toString()).toBe('10');
      expect(movements[0].ownerWarehouseId).toBe(warehouse.id);
      expect(await tx.documentItem.findMany({ where: { documentId: { in: deliveries } }, orderBy: { document: { docDate: 'asc' } } })).toEqual(original);
      const direct = await documents.createDirectDocument({ ...base, type: 'RETURN', notes: 'Fecha documento: 2026-10-04',
        items: [{ ...item, quantity: 2, sourceDocumentItemId: original[0].id }] }, office.id);
      expect((await tx.documentItem.findFirstOrThrow({ where: { documentId: direct.id } })).sourceDocumentItemId).toBe(original[1].id);
      const localCounts = () => Promise.all([tx.document.count(), tx.documentItem.count(), tx.stockLedger.count(), tx.sku.count()]);
      const stable = await localCounts();
      await expect(documents.createDirectDocument({ ...base, type: 'RETURN', notes: 'Fecha documento: 2026-10-05',
        items: [{ ...item, quantity: 3 }] }, office.id)).rejects.toThrow('saldo total');
      expect(await localCounts()).toEqual(stable);
      await expect(documents.approveRequestDocument(form.id, office.id)).rejects.toThrow('DRAFT');
      expect(await localCounts()).toEqual(stable);
      throw rollback;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 })).rejects.toBe(rollback);
    expect(await counts()).toEqual(before);
  }, 70000);
});
