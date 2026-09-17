import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccessoriesService } from './accessories.service';
import { AssetsService } from '../assets/assets.service';
import { CreateAccessoryDto, UpdateAccessoryDto } from './dto/accessory.dto';

// Opt-in: never reuse DATABASE_URL, which could point at production.
const testUrl = process.env.ACCESSORY_TEST_DATABASE_URL;
if (testUrl) {
  const parsed = new URL(testUrl);
  if (
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    !/^\/accessory_qa_[a-z0-9_]+$/.test(parsed.pathname)
  ) {
    throw new Error(
      'Accessory integration tests require a dedicated local accessory_qa_* database.',
    );
  }
}

(testUrl ? describe : describe.skip)(
  'Accessories with real PostgreSQL transactions',
  () => {
    const prisma = new PrismaService({
      datasources: {
        db: {
          url:
            testUrl ??
            'postgresql://unused:unused@127.0.0.1:1/accessory_qa_unused',
        },
      },
    });
    const service = new AccessoriesService(prisma);
    const assetsService = new AssetsService(prisma, {
      del: async () => undefined,
    } as any);
    const run = randomUUID();
    const userId = randomUUID();
    let ownerId: string;
    let warehouseId: string;
    let secondWarehouseId: string;
    let familyId: string;
    let otherFamilyId: string;
    let subfamilyId: string;
    let secondSubfamilyId: string;
    const assetIds: string[] = [];
    const skuIds: string[] = [];
    const accessoryIds: string[] = [];

    beforeAll(async () => {
      await prisma.$connect();
      ownerId = (await prisma.owner.create({ data: { name: `QA ${run}` } })).id;
      warehouseId = (
        await prisma.warehouse.create({
          data: {
            name: 'QA ACCESORIOS A',
            type: 'OWN',
            ownerCompanyId: ownerId,
          },
        })
      ).id;
      secondWarehouseId = (
        await prisma.warehouse.create({
          data: {
            name: 'QA ACCESORIOS B',
            type: 'OWN',
            ownerCompanyId: ownerId,
          },
        })
      ).id;
      familyId = (
        await prisma.assetFamily.create({
          data: { code: `QA-${run}`, name: 'QA PLUMA', controlType: 'SERIAL' },
        })
      ).id;
      otherFamilyId = (
        await prisma.assetFamily.create({
          data: { code: `QB-${run}`, name: 'QA RETRO', controlType: 'SERIAL' },
        })
      ).id;
      subfamilyId = (
        await prisma.assetSubfamily.create({
          data: { code: '200', name: '200 KG', assetFamilyId: familyId },
        })
      ).id;
      secondSubfamilyId = (
        await prisma.assetSubfamily.create({
          data: { code: '300', name: '300 KG', assetFamilyId: familyId },
        })
      ).id;
      for (const [index, subId] of [
        subfamilyId,
        subfamilyId,
        secondSubfamilyId,
      ].entries()) {
        const sku = await prisma.sku.create({
          data: {
            name: `QA PLUMA ${index}`,
            assetFamilyId: familyId,
            assetSubfamilyId: subId,
          },
        });
        skuIds.push(sku.id);
        const asset = await prisma.asset.create({
          data: {
            skuId: sku.id,
            internalNumber: index + 1,
            publicCode: `${run}-${index}`,
            warehouseOwnerId: warehouseId,
            warehouseCurrentId: warehouseId,
          },
        });
        assetIds.push(asset.id);
      }
    });

    afterAll(async () => {
      // Delete only this run's fixtures, in FK order. Existing snapshot data is untouched.
      await prisma.accessoryMovement.deleteMany({
        where: { accessoryId: { in: accessoryIds } },
      });
      await prisma.accessoryRevision.deleteMany({
        where: { accessoryId: { in: accessoryIds } },
      });
      await prisma.accessoryBalance.deleteMany({
        where: { accessoryId: { in: accessoryIds } },
      });
      await prisma.accessory.deleteMany({
        where: { id: { in: accessoryIds } },
      });
      await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
      await prisma.sku.deleteMany({ where: { id: { in: skuIds } } });
      if (familyId)
        await prisma.assetSubfamily.deleteMany({
          where: { assetFamilyId: familyId },
        });
      await prisma.assetFamily.deleteMany({
        where: { id: { in: [familyId, otherFamilyId].filter(Boolean) } },
      });
      if (ownerId) {
        await prisma.warehouse.deleteMany({
          where: { ownerCompanyId: ownerId },
        });
        await prisma.owner.delete({ where: { id: ownerId } });
      }
      await prisma.$disconnect();
    });

    function payload(
      overrides: Partial<CreateAccessoryDto> = {},
    ): CreateAccessoryDto {
      return {
        name: 'QA CANASTA',
        kind: 'INDIVIDUAL',
        internalCode: `QA-${randomUUID()}`,
        familyId,
        scope: 'FAMILY',
        assetIds: [],
        subfamilyIds: [],
        ownerWarehouseId: warehouseId,
        warehouseId,
        quantity: 1,
        requestId: randomUUID(),
        ...overrides,
      };
    }
    async function create(overrides: Partial<CreateAccessoryDto> = {}) {
      const item = await service.create(payload(overrides), userId);
      accessoryIds.push(item.id);
      return item;
    }
    function move(
      id: string,
      type: 'ASSIGN' | 'RETURN' | 'TRANSFER' | 'CONSUME' | 'RECEIVE' | 'RETIRE',
      quantity: number,
      from?: { assetId?: string; warehouseId?: string },
      to?: { assetId?: string; warehouseId?: string },
      requestId = randomUUID(),
    ) {
      return service.move(
        id,
        { type, quantity, from, to, requestId, note: 'QA TEST' },
        userId,
      );
    }
    function updateDto(
      item: Awaited<ReturnType<typeof create>>,
      overrides: Partial<UpdateAccessoryDto> = {},
    ): UpdateAccessoryDto {
      return {
        name: item.name,
        description: item.description ?? '',
        kind: item.kind,
        internalCode: item.internalCode ?? '',
        familyId: item.familyId,
        scope: item.scope,
        assetIds: item.assets.map((a) => a.assetId),
        subfamilyIds: item.subfamilies.map((s) => s.subfamilyId),
        active: item.active,
        version: item.version,
        ...overrides,
      };
    }

    it('creates once under simultaneous retries and keeps compatibility separate from assignment', async () => {
      const dto = payload({ scope: 'ASSETS', assetIds: [assetIds[0]] });
      const results = await Promise.all([
        service.create(dto, userId),
        service.create(dto, userId),
      ]);
      accessoryIds.push(results[0].id);
      expect(results[0].id).toBe(results[1].id);
      expect(results[0].balances[0].assetId).toBeNull();
      expect(results[0].balances[0].warehouseId).toBe(warehouseId);
      await expect(
        service.create({ ...dto, name: 'DIFFERENT' }, userId),
      ).rejects.toThrow('otros datos');
    });

    it.each([undefined, '', '  '])(
      'generates and preserves identity for blank code %j, including concurrent retries',
      async (internalCode) => {
        const dto = payload({ internalCode });
        const [first, replay] = await Promise.all([
          service.create(dto, userId),
          service.create(dto, userId),
        ]);
        accessoryIds.push(first.id);
        expect(first.internalCode).toMatch(/^ACC-[A-F0-9]{12}$/);
        expect(replay.id).toBe(first.id);
        expect(replay.internalCode).toBe(first.internalCode);
        expect(
          await prisma.accessoryMovement.count({
            where: { accessoryId: first.id },
          }),
        ).toBe(1);
        expect(first.balances.map((b) => b.quantity)).toEqual([1]);
        const updated = await service.update(
          first.id,
          updateDto(first, { name: 'QA RENAMED', internalCode: '' }),
          userId,
        );
        expect(updated.internalCode).toBe(first.internalCode);
        await expect(
          service.create({ ...dto, name: 'CHANGED' }, userId),
        ).rejects.toThrow('otros datos');
      },
    );

    it('generates different codes for separate units and still rejects duplicate manual codes', async () => {
      const items = await Promise.all(
        Array.from({ length: 5 }, () => create({ internalCode: '' })),
      );
      expect(new Set(items.map((item) => item.internalCode)).size).toBe(
        items.length,
      );
      await expect(
        create({ internalCode: items[0].internalCode! }),
      ).rejects.toThrow('ya existe');
      const customCode = `QA-MANUAL-${randomUUID()}`;
      const manual = await create({ internalCode: customCode.toLowerCase() });
      expect(manual.internalCode).toBe(customCode.toUpperCase());
      await expect(
        service.update(
          manual.id,
          updateDto(manual, { internalCode: items[0].internalCode! }),
          userId,
        ),
      ).rejects.toThrow('ya existe');
    });

    it('delivers ten, consumes six and returns four without losing stock history', async () => {
      const item = await create({
        kind: 'CONSUMABLE',
        internalCode: '',
        quantity: 10,
      });
      await move(
        item.id,
        'ASSIGN',
        10,
        { warehouseId },
        { assetId: assetIds[0] },
      );
      expect((await service.get(item.id)).balances[0].quantity).toBe(10);
      await move(item.id, 'CONSUME', 6, { assetId: assetIds[0] });
      await move(
        item.id,
        'RETURN',
        4,
        { assetId: assetIds[0] },
        { warehouseId },
      );
      const result = await service.get(item.id);
      expect(result.balances).toHaveLength(1);
      expect(result.balances[0]).toMatchObject({ warehouseId, quantity: 4 });
      expect((await service.history(item.id)).movements).toHaveLength(4);
    });

    it('allows only one simultaneous delivery of an individual accessory', async () => {
      const item = await create();
      const results = await Promise.allSettled(
        assetIds
          .slice(0, 2)
          .map((assetId) =>
            move(item.id, 'ASSIGN', 1, { warehouseId }, { assetId }),
          ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(
        (await service.get(item.id)).balances.reduce(
          (sum, b) => sum + b.quantity,
          0,
        ),
      ).toBe(1);
    });

    it('retries a movement without delivering twice', async () => {
      const item = await create({
        kind: 'CONSUMABLE',
        internalCode: '',
        quantity: 10,
      });
      const requestId = randomUUID();
      const results = await Promise.all([
        move(
          item.id,
          'ASSIGN',
          3,
          { warehouseId },
          { assetId: assetIds[0] },
          requestId,
        ),
        move(
          item.id,
          'ASSIGN',
          3,
          { warehouseId },
          { assetId: assetIds[0] },
          requestId,
        ),
      ]);
      expect(results[0].id).toBe(results[1].id);
      expect(
        (await service.get(item.id)).balances.find((b) => b.assetId)?.quantity,
      ).toBe(3);
    });

    it('rejects incompatible equipment and foreign-family selections', async () => {
      const item = await create({
        scope: 'SUBFAMILIES',
        subfamilyIds: [subfamilyId],
      });
      await expect(
        move(item.id, 'ASSIGN', 1, { warehouseId }, { assetId: assetIds[2] }),
      ).rejects.toThrow('compatible');
      await expect(
        service.create(
          payload({
            familyId: otherFamilyId,
            scope: 'ASSETS',
            assetIds: [assetIds[0]],
          }),
          userId,
        ),
      ).rejects.toThrow('familia');
      expect((await service.get(item.id)).balances[0].quantity).toBe(1);
    });

    it('changes compatibility from either card and protects assignments and edit versions', async () => {
      const item = await create();
      await move(
        item.id,
        'ASSIGN',
        1,
        { warehouseId },
        { assetId: assetIds[0] },
      );
      await expect(
        service.update(
          item.id,
          updateDto(item, { scope: 'ASSETS', assetIds: [assetIds[1]] }),
          userId,
        ),
      ).rejects.toThrow('Primero devuelve');
      await move(
        item.id,
        'RETURN',
        1,
        { assetId: assetIds[0] },
        { warehouseId },
      );
      const updated = await service.update(
        item.id,
        updateDto(item, { scope: 'ASSETS', assetIds: [assetIds[1]] }),
        userId,
      );
      expect(
        (await service.list(assetIds[0])).items.some((a) => a.id === item.id),
      ).toBe(false);
      expect(
        (await service.list(assetIds[1])).items.some((a) => a.id === item.id),
      ).toBe(true);
      expect((await service.history(item.id)).revisions).toHaveLength(1);
      await expect(
        service.update(item.id, updateDto(item), userId),
      ).rejects.toThrow('Otra persona');
      await expect(
        service.update(
          item.id,
          updateDto(updated, { kind: 'CONSUMABLE', internalCode: '' }),
          userId,
        ),
      ).rejects.toThrow('historial');
    });

    it('exchanges a unit, blocks removal of its equipment and permits return', async () => {
      const item = await create();
      await move(
        item.id,
        'ASSIGN',
        1,
        { warehouseId },
        { assetId: assetIds[0] },
      );
      await move(
        item.id,
        'TRANSFER',
        1,
        { assetId: assetIds[0] },
        { assetId: assetIds[1] },
      );
      await expect(
        assetsService.updateAsset(assetIds[1], { active: false }, userId),
      ).rejects.toThrow('accesorios asignados');
      await expect(
        assetsService.deleteAsset(assetIds[1], 'QA', userId),
      ).rejects.toThrow('accesorios asignados');
      await move(
        item.id,
        'RETURN',
        1,
        { assetId: assetIds[1] },
        { warehouseId: secondWarehouseId },
      );
      expect((await service.get(item.id)).balances[0].warehouseId).toBe(
        secondWarehouseId,
      );
    });

    it('protects identity, archives only empty stock and preserves the ledger', async () => {
      const item = await create();
      await expect(
        service.update(item.id, updateDto(item, { active: false }), userId),
      ).rejects.toThrow('existencias');
      await expect(
        move(item.id, 'CONSUME', 1, { warehouseId }),
      ).rejects.toThrow('no se consume');
      await move(item.id, 'RETIRE', 1, { warehouseId });
      const updated = await service.update(
        item.id,
        updateDto(item, { active: false }),
        userId,
      );
      expect(updated.active).toBe(false);
      expect((await service.history(item.id)).movements).toHaveLength(2);
      await expect(
        move(item.id, 'RECEIVE', 1, undefined, { warehouseId }),
      ).rejects.toThrow('archivado');
    });
  },
);
