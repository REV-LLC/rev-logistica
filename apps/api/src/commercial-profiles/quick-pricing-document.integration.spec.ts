import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { DocumentsService } from '../documents/documents.service';
import { AccessoriesService } from '../accessories/accessories.service';
import { EquipmentConfigurationService } from '../accessories/equipment-configuration.service';
import { AnnexSourceService } from '../annexes/annex-source.service';
import { CommercialProfilesService } from './commercial-profiles.service';

const url = process.env.IMPLEMENTS_QA_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.search ||
    !/^\/(configuration_ui_qa_|accessory_qa_)[a-z0-9_]+$/.test(parsed.pathname))
    throw new Error('Pricing flow tests require an explicitly selected local QA database.');
}

(url ? describe : describe.skip)('generic with/without implement pricing (PostgreSQL, rolled back)', () => {
  const prisma = new PrismaService({ datasources: { db: { url: url ?? 'postgresql://unused@127.0.0.1:1/accessory_qa_unused' } } });
  afterAll(() => prisma.$disconnect());

  it('saves different units/minimums, resolves native documents and annexes, and freezes the original prices', async () => {
    const counts = () => Promise.all([prisma.asset.count(), prisma.sku.count(), prisma.document.count(),
      prisma.stockLedger.count(), prisma.commercialProfile.count(), prisma.commercialProfileRevision.count()]);
    const before = await counts();
    const rollback = new Error('QA_QUICK_PRICING_ROLLBACK');
    await expect(prisma.$transaction(async tx => {
      const prefix = `QA_QUICK_PRICE_${randomUUID().slice(0, 8)}`;
      const actor = await tx.user.findFirstOrThrow({ where: { role: 'ADMIN', active: true } });
      const warehouse = await tx.warehouse.findFirstOrThrow({ where: { type: 'OWN', active: true } });
      const customer = await tx.customer.create({ data: { name: `${prefix} Cliente` } });
      const worksite = await tx.worksite.create({ data: { name: `${prefix} Obra` } });
      const site = await tx.customerWorksite.create({ data: { customerId: customer.id, worksiteId: worksite.id } });
      const family = await tx.assetFamily.create({ data: { code: `${prefix}_X`, name: `${prefix} Equipo X`, controlType: 'SERIAL' } });
      const subfamily = await tx.assetSubfamily.create({ data: { assetFamilyId: family.id, code: 'ESTANDAR', name: 'Estándar' } });
      const bulkFamily = await tx.assetFamily.create({ data: { code: `${prefix}_Y`, name: `${prefix} Implemento Y`, controlType: 'BULK' } });
      let step = 0;
      const proxy = { ...tx, $transaction: async (fn: (client: typeof tx) => unknown) => {
        const name = `qa_quick_price_${++step}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
        try { const result = await fn(tx); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); return result; }
        catch (error) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); throw error; }
      } } as unknown as PrismaService;
      const config = new EquipmentConfigurationService(proxy, new AccessoriesService(proxy));
      const inventory = new InventoryService(proxy, { del: async () => undefined, get: async () => undefined, set: async () => undefined } as any, config);
      const documents = new DocumentsService(proxy, inventory, {} as any, {} as any, {} as any);
      const profiles = new CommercialProfilesService(proxy);
      const parent = (await inventory.createSerializedAsset({ family: { id: family.id }, subfamily: { id: subfamily.id },
        sku: { name: `${prefix} Equipo X` }, asset: {}, ownerWarehouseId: warehouse.id, warehouseCurrentId: warehouse.id }, actor.id)).asset;
      const second = await tx.asset.create({ data: { publicCode: `${prefix}_SECOND`, skuId: parent.skuId,
        internalNumber: 2, warehouseOwnerId: warehouse.id, warehouseCurrentId: warehouse.id } });
      await tx.stockLedger.create({ data: { assetId: second.id, warehouseId: warehouse.id, ownerWarehouseId: warehouse.id,
        quantity: 1, movementType: 'ADJUST', createdBy: actor.id } });
      const bulk = await inventory.addBulkAdjustment({ family: { id: bulkFamily.id },
        sku: { name: `${prefix} Implemento Y`, isImplement: true, isConsumable: true },
        ownerWarehouseId: warehouse.id, warehouseId: warehouse.id, quantity: 5 }, actor.id);
      for (const asset of [parent, second]) await config.saveInTransaction(tx, { assetId: asset.id }, { version: 0,
        entries: [{ id: randomUUID(), skuId: bulk.sku.id, role: 'ACCESSORY', quantity: 1, defaultIncluded: false, required: false }] }, actor.id);
      const groupId = randomUUID();
      const input = { scopeType: 'SKU', scopeId: parent.skuId, expectedVersion: 0, effectiveFrom: '2026-10-01',
        groups: [{ id: groupId, name: 'Implemento Y', selectors: [{ kind: 'SKU', id: bulk.sku.id }] }],
        modes: [
          { id: randomUUID(), name: 'Sin implemento', unit: 'DAY', minimum: { value: '3', basis: 'PER_RENTAL' },
            pricing: { source: 'FIXED', amount: '25000' }, conditions: [{ groupId, presence: 'ABSENT' }], parts: [{ groupId, treatment: 'INCLUDED' }] },
          { id: randomUUID(), name: 'Con implemento', unit: 'METER', minimum: { value: '40', basis: 'PER_RENTAL' },
            pricing: { source: 'FIXED', amount: '1500' }, conditions: [{ groupId, presence: 'PRESENT', minimumQuantity: 1 }], parts: [{ groupId, treatment: 'INCLUDED' }] },
        ] };
      const { effectiveFrom: _oldDate, ...automaticInput } = input;
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
      const saved = await profiles.save(automaticInput, actor.id);
      expect(saved.version).toBe(1);
      expect(saved.effectiveFrom).toBe(day);
      expect((await tx.commercialProfileRevision.findFirstOrThrow({ where: { profileId: saved.id } }))
        .effectiveFrom.toISOString().slice(0, 10)).toBe(day);
      const base = { type: 'REMISSION' as const, inventorySourceMode: 'WAREHOUSE' as const, customerWorksiteId: site.id,
        warehouseId: warehouse.id, recipientPhone: '3001234567' };
      const without = await documents.createDirectDocument({ ...base, items: [
        { assetId: parent.id, ownerWarehouseId: warehouse.id, sourceWarehouseId: warehouse.id },
      ] }, actor.id);
      const withPart = await documents.createDirectDocument({ ...base, items: [
        { assetId: second.id, ownerWarehouseId: warehouse.id, sourceWarehouseId: warehouse.id },
        { skuId: bulk.sku.id, componentParentAssetId: second.id, quantity: 1,
          ownerWarehouseId: warehouse.id, sourceWarehouseId: warehouse.id },
      ] }, actor.id);
      const snapshot = async (documentId: string, assetId: string) => (await tx.documentItem.findFirstOrThrow({
        where: { documentId, assetId } })).commercialSnapshot;
      const daySnapshot = await snapshot(without.id, parent.id), meterSnapshot = await snapshot(withPart.id, second.id);
      expect(daySnapshot).toMatchObject({ status: 'RESOLVED', basePrice: '25000', mode: { unit: 'DAY', minimum: { value: '3' } } });
      expect(meterSnapshot).toMatchObject({ status: 'RESOLVED', basePrice: '1500', mode: { unit: 'METER', minimum: { value: '40' } } });
      const prepared = await new AnnexSourceService(proxy).prepare(site.id, `${day.slice(0, 7)}-01`, `${day.slice(0, 7)}-15`, day);
      expect(prepared.input.rentals.find(row => row.assetId === parent.id)).toMatchObject({
        pricing: { basePrice: '25000' }, commercial: { mode: { unit: 'DAY', minimum: { value: '3' } } } });
      expect(prepared.input.rentals.find(row => row.assetId === second.id)).toMatchObject({
        pricing: { basePrice: '1500' }, metering: { minimumMeters: '40', reports: [] } });
      expect(prepared.input.rentals.find(row => row.skuId === bulk.sku.id)).toMatchObject({
        pricing: { basePrice: '0.00' }, commercial: { contextualZero: true } });
      expect(prepared.sourceIssues.filter(issue => issue.code === 'COMMERCIAL_REVIEW')).toEqual([]);
      await profiles.save({ ...automaticInput, expectedVersion: 1, modes: input.modes.map(mode => ({ ...mode,
        pricing: { source: 'FIXED', amount: '99999' } })) }, actor.id);
      expect(await snapshot(without.id, parent.id)).toEqual(daySnapshot);
      expect(await snapshot(withPart.id, second.id)).toEqual(meterSnapshot);
      const after = await new AnnexSourceService(proxy).prepare(site.id, `${day.slice(0, 7)}-01`, `${day.slice(0, 7)}-15`, day);
      expect(after.input.rentals.find(row => row.assetId === second.id)?.pricing.basePrice).toBe('1500');
      throw rollback;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 })).rejects.toBe(rollback);
    expect(await counts()).toEqual(before);
  }, 70000);
});
