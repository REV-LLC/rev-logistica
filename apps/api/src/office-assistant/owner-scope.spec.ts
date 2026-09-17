import { requestedOwnerScope, scopeOfficeQuery } from './owner-scope';

describe('Office ownership reporting scope', () => {
  it('recognizes explicit REV ownership without narrowing mixed questions', () => {
    expect(requestedOwnerScope('¿Dónde están los tornillos de REV?')).toBe('INTERNAL');
    expect(requestedOwnerScope('Equipos propios en obra')).toBe('INTERNAL');
    expect(requestedOwnerScope('Tornillos de REV y de proveedores')).toBeUndefined();
    expect(requestedOwnerScope('¿Cuántos tornillos hay en general?')).toBeUndefined();
  });
  it('filters rows before SUM even when the model omits ownership', () => {
    const sql = scopeOfficeQuery('SELECT SUM(quantity) FROM rev_office.inventory_balances', 'INTERNAL');
    expect(sql).toContain("owner_category = ('INTERNAL')");
    expect(sql).toContain('AS inventory_balances');
  });
  it('preserves aliases and scopes every side of a join', () => {
    const sql = scopeOfficeQuery('SELECT b.quantity FROM rev_office.inventory_balances b LEFT JOIN rev_office.assets a ON a.asset_id=b.asset_id', 'INTERNAL');
    expect(sql.match(/owner_category/g)).toHaveLength(2);
    expect(sql).toContain('AS b');
    expect(sql).toContain('AS a');
    expect(sql).toContain('LEFT JOIN');
  });
  it('applies scope inside nested queries and unions', () => {
    const sql = scopeOfficeQuery('SELECT * FROM (SELECT quantity FROM rev_office.inventory_balances UNION ALL SELECT quantity FROM rev_office.inventory_balances) x', 'INTERNAL');
    expect(sql.match(/owner_category/g)).toHaveLength(2);
  });
  it('scopes movement ownership through its owner warehouse', () => {
    expect(scopeOfficeQuery('SELECT SUM(quantity) FROM rev_office.movements', 'INTERNAL')).toContain('owner_warehouse_id');
  });
  it('leaves reference discovery and unscoped queries available', () => {
    expect(scopeOfficeQuery('SELECT item_name FROM rev_office.catalog', 'INTERNAL')).not.toContain('owner_category');
    expect(scopeOfficeQuery('SELECT SUM(quantity) FROM rev_office.inventory_balances')).not.toContain('owner_category');
  });
  it('rejects unsafe SQL and ambiguous document ownership', () => {
    expect(() => scopeOfficeQuery('DELETE FROM rev_office.catalog', 'INTERNAL')).toThrow();
    expect(() => scopeOfficeQuery('SELECT quantity FROM rev_office.document_items', 'INTERNAL')).toThrow('propietarios');
  });
});
