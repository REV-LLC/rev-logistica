import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AccessoriesService } from './accessories.service';
import { EquipmentConfigurationService } from './equipment-configuration.service';
import { AssetsService } from '../assets/assets.service';
import { DocumentsService } from '../documents/documents.service';
import { documentReturnOrigins } from '../documents/document-return-origins';
import {
  EquipmentConfigurationDto,
  EquipmentConfigurationEntryDto,
} from './dto/equipment-configuration.dto';

// Explicit opt-in. Never inherit DATABASE_URL or modify production/snapshot fixtures.
const testUrl = process.env.ACCESSORY_TEST_DATABASE_URL;
if (testUrl) {
  const parsed = new URL(testUrl);
  if (
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    !/^\/accessory_qa_[a-z0-9_]+$/.test(parsed.pathname)
  )
    throw new Error(
      'Configuration tests require a dedicated local accessory_qa_* database.',
    );
}

(testUrl ? describe : describe.skip)(
  'Equipment configuration with real PostgreSQL',
  () => {
    const prisma = new PrismaService({
      datasources: {
        db: {
          url: testUrl ?? 'postgresql://unused@127.0.0.1:1/accessory_qa_unused',
        },
      },
    });
    const parts = new AccessoriesService(prisma);
    const configs = new EquipmentConfigurationService(prisma, parts);
    const conditions = new AssetsService(prisma, { del: async () => undefined } as any);
    const inventory = new InventoryService(
      prisma,
      { del: async () => undefined } as any,
      configs,
    );
    const run = randomUUID().slice(0, 8).toUpperCase();
    const userId = randomUUID();
    let ownerId: string;
    let warehouseId: string;
    let familyId: string;
    let subfamilyId: string;
    let assetId: string;
    let otherAssetId: string;
    let roofId: string;
    const documentIds: string[] = [];
    let customerId: string | undefined, worksiteId: string | undefined, customerWorksiteId: string | undefined;
    const newRow = (
      changes: Partial<EquipmentConfigurationEntryDto> = {},
    ): EquipmentConfigurationEntryDto => ({
      id: randomUUID(),
      role: 'COMPONENT',
      quantity: 1,
      defaultIncluded: true,
      required: false,
      newPart: {
        name: `QA TECHO ${run}`,
        kind: 'INDIVIDUAL',
        initialQuantity: 1,
        exclusive: true,
      },
      ...changes,
    });
    const payload = (entries: EquipmentConfigurationEntryDto[] = []) => ({
      ownerWarehouseId: warehouseId,
      warehouseCurrentId: warehouseId,
      family: { id: familyId },
      subfamily: { id: subfamilyId },
      sku: { name: `QA EQUIPO ${run}` },
      asset: {},
      configuration: { version: 0, entries },
    });
    const draft = (value: {
      version: number;
      entries: any[];
    }): EquipmentConfigurationDto => ({
      version: value.version,
      entries: value.entries.map(
        ({
          id,
          role,
          assetId,
          accessoryId,
          quantity,
          defaultIncluded,
          required,
        }) => ({
          id,
          role,
          ...(assetId ? { assetId } : {}),
          ...(accessoryId ? { accessoryId } : {}),
          quantity,
          defaultIncluded,
          required,
        }),
      ),
    });

    beforeAll(async () => {
      await prisma.$connect();
      await prisma.user.create({
        data: {
          id: userId,
          email: `qa-config-${run.toLowerCase()}@example.invalid`,
          passwordHash: 'test-only-disabled',
          role: 'OFFICE',
        },
      });
      ownerId = (
        await prisma.owner.create({ data: { name: `QA CONFIG ${run}` } })
      ).id;
      warehouseId = (
        await prisma.warehouse.create({
          data: {
            name: `QA CONFIG ${run}`,
            type: 'OWN',
            ownerCompanyId: ownerId,
          },
        })
      ).id;
      familyId = (
        await prisma.assetFamily.create({
          data: {
            code: `QC${run}`,
            name: `QA CONFIG ${run}`,
            controlType: 'SERIAL',
          },
        })
      ).id;
      subfamilyId = (
        await prisma.assetSubfamily.create({
          data: { code: `QC${run}`, name: '3 TN', assetFamilyId: familyId },
        })
      ).id;
      otherAssetId = (await inventory.createSerializedAsset(payload(), userId))
        .asset.id;
    });

    afterAll(async () => {
      if (warehouseId) {
        const owned = { ownerWarehouseId: warehouseId };
        const ownedAssets = { warehouseOwnerId: warehouseId };
        const configurationIds = (
          await prisma.equipmentConfiguration.findMany({
            where: { OR: [{ asset: ownedAssets }, { accessory: owned }] },
            select: { id: true },
          })
        ).map((c) => c.id);
        await prisma.equipmentConfigurationRevision.deleteMany({
          where: { configurationId: { in: configurationIds } },
        });
        await prisma.equipmentConfiguration.deleteMany({
          where: { id: { in: configurationIds } },
        });
        await prisma.accessoryParent.deleteMany({
          where: { accessory: owned },
        });
        await prisma.accessoryMovement.deleteMany({
          where: { accessory: owned },
        });
        await prisma.accessoryRevision.deleteMany({
          where: { accessory: owned },
        });
        await prisma.accessoryBalance.deleteMany({
          where: { accessory: owned },
        });
        await prisma.accessory.deleteMany({ where: owned });
        await prisma.fileObject.deleteMany({ where: { documentId: { in: documentIds } } });
        await prisma.documentItem.deleteMany({ where: { documentId: { in: documentIds } } });
        await prisma.stockLedger.deleteMany({ where: { asset: ownedAssets } });
        await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
        await prisma.assetConditionEvent.deleteMany({ where: { asset: ownedAssets } });
        const skus = (
          await prisma.asset.findMany({
            where: ownedAssets,
            select: { skuId: true },
          })
        ).map((a) => a.skuId);
        await prisma.assetMotorCompatibility.deleteMany({ where: { motor: ownedAssets } });
        await prisma.asset.deleteMany({ where: ownedAssets });
        await prisma.sku.deleteMany({ where: { id: { in: skus } } });
        await prisma.assetInternalCounter.deleteMany({
          where: { ownerWarehouseId: warehouseId },
        });
        const families = { code: { endsWith: run } };
        await prisma.assetSubfamily.deleteMany({
          where: { assetFamily: families },
        });
        await prisma.assetFamily.deleteMany({ where: families });
        await prisma.warehouse.delete({ where: { id: warehouseId } });
        await prisma.owner.delete({ where: { id: ownerId } });
      }
      if (customerWorksiteId) await prisma.customerWorksite.delete({ where: { id: customerWorksiteId } });
      if (worksiteId) await prisma.worksite.delete({ where: { id: worksiteId } });
      if (customerId) await prisma.customer.delete({ where: { id: customerId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    });

    it('creates equipment without a template, its exclusive roof and optional discs atomically', async () => {
      const input = payload([
        newRow(),
        newRow({
          role: 'ACCESSORY',
          quantity: 2,
          defaultIncluded: false,
          newPart: {
            name: `QA DISCOS ${run}`,
            kind: 'CONSUMABLE',
            initialQuantity: 12,
            exclusive: false,
          },
        }),
      ]);
      const created = await inventory.createSerializedAsset(
        {
          ...input,
          family: { code: `QN${run}`, name: `QA NUEVA ${run}` },
          subfamily: { code: `QN${run}`, name: '300 KG' },
        },
        userId,
      );
      assetId = created.asset.id;
      const config = await configs.get({ assetId });
      expect(config.version).toBe(1);
      expect(config.entries).toHaveLength(2);
      const roof = config.entries.find((e) => e.role === 'COMPONENT')!;
      roofId = roof.accessoryId!;
      expect(roof.accessory?.exclusiveAssetId).toBe(assetId);
      expect(roof.accessory?.internalCode).toMatch(/^ACC-/);
      expect(roof.defaultIncluded).toBe(true);
      expect(roof.required).toBe(false);
      const discs = await parts.get(
        config.entries.find((e) => e.role === 'ACCESSORY')!.accessoryId!,
      );
      expect(discs.balances[0].quantity).toBe(12);
      expect(
        await prisma.accessoryMovement.count({
          where: { accessoryId: discs.id, type: 'CONSUME' },
        }),
      ).toBe(0);
    });
    it('rolls back equipment, SKU, parts and opening balances if a later configuration row fails', async () => {
      const before = await Promise.all([
        prisma.asset.count(),
        prisma.sku.count(),
        prisma.accessory.count(),
        prisma.stockLedger.count(),
      ]);
      const invalid = newRow({ newPart: undefined, accessoryId: randomUUID() });
      await expect(
        inventory.createSerializedAsset(payload([newRow(), invalid]), userId),
      ).rejects.toThrow();
      const after = await Promise.all([
        prisma.asset.count(),
        prisma.sku.count(),
        prisma.accessory.count(),
        prisma.stockLedger.count(),
      ]);
      expect(after).toEqual(before);
    });
    it('finds existing equipment by name or public code without exposing full inventory records', async () => {
      const asset = await prisma.asset.findUniqueOrThrow({
        where: { id: assetId },
      });
      const byCode = await configs.assetCandidates(asset.publicCode);
      expect(byCode.items.map((item) => item.id)).toContain(assetId);
      expect(byCode.items.find(item => item.id === assetId)).toMatchObject({
        id: assetId, publicCode: asset.publicCode, isImplement: false,
      });
      expect(byCode.items.every(item => !('ledger' in item) && !('passwordHash' in item))).toBe(true);
      const byName = await configs.assetCandidates(`QA EQUIPO ${run}`);
      expect(byName.items.length).toBeGreaterThan(0);
      await expect(configs.assetCandidates('', -1)).rejects.toThrow('inválida');
    });
    it('does not duplicate or move inventory when editing defaults and required flags', async () => {
      const current = draft(await configs.get({ assetId }));
      current.entries[0].defaultIncluded = false;
      current.entries[0].required = true;
      const before = await parts.get(roofId);
      await configs.save({ assetId }, current, userId);
      const after = await parts.get(roofId);
      expect(after.balances).toEqual(before.balances);
      expect(after.version).toBe(before.version);
      expect((await configs.get({ assetId })).entries[0]).toMatchObject({
        recommendation: true, required: false, maximumQuantity: null,
      });
    });
    it('prevents reuse of an exclusive roof by another equipment and preserving the failed version', async () => {
      const current = draft(await configs.get({ assetId: otherAssetId }));
      current.entries.push(newRow({ newPart: undefined, accessoryId: roofId }));
      await expect(
        configs.save({ assetId: otherAssetId }, current, userId),
      ).rejects.toThrow('no es compatible');
      expect((await configs.get({ assetId: otherAssetId })).version).toBe(
        current.version,
      );
    });
    it('rejects stale and simultaneous saves instead of overwriting another person', async () => {
      const current = draft(await configs.get({ assetId }));
      const results = await Promise.allSettled([
        configs.save({ assetId }, current, userId),
        configs.save({ assetId }, current, userId),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      await expect(configs.save({ assetId }, current, userId)).rejects.toThrow(
        'Recarga',
      );
    });
    it('preserves part identity and history after removing it from the configuration', async () => {
      const current = draft(await configs.get({ assetId }));
      const before = await parts.get(roofId);
      current.entries = current.entries.filter((e) => e.accessoryId !== roofId);
      await configs.save({ assetId }, current, userId);
      const after = await parts.get(roofId);
      expect(after.balances).toEqual(before.balances);
      expect(after.exclusiveAssetId).toBe(assetId);
      expect(
        await prisma.accessoryMovement.count({
          where: { accessoryId: roofId },
        }),
      ).toBe(1);
      expect(
        await prisma.equipmentConfigurationRevision.count({
          where: { configuration: { assetId } },
        }),
      ).toBeGreaterThan(1);
    });
    it('preserves existing APT identity and allows nested configuration without circular links', async () => {
      const root = draft(await configs.get({ assetId }));
      root.entries.push(
        newRow({
          newPart: undefined,
          assetId: otherAssetId,
          role: 'ACCESSORY',
        }),
      );
      const assetCount = await prisma.asset.count();
      await configs.save({ assetId }, root, userId);
      expect(await prisma.asset.count()).toBe(assetCount);
      const nested = draft(await configs.get({ assetId: otherAssetId }));
      nested.entries.push(
        newRow({
          role: 'ACCESSORY',
          defaultIncluded: false,
          newPart: {
            name: `QA PUNTAS ${run}`,
            kind: 'CONSUMABLE',
            initialQuantity: 5,
            exclusive: false,
          },
        }),
      );
      await configs.save({ assetId: otherAssetId }, nested, userId);
      const cycle = draft(await configs.get({ assetId: otherAssetId }));
      cycle.entries.push(
        newRow({ newPart: undefined, role: 'ACCESSORY', assetId }),
      );
      await expect(
        configs.save({ assetId: otherAssetId }, cycle, userId),
      ).rejects.toThrow('sí mismo');
    });
    it('creates accessories of an individualized accessory and protects configured compatibility', async () => {
      const root = draft(await configs.get({ assetId: otherAssetId }));
      root.entries.push(
        newRow({
          role: 'ACCESSORY',
          newPart: {
            name: `QA APT ${run}`,
            kind: 'INDIVIDUAL',
            initialQuantity: 1,
            exclusive: false,
          },
        }),
      );
      const saved = await configs.save({ assetId: otherAssetId }, root, userId);
      const aptId = saved.entries.find(
        (e) => e.accessory?.name === `QA APT ${run}`,
      )!.accessoryId!;
      const nested = await configs.save(
        { accessoryId: aptId },
        {
          version: 0,
          entries: [
            newRow({
              role: 'ACCESSORY',
              newPart: {
                name: `QA MANGUERA ${run}`,
                kind: 'RETURNABLE',
                initialQuantity: 3,
                exclusive: false,
              },
            }),
          ],
        },
        userId,
      );
      const hose = await parts.get(nested.entries[0].accessoryId!);
      expect(hose.scope).toBe('ACCESSORIES');
      expect(hose.compatibleParents[0].parentAccessoryId).toBe(aptId);
      await expect(
        parts.update(
          hose.id,
          {
            name: hose.name,
            kind: hose.kind,
            familyId: hose.familyId,
            scope: 'FAMILY',
            assetIds: [],
            subfamilyIds: [],
            parentAccessoryIds: [],
            version: hose.version,
            active: true,
          },
          userId,
        ),
      ).rejects.toThrow('configuración');
      const updated = await parts.update(
        hose.id,
        {
          name: 'MANGUERA RENOMBRADA',
          kind: hose.kind,
          familyId: hose.familyId,
          scope: hose.scope,
          assetIds: [],
          subfamilyIds: [],
          parentAccessoryIds: [aptId],
          version: hose.version,
          active: true,
        },
        userId,
      );
      expect(updated.compatibleParents).toHaveLength(1);
      expect(updated.balances).toEqual(hose.balances);
    });
  },
);
