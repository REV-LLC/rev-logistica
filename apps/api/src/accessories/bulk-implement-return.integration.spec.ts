import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { DocumentsService } from '../documents/documents.service';
import { AccessoriesService } from './accessories.service';
import { EquipmentConfigurationService } from './equipment-configuration.service';
import { BulkImplementPromotionService } from './bulk-implement-promotion.service';

const url = process.env.IMPLEMENTS_QA_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.search ||
      !/^\/(configuration_ui_qa_|accessory_qa_)[a-z0-9_]+$/.test(parsed.pathname))
    throw new Error('Returnable implement tests require an explicitly selected local QA database.');
}

(url ? describe : describe.skip)('native returnable quantity implements (PostgreSQL, rolled back)', () => {
  const prisma = new PrismaService({ datasources: { db: { url: url ?? 'postgresql://unused@127.0.0.1:1/accessory_qa_unused' } } });
  afterAll(() => prisma.$disconnect());

  it.each(['native', 'legacyPromotion'])('%s: remits three, returns two and one, and rejects a duplicate return atomically', async mode => {
    const counts = () => Promise.all([prisma.asset.count(), prisma.sku.count(), prisma.document.count(), prisma.stockLedger.count(), prisma.accessory.count()]);
    const before = await counts();
    const rollback = new Error('QA_RETURNABLE_ROLLBACK');
    await expect(prisma.$transaction(async tx => {
      const prefix = `QA_RETURNABLE_${randomUUID().slice(0, 8)}`;
      const actor = await tx.user.findFirstOrThrow({ where: { active: true, role: 'ADMIN' } });
      const warehouse = await tx.warehouse.findFirstOrThrow({ where: { active: true, type: 'OWN' } });
      const customer = await tx.customer.create({ data: { name: `${prefix} Cliente` } });
      const worksite = await tx.worksite.create({ data: { name: `${prefix} Obra` } });
      const site = await tx.customerWorksite.create({ data: { customerId: customer.id, worksiteId: worksite.id } });
      const family = await tx.assetFamily.create({ data: { code: `${prefix}_X`, name: `${prefix} Equipo X`, controlType: 'SERIAL' } });
      const subfamily = await tx.assetSubfamily.create({ data: { assetFamilyId: family.id, code: 'ESTANDAR', name: 'Estándar' } });
      const bulkFamily = await tx.assetFamily.create({ data: { code: `${prefix}_Y`, name: `${prefix} Implemento Y`, controlType: 'BULK' } });
      let sequence = 0;
      const proxy = { ...tx, $transaction: async (fn: (client: typeof tx) => unknown) => {
        const savepoint = `qa_returnable_${++sequence}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
        try { const value = await fn(tx); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`); return value; }
        catch (error) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`); throw error; }
      } } as unknown as PrismaService;
      const config = new EquipmentConfigurationService(proxy, new AccessoriesService(proxy));
      const inventory = new InventoryService(proxy, {
        del: async () => undefined,
        get: async () => undefined,
        set: async () => undefined,
      } as any, config);
      const documents = new DocumentsService(proxy, inventory, {} as any, {} as any, {} as any);
      const accessoryCount = await tx.accessory.count();
      const parent = (await inventory.createSerializedAsset({ family: { id: family.id }, subfamily: { id: subfamily.id },
        sku: { name: `${prefix} Equipo X` }, asset: {}, ownerWarehouseId: warehouse.id, warehouseCurrentId: warehouse.id }, actor.id)).asset;
      const assetsBeforeBulk = await tx.asset.count();
      let bulk: { sku: { id: string } };
      if (mode === 'legacyPromotion') {
        const legacy = await new AccessoriesService(proxy).create({ requestId: randomUUID(), name: prefix + ' anterior',
          kind: 'RETURNABLE', familyId: family.id, scope: 'ASSETS', subfamilyIds: [], assetIds: [parent.id],
          ownerWarehouseId: warehouse.id, warehouseId: warehouse.id, quantity: 10 }, actor.id);
        const oldBalances = await tx.accessoryBalance.findMany({ where: { accessoryId: legacy.id } });
        const sku = await tx.sku.create({ data: { assetFamilyId: bulkFamily.id, name: prefix + ' nativo', isImplement: true, isConsumable: false, price: 0 } });
        const service = new BulkImplementPromotionService();
        const input = { accessoryId: legacy.id, skuId: sku.id, effectiveAt: new Date(Date.now() + 60000), quantity: 10,
          confirmation: 'Office confirmó el saldo completo como implemento por cantidad y retornable.' };
        const plan = await service.preview(tx, input, actor.id);
        if (plan.status !== 'READY') throw new Error('A fresh identity must be ready');
        const promoted = await service.apply(tx, input, actor.id, plan.fingerprint);
        const counts = await Promise.all([tx.stockLedger.count(), tx.implementIdentityBridge.count()]);
        expect((await service.apply(tx, input, actor.id, plan.fingerprint)).replayed).toBe(true);
        expect(await Promise.all([tx.stockLedger.count(), tx.implementIdentityBridge.count()])).toEqual(counts);
        expect(await tx.accessoryBalance.findMany({ where: { accessoryId: legacy.id } })).toEqual(oldBalances);
        await expect(service.apply(tx, { ...input, quantity: 11 }, actor.id, plan.fingerprint)).rejects.toThrow('otro empalme');
        expect(promoted.bridge.assetId).toBeNull();
        expect(promoted.bridge.skuId).toBe(sku.id);
        const opening = await tx.stockLedger.findUniqueOrThrow({ where: { id: promoted.bridge.openingLedgerId } });
        await tx.$executeRawUnsafe('SAVEPOINT qa_bulk_opening_immutable');
        try {
          await expect(tx.stockLedger.update({ where: { id: opening.id }, data: { quantity: 11 } }))
            .rejects.toThrow('inmutable');
        } finally {
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT qa_bulk_opening_immutable');
          await tx.$executeRawUnsafe('RELEASE SAVEPOINT qa_bulk_opening_immutable');
        }
        expect(await tx.stockLedger.findUniqueOrThrow({ where: { id: opening.id } })).toEqual(opening);
        bulk = { sku };
      } else bulk = await inventory.addBulkAdjustment({ family: { id: bulkFamily.id },
        sku: { name: `${prefix} Mangueras`, isImplement: true, isConsumable: false, price: 0 },
        ownerWarehouseId: warehouse.id, warehouseId: warehouse.id, quantity: 10 }, actor.id);
      expect(await tx.asset.count()).toBe(assetsBeforeBulk);
      expect(await tx.accessory.count()).toBe(accessoryCount + (mode === 'legacyPromotion' ? 1 : 0));
      expect(await tx.sku.findUniqueOrThrow({ where: { id: bulk.sku.id } })).toMatchObject({ isImplement: true, isConsumable: false });
      const configVersion = (await tx.equipmentConfiguration.findUnique({ where: { assetId: parent.id }, select: { version: true } }))?.version ?? 0;
      await config.saveInTransaction(tx, { assetId: parent.id }, { version: configVersion, entries: [{ id: randomUUID(),
        skuId: bulk.sku.id, role: 'ACCESSORY', quantity: 3, defaultIncluded: true, required: false }] }, actor.id);
      const base = { customerWorksiteId: site.id, warehouseId: warehouse.id, recipientPhones: ['+573000000000'] };
      const remission = await documents.createDirectDocument({ ...base, type: 'REMISSION', inventorySourceMode: 'WAREHOUSE', items: [
        { assetId: parent.id, ownerWarehouseId: warehouse.id, sourceWarehouseId: warehouse.id },
        { skuId: bulk.sku.id, componentParentAssetId: parent.id, quantity: 3, ownerWarehouseId: warehouse.id, sourceWarehouseId: warehouse.id },
      ] }, actor.id);
      const source = await tx.documentItem.findFirstOrThrow({ where: { documentId: remission.id, skuId: bulk.sku.id }, include: { compositionParent: true } });
      expect(source.quantity?.toNumber()).toBe(3);
      expect(source.compositionParent?.assetId).toBe(parent.id);
      const inWarehouse = async () => Number((await tx.stockLedger.aggregate({ where: {
        skuId: bulk.sku.id, warehouseId: warehouse.id, ownerWarehouseId: warehouse.id }, _sum: { quantity: true } }))._sum.quantity);
      expect(await inWarehouse()).toBe(7);
      const returnQuantity = (quantity: number) => documents.createDirectDocument({ ...base, type: 'RETURN', items: [{
        skuId: bulk.sku.id, ownerWarehouseId: warehouse.id, componentParentAssetId: parent.id, quantity,
        sourceDocumentItemId: source.id, parentSourceDocumentItemId: source.compositionParent!.id,
      }] }, actor.id);
      await returnQuantity(2);
      expect(await inWarehouse()).toBe(9);
      expect((await inventory.getOnSiteInventory(site.id)).bulk.find(row => row.skuId === bulk.sku.id)?.quantity).toBe(1);
      await returnQuantity(1);
      expect(await inWarehouse()).toBe(10);
      expect((await inventory.getOnSiteInventory(site.id)).bulk.find(row => row.skuId === bulk.sku.id)?.quantity ?? 0).toBe(0);
      const beforeRejectedReturn = await Promise.all([tx.document.count(), tx.documentItem.count(), tx.stockLedger.count()]);
      await expect(returnQuantity(1)).rejects.toThrow();
      expect(await Promise.all([tx.document.count(), tx.documentItem.count(), tx.stockLedger.count()])).toEqual(beforeRejectedReturn);
      expect(await tx.sku.findUniqueOrThrow({ where: { id: bulk.sku.id } })).toMatchObject({ isConsumable: false });
      throw rollback;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 })).rejects.toBe(rollback);
    expect(await counts()).toEqual(before);
  }, 70000);
});
