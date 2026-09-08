import { MovementType, Prisma } from '@prisma/client';
import { InventoryService } from './inventory.service';

describe('InventoryService ledger search', () => {
  function createService(rows: unknown[] = []) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const service = new InventoryService(
      { stockLedger: { findMany } } as never,
      {} as never,
    );
    return { service, findMany };
  }

  it('filters document numbers in the database before limiting the history page', async () => {
    const historicalMovement = {
      id: 'old-movement',
      quantity: new Prisma.Decimal(2),
      effectiveAt: new Date('2024-01-10T13:30:00Z'),
      document: { consecutive: 'RM-19001' },
    };
    const { service, findMany } = createService([historicalMovement]);

    const result = await service.getLedger({ search: '  rm-19001  ', take: 30 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 30,
        where: {
          AND: [
            {
              OR: expect.arrayContaining([
                {
                  document: {
                    consecutive: { contains: 'rm-19001', mode: 'insensitive' },
                  },
                },
              ]),
            },
          ],
        },
      }),
    );
    expect(result.items).toEqual([{ ...historicalMovement, quantity: 2 }]);
    expect(result.nextCursor).toBeNull();
  });

  it('retains search and explicit filters on subsequent pages', async () => {
    const row = {
      id: 'movement-1',
      quantity: new Prisma.Decimal(1),
      effectiveAt: new Date('2026-01-10T13:30:00Z'),
    };
    const { service, findMany } = createService([row]);
    const query = {
      search: 'motor ABC',
      movementType: MovementType.OUT,
      warehouseId: 'warehouse-1',
      from: '2025-01-01T00:00:00Z',
      take: 1,
    };
    const firstPage = await service.getLedger(query);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    await service.getLedger({ ...query, cursor: firstPage.nextCursor! });

    const firstWhere = findMany.mock.calls[0][0].where;
    const secondWhere = findMany.mock.calls[1][0].where;
    expect(secondWhere).toEqual({
      ...firstWhere,
      AND: [
        ...firstWhere.AND,
        {
          OR: [
            { effectiveAt: { lt: row.effectiveAt } },
            { effectiveAt: row.effectiveAt, id: { lt: row.id } },
          ],
        },
      ],
    });
    expect(secondWhere.movementType).toBe(MovementType.OUT);
    expect(secondWhere.warehouseId).toBe('warehouse-1');
    expect(secondWhere.effectiveAt.gte).toEqual(new Date(query.from));
    expect(firstWhere.AND).toHaveLength(2);
    expect(firstWhere.AND[1].OR).toEqual(
      expect.arrayContaining([
        { asset: { serialOrEngine: { contains: 'ABC', mode: 'insensitive' } } },
      ]),
    );
  });

  it('searches item descriptions, locations, and responsible people', async () => {
    const { service, findMany } = createService();
    await service.getLedger({ search: 'Ana Pérez' });
    const conditions = findMany.mock.calls[0][0].where.AND;

    expect(conditions[0].OR).toEqual(
      expect.arrayContaining([
        { sku: { name: { contains: 'Ana', mode: 'insensitive' } } },
        { asset: { description: { contains: 'Ana', mode: 'insensitive' } } },
        { warehouse: { name: { contains: 'Ana', mode: 'insensitive' } } },
      ]),
    );
    expect(conditions[1].OR).toEqual(
      expect.arrayContaining([
        {
          document: {
            creator: {
              OR: expect.arrayContaining([
                { employee: { lastName: { contains: 'Pérez', mode: 'insensitive' } } },
              ]),
            },
          },
        },
      ]),
    );
  });

  it('recognizes Spanish movement labels with or without accents', async () => {
    const { service, findMany } = createService();
    await service.getLedger({ search: 'transito' });
    expect(findMany.mock.calls[0][0].where.AND[0].OR).toContainEqual({
      movementType: { in: [MovementType.TRANSIT] },
    });
  });

  it('leaves the history unrestricted when search is empty', async () => {
    const { service, findMany } = createService();
    await service.getLedger({ search: '   ' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});
