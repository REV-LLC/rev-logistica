import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { DocumentsService } from '../documents/documents.service';
import { CommercialProfilesService } from '../commercial-profiles/commercial-profiles.service';
import { AccessoriesService } from './accessories.service';
import { EquipmentConfigurationService } from './equipment-configuration.service';
import { ImplementPromotionService } from './implement-promotion.service';
import { documentReturnOrigins } from '../documents/document-return-origins';
import { reviewedDocumentaryIdentities } from './implement-documentary-identity';

const testUrl = process.env.IMPLEMENTS_QA_DATABASE_URL;
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !/^\/(configuration_ui_qa_|accessory_qa_)[a-z0-9_]+$/.test(parsed.pathname))
    throw new Error('Promotion flow tests require an explicitly selected local QA database.');
}

(testUrl ? describe : describe.skip)('promoted implement documentary flow in PostgreSQL (always rolled back)', () => {
  const prisma = new PrismaService({ datasources: { db: { url: testUrl ?? 'postgresql://unused@127.0.0.1:1/accessory_qa_unused' } } });
  afterAll(() => prisma.$disconnect());

  it.each([true, false])('preserves evidence and returns/remits/returns one asset (existing profile: %s)', async (existingProfile) => {
    const originalCounts = await Promise.all([prisma.asset.count(), prisma.stockLedger.count(), prisma.document.count(), prisma.accessoryBalance.count(), prisma.accessoryMovement.count()]);
    const rollback = new Error('QA_PROMOTION_FLOW_ROLLBACK');
    await expect(prisma.$transaction(async tx => {
      const prefix = `QA_PROMOTION_FLOW_${randomUUID().slice(0, 8)}`;
      const warehouse = await tx.warehouse.findFirstOrThrow({ where: { type: 'OWN', active: true } });
      const actor = await tx.user.findFirstOrThrow({ where: { role: 'ADMIN', active: true } });
      const customer = await tx.customer.create({ data: { name: `${prefix} Cliente` } });
      const worksite = await tx.worksite.create({ data: { name: `${prefix} Obra` } });
      const site = await tx.customerWorksite.create({ data: { customerId: customer.id, worksiteId: worksite.id } });
      const parentFamily = await tx.assetFamily.create({ data: { code: `${prefix}_PARENT`, name: `${prefix} Equipos`, controlType: 'SERIAL' } });
      const implementFamily = await tx.assetFamily.create({ data: { code: `${prefix}_IMPLEMENT`, name: `${prefix} Implementos`, controlType: 'SERIAL' } });
      const parentSubfamily = await tx.assetSubfamily.create({ data: { assetFamilyId: parentFamily.id, code: 'ESTANDAR', name: 'Estándar' } });
      const implementSubfamily = await tx.assetSubfamily.create({ data: { assetFamilyId: implementFamily.id, code: 'ESTANDAR', name: 'Estándar' } });
      const implementSku = await tx.sku.create({ data: { name: `${prefix} Unidad Y`, assetFamilyId: implementFamily.id,
        assetSubfamilyId: implementSubfamily.id, chargeType: 'DAY', price: new Prisma.Decimal(0) } });

      let savepoint = 0;
      // Nested service transactions must roll back rejected documents as they do
      // in normal execution, while this whole rehearsal still rolls back once.
      const proxy = { ...tx, $transaction: async (fn: (client: typeof tx) => unknown) => {
        const name = `qa_promotion_step_${++savepoint}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
        try {
          const result = await fn(tx);
          await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`);
          return result;
        } catch (error) {
          await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`);
          await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`);
          throw error;
        }
      } } as unknown as PrismaService;
      const cache = { del: async () => undefined, get: async () => undefined, set: async () => undefined };
      const accessories = new AccessoriesService(proxy);
      const configuration = new EquipmentConfigurationService(proxy, accessories);
      const inventory = new InventoryService(proxy, cache as any, configuration);
      const documents = new DocumentsService(proxy, inventory, {} as any, {} as any, {} as any);
      const promotion = new ImplementPromotionService(proxy);
      const parent = (await inventory.createSerializedAsset({ family: { id: parentFamily.id }, subfamily: { id: parentSubfamily.id },
        sku: { name: `${prefix} Equipo X` }, asset: {}, ownerWarehouseId: warehouse.id, warehouseCurrentId: warehouse.id }, actor.id)).asset;
      await inventory.moveOnSite({ customerWorksiteId: site.id, items: [{ assetId: parent.id, ownerWarehouseId: warehouse.id }] }, actor.id, tx);
      const legacy = await accessories.create({ name: `${prefix} Unidad Y`, kind: 'INDIVIDUAL', purpose: 'ACCESSORY',
        internalCode: `${prefix}_OLD`, familyId: parentFamily.id, scope: 'ASSETS', assetIds: [parent.id], subfamilyIds: [],
        ownerWarehouseId: warehouse.id, warehouseId: warehouse.id, quantity: 1, requestId: randomUUID() }, actor.id);
      // Imported legacy custody with no DocumentaryItem/source document. These
      // fixture writes precede the fingerprint; promotion must never alter them.
      await tx.accessoryBalance.updateMany({ where: { accessoryId: legacy.id }, data: { quantity: 0 } });
      await tx.accessoryBalance.create({ data: { accessoryId: legacy.id, assetId: parent.id, customerWorksiteId: site.id,
        locationKey: `asset:${parent.id}:worksite:${site.id}`, quantity: 1 } });
      const parentNode = randomUUID();
      const historicDelivery = await tx.document.create({ data: { type: 'REMISSION', status: 'CONFIRMED', createdBy: actor.id,
        warehouseId: warehouse.id, customerWorksiteId: site.id, consecutive: `${prefix}_DELIVERY`, docDate: new Date(),
        items: { create: [{ assetId: parent.id, condition: warehouse.id, compositionNodeId: parentNode },
          { accessoryId: legacy.id, componentParentAssetId: parent.id, quantity: 1, condition: warehouse.id,
            accessoryName: legacy.name, accessoryKind: 'INDIVIDUAL', accessorySourceBalanceId: legacy.balances[0].id,
            compositionNodeId: randomUUID(), parentCompositionNodeId: parentNode }] } }, include: { items: true } });
      const historicLine = historicDelivery.items.find(row => row.accessoryId === legacy.id)!;
      await tx.accessoryMovement.create({ data: { accessoryId: legacy.id, type: 'ASSIGN', quantity: 1,
        requestId: `document:${historicDelivery.id}:item:${historicLine.id}`, documentId: historicDelivery.id,
        fingerprint: prefix, createdBy: actor.id, note: 'QA historical documentary custody',
        from: { warehouseId: warehouse.id }, to: { assetId: parent.id, customerWorksiteId: site.id } } });
      const saved = await configuration.saveInTransaction(tx, { assetId: parent.id }, { version: 0, entries: [
        { id: randomUUID(), accessoryId: legacy.id, role: 'ACCESSORY', quantity: 1, recommendation: true, defaultIncluded: true, required: false },
      ] }, actor.id);
      if (existingProfile) await new CommercialProfilesService(proxy).save({ scopeType: 'ACCESSORY', scopeId: legacy.id, expectedVersion: 0,
        effectiveFrom: '2026-10-01', groups: [], modes: [{ id: randomUUID(), name: 'Tarifa cero conservada', unit: 'DAY',
          minimum: { value: '0', basis: 'PER_RENTAL' }, pricing: { source: 'FIXED', amount: '0' }, conditions: [], parts: [] }] }, actor.id);
      const legacyEvidence = async () => ({
        accessory: await tx.accessory.findUniqueOrThrow({ where: { id: legacy.id } }),
        balances: await tx.accessoryBalance.findMany({ where: { accessoryId: legacy.id }, orderBy: { id: 'asc' } }),
        movements: await tx.accessoryMovement.findMany({ where: { accessoryId: legacy.id }, orderBy: { id: 'asc' } }),
        revisions: await tx.accessoryRevision.findMany({ where: { accessoryId: legacy.id }, orderBy: { id: 'asc' } }),
        historicalDocument: await tx.document.findUnique({ where: { id: historicDelivery.id }, include: { items: true } }),
        commercialProfiles: await tx.commercialProfile.findMany({ where: { scopeType: 'ACCESSORY', scopeId: legacy.id },
          include: { revisions: { orderBy: { version: 'asc' } } } }),
      });
      const beforeLegacy = await legacyEvidence();
      const effectiveAt = new Date(Date.now() + 60000);
      const input = { accessoryId: legacy.id, skuId: implementSku.id, effectiveAt, sourceDocumentItemId: historicLine.id, internalNumber: 2,
        ...(!existingProfile ? { unconfiguredPrice: '0' as const } : {}) };
      const plan = await promotion.previewInTransaction(tx, input, actor.id);
      if (plan.status !== 'READY') throw new Error('Fixture must be promotable, not previously promoted.');
      const countsBeforePromotion = await Promise.all([tx.asset.count(), tx.stockLedger.count(), tx.implementIdentityBridge.count()]);
      await expect(promotion.promoteInTransaction(tx, input, actor.id, '0'.repeat(64))).rejects.toThrow('cambió desde la revisión');
      expect(await Promise.all([tx.asset.count(), tx.stockLedger.count(), tx.implementIdentityBridge.count()])).toEqual(countsBeforePromotion);
      const promoted = await promotion.promoteInTransaction(tx, input, actor.id, plan.fingerprint);
      await tx.$executeRawUnsafe('SET CONSTRAINTS reviewed_implement_opening IMMEDIATE');
      await tx.$executeRawUnsafe('SET CONSTRAINTS reviewed_implement_opening DEFERRED');
      expect(promoted.replayed).toBe(false);
      expect(promoted.asset.isImplement).toBe(true);
      expect(promoted.asset.internalNumber).toBe(2);
      expect(promoted.openingLedgers).toHaveLength(2);
      expect(promoted.openingLedgers.every(row => row.isOpeningBalance && row.refDocumentId === null && row.skuId === null)).toBe(true);
      expect(await legacyEvidence()).toEqual(beforeLegacy);
      expect((await accessories.list(parent.id, prefix)).items.some(row => row.id === legacy.id)).toBe(false);
      expect((await accessories.documentOptions({ type: 'RETURN', customerWorksiteId: site.id, assetId: parent.id, page: 0 }))
        .items.some(row => row.accessoryId === legacy.id)).toBe(false);
      expect(await accessories.get(legacy.id)).toMatchObject({ readOnly: true, nativeAssetId: promoted.asset.id });
      const afterPromotionAssetCount = await tx.asset.count();
      const afterPromotionLedgerCount = await tx.stockLedger.count();
      const replay = await promotion.promoteInTransaction(tx, input, actor.id, plan.fingerprint);
      expect(replay.replayed).toBe(true);
      expect(replay.bridge.assetId).toBe(promoted.bridge.assetId);
      expect(await tx.asset.count()).toBe(afterPromotionAssetCount);
      expect(await tx.stockLedger.count()).toBe(afterPromotionLedgerCount);
      await tx.$executeRawUnsafe('SAVEPOINT qa_unreviewed_opening');
      try {
        await expect((async () => {
          await tx.stockLedger.create({ data: { assetId: parent.id, skuId: null, ownerWarehouseId: warehouse.id,
            warehouseId: null, customerWorksiteId: site.id, movementType: 'ON_SITE', quantity: 1,
            effectiveAt, isOpeningBalance: true, createdBy: actor.id } });
          await tx.$executeRawUnsafe('SET CONSTRAINTS reviewed_implement_opening IMMEDIATE');
        })()).rejects.toThrow('requiere su empalme de identidad revisado');
      } finally {
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT qa_unreviewed_opening');
        await tx.$executeRawUnsafe('RELEASE SAVEPOINT qa_unreviewed_opening');
      }
      expect(await tx.stockLedger.count()).toBe(afterPromotionLedgerCount);
      for (const opening of promoted.openingLedgers) {
        for (const operation of ['UPDATE', 'DELETE']) {
          await tx.$executeRawUnsafe('SAVEPOINT qa_immutable_implement_opening');
          try {
            await expect(operation === 'DELETE'
              ? tx.stockLedger.delete({ where: { id: opening.id } })
              : tx.stockLedger.update({ where: { id: opening.id }, data: { effectiveAt: new Date(effectiveAt.getTime() + 1000) } }))
              .rejects.toThrow('es evidencia histórica y no se puede modificar ni eliminar');
          } finally {
            await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT qa_immutable_implement_opening');
            await tx.$executeRawUnsafe('RELEASE SAVEPOINT qa_immutable_implement_opening');
          }
          expect(await tx.stockLedger.count()).toBe(afterPromotionLedgerCount);
          expect(await tx.stockLedger.findUniqueOrThrow({ where: { id: opening.id } })).toEqual(opening);
        }
      }
      const linked = await tx.equipmentConfigurationEntry.findMany({ where: { configurationId: saved.id } });
      expect(linked).toHaveLength(1);
      expect(linked[0]).toMatchObject({ id: saved.entries[0].id, assetId: promoted.asset.id, accessoryId: null });
      const inventoryQuantity = async () => {
        const onSite = await inventory.getOnSiteInventory(site.id) as { serial: Array<{ assetId: string; quantity: number }> };
        const inWarehouse = await inventory.getWarehouseInventory(warehouse.id) as { serial: Array<{ assetId: string; quantity: number }> };
        return { site: onSite.serial.filter(row => row.assetId === promoted.asset.id),
          warehouse: inWarehouse.serial.filter(row => row.assetId === promoted.asset.id) };
      };
      const initialStock = await inventoryQuantity();
      expect(initialStock.site).toHaveLength(1);
      expect(initialStock.site[0].quantity).toBe(1);
      expect(initialStock.warehouse).toHaveLength(0);
      const catalog = await inventory.getOwnerAssetCatalog(warehouse.id);
      expect(catalog.serial.find(row => row.assetId === promoted.asset.id)).toMatchObject({ status: 'OUT', balance: { isConsistent: true } });
      await expect(accessories.moveInTransaction(tx, legacy.id, { requestId: randomUUID(), type: 'RETIRE', quantity: 1,
        from: { assetId: parent.id, customerWorksiteId: site.id }, note: 'Must not move the historical identity' }, actor.id)).rejects.toThrow('ya está registrado como equipo');

      const dateAt = (minutes: number) => new Date(effectiveAt.getTime() + minutes * 60000).toISOString();
      const base = { customerWorksiteId: site.id, warehouseId: warehouse.id, recipientPhones: ['+573000000000'] };
      const native = { assetId: promoted.asset.id, ownerWarehouseId: warehouse.id };
      const origins = await documentReturnOrigins(tx, site.id);
      // Explicit future fixture timestamp: identity is only usable after cutover.
      expect((await reviewedDocumentaryIdentities(tx, [historicLine], effectiveAt))[0]).toMatchObject({ assetId: promoted.asset.id, accessoryId: null });
      expect(origins.some(row => row.sourceDocumentItemId === historicLine.id)).toBe(true);
      const firstReturn = await documents.createDirectDocument({ ...base, type: 'RETURN', notes: `Fecha documento: ${dateAt(1)}`,
        items: [{ ...native, sourceDocumentItemId: historicLine.id }] }, actor.id);
      const stockAfterReturn = await inventoryQuantity();
      expect(stockAfterReturn.site).toHaveLength(0);
      expect(stockAfterReturn.warehouse).toHaveLength(1);
      expect(stockAfterReturn.warehouse[0].quantity).toBe(1);
      const remission = await documents.createDirectDocument({ ...base, type: 'REMISSION', inventorySourceMode: 'WAREHOUSE',
        notes: `Fecha documento: ${dateAt(2)}`, items: [{ ...native, sourceWarehouseId: warehouse.id }] }, actor.id);
      const stockAfterRemission = await inventoryQuantity();
      expect(stockAfterRemission.site).toHaveLength(1);
      expect(stockAfterRemission.site[0].quantity).toBe(1);
      expect(stockAfterRemission.warehouse).toHaveLength(0);
      const remissionLine = await tx.documentItem.findFirstOrThrow({ where: { documentId: remission.id, assetId: promoted.asset.id } });
      expect(remissionLine.commercialSnapshot).toMatchObject({ status: 'RESOLVED', basePrice: '0',
        mode: { name: existingProfile ? 'Tarifa cero conservada' : 'Tarifa', pricing: { source: 'FIXED', amount: '0' } } });
      const finalReturn = await documents.createDirectDocument({ ...base, type: 'RETURN', notes: `Fecha documento: ${dateAt(3)}`,
        items: [{ ...native, sourceDocumentItemId: remissionLine.id }] }, actor.id);
      const stockAfterFinalReturn = await inventoryQuantity();
      expect(stockAfterFinalReturn.site).toHaveLength(0);
      expect(stockAfterFinalReturn.warehouse).toHaveLength(1);
      expect(stockAfterFinalReturn.warehouse[0].quantity).toBe(1);
      const countsBeforeRejection = await Promise.all([tx.document.count(), tx.documentItem.count(), tx.stockLedger.count()]);
      await expect(documents.createDirectDocument({ ...base, type: 'RETURN', notes: `Fecha documento: ${dateAt(4)}`,
        items: [{ ...native, sourceDocumentItemId: remissionLine.id }] }, actor.id)).rejects.toThrow();
      expect(await Promise.all([tx.document.count(), tx.documentItem.count(), tx.stockLedger.count()])).toEqual(countsBeforeRejection);
      expect(await legacyEvidence()).toEqual(beforeLegacy);
      const ledgers = await tx.stockLedger.findMany({ where: { assetId: promoted.asset.id, isOpeningBalance: false }, orderBy: { effectiveAt: 'asc' } });
      expect(ledgers.map(row => [row.movementType, Number(row.quantity), row.refDocumentId]))
        .toEqual([['IN', 1, firstReturn.id], ['OUT', -1, remission.id], ['IN', 1, finalReturn.id]]);
      expect(await tx.documentItem.count({ where: { accessoryId: legacy.id } })).toBe(1);
      throw rollback;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 90000 })).rejects.toBe(rollback);
    expect(await Promise.all([prisma.asset.count(), prisma.stockLedger.count(), prisma.document.count(), prisma.accessoryBalance.count(), prisma.accessoryMovement.count()])).toEqual(originalCounts);
  }, 100000);
});
