import { OfficeDatabaseService } from './office-database.service';
import { OFFICE_VIEWS } from './query-policy';

describe('Office database metadata cache and value types', () => {
  const oldUrl = process.env.OFFICE_ASSISTANT_DATABASE_URL;
  afterEach(() => {
    jest.restoreAllMocks();
    if (oldUrl === undefined) delete process.env.OFFICE_ASSISTANT_DATABASE_URL;
    else process.env.OFFICE_ASSISTANT_DATABASE_URL = oldUrl;
  });
  function databaseFixture() {
    process.env.OFFICE_ASSISTANT_DATABASE_URL = 'postgresql://rev_office_reader:synthetic@localhost/test';
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM pg_roles')) return { rows: [{ safe: true }] };
      if (sql.includes('information_schema.columns')) return { rows: OFFICE_VIEWS.map(table_name => ({ table_name, column_name: 'nombre', data_type: 'text' })) };
      if (sql.startsWith('SELECT * FROM (')) return {
        fields: [{ name: 'cantidad', dataTypeID: 1700 }, { name: 'fecha', dataTypeID: 1082 }, { name: 'momento', dataTypeID: 1114 }, { name: 'serial', dataTypeID: 25 }],
        rows: [{ cantidad: '12.5000', fecha: new Date(2026, 8, 15), momento: new Date('2026-09-15T14:00:00Z'), serial: '00123' }],
      };
      return { rows: [] };
    });
    const pool = { connect: jest.fn().mockResolvedValue({ query, release: jest.fn() }) };
    const db = new OfficeDatabaseService();
    // Inject only the transport boundary. Real transactions, checks and policy run.
    (db as unknown as { pool: unknown }).pool = pool;
    return { db, pool, query };
  }
  it('caches schema metadata only, honors expiry, and status can force a fresh check', async () => {
    const { db, pool } = databaseFixture();
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    expect(await db.schema(['catalog'])).toContain('rev_office.catalog');
    const subset = await db.schema(['customers']);
    expect(subset).toContain('rev_office.customers');
    expect(subset).not.toContain('rev_office.catalog');
    expect(pool.connect).toHaveBeenCalledTimes(1);
    now += 300001;
    await db.schema(['customers']);
    expect(pool.connect).toHaveBeenCalledTimes(2);
    await db.schema(undefined, true);
    expect(pool.connect).toHaveBeenCalledTimes(3);
    await expect(db.schema(['User'])).rejects.toThrow('Vista no autorizada');
  });
  it('reads new rows and checks privileges on every query, preserving dates and precision', async () => {
    const { db, query } = databaseFixture();
    await db.schema();
    const sql = 'SELECT quantity AS cantidad FROM rev_office.inventory_balances';
    const first = await db.query(sql, 'Prueba', '1');
    await db.query(sql, 'Prueba', '2');
    expect(query.mock.calls.filter(([sql]) => sql.includes('FROM pg_roles'))).toHaveLength(3);
    expect(query.mock.calls.filter(([sql]) => sql.startsWith('SELECT * FROM ('))).toHaveLength(2);
    expect(first.rows[0]).toMatchObject({ cantidad: '12.5', fecha: '2026-09-15', serial: '00123' });
    expect(first.columnTypes).toEqual({ cantidad: 'number', fecha: 'date', momento: 'datetime', serial: 'text' });
  });
});
