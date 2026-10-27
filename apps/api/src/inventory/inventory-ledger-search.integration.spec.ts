import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';

const url = process.env.LEDGER_SEARCH_QA_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    !/qa|test/.test(target.pathname)
  ) {
    throw new Error(
      'Ledger integration test requires an explicitly selected local QA database',
    );
  }
}

(url ? describe : describe.skip)(
  'Ledger search — real PostgreSQL, complete rollback',
  () => {
    const db = new PrismaService({
      datasources: {
        db: { url: url ?? 'postgresql://unused@127.0.0.1:1/unused_qa' },
      },
    });
    afterAll(() => db.$disconnect());

    it('finds warehouse and on-site entries by customer/worksite before pagination without touching stock', async () => {
      const rollback = new Error('QA_LEDGER_ROLLBACK');
      const before = await db.stockLedger.count();
      await expect(
        db.$transaction(
          async (tx) => {
            const actor = await tx.user.findFirstOrThrow({
              where: { active: true, role: 'ADMIN' },
            });
            const warehouse = await tx.warehouse.findFirstOrThrow({
              where: { active: true, type: 'OWN' },
            });
            const prefix = `QA_LEDGER_${randomUUID().slice(0, 8)}`;
            const a = await tx.customer.create({
              data: { name: `${prefix} Cliente A` },
            });
            const b = await tx.customer.create({
              data: { name: `${prefix} Cliente B` },
            });
            const sites = [];
            for (const [customerId, name] of [
              [a.id, 'Las Mercedes'],
              [a.id, 'Centro'],
              [b.id, 'Las Mercedes'],
            ]) {
              const worksite = await tx.worksite.create({
                data: { name: `${prefix} ${name}` },
              });
              sites.push(
                await tx.customerWorksite.create({
                  data: {
                    customerId,
                    worksiteId: worksite.id,
                    alias: `${prefix} alias-${sites.length}`,
                  },
                }),
              );
            }
            const family = await tx.assetFamily.create({
              data: { code: prefix, name: prefix, controlType: 'BULK' },
            });
            const sku = await tx.sku.create({
              data: { name: prefix, assetFamilyId: family.id },
            });
            const rows = [];
            for (const [index, site] of [
              sites[0],
              sites[0],
              sites[1],
              sites[2],
            ].entries()) {
              const doc = await tx.document.create({
                data: {
                  type: index === 1 ? 'RETURN' : 'REMISSION',
                  customerWorksiteId: site.id,
                  warehouseId: warehouse.id,
                  createdBy: actor.id,
                  consecutive: `${prefix}-${index}`,
                },
              });
              rows.push(
                await tx.stockLedger.create({
                  data: {
                    skuId: sku.id,
                    warehouseId: warehouse.id,
                    ownerWarehouseId: warehouse.id,
                    movementType: index === 1 ? 'IN' : 'OUT',
                    quantity: index === 1 ? 1 : -1,
                    refDocumentId: doc.id,
                    refDocumentType: doc.type,
                    createdBy: actor.id,
                    effectiveAt: new Date(`2024-01-0${index + 1}T15:00:00Z`),
                  },
                }),
              );
            }
            const onSite = await tx.stockLedger.create({
              data: {
                skuId: sku.id,
                customerWorksiteId: sites[0].id,
                ownerWarehouseId: warehouse.id,
                movementType: 'ON_SITE',
                quantity: 1,
                createdBy: actor.id,
                effectiveAt: new Date('2024-01-05T15:00:00Z'),
              },
            });
            // If a ledger row has its own worksite, it must not be attributed to the document's other worksite.
            const mismatch = await tx.stockLedger.create({
              data: {
                skuId: sku.id,
                customerWorksiteId: sites[2].id,
                ownerWarehouseId: warehouse.id,
                refDocumentId: rows[0].refDocumentId,
                movementType: 'TRANSIT',
                quantity: 1,
                createdBy: actor.id,
                effectiveAt: new Date('2024-01-06T15:00:00Z'),
              },
            });
            const service = new InventoryService(
              tx as unknown as PrismaService,
              {} as never,
            );
            const all = await service.getLedger({
              customerId: a.id,
              skuId: sku.id,
            });
            expect(all.items.map((i) => i.id).sort()).toEqual(
              [onSite.id, ...rows.slice(0, 3).map((i) => i.id)].sort(),
            );
            const scoped = {
              customerId: a.id,
              customerWorksiteId: sites[0].id,
              skuId: sku.id,
              take: 1,
            };
            const ids: string[] = [];
            let cursor: string | null = null;
            do {
              const page = await service.getLedger({
                ...scoped,
                cursor: cursor ?? undefined,
              });
              ids.push(...page.items.map((i) => i.id));
              cursor = page.nextCursor;
            } while (cursor);
            expect(ids).toEqual([onSite.id, rows[1].id, rows[0].id]);
            expect(
              (
                await service.getLedger({
                  ...scoped,
                  customerWorksiteId: sites[2].id,
                })
              ).items,
            ).toHaveLength(0);
            expect(
              (
                await service.getLedger({
                  customerId: a.id,
                  warehouseId: warehouse.id,
                  movementType: 'IN',
                  skuId: sku.id,
                })
              ).items.map((i) => i.id),
            ).toEqual([rows[1].id]);
            expect(
              (
                await service.getLedger({
                  search: `${prefix} Mercedes`,
                  skuId: sku.id,
                })
              ).items.map((i) => i.id),
            ).toEqual([
              mismatch.id,
              onSite.id,
              rows[3].id,
              rows[1].id,
              rows[0].id,
            ]);
            expect(
              (
                await service.getLedger({
                  search: `${prefix} alias-1`,
                  skuId: sku.id,
                })
              ).items.map((i) => i.id),
            ).toEqual([rows[2].id]);
            expect(
              (
                await service.getLedger({ skuId: sku.id, customerId: a.id })
              ).items.find((i) => i.id === rows[0].id)?.document
                ?.customerWorksite?.customer.id,
            ).toBe(a.id);
            throw rollback;
          },
          { timeout: 30000 },
        ),
      ).rejects.toBe(rollback);
      expect(await db.stockLedger.count()).toBe(before);
    }, 35000);
  },
);
