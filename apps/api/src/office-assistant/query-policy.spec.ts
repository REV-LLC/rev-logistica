import { validateOfficeQuery } from './query-policy';

describe('Office SQL boundary', () => {
  it('allows grouped statistics, joins and safe subqueries', () => {
    const result = validateOfficeQuery(`SELECT c.item_name, SUM(i.quantity) AS unidades
      FROM rev_office.inventory_balances i JOIN rev_office.catalog c ON c.sku_id = i.sku_id
      WHERE i.location_type = 'WORKSITE' AND i.quantity > 0
      GROUP BY c.item_name ORDER BY unidades DESC`);
    expect(result.views).toEqual(['inventory_balances', 'catalog']);
    expect(validateOfficeQuery('SELECT count(*) FROM (SELECT sku_id FROM rev_office.catalog) c').views).toEqual(['catalog']);
  });

  it.each([
    'DELETE FROM rev_office.customers',
    'UPDATE rev_office.catalog SET price = 0',
    'SELECT * FROM rev_office.catalog; DELETE FROM public."Sku"',
    'WITH x AS (DELETE FROM rev_office.customers RETURNING *) SELECT * FROM x',
    'SELECT * INTO TEMP stolen FROM rev_office.customers',
    'SELECT * FROM rev_office.catalog FOR UPDATE',
    'SELECT * FROM public."User"',
    'SELECT * FROM pg_catalog.pg_authid',
    'SELECT * FROM rev_office.catalog UNION ALL SELECT * FROM public."User"',
    'SELECT (SELECT email FROM public."User" LIMIT 1) FROM rev_office.catalog',
    "SELECT pg_read_file('/etc/passwd') FROM rev_office.catalog",
    "SELECT set_config('default_transaction_read_only', 'off', false) FROM rev_office.catalog",
    'SELECT pg_sleep(20) FROM rev_office.catalog',
    'SELECT public.sum(quantity) FROM rev_office.inventory_balances',
    "SELECT 'public.User'::regclass FROM rev_office.catalog",
    "SELECT quantity::public.custom_type FROM rev_office.inventory_balances",
    'SELECT * FROM rev_office.catalog WHERE EXISTS (SELECT * FROM public."User")',
    "COPY (SELECT * FROM rev_office.customers) TO '/tmp/office.csv'",
    'SET ROLE rev',
  ])('rejects writes and data/function escape: %s', (sql) => {
    expect(() => validateOfficeQuery(sql)).toThrow();
  });

  it('accepts SQL-like text as a value, not a statement', () => {
    expect(() => validateOfficeQuery("SELECT sku_id FROM rev_office.catalog WHERE item_name = 'delete; drop table User'" )).not.toThrow();
  });
});
