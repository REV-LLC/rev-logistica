import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AccessoriesService } from './accessories.service';
import { EquipmentMotorsService } from './equipment-motors.service';
import { EquipmentConfigurationService } from './equipment-configuration.service';
import { AssetsService } from '../assets/assets.service';
import { DocumentsService } from '../documents/documents.service';
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
    const motors = new EquipmentMotorsService(prisma);
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

    const createInterchangeable = async () => (await inventory.createSerializedAsset({ ...payload(), asset: { interchangeableMotor: true } }, userId)).asset.id;
    const version = async (id: string) => (await configs.get({ assetId: id })).version;
    const details = (ids: string[]) => ({ brand: 'HONDA QA', model: 'GX ' + run, powerHp: 6.5, fuel: 'GASOLINA' as const, compatibleEquipmentIds: ids });

    it('creates a real motor asset, transfers it atomically and records both equipment histories without stock movements', async () => {
      const source = await createInterchangeable(), target = await createInterchangeable();
      const initialVersion = await version(source);
      const created = await motors.assign(source, { version: initialVersion, newMotor: details([source, target]) }, userId);
      const motorId = created.assignedMotorId!;
      const motor = await motors.get(motorId);
      expect(motor.description).toBe('HONDA QA 6.5 HP GX ' + run);
      expect(Number(motor.motorPowerHp)).toBe(6.5);
      expect((await motors.candidates(run)).items.some(m => m.id === motorId && m.assignedToMixer?.id === source)).toBe(true);
      const stock = await prisma.stockLedger.findMany({ where: { assetId: motorId } });
      expect(stock).toHaveLength(1);
      const targetBefore = await version(target);
      await motors.assign(target, { version: targetBefore, motorId, expectedSourceId: source }, userId);
      expect((await prisma.asset.findUniqueOrThrow({ where: { id: source } })).assignedMotorId).toBeNull();
      expect((await prisma.asset.findUniqueOrThrow({ where: { id: target } })).assignedMotorId).toBe(motorId);
      expect(await prisma.stockLedger.findMany({ where: { assetId: motorId } })).toEqual(stock);
      const sourceHistory = await configs.motorHistory(source), targetHistory = await configs.motorHistory(target);
      expect(sourceHistory).toHaveLength(2);
      expect(sourceHistory[0].after).toMatchObject({ motor: { assignedMotorId: null } });
      expect(targetHistory[0].after).toMatchObject({ motor: { assignedMotorId: motorId } });
      expect((sourceHistory[0].after as any).operationId).toBe((targetHistory[0].after as any).operationId);
      await expect(motors.assign(target, { version: targetBefore, motorId: null }, userId)).rejects.toThrow('equipo cambió');
      const current = await configs.get({ assetId: target });
      await expect(configs.save({ assetId: target }, { ...draft(current), entries: [{ id: randomUUID(), assetId: motorId,
        role: 'COMPONENT', quantity: 1, defaultIncluded: true, required: false }] }, userId)).rejects.toThrow('botón Motor');
      await motors.assign(target, { version: await version(target), motorId: null }, userId);
      expect((await motors.get(motorId)).assignedToMixer).toBeNull();
      expect(await prisma.stockLedger.findMany({ where: { assetId: motorId } })).toEqual(stock);
    });

    it('rejects invalid compatibility, unenabled equipment and stale source without detaching anything', async () => {
      const source = await createInterchangeable(), target = await createInterchangeable();
      const created = await motors.assign(source, { version: await version(source), newMotor: details([source]) }, userId);
      const motorId = created.assignedMotorId!;
      await expect(motors.assign(target, { version: await version(target), motorId, expectedSourceId: source }, userId)).rejects.toThrow('no es compatible');
      await expect(motors.assign(target, { version: await version(target), motorId, expectedSourceId: null }, userId)).rejects.toThrow('asignación del motor cambió');
      await expect(motors.assign(otherAssetId, { version: await version(otherAssetId), motorId, expectedSourceId: source }, userId)).rejects.toThrow('no tiene habilitado');
      expect((await motors.get(motorId)).assignedToMixer?.id).toBe(source);
      const count = await prisma.asset.count({ where: { warehouseOwnerId: warehouseId } });
      await expect(motors.assign(target, { version: await version(target), newMotor: details([otherAssetId, target]) }, userId)).rejects.toThrow('equipos activos');
      expect(await prisma.asset.count({ where: { warehouseOwnerId: warehouseId } })).toBe(count);
    });

    it('edits motor details and compatibility while preserving identity and auditing changes', async () => {
      const source = await createInterchangeable(), target = await createInterchangeable();
      const { assignedMotorId } = await motors.assign(source, { version: await version(source), newMotor: details([source]) }, userId);
      const motor = await motors.get(assignedMotorId!);
      await expect(motors.edit(motor.id, { ...details([target]), version: motor.motorVersion }, userId)).rejects.toThrow('incluir el equipo');
      const updated = await motors.edit(motor.id, { ...details([source, target]), brand: 'EDITADO', powerHp: 9, version: motor.motorVersion }, userId);
      expect(updated.publicCode).toBe(motor.publicCode);
      expect(updated.internalNumber).toBe(motor.internalNumber);
      expect(updated.description).toBe('EDITADO 9 HP GX ' + run);
      expect(updated.motorCompatibility).toHaveLength(2);
      await expect(motors.edit(motor.id, { ...details([source]), version: motor.motorVersion }, userId)).rejects.toThrow('motor cambió');
      expect(await prisma.equipmentConfigurationRevision.count({ where: { configuration: { assetId: motor.id } } })).toBe(1);
    });

    it('serializes concurrent transfers so a stale selection cannot steal a just-assigned motor', async () => {
      const source = await createInterchangeable();
      const targets = await Promise.all([createInterchangeable(), createInterchangeable()]);
      const { assignedMotorId: motorId } = await motors.assign(source, { version: await version(source), newMotor: details([source, ...targets]) }, userId);
      const results = await Promise.allSettled(targets.map(async target => motors.assign(target,
        { version: await version(target), motorId, expectedSourceId: source }, userId)));
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(await prisma.asset.count({ where: { assignedMotorId: motorId } })).toBe(1);
    });

    it('rejects changing the creation flag through a template', async () => {
      const base = await prisma.asset.findUniqueOrThrow({ where: { id: otherAssetId } });
      await expect(inventory.createSerializedAsset({ ...payload(), sku: { id: base.skuId }, asset: { interchangeableMotor: true } }, userId)).rejects.toThrow('sin plantilla');
    });

    it('rolls back both assignments and their audit trail if the transaction fails after the transfer', async () => {
      const source = await createInterchangeable(), target = await createInterchangeable();
      const { assignedMotorId: motorId } = await motors.assign(source, { version: await version(source), newMotor: details([source, target]) }, userId);
      const sourceBefore = await configs.get({ assetId: source }), targetBefore = await configs.get({ assetId: target });
      const historyBefore = await configs.motorHistory(source);
      const transact = prisma.$transaction.bind(prisma);
      const spy = jest.spyOn(prisma, '$transaction').mockImplementationOnce(((callback: any) => transact(async tx => {
        await callback(tx);
        throw new Error('QA simulated commit failure');
      })) as any);
      try {
        await expect(motors.assign(target, { version: targetBefore.version, motorId, expectedSourceId: source }, userId)).rejects.toThrow('simulated commit failure');
      } finally { spy.mockRestore(); }
      expect(await configs.get({ assetId: source })).toEqual(sourceBefore);
      expect(await configs.get({ assetId: target })).toEqual(targetBefore);
      expect(await configs.motorHistory(source)).toEqual(historyBefore);
      expect(await configs.motorHistory(target)).toHaveLength(0);
    });

    it('completes motor creation, transfer, remission, damaged return and independent repairs without stock or identity drift', async () => {
      const documents = new DocumentsService(prisma, inventory, {} as any, {} as any, { refresh: jest.fn() } as any);
      jest.spyOn(documents as any, 'sendFinalEmailInBackground').mockImplementation(() => undefined);
      customerId = (await prisma.customer.create({ data: { name: `QA MOTOR ${run}` } })).id;
      worksiteId = (await prisma.worksite.create({ data: { name: `QA MOTOR ${run}` } })).id;
      customerWorksiteId = (await prisma.customerWorksite.create({ data: { customerId, worksiteId } })).id;
      const source = await createInterchangeable(), target = await createInterchangeable();
      const motorId = (await motors.assign(source, { version: await version(source), newMotor: details([source, target]) }, userId)).assignedMotorId!;
      const motorBefore = await motors.get(motorId);
      const stockBefore = await prisma.stockLedger.findMany({ where: { assetId: motorId } });
      await motors.assign(target, { version: await version(target), motorId, expectedSourceId: source }, userId);
      expect((await conditions.getAssetById(source)).assignedMotorId).toBeNull();
      expect(await prisma.stockLedger.findMany({ where: { assetId: motorId } })).toEqual(stockBefore);
      await expect(conditions.updateAssetCondition(motorId, { isDamaged: true, note: 'Stale card', expectedParentAssetId: source }, userId)).rejects.toThrow('motor asignado cambió');
      const items = [
        { assetId: target, ownerWarehouseId: warehouseId, sourceWarehouseId: warehouseId },
        { assetId: motorId, componentParentAssetId: target, ownerWarehouseId: warehouseId, sourceWarehouseId: warehouseId },
      ];
      const draft = async (type: 'REMISSION' | 'RETURN', lines = items) => {
        const doc = await documents.createRequestDocument({ type, items: lines, warehouseId, customerWorksiteId, createdBy: userId, sendWhatsapp: false });
        documentIds.push(doc.id); return doc;
      };
      const omitted = await draft('REMISSION', items.slice(0, 1));
      await expect(documents.approveRequestDocument(omitted.id, userId)).rejects.toThrow('incluir el motor asignado');
      expect(await prisma.stockLedger.count({ where: { refDocumentId: omitted.id } })).toBe(0);
      const sent = await draft('REMISSION');
      await documents.approveRequestDocument(sent.id, userId);
      expect(await prisma.stockLedger.count({ where: { refDocumentId: sent.id, movementType: 'OUT' } })).toBe(2);
      for (const id of [target, motorId]) expect((await conditions.getAssetById(id)).warehouseCurrentId).toBeNull();
      await expect(motors.assign(source, { version: await version(source), motorId, expectedSourceId: target }, userId)).rejects.toThrow('bodega');
      await expect(documents.approveRequestDocument(sent.id, userId)).rejects.toThrow('DRAFT');
      expect(await prisma.stockLedger.count({ where: { refDocumentId: sent.id } })).toBe(2);
      const returned = await draft('RETURN', items.map(item => ({ ...item, ...(item.assetId === motorId ? { conditionNote: 'QA motor no enciende al regresar' } : {}) })));
      await documents.approveRequestDocument(returned.id, userId);
      expect(await prisma.stockLedger.count({ where: { refDocumentId: returned.id, movementType: 'IN' } })).toBe(2);
      const machine = await conditions.getAssetById(target), damagedMotor = await conditions.getAssetById(motorId);
      expect(machine).toMatchObject({ isDamaged: false, warehouseCurrentId: warehouseId, assignedMotorId: motorId, conditionEvents: [] });
      expect(machine.assignedMotor).toMatchObject({ id: motorId, isDamaged: true });
      expect(damagedMotor).toMatchObject({ isDamaged: true, warehouseCurrentId: warehouseId, conditionEvents: [expect.objectContaining({ note: 'QA motor no enciende al regresar' })] });
      const blocked = await draft('REMISSION');
      await expect(documents.approveRequestDocument(blocked.id, userId)).rejects.toThrow('averiado');
      expect(await prisma.stockLedger.count({ where: { refDocumentId: blocked.id } })).toBe(0);
      await conditions.updateAssetCondition(motorId, { isDamaged: false, note: 'QA motor reparado', expectedParentAssetId: target }, userId);
      await conditions.updateAssetCondition(target, { isDamaged: true, note: 'QA falla del chasis' }, userId);
      expect((await conditions.getAssetById(motorId)).isDamaged).toBe(false);
      await expect(documents.approveRequestDocument(blocked.id, userId)).rejects.toThrow('averiado');
      await conditions.updateAssetCondition(target, { isDamaged: false, note: 'QA chasis reparado' }, userId);
      await documents.approveRequestDocument(blocked.id, userId);
      const finalReturn = await draft('RETURN');
      await documents.approveRequestDocument(finalReturn.id, userId);
      for (const id of [target, motorId]) {
        const asset = await conditions.getAssetById(id);
        expect(asset.isDamaged).toBe(false);
        expect(asset.conditionEvents).toHaveLength(2);
        expect(asset.warehouseCurrentId).toBe(warehouseId);
        const balance = await prisma.stockLedger.aggregate({ where: { assetId: id, warehouseId }, _sum: { quantity: true } });
        expect(Number(balance._sum.quantity)).toBe(1);
      }
      const motorAfter = await motors.get(motorId);
      expect(motorAfter.publicCode).toBe(motorBefore.publicCode);
      expect(motorAfter.internalNumber).toBe(motorBefore.internalNumber);
      expect(motorAfter.assignedToMixer?.id).toBe(target);
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
      expect(Object.keys(byCode.items[0]).sort()).toEqual([
        'id',
        'publicCode',
        'sku',
      ]);
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
      expect((await configs.get({ assetId })).entries[0].required).toBe(true);
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
