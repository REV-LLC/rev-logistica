import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { DocumentsService } from '../documents/documents.service';
import { AccessoriesService } from './accessories.service';
import { ProviderReturnsService } from '../provider-returns/provider-returns.service';
import { DocumentType, InventorySourceMode, Role } from '@prisma/client';

const testUrl = process.env.ACCESSORY_TEST_DATABASE_URL;
if (testUrl) {
  const parsed = new URL(testUrl);
  if (
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    !/^\/accessory_qa_[a-z0-9_]+$/.test(parsed.pathname)
  )
    throw new Error('Use only a dedicated local accessory_qa_* database.');
}

(testUrl ? describe : describe.skip)(
  'Documentary accessories with real PostgreSQL',
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
    const accessories = new AccessoriesService(prisma);
    const inventory = new InventoryService(prisma, {
      del: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
    } as any);
    const documents = new DocumentsService(
      prisma,
      inventory,
      {} as any,
      {} as any,
      { refresh: jest.fn() } as any,
    );
    const providerReturns = new ProviderReturnsService(prisma);
    const run = randomUUID();
    const documentIds: string[] = [],
      assetIds: string[] = [],
      accessoryIds: string[] = [];
    let userId: string,
      ownerId: string,
      warehouseId: string,
      providerId: string,
      familyId: string,
      skuId: string,
      bulkFamilyId: string,
      bulkSkuId: string,
      customerId: string;
    const worksiteIds: string[] = [],
      siteIds: string[] = [];

    beforeAll(async () => {
      await prisma.$connect();
      jest
        .spyOn(documents as any, 'sendFinalEmailInBackground')
        .mockImplementation(() => undefined);
      userId = (
        await prisma.user.create({
          data: {
            email: `${run}@accessory.invalid`,
            passwordHash: 'not-a-password',
            role: 'OFFICE',
          },
        })
      ).id;
      ownerId = (await prisma.owner.create({ data: { name: `QA DOC ${run}` } }))
        .id;
      warehouseId = (
        await prisma.warehouse.create({
          data: {
            name: `QA BODEGA ${run}`,
            type: 'OWN',
            ownerCompanyId: ownerId,
          },
        })
      ).id;
      providerId = (
        await prisma.warehouse.create({
          data: {
            name: `QA PROVEEDOR ${run}`,
            type: 'ALLY',
            ownerCompanyId: ownerId,
          },
        })
      ).id;
      familyId = (
        await prisma.assetFamily.create({
          data: {
            code: `QD-${run}`,
            name: 'QA PLUMA DOCUMENTAL',
            controlType: 'SERIAL',
          },
        })
      ).id;
      skuId = (
        await prisma.sku.create({
          data: { name: 'QA PLUMA', assetFamilyId: familyId },
        })
      ).id;
      customerId = (
        await prisma.customer.create({ data: { name: `QA CLIENTE ${run}` } })
      ).id;
      bulkFamilyId = (await prisma.assetFamily.create({ data: {
        code: `QB-${run}`, name: 'QA MATERIAL MIXTO', controlType: 'BULK',
      } })).id;
      bulkSkuId = (await prisma.sku.create({ data: { name: 'QA MATERIAL MIXTO', assetFamilyId: bulkFamilyId } })).id;
      for (const suffix of ['A', 'B']) {
        const worksite = await prisma.worksite.create({
          data: { name: `QA OBRA ${suffix} ${run}` },
        });
        worksiteIds.push(worksite.id);
        siteIds.push(
          (
            await prisma.customerWorksite.create({
              data: { customerId, worksiteId: worksite.id },
            })
          ).id,
        );
      }
    });

    afterAll(async () => {
      await prisma.accessoryProviderReceiptItem.deleteMany({
        where: { receiptDocumentId: { in: documentIds } },
      });
      await prisma.fileObject.deleteMany({
        where: { documentId: { in: documentIds } },
      });
      await prisma.accessoryMovement.deleteMany({
        where: { accessoryId: { in: accessoryIds } },
      });
      await prisma.documentItem.deleteMany({
        where: { documentId: { in: documentIds } },
      });
      await prisma.stockLedger.deleteMany({
        where: { OR: [{ assetId: { in: assetIds } }, ...(bulkSkuId ? [{ skuId: bulkSkuId }] : [])] },
      });
      await prisma.accessoryBalance.deleteMany({
        where: { accessoryId: { in: accessoryIds } },
      });
      await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
      await prisma.accessoryRevision.deleteMany({
        where: { accessoryId: { in: accessoryIds } },
      });
      await prisma.accessory.deleteMany({
        where: { id: { in: accessoryIds } },
      });
      await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
      if (skuId) await prisma.sku.delete({ where: { id: skuId } });
      if (bulkSkuId) await prisma.sku.delete({ where: { id: bulkSkuId } });
      if (bulkFamilyId) await prisma.assetFamily.delete({ where: { id: bulkFamilyId } });
      if (familyId)
        await prisma.assetFamily.delete({ where: { id: familyId } });
      await prisma.customerWorksite.deleteMany({
        where: { id: { in: siteIds } },
      });
      await prisma.worksite.deleteMany({ where: { id: { in: worksiteIds } } });
      if (customerId)
        await prisma.customer.delete({ where: { id: customerId } });
      if (ownerId) {
        await prisma.warehouse.deleteMany({
          where: { ownerCompanyId: ownerId },
        });
        await prisma.owner.delete({ where: { id: ownerId } });
      }
      if (userId) await prisma.user.delete({ where: { id: userId } });
      await prisma.$disconnect();
    });

    async function fixture(
      kind: 'CONSUMABLE' | 'INDIVIDUAL' | 'RETURNABLE' = 'CONSUMABLE',
      quantity = 10,
      accessoryOwnerId = warehouseId,
    ) {
      const parent = await prisma.asset.create({
        data: {
          skuId,
          internalNumber: assetIds.length + 1,
          publicCode: `${run}-${assetIds.length}`,
          warehouseOwnerId: warehouseId,
          warehouseCurrentId: warehouseId,
        },
      });
      assetIds.push(parent.id);
      await prisma.stockLedger.create({
        data: {
          assetId: parent.id,
          warehouseId,
          ownerWarehouseId: warehouseId,
          movementType: 'IN',
          quantity: 1,
          effectiveAt: new Date('2020-01-01'),
          createdBy: userId,
        },
      });
      const accessory = await accessories.create(
        {
          name:
            kind === 'CONSUMABLE'
              ? 'QA PUNTAS'
              : kind === 'RETURNABLE'
                ? 'QA MANGUERAS'
                : 'QA CANASTA',
          kind,
          internalCode: kind === 'INDIVIDUAL' ? randomUUID() : undefined,
          familyId,
          scope: 'FAMILY',
          subfamilyIds: [],
          assetIds: [],
          warehouseId,
          ownerWarehouseId: accessoryOwnerId,
          quantity,
          requestId: randomUUID(),
        },
        userId,
      );
      accessoryIds.push(accessory.id);
      return { parent, accessory };
    }
    function line(
      accessoryId: string,
      balanceId: string,
      parentId: string,
      quantity: number,
    ) {
      return {
        accessoryId,
        accessorySourceBalanceId: balanceId,
        componentParentAssetId: parentId,
        quantity,
        ownerWarehouseId: warehouseId,
      };
    }
    async function draft(
      type: 'REMISSION' | 'RETURN',
      items: Parameters<DocumentsService['createRequestDocument']>[0]['items'],
      siteId = siteIds[0],
      destinationId = warehouseId,
    ) {
      const doc = await documents.createRequestDocument({
        type,
        items,
        warehouseId: destinationId,
        customerWorksiteId: siteId,
        createdBy: userId,
        sendWhatsapp: false,
      });
      documentIds.push(doc.id);
      return doc;
    }
    async function dispatch(quantity = 10) {
      const { parent, accessory } = await fixture();
      const doc = await draft('REMISSION', [
        { assetId: parent.id, ownerWarehouseId: warehouseId },
        line(accessory.id, accessory.balances[0].id, parent.id, quantity),
      ]);
      await documents.approveRequestDocument(doc.id, userId);
      const balance = await prisma.accessoryBalance.findFirstOrThrow({
        where: { accessoryId: accessory.id, customerWorksiteId: siteIds[0] },
      });
      return { parent, accessory, doc, balance };
    }

    it('debits the same bulk reference and owner separately from each physical warehouse', async () => {
      for (const origin of [warehouseId, providerId]) {
        await prisma.stockLedger.create({ data: { skuId: bulkSkuId, warehouseId: origin,
          ownerWarehouseId: providerId, movementType: 'IN', quantity: 5,
          effectiveAt: new Date('2020-01-01'), createdBy: userId } });
      }
      const items = [
        { skuId: bulkSkuId, quantity: 2, ownerWarehouseId: providerId, sourceWarehouseId: warehouseId },
        { skuId: bulkSkuId, quantity: 3, ownerWarehouseId: providerId, sourceWarehouseId: providerId },
      ];
      const doc = await draft('REMISSION', items);
      await documents.updateRequestDocument(doc.id, { items }, userId);
      await evidence(doc.id, 'COMPROBANTE_SALIDA_PROVEEDOR');
      await documents.approveRequestDocument(doc.id, userId);
      const rows = await prisma.stockLedger.findMany({ where: { refDocumentId: doc.id } });
      expect(rows).toHaveLength(2);
      expect(rows.find(row => row.warehouseId === warehouseId)?.quantity.toNumber()).toBe(-2);
      expect(rows.find(row => row.warehouseId === providerId)?.quantity.toNumber()).toBe(-3);
      const remaining = await prisma.stockLedger.groupBy({ by: ['warehouseId'],
        where: { skuId: bulkSkuId }, _sum: { quantity: true } });
      expect(remaining.find(row => row.warehouseId === warehouseId)?._sum.quantity?.toNumber()).toBe(3);
      expect(remaining.find(row => row.warehouseId === providerId)?._sum.quantity?.toNumber()).toBe(2);
    });

    it('persists mixed origins through autosave, submission and approval without mixing owners', async () => {
      const first = await fixture('INDIVIDUAL', 1);
      const second = await fixture('INDIVIDUAL', 1);
      // Fixture opening stock: one supplier-owned machine starts at the supplier.
      await prisma.asset.update({ where: { id: second.parent.id }, data: {
        warehouseOwnerId: providerId, warehouseCurrentId: providerId,
      } });
      await prisma.stockLedger.updateMany({ where: { assetId: second.parent.id }, data: {
        ownerWarehouseId: providerId, warehouseId: providerId,
      } });
      const items = [
        { assetId: first.parent.id, ownerWarehouseId: warehouseId, sourceWarehouseId: warehouseId },
        { ...line(first.accessory.id, first.accessory.balances[0].id, first.parent.id, 1), sourceWarehouseId: warehouseId },
        { assetId: second.parent.id, ownerWarehouseId: providerId, sourceWarehouseId: providerId },
      ];
      const doc = await documents.createAutosavedRequestDocument({
        type: DocumentType.REMISSION, inventorySourceMode: InventorySourceMode.WAREHOUSE,
        warehouseId, customerWorksiteId: siteIds[0], createdBy: userId,
        notes: 'Entrega: ON_SITE', items,
      });
      documentIds.push(doc.id);
      await documents.updateAutosavedRequestDocument(doc.id, { items }, { sub: userId, role: Role.OFFICE });
      const saved = await prisma.documentItem.findMany({ where: { documentId: doc.id } });
      expect(saved.map(item => item.sourceWarehouseId).sort()).toEqual([warehouseId, warehouseId, providerId].sort());
      expect(await prisma.stockLedger.count({ where: { refDocumentId: doc.id } })).toBe(0);
      await evidence(doc.id, 'SIGNATURE_RECEIVED');
      await evidence(doc.id, 'COMPROBANTE_SALIDA_PROVEEDOR');
      await documents.submitAutosavedRequestDocument(doc.id, { sendWhatsapp: false }, { sub: userId, role: Role.OFFICE });
      await documents.approveRequestDocument(doc.id, userId);
      const movements = await prisma.stockLedger.findMany({ where: { refDocumentId: doc.id } });
      expect(movements).toHaveLength(2);
      expect(movements).toEqual(expect.arrayContaining([
        expect.objectContaining({ assetId: first.parent.id, warehouseId, ownerWarehouseId: warehouseId, movementType: 'OUT' }),
        expect.objectContaining({ assetId: second.parent.id, warehouseId: providerId, ownerWarehouseId: providerId, movementType: 'OUT' }),
      ]));
      const inWorksite = (await accessories.get(first.accessory.id)).balances[0];
      expect(inWorksite.customerWorksiteId).toBe(siteIds[0]);
      const returned = await draft('RETURN', [
        { assetId: first.parent.id, ownerWarehouseId: warehouseId },
        line(first.accessory.id, inWorksite.id, first.parent.id, 1),
        { assetId: second.parent.id, ownerWarehouseId: providerId },
      ]);
      await documents.approveRequestDocument(returned.id, userId);
      expect(await prisma.stockLedger.count({ where: { refDocumentId: returned.id, warehouseId, movementType: 'IN' } })).toBe(2);
      expect((await accessories.get(first.accessory.id)).balances[0].warehouseId).toBe(warehouseId);
    });

    it('rolls back the entire mixed remission, including accessories, if a later origin is incorrect', async () => {
      const first = await fixture('INDIVIDUAL', 1);
      const second = await fixture('INDIVIDUAL', 1);
      const doc = await draft('REMISSION', [
        { assetId: first.parent.id, ownerWarehouseId: warehouseId, sourceWarehouseId: warehouseId },
        { ...line(first.accessory.id, first.accessory.balances[0].id, first.parent.id, 1), sourceWarehouseId: warehouseId },
        { assetId: second.parent.id, ownerWarehouseId: warehouseId, sourceWarehouseId: providerId },
      ]);
      await expect(documents.approveRequestDocument(doc.id, userId)).rejects.toThrow();
      expect(await prisma.stockLedger.count({ where: { refDocumentId: doc.id } })).toBe(0);
      expect(await prisma.accessoryMovement.count({ where: { documentId: doc.id } })).toBe(0);
      expect((await accessories.get(first.accessory.id)).balances[0].warehouseId).toBe(warehouseId);
      expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe('DRAFT');
    });

    it('draft/save captures labels and owner without reserving stock; concurrent approval moves once', async () => {
      const { parent, accessory } = await fixture('INDIVIDUAL', 1);
      const doc = await draft('REMISSION', [
        { assetId: parent.id, ownerWarehouseId: warehouseId },
        {
          ...line(accessory.id, accessory.balances[0].id, parent.id, 1),
          ownerWarehouseId: providerId,
        },
      ]);
      const saved = await prisma.documentItem.findFirstOrThrow({
        where: { documentId: doc.id, accessoryId: accessory.id },
      });
      expect(saved.condition).toBe(warehouseId);
      expect(saved.accessoryName).toBe('QA CANASTA');
      expect(saved.requestedTag).toContain(parent.publicCode);
      expect(
        await prisma.accessoryMovement.count({ where: { documentId: doc.id } }),
      ).toBe(0);
      const results = await Promise.all([
        documents.approveRequestDocument(doc.id, userId),
        documents.approveRequestDocument(doc.id, userId),
      ]);
      expect(results.map((entry) => entry.status)).toEqual([
        'CONFIRMED',
        'CONFIRMED',
      ]);
      expect(
        await prisma.accessoryMovement.count({ where: { documentId: doc.id } }),
      ).toBe(1);
      expect(
        await prisma.stockLedger.count({ where: { refDocumentId: doc.id } }),
      ).toBe(1);
      await prisma.accessory.update({
        where: { id: accessory.id },
        data: { name: 'RENOMBRADA' },
      });
      expect(
        (
          await prisma.documentItem.findUniqueOrThrow({
            where: { id: saved.id },
          })
        ).accessoryName,
      ).toBe('QA CANASTA');
    });

    it('dispatches ten, consumes six at the exact worksite and returns four without returning the equipment', async () => {
      const { parent, accessory, balance } = await dispatch();
      await accessories.move(
        accessory.id,
        {
          requestId: randomUUID(),
          type: 'CONSUME',
          quantity: 6,
          from: { assetId: parent.id, customerWorksiteId: siteIds[0] },
          note: 'Se consumieron seis puntas',
        },
        userId,
      );
      const returned = await draft('RETURN', [
        line(accessory.id, balance.id, parent.id, 4),
      ]);
      await documents.approveRequestDocument(returned.id, userId);
      const state = await accessories.get(accessory.id);
      expect(state.balances).toHaveLength(1);
      expect(state.balances[0].quantity).toBe(4);
      expect(state.balances[0].warehouseId).toBe(warehouseId);
      expect(
        (await prisma.asset.findUniqueOrThrow({ where: { id: parent.id } }))
          .warehouseCurrentId,
      ).toBeNull();
      expect(
        await prisma.stockLedger.count({
          where: { refDocumentId: returned.id },
        }),
      ).toBe(0);
    });

    it('keeps returnable hoses as quantities through partial returns, blocks consumption and deduplicates approvals', async () => {
      const { parent, accessory } = await fixture('RETURNABLE', 10);
      const remission = await draft('REMISSION', [
        { assetId: parent.id, ownerWarehouseId: warehouseId },
        line(accessory.id, accessory.balances[0].id, parent.id, 6),
      ]);
      const documentLine = await prisma.documentItem.findFirstOrThrow({
        where: { documentId: remission.id, accessoryId: accessory.id },
      });
      expect(documentLine.accessoryKind).toBe('RETURNABLE');
      expect(documentLine.requestedTag).toContain('Retornable por cantidad');
      expect(documentLine.requestedTag).not.toContain('Consumible');
      await documents.approveRequestDocument(remission.id, userId);
      const onSite = await prisma.accessoryBalance.findFirstOrThrow({
        where: { accessoryId: accessory.id, customerWorksiteId: siteIds[0] },
      });
      await expect(
        accessories.move(
          accessory.id,
          {
            requestId: randomUUID(),
            type: 'CONSUME',
            quantity: 1,
            from: { assetId: parent.id, customerWorksiteId: siteIds[0] },
            note: 'No es consumible',
          },
          userId,
        ),
      ).rejects.toThrow('Solo los consumibles');
      const returned = await draft('RETURN', [
        line(accessory.id, onSite.id, parent.id, 2),
      ]);
      await Promise.all([
        documents.approveRequestDocument(returned.id, userId),
        documents.approveRequestDocument(returned.id, userId),
      ]);
      let state = await accessories.get(accessory.id);
      expect(
        state.balances.find((balance) => balance.warehouseId === warehouseId)
          ?.quantity,
      ).toBe(6);
      expect(
        state.balances.find(
          (balance) => balance.customerWorksiteId === siteIds[0],
        )?.quantity,
      ).toBe(4);
      expect(
        state.balances.reduce((sum, balance) => sum + balance.quantity, 0),
      ).toBe(10);
      await accessories.move(
        accessory.id,
        {
          requestId: randomUUID(),
          type: 'RECEIVE',
          quantity: 3,
          to: { warehouseId },
          note: 'Ingreso de tres mangueras',
        },
        userId,
      );
      state = await accessories.get(accessory.id);
      expect(
        state.balances.find((balance) => balance.warehouseId === warehouseId)
          ?.quantity,
      ).toBe(9);
      expect(
        await prisma.accessoryMovement.count({
          where: { accessoryId: accessory.id, type: 'CONSUME' },
        }),
      ).toBe(0);
    });

    it('rolls back accessory stock and document status if equipment movement fails', async () => {
      const { parent, accessory } = await fixture();
      await prisma.stockLedger.create({
        data: {
          assetId: parent.id,
          ownerWarehouseId: warehouseId,
          warehouseId: null,
          customerWorksiteId: siteIds[1],
          movementType: 'OUT',
          quantity: -1,
          createdBy: userId,
        },
      });
      const doc = await draft('REMISSION', [
        { assetId: parent.id, ownerWarehouseId: warehouseId },
        line(accessory.id, accessory.balances[0].id, parent.id, 10),
      ]);
      await expect(
        documents.approveRequestDocument(doc.id, userId),
      ).rejects.toThrow();
      expect((await accessories.get(accessory.id)).balances[0].quantity).toBe(
        10,
      );
      expect(
        await prisma.accessoryMovement.count({ where: { documentId: doc.id } }),
      ).toBe(0);
      expect(
        (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } }))
          .status,
      ).toBe('DRAFT');
    });

    it('rejects wrong worksite, over-return and manual documentary bypass without changing balances', async () => {
      const { parent, accessory, balance } = await dispatch();
      const wrong = await draft(
        'RETURN',
        [line(accessory.id, balance.id, parent.id, 1)],
        siteIds[1],
      );
      await expect(
        documents.approveRequestDocument(wrong.id, userId),
      ).rejects.toThrow('esta obra');
      const excessive = await draft('RETURN', [
        line(accessory.id, balance.id, parent.id, 11),
      ]);
      await expect(
        documents.approveRequestDocument(excessive.id, userId),
      ).rejects.toThrow('existencias suficientes');
      await expect(
        accessories.move(
          accessory.id,
          {
            requestId: randomUUID(),
            type: 'RETURN',
            quantity: 1,
            from: { assetId: parent.id, customerWorksiteId: siteIds[0] },
            to: { warehouseId },
            note: 'Intento por card',
          },
          userId,
        ),
      ).rejects.toThrow('documental');
      expect(
        (
          await prisma.accessoryBalance.findUniqueOrThrow({
            where: { id: balance.id },
          })
        ).quantity,
      ).toBe(10);
    });

    it('moves preassigned stock instead of deducting warehouse stock again', async () => {
      const { parent, accessory } = await fixture('INDIVIDUAL', 1);
      await accessories.move(
        accessory.id,
        {
          requestId: randomUUID(),
          type: 'ASSIGN',
          quantity: 1,
          from: { warehouseId },
          to: { assetId: parent.id },
          note: 'Preparar salida',
        },
        userId,
      );
      const assigned = (await accessories.get(accessory.id)).balances[0];
      const doc = await draft('REMISSION', [
        { assetId: parent.id, ownerWarehouseId: warehouseId },
        line(accessory.id, assigned.id, parent.id, 1),
      ]);
      await documents.approveRequestDocument(doc.id, userId);
      const balances = (await accessories.get(accessory.id)).balances;
      expect(balances).toHaveLength(1);
      expect(balances[0].customerWorksiteId).toBe(siteIds[0]);
    });

    it('rejection leaves stock untouched and cannot be approved afterwards', async () => {
      const { parent, accessory } = await fixture();
      const doc = await draft('REMISSION', [
        { assetId: parent.id, ownerWarehouseId: warehouseId },
        line(accessory.id, accessory.balances[0].id, parent.id, 10),
      ]);
      await documents.rejectRequestDocument(doc.id, userId, 'QA rechazo');
      await expect(
        documents.approveRequestDocument(doc.id, userId),
      ).rejects.toThrow('estado DRAFT');
      expect((await accessories.get(accessory.id)).balances[0].quantity).toBe(
        10,
      );
    });

    it('rejects returns to a provider that does not own the accessory', async () => {
      const { parent, accessory, balance } = await dispatch();
      const doc = await draft(
        'RETURN',
        [line(accessory.id, balance.id, parent.id, 10)],
        siteIds[0],
        providerId,
      );
      await expect(
        documents.approveRequestDocument(doc.id, userId),
      ).rejects.toThrow('propietario');
      expect(
        (
          await prisma.accessoryBalance.findUniqueOrThrow({
            where: { id: balance.id },
          })
        ).quantity,
      ).toBe(10);
    });

    async function evidence(documentId: string, category: string) {
      await prisma.fileObject.create({
        data: {
          documentId,
          fileType: category,
          category,
          storageKey: 'data:image/png;base64,QA',
          createdBy: userId,
          ...(category === 'COMPROBANTE_SALIDA_PROVEEDOR'
            ? { providerWarehouseId: providerId }
            : {}),
        },
      });
    }

    it('supports accessory-only replenishment for equipment already at the worksite', async () => {
      const { parent } = await dispatch();
      const { accessory } = await fixture();
      const doc = await draft('REMISSION', [
        line(accessory.id, accessory.balances[0].id, parent.id, 3),
      ]);
      await documents.approveRequestDocument(doc.id, userId);
      expect(
        await prisma.stockLedger.count({ where: { refDocumentId: doc.id } }),
      ).toBe(0);
      expect(
        (
          await prisma.accessoryBalance.findFirstOrThrow({
            where: {
              accessoryId: accessory.id,
              customerWorksiteId: siteIds[0],
            },
          })
        ).quantity,
      ).toBe(3);
    });

    it('keeps a document with more than twenty rows intact and moves every accessory row', async () => {
      const { parent, accessory } = await fixture('CONSUMABLE', 25);
      const doc = await draft('REMISSION', [
        { assetId: parent.id, ownerWarehouseId: warehouseId },
        ...Array.from({ length: 21 }, () =>
          line(accessory.id, accessory.balances[0].id, parent.id, 1),
        ),
      ]);
      const result = await documents.approveRequestDocument(doc.id, userId);
      expect(result.splitDocumentIds).toEqual([doc.id]);
      expect(
        await prisma.documentItem.count({ where: { documentId: doc.id } }),
      ).toBe(22);
      expect(
        await prisma.accessoryMovement.count({ where: { documentId: doc.id } }),
      ).toBe(21);
      expect(
        (
          await prisma.accessoryBalance.findFirstOrThrow({
            where: {
              accessoryId: accessory.id,
              customerWorksiteId: siteIds[0],
            },
          })
        ).quantity,
      ).toBe(21);
    });

    it('prevents dispatching equipment while omitting its preassigned accessories', async () => {
      const { parent, accessory } = await fixture('INDIVIDUAL', 1);
      await accessories.move(
        accessory.id,
        {
          requestId: randomUUID(),
          type: 'ASSIGN',
          quantity: 1,
          from: { warehouseId },
          to: { assetId: parent.id },
          note: 'Preparar salida',
        },
        userId,
      );
      const doc = await draft('REMISSION', [
        { assetId: parent.id, ownerWarehouseId: warehouseId },
      ]);
      await expect(
        documents.approveRequestDocument(doc.id, userId),
      ).rejects.toThrow('Inclúyelos');
      expect(
        await prisma.stockLedger.count({ where: { refDocumentId: doc.id } }),
      ).toBe(0);
    });

    it.each(['DIRECT', 'VIA_OWN_WAREHOUSE'])(
      'receives provider accessories %s only after proof, once under retries',
      async (route) => {
        const { parent, accessory } = await fixture(
          'CONSUMABLE',
          10,
          providerId,
        );
        const remission = await draft('REMISSION', [
          { assetId: parent.id, ownerWarehouseId: warehouseId },
          line(accessory.id, accessory.balances[0].id, parent.id, 10),
        ]);
        await expect(
          documents.approveRequestDocument(remission.id, userId),
        ).rejects.toThrow('remisión física');
        await evidence(remission.id, 'COMPROBANTE_SALIDA_PROVEEDOR');
        await documents.approveRequestDocument(remission.id, userId);
        const balance = (await accessories.get(accessory.id)).balances[0];
        const returned = await draft(
          'RETURN',
          [line(accessory.id, balance.id, parent.id, 10)],
          siteIds[0],
          route === 'DIRECT' ? providerId : warehouseId,
        );
        await documents.approveRequestDocument(returned.id, userId);
        const beforeReceipt = (await accessories.get(accessory.id)).balances[0];
        expect(beforeReceipt.warehouseId).toBe(
          route === 'DIRECT' ? null : warehouseId,
        );
        expect(beforeReceipt.transitDocumentId).toBe(
          route === 'DIRECT' ? returned.id : null,
        );
        const pending = (
          await providerReturns.listPending({ id: userId, role: Role.OFFICE })
        ).find((item) => item.sourceDocumentId === returned.id)!;
        expect(pending.pendingQuantity).toBe(10);
        const receipt = await providerReturns.createDraft(
          {
            sourceDocumentId: returned.id,
            providerWarehouseId: providerId,
            items: [],
            accessoryItems: [
              { sourceMovementId: pending.sourceLedgerId, quantity: 10 },
            ],
          },
          { id: userId, role: Role.OFFICE },
        );
        documentIds.push(receipt.id);
        await expect(
          providerReturns.confirm(receipt.id, {
            id: userId,
            role: Role.OFFICE,
          }),
        ).rejects.toThrow('evidencia');
        await evidence(receipt.id, 'EVIDENCIA_ENTREGA_PROVEEDOR');
        await evidence(receipt.id, 'COMPROBANTE_RECEPCION_PROVEEDOR');
        await Promise.all([
          providerReturns.confirm(receipt.id, {
            id: userId,
            role: Role.OFFICE,
          }),
          providerReturns.confirm(receipt.id, {
            id: userId,
            role: Role.OFFICE,
          }),
        ]);
        const state = (await accessories.get(accessory.id)).balances;
        expect(state).toHaveLength(1);
        expect(state[0].warehouseId).toBe(providerId);
        expect(state[0].quantity).toBe(10);
        expect(
          await prisma.accessoryMovement.count({
            where: { documentId: receipt.id },
          }),
        ).toBe(1);
        expect(
          await prisma.stockLedger.count({
            where: { refDocumentId: receipt.id },
          }),
        ).toBe(0);
        expect(
          (
            await providerReturns.listPending({ id: userId, role: Role.OFFICE })
          ).some((item) => item.sourceDocumentId === returned.id),
        ).toBe(false);
      },
    );

    it('serializes competing partial provider receipts and never receives more than was returned', async () => {
      const { parent, accessory } = await fixture('CONSUMABLE', 10, providerId);
      const remission = await draft('REMISSION', [
        { assetId: parent.id, ownerWarehouseId: warehouseId },
        line(accessory.id, accessory.balances[0].id, parent.id, 10),
      ]);
      await evidence(remission.id, 'COMPROBANTE_SALIDA_PROVEEDOR');
      await documents.approveRequestDocument(remission.id, userId);
      const balance = (await accessories.get(accessory.id)).balances[0];
      const returned = await draft(
        'RETURN',
        [line(accessory.id, balance.id, parent.id, 10)],
        siteIds[0],
        providerId,
      );
      await documents.approveRequestDocument(returned.id, userId);
      const source = await prisma.accessoryMovement.findFirstOrThrow({
        where: { documentId: returned.id },
      });
      const receipts: string[] = [];
      for (let index = 0; index < 2; index++) {
        const receipt = await providerReturns.createDraft(
          {
            sourceDocumentId: returned.id,
            providerWarehouseId: providerId,
            items: [],
            accessoryItems: [{ sourceMovementId: source.id, quantity: 6 }],
          },
          { id: userId, role: Role.OFFICE },
        );
        documentIds.push(receipt.id);
        receipts.push(receipt.id);
        await evidence(receipt.id, 'EVIDENCIA_ENTREGA_PROVEEDOR');
        await evidence(receipt.id, 'COMPROBANTE_RECEPCION_PROVEEDOR');
      }
      const results = await Promise.allSettled(
        receipts.map((id) =>
          providerReturns.confirm(id, { id: userId, role: Role.OFFICE }),
        ),
      );
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const balances = (await accessories.get(accessory.id)).balances;
      expect(
        balances.find((row) => row.warehouseId === providerId)?.quantity,
      ).toBe(6);
      expect(
        balances.find((row) => row.transitDocumentId === returned.id)?.quantity,
      ).toBe(4);
    });

    it('dispatches preassigned provider accessories with ON_SITE delivery from the owner warehouse', async () => {
      const { parent, accessory } = await fixture('INDIVIDUAL', 1, providerId);
      await prisma.asset.update({
        where: { id: parent.id },
        data: { warehouseOwnerId: providerId, warehouseCurrentId: providerId },
      });
      await prisma.stockLedger.updateMany({
        where: { assetId: parent.id },
        data: { ownerWarehouseId: providerId, warehouseId: providerId },
      });
      await accessories.move(
        accessory.id,
        {
          requestId: randomUUID(),
          type: 'TRANSFER',
          quantity: 1,
          from: { warehouseId },
          to: { warehouseId: providerId },
          note: 'QA traslado',
        },
        userId,
      );
      await accessories.move(
        accessory.id,
        {
          requestId: randomUUID(),
          type: 'ASSIGN',
          quantity: 1,
          from: { warehouseId: providerId },
          to: { assetId: parent.id },
          note: 'QA preparar entrega',
        },
        userId,
      );
      const assigned = (await accessories.get(accessory.id)).balances[0];
      const options = await accessories.documentOptions({
        type: 'REMISSION',
        customerWorksiteId: siteIds[0],
        warehouseId,
        assetId: parent.id,
        deliveryMode: 'ON_SITE',
        page: 0,
      });
      expect(
        options.items.some((item) => item.sourceBalanceId === assigned.id),
      ).toBe(true);
      const doc = await documents.createRequestDocument({
        type: 'REMISSION',
        warehouseId,
        customerWorksiteId: siteIds[0],
        notes: 'Entrega: ON_SITE',
        createdBy: userId,
        sendWhatsapp: false,
        items: [
          { assetId: parent.id, ownerWarehouseId: providerId },
          line(accessory.id, assigned.id, parent.id, 1),
        ],
      });
      documentIds.push(doc.id);
      await evidence(doc.id, 'COMPROBANTE_SALIDA_PROVEEDOR');
      await documents.approveRequestDocument(doc.id, userId);
      expect(
        (await accessories.get(accessory.id)).balances[0].customerWorksiteId,
      ).toBe(siteIds[0]);
      expect(
        await prisma.stockLedger.count({
          where: { refDocumentId: doc.id, movementType: 'ON_SITE' },
        }),
      ).toBe(1);
    });
  },
);
