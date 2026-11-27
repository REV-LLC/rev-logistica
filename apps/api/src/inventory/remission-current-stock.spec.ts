import { DocumentType, MovementType, Prisma } from '@prisma/client';
import { InventoryService } from './inventory.service';

describe('remission approval after registering provider stock (RM019712)', () => {
  const docDate = new Date('2026-11-26T21:30:00Z');
  const receiptDate = new Date('2026-11-27T19:00:51Z');

  function fixture() {
    const rows = [
      { quantity: 54, movementType: MovementType.ADJUST, effectiveAt: docDate },
      { quantity: 6, movementType: MovementType.ADJUST, effectiveAt: receiptDate },
    ];
    const tx = {
      $queryRaw: jest.fn(async (query: Prisma.Sql) => {
        // Model the historical balance that used to veto an otherwise valid
        // dispatch: the last six units were registered after the document date.
        if (query.text.includes('WITH requested')) return [{
          balance: new Prisma.Decimal(-6), effectiveAt: docDate,
          name: 'PLAQUETA (0.70 M X 1.40 M)', consecutive: null,
        }];
        return [];
      }),
      document: { findUnique: jest.fn().mockResolvedValue({ type: DocumentType.REMISSION, docDate }) },
      warehouse: { findUnique: jest.fn().mockResolvedValue({ id: 'provider' }) },
      customerWorksite: { findUnique: jest.fn().mockResolvedValue({ id: 'site' }) },
      stockLedger: {
        groupBy: jest.fn(async ({ where }) => {
          if (where.movementType === MovementType.ON_SITE) {
            return [{ skuId: 'plaqueta', ownerWarehouseId: 'provider', _sum: {
              quantity: rows.filter(r => r.movementType === MovementType.ON_SITE).reduce((s, r) => s + r.quantity, 0),
            } }];
          }
          if (where.movementType) return [];
          return [{ skuId: 'plaqueta', ownerWarehouseId: 'provider', warehouseId: 'provider', _sum: {
            quantity: rows.filter(r => r.movementType !== MovementType.ON_SITE).reduce((s, r) => s + r.quantity, 0),
          } }];
        }),
        create: jest.fn(async ({ data }) => {
          rows.push(data);
          return { id: 'dispatch' };
        }),
      },
    };
    const prisma = {
      $transaction: (run: (tx: unknown) => unknown) => run(tx),
      warehouse: { findMany: jest.fn().mockResolvedValue([{ id: 'provider' }]) },
    };
    return { rows, tx, service: new InventoryService(prisma as never, { del: jest.fn() } as never) };
  }

  it.each(['moveOut', 'moveOnSite'] as const)(
    '%s uses current stock, preserves documentary dates and prevents spending the same stock twice',
    async method => {
      const { rows, tx, service } = fixture();
      const payload = {
        warehouseId: 'provider', customerWorksiteId: 'site', documentId: 'rm019712',
        items: [{ skuId: 'plaqueta', ownerWarehouseId: 'provider', quantity: 60 }],
      };
      await expect(service[method](payload, 'office')).resolves.toMatchObject({ count: 1 });
      expect(tx.stockLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({
        effectiveAt: docDate, refDocumentId: 'rm019712',
        quantity: method === 'moveOut' ? -60 : 60,
      }) });
      expect(rows[1]).toMatchObject({ quantity: 6, effectiveAt: receiptDate });

      await expect(service[method](payload, 'office')).rejects.toMatchObject({ response: {
        code: 'INSUFFICIENT_STOCK', shortages: [expect.objectContaining({ availableQuantity: 0 })],
      } });
      expect(tx.stockLedger.create).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['moveOut', 'moveOnSite'] as const)('%s rejects a real current shortage without writing movements', async method => {
    const { rows, tx, service } = fixture();
    rows.pop();
    await expect(service[method]({
      warehouseId: 'provider', customerWorksiteId: 'site', documentId: 'rm019712',
      items: [{ skuId: 'plaqueta', ownerWarehouseId: 'provider', quantity: 60 }],
    }, 'office')).rejects.toMatchObject({ response: {
      code: 'INSUFFICIENT_STOCK', shortages: [expect.objectContaining({ availableQuantity: 54, missingQuantity: 6 })],
    } });
    expect(tx.stockLedger.create).not.toHaveBeenCalled();
  });
});
