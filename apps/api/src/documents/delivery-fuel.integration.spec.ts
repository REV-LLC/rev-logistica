import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { DocumentsService } from './documents.service';
import { EquipmentConfigurationService } from '../accessories/equipment-configuration.service';
import { AccessoriesService } from '../accessories/accessories.service';
import { documentReturnOrigins } from './document-return-origins';
import { buildPdfItemDescription } from './document-pdf.service';

const url = process.env.IMPLEMENTS_QA_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (!['localhost', '127.0.0.1'].includes(target.hostname) || !/^\/accessory_qa_[a-z0-9_]+$/.test(target.pathname))
    throw new Error('Delivery fuel tests require an explicitly selected local QA database.');
}
(url ? describe : describe.skip)('mixer delivery choice, real PostgreSQL, complete rollback', () => {
  const db = new PrismaService({ datasources: { db: { url: url ?? 'postgresql://unused@127.0.0.1:1/accessory_qa_unused' } } });
  afterAll(() => db.$disconnect());
  it('retains an immutable archive with no operative motor links', async () => {
    expect(await db.retiredMotorConfiguration.count()).toBeGreaterThan(0);
    expect(await db.asset.count({ where: { assignedMotorId: { not: null } } })).toBe(0);
    expect(await db.assetMotorCompatibility.count()).toBe(0);
    const archived = await db.retiredMotorConfiguration.findFirstOrThrow();
    await expect(db.$transaction(tx => tx.retiredMotorConfiguration.update({
      where: { assetId: archived.assetId }, data: { snapshot: {} },
    }))).rejects.toThrow('inmutable');
    await expect(db.$transaction(tx => tx.retiredMotorConfiguration.delete({
      where: { assetId: archived.assetId },
    }))).rejects.toThrow('inmutable');
    expect(await db.retiredMotorConfiguration.findUniqueOrThrow({ where: { assetId: archived.assetId } })).toEqual(archived);
  });
  it('creates, autosaves, edits, approves, returns and dispatches again without assigning or moving a motor', async () => {
    const counts = () => Promise.all([db.document.count(), db.documentItem.count(), db.stockLedger.count(), db.asset.count()]);
    const originalCounts = await counts();
    const rollback = new Error('QA_DELIVERY_FUEL_ROLLBACK');
    await expect(db.$transaction(async tx => {
      const office = await tx.user.findFirstOrThrow({ where: { role: 'ADMIN', active: true } });
      const driver = await tx.user.findFirstOrThrow({ where: { role: 'DRIVER', active: true } });
      const warehouse = await tx.warehouse.findFirstOrThrow({ where: { type: 'OWN', active: true } });
      const prefix = 'QA_FUEL_' + randomUUID().slice(0, 8);
      const customer = await tx.customer.create({ data: { name: prefix } });
      const worksite = await tx.worksite.create({ data: { name: prefix } });
      const site = await tx.customerWorksite.create({ data: { customerId: customer.id, worksiteId: worksite.id } });
      const family = await tx.assetFamily.create({ data: { code: prefix, name: 'Equipo genérico', controlType: 'SERIAL', deliveryFuelSelectable: true } });
      const subfamily = await tx.assetSubfamily.create({ data: { assetFamilyId: family.id, code: 'STANDARD', name: 'Estándar' } });
      let step = 0;
      const proxy = { ...tx, $transaction: async (run: (client: typeof tx) => unknown) => {
        const name = 'qa_delivery_fuel_' + ++step;
        await tx.$executeRawUnsafe('SAVEPOINT ' + name);
        try { const value = await run(tx); await tx.$executeRawUnsafe('RELEASE SAVEPOINT ' + name); return value; }
        catch (error) { await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT ' + name); await tx.$executeRawUnsafe('RELEASE SAVEPOINT ' + name); throw error; }
      } } as unknown as PrismaService;
      const config = new EquipmentConfigurationService(proxy, new AccessoriesService(proxy));
      const inventory = new InventoryService(proxy, { get: async () => undefined, set: async () => undefined, del: async () => undefined } as any, config);
      const documents = new DocumentsService(proxy, inventory, { sendFinalIfNeeded: async () => undefined } as any,
        { sendDraft: async () => undefined } as any, { refresh: async () => undefined } as any);
      const { asset } = await inventory.createSerializedAsset({
        family: { id: family.id }, subfamily: { id: subfamily.id }, sku: { name: 'Equipo genérico GASOLINA' },
        asset: { fuel: 'GASOLINA' }, ownerWarehouseId: warehouse.id, warehouseCurrentId: warehouse.id,
      }, office.id);
      const originalAsset = await tx.asset.findUniqueOrThrow({ where: { id: asset.id } });
      const base = { type: 'REMISSION' as const, warehouseId: warehouse.id, inventorySourceMode: 'WAREHOUSE' as const,
        customerWorksiteId: site.id, recipientPhones: ['3001234567'] };
      const line = { assetId: asset.id, sourceWarehouseId: warehouse.id, ownerWarehouseId: warehouse.id };
      const form = await documents.createAutosavedRequestDocument({ ...base, createdBy: driver.id, requesterRole: 'DRIVER', items: [line] });
      expect((await tx.documentItem.findFirstOrThrow({ where: { documentId: form.id } })).deliveryFuel).toBeNull();
      await expect(documents.submitAutosavedRequestDocument(form.id, { sendWhatsapp: false }, { sub: driver.id, role: 'DRIVER' })).rejects.toThrow('Elige');
      expect((await tx.document.findUniqueOrThrow({ where: { id: form.id } })).status).toBe('IN_PROGRESS');
      await documents.updateAutosavedRequestDocument(form.id, { ...base, items: [{ ...line, deliveryFuel: 'GASOLINA' }] }, { sub: driver.id, role: 'DRIVER' });
      expect((await tx.documentItem.findFirstOrThrow({ where: { documentId: form.id } })).deliveryFuel).toBe('GASOLINA');
      await documents.updateAutosavedRequestDocument(form.id, { ...base, items: [{ ...line, deliveryFuel: 'ELECTRICO' }] }, { sub: driver.id, role: 'DRIVER' });
      expect((await documents.getDocument(form.id)).items).toMatchObject([{ deliveryFuel: 'ELECTRICO' }]);
      // The signed form's submit step normally transitions IN_PROGRESS to DRAFT.
      // No fake signature or external storage is needed to test approval under its stock transaction.
      await tx.document.update({ where: { id: form.id }, data: { status: 'DRAFT' } });
      await documents.updateRequestDocument(form.id, { ...base, items: [line] }, office.id);
      await expect(documents.approveRequestDocument(form.id, office.id)).rejects.toThrow('Elige');
      expect(await tx.stockLedger.count({ where: { refDocumentId: form.id } })).toBe(0);
      await documents.updateRequestDocument(form.id, { ...base, items: [{ ...line, deliveryFuel: 'ELECTRICO' }] }, office.id);
      await documents.approveRequestDocument(form.id, office.id);
      const originalLine = await tx.documentItem.findFirstOrThrow({ where: { documentId: form.id } });
      expect(originalLine.deliveryFuel).toBe('ELECTRICO');
      expect(await tx.documentItem.count({ where: { documentId: form.id } })).toBe(1);
      expect((await documentReturnOrigins(tx, site.id)).find(row => row.assetId === asset.id)?.deliveryFuel).toBe('ELECTRICO');
      expect(buildPdfItemDescription({ ...originalLine, asset: { sku: { name: 'Equipo genérico GASOLINA' } }, sku: null } as never)).toBe('Equipo genérico · Eléctrica');
      const returned = await documents.createDirectDocument({ type: 'RETURN', customerWorksiteId: site.id,
        warehouseId: warehouse.id, recipientPhone: '3001234567',
        items: [{ assetId: asset.id, ownerWarehouseId: warehouse.id, sourceDocumentItemId: originalLine.id }] }, office.id);
      expect((await tx.documentItem.findFirstOrThrow({ where: { documentId: returned.id } })).deliveryFuel).toBe('ELECTRICO');
      const second = await documents.createDirectDocument({ ...base, recipientPhone: '3001234567',
        items: [{ ...line, deliveryFuel: 'GASOLINA' }] }, office.id);
      expect((await tx.documentItem.findFirstOrThrow({ where: { documentId: second.id } })).deliveryFuel).toBe('GASOLINA');
      expect(await tx.documentItem.findUniqueOrThrow({ where: { id: originalLine.id } })).toEqual(originalLine);
      const finalAsset = await tx.asset.findUniqueOrThrow({ where: { id: asset.id } });
      expect(finalAsset.fuel).toBe(originalAsset.fuel);
      expect(finalAsset.assignedMotorId).toBeNull();
      expect(await tx.stockLedger.count({ where: { refDocumentId: { in: [form.id, returned.id, second.id] }, assetId: { not: asset.id } } })).toBe(0);
      throw rollback;
    }, { timeout: 60000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable })).rejects.toBe(rollback);
    expect(await counts()).toEqual(originalCounts);
  }, 70000);
});
