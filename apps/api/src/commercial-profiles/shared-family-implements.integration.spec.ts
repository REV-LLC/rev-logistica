import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { DocumentsService } from '../documents/documents.service';
import { AccessoriesService } from '../accessories/accessories.service';
import { EquipmentConfigurationService } from '../accessories/equipment-configuration.service';
import { validateDocumentConfiguration } from '../accessories/document-configuration';
import { AnnexSourceService } from '../annexes/annex-source.service';
import { CommercialProfilesService } from './commercial-profiles.service';
import { documentCommercialSnapshotsV2 } from './commercial-history-v2';

const url = process.env.IMPLEMENTS_QA_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.search ||
    !/^\/accessory_qa_[a-z0-9_]+$/.test(parsed.pathname))
    throw new Error('Shared-family tests require an explicitly selected local QA database.');
}

(url ? describe : describe.skip)('shared family, explicit compatibility and isolated prices (PostgreSQL)', () => {
  const prisma = new PrismaService({ datasources: { db: { url: url ?? 'postgresql://unused@127.0.0.1:1/accessory_qa_unused' } } });
  afterAll(() => prisma.$disconnect());

  it('creates equipment/implements in separate subfamilies, rejects unlinked peers and freezes each own tariff', async () => {
    const counts = () => Promise.all([prisma.asset.count(), prisma.sku.count(), prisma.document.count(),
      prisma.stockLedger.count(), prisma.commercialProfileRevision.count(), prisma.equipmentConfigurationEntry.count()]);
    const before = await counts();
    const rollback = new Error('QA_SHARED_FAMILY_ROLLBACK');
    await expect(prisma.$transaction(async tx => {
      const prefix = `QA_SHARED_${randomUUID().slice(0, 8)}`;
      const actor = await tx.user.findFirstOrThrow({ where: { role: 'ADMIN', active: true } });
      const warehouse = await tx.warehouse.findFirstOrThrow({ where: { type: 'OWN', active: true } });
      const family = await tx.assetFamily.create({ data: { code: prefix, name: `${prefix} Familia X`, controlType: 'SERIAL' } });
      const equipmentSubfamily = await tx.assetSubfamily.create({ data: { assetFamilyId: family.id, code: 'EQUIPOS', name: 'Equipos' } });
      const proxy = { ...tx, $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } as unknown as PrismaService;
      const config = new EquipmentConfigurationService(proxy, new AccessoriesService(proxy));
      const inventory = new InventoryService(proxy, { del: async () => undefined, get: async () => undefined, set: async () => undefined } as any, config);
      const profiles = new CommercialProfilesService(proxy);
      const input = { family: { id: family.id }, ownerWarehouseId: warehouse.id, warehouseCurrentId: warehouse.id };
      const parent = (await inventory.createSerializedAsset({ ...input, subfamily: { id: equipmentSubfamily.id },
        sku: { name: `${prefix} Equipo X` }, asset: {} }, actor.id)).asset;
      const child = (await inventory.createSerializedAsset({ ...input, subfamily: { name: 'Implementos Y' },
        sku: { name: `${prefix} Implemento Y` }, asset: { isImplement: true } }, actor.id)).asset;
      const childSku = await tx.sku.findUniqueOrThrow({ where: { id: child.skuId } });
      expect(childSku.assetFamilyId).toBe(family.id);
      expect(childSku.assetSubfamilyId).not.toBe(equipmentSubfamily.id);
      const outsider = (await inventory.createSerializedAsset({ ...input, subfamily: { id: childSku.assetSubfamilyId! },
        sku: { id: childSku.id }, asset: { isImplement: true } }, actor.id)).asset;
      expect(child.internalNumber).toBe(1);
      expect(outsider.internalNumber).toBe(2);
      expect((await config.get({ assetId: parent.id })).entries).toEqual([]);
      const candidates = await config.assetCandidates(prefix, 0, true);
      expect(candidates.items.map(item => item.id).sort()).toEqual([child.id, outsider.id].sort());
      expect(candidates.items.some(item => item.id === parent.id)).toBe(false);
      const lines = (id: string) => ({ type: 'REMISSION', items: [{ assetId: parent.id }, { assetId: id, componentParentAssetId: parent.id }] });
      await expect(validateDocumentConfiguration(tx, lines(child.id))).rejects.toThrow('no está permitida');
      await config.saveInTransaction(tx, { assetId: parent.id }, { version: 0, entries: [
        { id: randomUUID(), assetId: child.id, role: 'ACCESSORY', quantity: 1, defaultIncluded: true, required: false },
      ] }, actor.id);
      await expect(validateDocumentConfiguration(tx, lines(child.id))).resolves.toBeUndefined();
      await expect(validateDocumentConfiguration(tx, lines(outsider.id))).rejects.toThrow('no está permitida');
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
      const mode = (name: string, amount: string) => ({ id: randomUUID(), name, unit: 'DAY',
        minimum: { value: '0', basis: 'PER_RENTAL' }, pricing: { source: 'FIXED', amount }, conditions: [], parts: [] });
      const groupId = randomUUID();
      const familyProfile = await profiles.save({ scopeType: 'FAMILY', scopeId: family.id, expectedVersion: 0,
        groups: [{ id: groupId, name: 'Implementos', selectors: [{ kind: 'ASSET', id: child.id }] }],
        modes: [{ ...mode('Equipo X', '80000'), parts: [{ groupId, treatment: 'INDEPENDENT' }] }] }, actor.id);
      expect((await profiles.get('ASSET', parent.id)).inherited).toMatchObject({ scopeType: 'FAMILY' });
      expect((await profiles.get('ASSET', child.id)).inherited).toBeUndefined();
      expect((await profiles.get('SKU', child.skuId)).inherited).toBeUndefined();
      // A new document must not silently borrow the machine's family profile.
      const unsaved = { id: randomUUID(), type: 'REMISSION', docDate: new Date(), customerWorksiteId: null,
        items: [{ id: randomUUID(), assetId: outsider.id, asset: { ...outsider, sku: childSku }, sku: null, accessory: null }] } as any;
      const unresolved = await documentCommercialSnapshotsV2(tx, unsaved, false);
      expect([...unresolved.values()][0]).toMatchObject({ status: 'REVIEW' });
      expect([...unresolved.values()][0].frozenProfile).toBeUndefined();
      await profiles.save({ scopeType: 'SKU', scopeId: child.skuId, expectedVersion: 0, groups: [],
        modes: [mode('Implemento Y', '2000')] }, actor.id);
      expect((await profiles.get('ASSET', child.id)).inherited).toMatchObject({ scopeType: 'SKU' });
      await profiles.save({ scopeType: 'ASSET', scopeId: child.id, expectedVersion: 0, groups: [],
        modes: [mode('Esta unidad Y', '3000')] }, actor.id);
      const customer = await tx.customer.create({ data: { name: prefix } });
      const worksite = await tx.worksite.create({ data: { name: prefix } });
      const site = await tx.customerWorksite.create({ data: { customerId: customer.id, worksiteId: worksite.id } });
      const document = await new DocumentsService(proxy, inventory, {} as any, {} as any, {} as any).createDirectDocument({
        type: 'REMISSION', inventorySourceMode: 'WAREHOUSE', customerWorksiteId: site.id, warehouseId: warehouse.id,
        recipientPhone: '3001234567', items: [
          { assetId: parent.id, ownerWarehouseId: warehouse.id, sourceWarehouseId: warehouse.id },
          { assetId: child.id, componentParentAssetId: parent.id, ownerWarehouseId: warehouse.id, sourceWarehouseId: warehouse.id },
        ],
      }, actor.id);
      const snapshots = await tx.documentItem.findMany({ where: { documentId: document.id }, orderBy: { id: 'asc' } });
      expect(snapshots.find(row => row.assetId === parent.id)?.commercialSnapshot).toMatchObject({ status: 'RESOLVED', basePrice: '80000' });
      expect(snapshots.find(row => row.assetId === child.id)?.commercialSnapshot).toMatchObject({ status: 'RESOLVED', basePrice: '3000' });
      await profiles.save({ scopeType: 'FAMILY', scopeId: family.id, expectedVersion: familyProfile.version,
        groups: familyProfile.groups, modes: familyProfile.modes.map(row => ({ ...row, pricing: { source: 'FIXED', amount: '99999' } })) }, actor.id);
      expect(await tx.documentItem.findMany({ where: { documentId: document.id }, orderBy: { id: 'asc' } })).toEqual(snapshots);
      const annex = await new AnnexSourceService(proxy).prepare(site.id, `${day.slice(0, 7)}-01`, day, day);
      expect(annex.input.rentals.find(row => row.assetId === child.id)?.pricing.basePrice).toBe('3000');
      expect(annex.input.rentals.find(row => row.assetId === parent.id)?.pricing.basePrice).toBe('80000');
      expect(annex.sourceIssues.filter(issue => issue.code === 'COMMERCIAL_REVIEW')).toEqual([]);
      throw rollback;
    }, { timeout: 60000 })).rejects.toBe(rollback);
    expect(await counts()).toEqual(before);
  }, 70000);
});
