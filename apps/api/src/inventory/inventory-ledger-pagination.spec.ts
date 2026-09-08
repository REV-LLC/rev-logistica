import { InventoryService } from './inventory.service';

const instant = new Date('2026-09-08T15:00:00Z');
const rows = [
  { id: 'new-first-uuid', appendOrder: 1, effectiveAt: instant, quantity: 1 },
  { id: 'aaa-new-latest', appendOrder: 2, effectiveAt: instant, quantity: -1 },
  { id: 'zzz-legacy', appendOrder: null, effectiveAt: instant, quantity: 1 },
  { id: 'aaa-legacy', appendOrder: null, effectiveAt: instant, quantity: -1 },
  { id: 'older', appendOrder: null, effectiveAt: new Date('2026-09-07T15:00:00Z'), quantity: 1 },
];

function matches(row: Record<string, unknown>, where: Record<string, any>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return condition.every((clause: Record<string, any>) => matches(row, clause));
    if (key === 'OR') return condition.some((clause: Record<string, any>) => matches(row, clause));
    const value = row[key] instanceof Date ? (row[key] as Date).getTime() : row[key];
    if (condition instanceof Date) return value === condition.getTime();
    if (condition !== null && typeof condition === 'object') {
      if (value === null) return false; // SQL NULL never satisfies < or >.
      return Object.entries(condition).every(([operator, expected]) => {
        const other = expected instanceof Date ? expected.getTime() : expected;
        return operator === 'lt' ? (value as any) < other!
          : operator === 'gte' ? (value as any) >= other!
            : operator === 'lte' ? (value as any) <= other! : false;
      });
    }
    return value === condition;
  });
}

function fixture() {
  const prisma = { stockLedger: {
    findUnique: jest.fn(async ({ where }) => rows.find((row) => row.id === where.id) ?? null),
    findMany: jest.fn(async ({ where, orderBy, take }) => rows.filter((row) => matches(row, where))
      .sort((left, right) => {
        for (const clause of orderBy) {
          const [key, value] = Object.entries(clause)[0] as [keyof typeof left, any];
          const a = left[key] instanceof Date ? (left[key] as Date).getTime() : left[key];
          const b = right[key] instanceof Date ? (right[key] as Date).getTime() : right[key];
          if (a === b) continue;
          if (a === null) return value.nulls === 'last' ? 1 : -1;
          if (b === null) return value.nulls === 'last' ? -1 : 1;
          const direction = typeof value === 'object' ? value.sort : value;
          return (a > b ? 1 : -1) * (direction === 'desc' ? -1 : 1);
        }
        return 0;
      }).slice(0, take)),
  } };
  return { prisma, service: new InventoryService(prisma as never, {} as never) };
}

describe('ledger append-order cursor pagination', () => {
  it('paginates new appends then null legacy UUIDs at the same timestamp without omission or duplication', async () => {
    const { service, prisma } = fixture();
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.getLedger({ take: 1, cursor });
      seen.push(...page.items.map((row) => row.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(['aaa-new-latest', 'new-first-uuid', 'zzz-legacy', 'aaa-legacy', 'older']);
    expect(new Set(seen).size).toBe(rows.length);
    expect(prisma.stockLedger.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['aaa-new-latest', ['aaa-legacy', 'older']],
    ['zzz-legacy', ['new-first-uuid', 'aaa-new-latest', 'aaa-legacy', 'older']],
  ])('continues the original order of an old effectiveAt/id cursor from %s', async (id, expected) => {
    const { service, prisma } = fixture();
    const cursor = Buffer.from(JSON.stringify({ effectiveAt: instant.toISOString(), id })).toString('base64');
    const result = await service.getLedger({ take: 10, cursor });
    expect(result.items.map((row) => row.id)).toEqual(expected);
    expect(prisma.stockLedger.findUnique).not.toHaveBeenCalled();
  });

  it('does not omit new rows after a first page served by the old API during rollout', async () => {
    const { service } = fixture();
    // The old API sorted by UUID and already returned zzz-legacy first.
    const seen = ['zzz-legacy'];
    let cursor: string | undefined = Buffer.from(JSON.stringify({
      effectiveAt: instant.toISOString(), id: seen[0],
    })).toString('base64');
    do {
      const page = await service.getLedger({ take: 1, cursor });
      seen.push(...page.items.map((row) => row.id));
      cursor = page.nextCursor ?? undefined;
      if (cursor) expect(JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'))).not.toHaveProperty('appendOrder');
    } while (cursor);
    expect(seen).toEqual(['zzz-legacy', 'new-first-uuid', 'aaa-new-latest', 'aaa-legacy', 'older']);
    expect(new Set(seen).size).toBe(rows.length);
    // Restarting the listing opts into the new, explicit append ordering.
    expect((await service.getLedger({ take: 1 })).items[0].id).toBe('aaa-new-latest');
  });

  it('preserves the earliest legacy createdAt/id cursor format', async () => {
    const { service } = fixture();
    const cursor = JSON.stringify({ createdAt: instant.toISOString(), id: 'zzz-legacy' });
    expect((await service.getLedger({ take: 10, cursor })).items.map((row) => row.id))
      .toEqual(['new-first-uuid', 'aaa-new-latest', 'aaa-legacy', 'older']);
  });

  it.each([-1, 0, 1.1, '2', {}])('rejects malformed explicit append orders: %s', async (appendOrder) => {
    const { service, prisma } = fixture();
    const cursor = JSON.stringify({ effectiveAt: instant.toISOString(), id: 'some-row', appendOrder });
    await expect(service.getLedger({ cursor })).rejects.toThrow('Invalid cursor');
    expect(prisma.stockLedger.findMany).not.toHaveBeenCalled();
  });
});
