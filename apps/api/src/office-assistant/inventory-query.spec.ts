import { inventoryParameters, inventoryQuery } from './inventory-query';
import { scopeOfficeQuery } from './owner-scope';
import { validateOfficeQuery } from './query-policy';

const defaults = { terms: ['tornill', 'nivel'], location: 'WORKSITE', ownership: 'ALL', groupBy: 'LOCATION' } as const;
describe('prepared inventory query', () => {
  it.each(['LOCATION', 'ITEM', 'CUSTOMER', 'OWNER', 'ASSET'] as const)('uses validated read-only SQL for %s', (groupBy) => {
    const sql = inventoryQuery({ ...defaults, terms: [...defaults.terms], groupBy });
    expect(validateOfficeQuery(sql).views).toEqual(['inventory_balances']);
    expect(sql).toContain('SUM(quantity) AS cantidad');
    expect(sql).not.toContain('LIMIT');
    expect(sql).toContain("location_type = 'WORKSITE'");
    expect(sql).toContain('balance_valid');
    expect(sql).toContain('sku_id, owner_id');
    expect(sql).not.toContain('quantity > 0'); // invalid balances stay visible, separately grouped
  });
  it('escapes names as data and rejects SQL pattern characters', () => {
    const sql = inventoryQuery({ ...defaults, terms: ["a' OR true --"] });
    expect(validateOfficeQuery(sql).views).toEqual(['inventory_balances']);
    expect(sql).toContain("a'' OR true --");
    for (const term of ['%', '_', '\\', '\u0000']) {
      expect(() => inventoryQuery({ ...defaults, terms: [term] })).toThrow();
    }
    expect(inventoryParameters.safeParse({ ...defaults, location: "WORKSITE' OR true" }).success).toBe(false);
  });
  it('enforces REV ownership server-side even if the model selects ALL', () => {
    const sql = scopeOfficeQuery(inventoryQuery({ ...defaults, terms: [] }), 'INTERNAL');
    expect(sql).toContain('INTERNAL');
    expect(validateOfficeQuery(sql).views).toEqual(['inventory_balances']);
  });
});
