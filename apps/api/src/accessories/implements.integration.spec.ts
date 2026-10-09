import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AccessoriesService } from './accessories.service';
import { EquipmentConfigurationService } from './equipment-configuration.service';
import { validateDocumentConfiguration } from './document-configuration';

const url = process.env.IMPLEMENTS_QA_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !/^\/(configuration_ui_qa_|accessory_qa_)[a-z0-9_]+$/.test(parsed.pathname))
    throw new Error('Implement tests require an explicitly selected local QA database.');
}
(url ? describe : describe.skip)('native implements in PostgreSQL (always rolled back)', () => {
  const prisma = new PrismaService({ datasources: { db: { url: url ?? 'postgresql://unused@127.0.0.1:1/accessory_qa_unused' } } });
  afterAll(() => prisma.$disconnect());
  it('creates asset and bulk stock once, links explicit identities, and treats families only as recommendations', async () => {
    const rollback = new Error('QA_ROLLBACK');
    await expect(prisma.$transaction(async tx => {
      const prefix = `QA_IMPL_${randomUUID().slice(0, 8)}`;
      const warehouse = await tx.warehouse.findFirstOrThrow({ where: { type: 'OWN' } });
      const actor = await tx.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
      const serialFamily = await tx.assetFamily.create({ data: { code: `${prefix}_SERIAL`, name: `${prefix} Unidades`, controlType: 'SERIAL' } });
      const bulkFamily = await tx.assetFamily.create({ data: { code: `${prefix}_BULK`, name: `${prefix} Consumibles`, controlType: 'BULK' } });
      const routeFamily = await tx.assetFamily.create({ data: { code: `${prefix}_ROUTE`, name: `${prefix} Implementos recomendados`, controlType: 'SERIAL' } });
      const subfamily = await tx.assetSubfamily.create({ data: { assetFamilyId: serialFamily.id, code: 'ESTANDAR', name: 'Estándar' } });
      const proxy = { ...tx, $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } as unknown as PrismaService;
      const configService = new EquipmentConfigurationService(proxy, new AccessoriesService(proxy));
      const inventory = new InventoryService(proxy, { del: async () => undefined } as any, configService);
      const originalAccessoryCount = await tx.accessory.count();
      const input = (name: string, isImplement: boolean) => ({ family: { id: serialFamily.id }, subfamily: { id: subfamily.id },
        sku: { name }, asset: { description: name, isImplement }, ownerWarehouseId: warehouse.id, warehouseCurrentId: warehouse.id });
      const parent = await inventory.createSerializedAsset(input(`${prefix} Equipo X`, false), actor.id);
      const child = await inventory.createSerializedAsset(input(`${prefix} Implemento Y`, true), actor.id);
      const bulk = await inventory.addBulkAdjustment({ family: { id: bulkFamily.id }, sku: { name: `${prefix} Consumible Z`, isImplement: true, isConsumable: true },
        ownerWarehouseId: warehouse.id, warehouseId: warehouse.id, quantity: 10 }, actor.id);
      expect(child.asset.isImplement).toBe(true);
      expect(await tx.accessory.count()).toBe(originalAccessoryCount);
      expect(await tx.stockLedger.count({ where: { assetId: child.asset.id } })).toBe(1);
      expect(await tx.sku.findUniqueOrThrow({ where: { id: bulk.sku.id } })).toMatchObject({ isImplement: true, isConsumable: true });
      const entry = { role: 'ACCESSORY' as const, quantity: 1, defaultIncluded: false, required: false };
      const saved = await configService.saveInTransaction(tx, { assetId: parent.asset.id }, { version: 0, entries: [
        { ...entry, id: randomUUID(), assetId: child.asset.id },
        { ...entry, id: randomUUID(), skuId: bulk.sku.id },
        { ...entry, id: randomUUID(), familyId: routeFamily.id, recommendation: true },
        { ...entry, id: randomUUID(), familyId: bulkFamily.id, recommendation: true, templateParentFamilyId: routeFamily.id },
      ] }, actor.id);
      expect(saved.entries.map(row => row.skuId).filter(Boolean)).toEqual([bulk.sku.id]);
      expect(saved.entries.find(row => row.familyId === bulkFamily.id)?.templateParentFamilyId).toBe(routeFamily.id);
      // Editing an existing row with an old-client payload cannot resurrect
      // requirements or caps, even when its proposed quantity exceeds the cap.
      const edited = await configService.saveInTransaction(tx, { assetId: parent.asset.id }, {
        version: saved.version, entries: saved.entries.map(row => ({
          ...entry, id: row.id, ...(row.assetId ? { assetId: row.assetId } : {}),
          ...(row.skuId ? { skuId: row.skuId, quantity: 3 } : {}),
          ...(row.familyId ? { familyId: row.familyId } : {}),
          recommendation: false, required: true, maximumQuantity: 1,
        })),
      }, actor.id);
      expect(edited.entries.every(row => row.recommendation && !row.required && row.maximumQuantity == null)).toBe(true);
      // Omitting a field an old client does not understand must not erase the
      // explicit route; no physical identities are inferred by family edges.
      expect(edited.entries.find(row => row.familyId === bulkFamily.id)?.templateParentFamilyId).toBe(routeFamily.id);
      expect(edited.entries.filter(row => row.assetId).map(row => row.assetId)).toEqual([child.asset.id]);
      const reconnected = await configService.saveInTransaction(tx, { assetId: parent.asset.id }, {
        version: edited.version, entries: edited.entries.map(row => ({
          ...entry, id: row.id, ...(row.assetId ? { assetId: row.assetId } : {}),
          ...(row.skuId ? { skuId: row.skuId, quantity: row.quantity } : {}),
          ...(row.familyId ? { familyId: row.familyId, templateParentFamilyId: null } : {}),
          recommendation: row.recommendation,
        })),
      }, actor.id);
      expect(reconnected.entries.find(row => row.familyId === bulkFamily.id)?.templateParentFamilyId).toBeNull();
      const routeRevisions = await tx.equipmentConfigurationRevision.findMany({
        where: { configurationId: saved.id },
      });
      expect(routeRevisions.map(row => row.after)).toEqual(expect.arrayContaining([
        expect.objectContaining({ entries: expect.arrayContaining([
          expect.objectContaining({ familyId: bulkFamily.id, templateParentFamilyId: null }),
        ]) }),
      ]));
      await expect(validateDocumentConfiguration(tx, { type: 'REMISSION', items: [{ assetId: parent.asset.id }] })).resolves.toBeUndefined();
      await expect(validateDocumentConfiguration(tx, { type: 'REMISSION', items: [{ assetId: parent.asset.id },
        { assetId: child.asset.id, componentParentAssetId: parent.asset.id }, { skuId: bulk.sku.id, componentParentAssetId: parent.asset.id, quantity: 2 }] })).resolves.toBeUndefined();
      throw rollback;
    }, { timeout: 30000 })).rejects.toBe(rollback);
  });
});
