import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessoriesService } from '../accessories/accessories.service';
import { ImplementPromotionService } from '../accessories/implement-promotion.service';
import { EquipmentConfigurationService } from '../accessories/equipment-configuration.service';
import { InventoryService } from '../inventory/inventory.service';
import { DocumentsService } from '../documents/documents.service';
import { AnnexSourceService } from '../annexes/annex-source.service';
import { CommercialProfilesService } from './commercial-profiles.service';
import { inspectLegacyEquipmentOrigin } from '../documents/legacy-equipment-origin';
import { commercialBusinessDate } from './commercial-cutoff';

// Never fall back to DATABASE_URL. All fixtures and services roll back together.
const testUrl = process.env.IMPLEMENTS_QA_DATABASE_URL;
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.search ||
    !/^\/(configuration_ui_qa_|accessory_qa_)[a-z0-9_]+$/.test(parsed.pathname))
    throw new Error('Promoted implement annex integration requires an explicitly selected local QA database.');
}
(testUrl ? describe : describe.skip)('promoted implement annex in real PostgreSQL (always rolled back)', () => {
  const prisma = new PrismaService({ datasources: { db: { url: testUrl ?? 'postgresql://unused@127.0.0.1:1/accessory_qa_unused' } } });
  afterAll(() => prisma.$disconnect());

  it('reconciles the reviewed opening without inventing a remission, preserves zero pricing, and closes on a standard native return', async () => {
    const counts = () => Promise.all([prisma.document.count(), prisma.documentItem.count(), prisma.asset.count(),
      prisma.stockLedger.count(), prisma.accessoryMovement.count(), prisma.accessoryBalance.count(), prisma.implementIdentityBridge.count()]);
    const beforeCounts = await counts();
    const rollback = new Error('QA_PROMOTED_ANNEX_ROLLBACK');
    await expect(prisma.$transaction(async tx => {
      const prefix = `QA_IMPLEMENT_ANNEX_${randomUUID().slice(0, 8)}`;
      const actor = await tx.user.findFirstOrThrow({ where: { active: true, role: 'ADMIN' } });
      const warehouse = await tx.warehouse.findFirstOrThrow({ where: { active: true, type: 'OWN' } });
      const customer = await tx.customer.create({ data: { name: `${prefix} Cliente` } });
      const worksite = await tx.worksite.create({ data: { name: `${prefix} Obra` } });
      const site = await tx.customerWorksite.create({ data: { customerId: customer.id, worksiteId: worksite.id } });
      const parentFamily = await tx.assetFamily.create({ data: { name: `${prefix} Equipos`, code: `${prefix}_X`, controlType: 'SERIAL' } });
      const implementFamily = await tx.assetFamily.create({ data: { name: `${prefix} Implementos`, code: `${prefix}_Y`, controlType: 'SERIAL' } });
      const parentSubfamily = await tx.assetSubfamily.create({ data: { assetFamilyId: parentFamily.id, name: 'Estándar', code: 'ESTANDAR' } });
      const implementSubfamily = await tx.assetSubfamily.create({ data: { assetFamilyId: implementFamily.id, name: 'Estándar', code: 'ESTANDAR' } });
      const parentSku = await tx.sku.create({ data: { name: `${prefix} X`, assetFamilyId: parentFamily.id,
        assetSubfamilyId: parentSubfamily.id, chargeType: 'DAY', price: 100 } });
      const implementSku = await tx.sku.create({ data: { name: `${prefix} Y`, assetFamilyId: implementFamily.id,
        assetSubfamilyId: implementSubfamily.id, chargeType: 'DAY', price: 0 } });
      const parent = await tx.asset.create({ data: { skuId: parentSku.id, publicCode: `${prefix}_PARENT`, internalNumber: 1,
        warehouseOwnerId: warehouse.id, warehouseCurrentId: null } });
      // Historical import fixtures precede the evidence fingerprint. No real
      // historical rows are edited, even transiently, by this rehearsal.
      await tx.stockLedger.create({ data: { assetId: parent.id, ownerWarehouseId: warehouse.id, warehouseId: warehouse.id,
        movementType: 'ADJUST', quantity: 1, isOpeningBalance: true, effectiveAt: new Date('2026-09-01T12:00:00Z'), createdBy: actor.id } });
      const historical = await tx.document.create({ data: { type: 'REMISSION', status: 'CONFIRMED', createdBy: actor.id,
        warehouseId: warehouse.id, customerWorksiteId: site.id, consecutive: `${prefix}_HISTORICAL`, docDate: new Date('2026-09-25T12:00:00Z'),
        items: { create: { assetId: parent.id, condition: warehouse.id } } } });
      const parentSource = await tx.stockLedger.create({ data: { assetId: parent.id, ownerWarehouseId: warehouse.id,
        warehouseId: warehouse.id, customerWorksiteId: site.id, movementType: 'OUT', quantity: -1,
        refDocumentId: historical.id, refDocumentType: 'REMISSION', effectiveAt: historical.docDate, createdBy: actor.id } });
      let savepoint = 0;
      const proxy = { ...tx, $transaction: async (fn: (client: typeof tx) => unknown) => {
        const name = `qa_annex_step_${++savepoint}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
        try { const result = await fn(tx); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); return result; }
        catch (error) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`); throw error; }
      } } as unknown as PrismaService;
      const accessories = new AccessoriesService(proxy), profiles = new CommercialProfilesService(proxy);
      const legacy = await accessories.create({ name: `${prefix} Unidad Y`, kind: 'INDIVIDUAL', purpose: 'ACCESSORY',
        familyId: parentFamily.id, scope: 'ASSETS', assetIds: [parent.id], subfamilyIds: [], ownerWarehouseId: warehouse.id,
        warehouseId: warehouse.id, quantity: 1, requestId: randomUUID() }, actor.id);
      await tx.accessoryBalance.updateMany({ where: { accessoryId: legacy.id }, data: { quantity: 0 } });
      await tx.accessoryBalance.create({ data: { accessoryId: legacy.id, assetId: parent.id, customerWorksiteId: site.id,
        locationKey: `asset:${parent.id}:worksite:${site.id}`, quantity: 1 } });
      const mode = (amount: string) => ({ id: randomUUID(), name: 'Modalidad genérica', unit: 'DAY' as const,
        minimum: { value: '0', basis: 'PER_RENTAL' as const }, pricing: { source: 'FIXED' as const, amount }, conditions: [], parts: [] });
      await profiles.save({ scopeType: 'ACCESSORY', scopeId: legacy.id, expectedVersion: 0, effectiveFrom: '2026-10-01', groups: [], modes: [mode('0')] }, actor.id);
      const groupId = randomUUID();
      await profiles.save({ scopeType: 'ASSET', scopeId: parent.id, expectedVersion: 0, effectiveFrom: '2026-10-01',
        groups: [{ id: groupId, name: 'Implemento incluido', selectors: [{ kind: 'ACCESSORY', id: legacy.id }] }],
        modes: [{ ...mode('100'), parts: [{ groupId, treatment: 'INCLUDED' }] }] }, actor.id);
      const inspected = await inspectLegacyEquipmentOrigin(tx, parentSource.id, '2026-10-01');
      const parentOrigin = await tx.legacyEquipmentOrigin.create({ data: { sourceLedgerId: parentSource.id,
        effectiveFrom: new Date('2026-10-01T05:00:00Z'), reviewedBy: actor.id, note: 'Explicit QA fixture review',
        evidenceSnapshot: inspected.evidence as unknown as Prisma.InputJsonValue,
        commercialSnapshot: inspected.commercialSnapshot as unknown as Prisma.InputJsonValue } });
      const oldProfile = await profiles.get('ACCESSORY', legacy.id);
      const oldDelivery = await tx.document.create({ data: { type: 'REMISSION', status: 'CONFIRMED', createdBy: actor.id,
        warehouseId: warehouse.id, customerWorksiteId: site.id, consecutive: `${prefix}_OLD_IMPLEMENT`,
        docDate: new Date('2026-10-02T12:00:00Z'), items: { create: { accessoryId: legacy.id,
          componentParentAssetId: parent.id, quantity: 1, condition: warehouse.id, compositionNodeId: randomUUID(),
          parentLegacyOriginId: parentOrigin.id, accessoryName: legacy.name, accessoryKind: 'INDIVIDUAL',
          accessorySourceBalanceId: legacy.balances[0].id, commercialSnapshot: {
            schemaVersion: 2, status: 'RESOLVED', parts: [], basePrice: '0', catalog: { unit: 'DAY', price: '0' },
            frozenProfile: { id: oldProfile.id!, version: oldProfile.version, effectiveFrom: oldProfile.effectiveFrom!,
              groups: oldProfile.groups, modes: oldProfile.modes },
          } as unknown as Prisma.InputJsonValue } } }, include: { items: true } });
      const oldLine = oldDelivery.items[0];
      await tx.accessoryMovement.create({ data: { accessoryId: legacy.id, type: 'ASSIGN', quantity: 1,
        documentId: oldDelivery.id, requestId: `document:${oldDelivery.id}:item:${oldLine.id}`, fingerprint: prefix,
        note: 'QA historical documentary delivery',
        createdBy: actor.id, from: { warehouseId: warehouse.id }, to: { assetId: parent.id, customerWorksiteId: site.id } } });
      const evidence = async () => ({
        document: await tx.document.findUnique({ where: { id: historical.id }, include: { items: true } }),
        parentSource: await tx.stockLedger.findUnique({ where: { id: parentSource.id } }),
        parentOrigin: await tx.legacyEquipmentOrigin.findUnique({ where: { id: parentOrigin.id } }),
        accessory: await tx.accessory.findUnique({ where: { id: legacy.id } }),
        balances: await tx.accessoryBalance.findMany({ where: { accessoryId: legacy.id }, orderBy: { id: 'asc' } }),
        movements: await tx.accessoryMovement.findMany({ where: { accessoryId: legacy.id }, orderBy: { id: 'asc' } }),
        oldDelivery: await tx.document.findUnique({ where: { id: oldDelivery.id }, include: { items: true } }),
      });
      const frozenEvidence = await evidence();
      const effectiveAt = new Date(Date.now() + 60000), day = commercialBusinessDate(effectiveAt);
      const promotion = new ImplementPromotionService(proxy), input = { accessoryId: legacy.id, skuId: implementSku.id,
        effectiveAt, parentLegacyOriginId: parentOrigin.id, sourceDocumentItemId: oldLine.id };
      const plan = await promotion.previewInTransaction(tx, input, actor.id);
      if (plan.status !== 'READY') throw new Error('The fresh QA identity must be ready.');
      const promoted = await promotion.promoteInTransaction(tx, input, actor.id, plan.fingerprint);
      const configuration = new EquipmentConfigurationService(proxy, accessories);
      const cache = { del: async () => undefined, get: async () => undefined, set: async () => undefined };
      const inventory = new InventoryService(proxy, cache as any, configuration);
      const documents = new DocumentsService(proxy, inventory, {} as any, {} as any, {} as any);
      const source = new AnnexSourceService(proxy);
      const periodFrom = `${day.slice(0, 7)}-01`, periodTo = `${day.slice(0, 7)}-15`;
      const prepared = await source.prepare(site.id, periodFrom, periodTo, day);
      const child = prepared.input.rentals.filter(row => row.assetId === promoted.asset.id);
      expect(child).toHaveLength(1);
      expect(child[0]).toMatchObject({ source: { reference: promoted.bridge.openingLedgerId },
        commercial: { status: 'RESOLVED', contextualZero: true, basePrice: '0.00' }, pricing: { basePrice: '0.00' } });
      const historicalChildren = prepared.input.rentals.filter(row => row.accessoryId === legacy.id);
      expect(historicalChildren.length).toBeGreaterThan(0);
      expect(historicalChildren.every(row => row.commercialInterval!.to < day)).toBe(true);
      expect(child[0].commercialInterval!.from).toBe(day);
      expect(prepared.sourceIssues.filter(issue => ['COMMERCIAL_REVIEW', 'INVENTORY_REVIEW'].includes(issue.code))).toEqual([]);
      expect(prepared.result.lines.filter(line => line.key.startsWith(child[0].id + ':')).every(line => line.net === '0.00')).toBe(true);
      expect(await evidence()).toEqual(frozenEvidence);
      // Today's price/profile may change; the reviewed opening stays frozen.
      await tx.sku.update({ where: { id: implementSku.id }, data: { price: 999 } });
      await profiles.save({ scopeType: 'ASSET', scopeId: promoted.asset.id, expectedVersion: 1, effectiveFrom: day, groups: [], modes: [mode('123')] }, actor.id);
      const later = await source.prepare(site.id, periodFrom, periodTo, day);
      expect(later.input.rentals.find(row => row.assetId === promoted.asset.id)?.pricing.basePrice).toBe('0.00');
      const returned = await documents.createDirectDocument({ type: 'RETURN', customerWorksiteId: site.id, warehouseId: warehouse.id,
        recipientPhone: '3001234567', notes: `Fecha documento: ${new Date(effectiveAt.getTime() + 60000).toISOString()}`,
        items: [{ assetId: promoted.asset.id, ownerWarehouseId: warehouse.id, sourceDocumentItemId: oldLine.id }] }, actor.id);
      const afterReturn = await source.prepare(site.id, periodFrom, periodTo, day);
      const returnedChild = afterReturn.input.rentals.find(row => row.assetId === promoted.asset.id)!;
      expect(returnedChild.returns).toHaveLength(1);
      expect(returnedChild.returns[0]).toMatchObject({ date: day, quantity: '1' });
      expect(returnedChild.commercial?.status).toBe('RESOLVED');
      expect(await tx.documentItem.findFirst({ where: { documentId: returned.id, assetId: promoted.asset.id } })).toMatchObject({ sourceDocumentItemId: oldLine.id });
      const newDeliveryAt = new Date(effectiveAt.getTime() + 86400000 + 120000), nextDay = commercialBusinessDate(newDeliveryAt);
      const newDelivery = await documents.createDirectDocument({ type: 'REMISSION', inventorySourceMode: 'WAREHOUSE',
        customerWorksiteId: site.id, warehouseId: warehouse.id, recipientPhone: '3001234567',
        notes: `Fecha documento: ${newDeliveryAt.toISOString()}`, items: [{ assetId: promoted.asset.id,
          ownerWarehouseId: warehouse.id, sourceWarehouseId: warehouse.id }] }, actor.id);
      const afterNewDelivery = await source.prepare(site.id, periodFrom, periodTo, nextDay);
      const nativeLots = afterNewDelivery.input.rentals.filter(row => row.assetId === promoted.asset.id);
      expect(nativeLots).toHaveLength(2);
      const openingLot = nativeLots.find(row => row.source.reference === promoted.bridge.openingLedgerId)!;
      expect(openingLot.returns).toHaveLength(1);
      expect(openingLot.pricing.basePrice).toBe('0.00');
      expect(openingLot.commercialInterval?.to).toBe(day);
      const newLot = nativeLots.find(row => row.source.reference !== promoted.bridge.openingLedgerId)!;
      expect(newLot).toMatchObject({ deliveredOn: nextDay, pricing: { basePrice: '123' }, returns: [], commercial: { status: 'RESOLVED' } });
      const newLedger = await tx.stockLedger.findUniqueOrThrow({ where: { id: newLot.source.reference } });
      expect(newLedger.refDocumentId).toBe(newDelivery.id);
      expect(afterNewDelivery.sourceIssues.filter(issue => ['COMMERCIAL_REVIEW', 'INVENTORY_REVIEW'].includes(issue.code))).toEqual([]);
      expect(await evidence()).toEqual(frozenEvidence);
      expect(await tx.documentItem.count({ where: { accessoryId: legacy.id } })).toBe(1);
      throw rollback;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 90000 })).rejects.toBe(rollback);
    expect(await counts()).toEqual(beforeCounts);
  }, 100000);
});
