import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { assertBulkSourceTimeline } from './bulk-source-timeline';

const url = process.env.BULK_TIMELINE_QA_URL;
if (url && !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('Timeline QA requires a local PostgreSQL connection.');
}
const at = (day: number) =>
  new Date(`2026-08-${String(day).padStart(2, '0')}T12:00:00Z`);

(url ? describe : describe.skip)(
  'backdated bulk stock, real PostgreSQL',
  () => {
    let db: Client;
    let tx: Prisma.TransactionClient;
    beforeEach(async () => {
      db = new Client({ connectionString: url });
      await db.connect();
      await db.query('BEGIN');
      const schema = 'bulk_timeline_qa_' + randomUUID().replace(/-/g, '');
      await db.query(`CREATE SCHEMA "${schema}"`);
      await db.query(`SET LOCAL search_path TO "${schema}"`);
      await db.query(`CREATE TABLE "Sku" (id text PRIMARY KEY, name text);
      CREATE TABLE "Document" (id text PRIMARY KEY, consecutive text);
      CREATE TABLE "StockLedger" (id text PRIMARY KEY, "skuId" text, "assetId" text,
        "ownerWarehouseId" text, "warehouseId" text, "customerWorksiteId" text,
        "movementType" text, quantity numeric, "effectiveAt" timestamp,
        "createdAt" timestamp DEFAULT now(), "appendOrder" serial,
        "refDocumentId" text, "isOpeningBalance" boolean DEFAULT false);
      INSERT INTO "Sku" VALUES ('sku', 'RUEDAS NIVELADORAS'), ('other', 'OTRO MATERIAL');
      INSERT INTO "Document" VALUES ('later-return', 'DV019171');`);
      tx = {
        $queryRaw: async (query: Prisma.Sql) =>
          (await db.query(query.text, query.values)).rows,
      } as never;
    });
    afterEach(async () => {
      await db.query('ROLLBACK');
      await db.end();
    });
    async function ledger(
      day: number,
      type: string,
      quantity: string | number,
      options: {
        owner?: string;
        sku?: string;
        warehouse?: string | null;
        site?: string | null;
        opening?: boolean;
        document?: string;
      } = {},
    ) {
      await db.query(
        `INSERT INTO "StockLedger"
      (id,"skuId","ownerWarehouseId","warehouseId","customerWorksiteId","movementType",quantity,"effectiveAt","isOpeningBalance","refDocumentId")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          randomUUID(),
          options.sku ?? 'sku',
          options.owner ?? 'owner',
          options.warehouse === undefined ? 'warehouse' : options.warehouse,
          options.site === undefined ? 'site' : options.site,
          type,
          quantity,
          at(day),
          options.opening ?? false,
          options.document ?? null,
        ],
      );
    }
    const source = (quantity: number, locationId = 'site') => [
      { skuId: 'sku', ownerWarehouseId: 'owner', quantity, locationId },
    ];

    it('rejects a retroactive return which leaves a later confirmed return negative despite positive final stock', async () => {
      await ledger(1, 'ON_SITE', 5, { warehouse: null });
      await ledger(4, 'IN', 4, { document: 'later-return' });
      await ledger(6, 'OUT', -2);
      await expect(
        assertBulkSourceTimeline(tx, 'WORKSITE', source(2), at(2)),
      ).rejects.toThrow('DV019171');
      expect(
        (await db.query('SELECT COUNT(*) FROM "StockLedger"')).rows[0].count,
      ).toBe('3');
    });
    it('never borrows units from a future delivery, another SKU or owner', async () => {
      await ledger(1, 'ON_SITE', 100, { owner: 'other' });
      await ledger(1, 'ON_SITE', 100, { sku: 'other' });
      await ledger(6, 'OUT', -5);
      await expect(
        assertBulkSourceTimeline(tx, 'WORKSITE', source(1), at(2)),
      ).rejects.toThrow('-1 unidades');
    });
    it('allows an actual spare unit and a valid retroactive return', async () => {
      await ledger(1, 'ON_SITE', 5, { warehouse: null });
      await ledger(4, 'IN', 2);
      await expect(
        assertBulkSourceTimeline(tx, 'WORKSITE', source(1), at(2)),
      ).resolves.toBeUndefined();
    });
    it('guards direct provider transit returns with the same worksite chronology', async () => {
      await ledger(1, 'ON_SITE', 5, { warehouse: null });
      await ledger(4, 'TRANSIT', 5, {
        warehouse: null,
        document: 'later-return',
      });
      await ledger(6, 'OUT', -3);
      await expect(
        assertBulkSourceTimeline(tx, 'WORKSITE', source(1), at(2)),
      ).rejects.toThrow('DV019171');
    });
    it('also rejects a dispatch funded by a future warehouse receipt', async () => {
      await ledger(6, 'ADJUST', 5, { site: null });
      await expect(
        assertBulkSourceTimeline(
          tx,
          'WAREHOUSE',
          source(1, 'warehouse'),
          at(2),
        ),
      ).rejects.toThrow('bodega de origen');
    });
    it('reserves future warehouse dispatches and counts ON_SITE deductions from the owner warehouse', async () => {
      await ledger(1, 'ADJUST', 5, { site: null, warehouse: 'owner' });
      await ledger(4, 'ON_SITE', 5, { warehouse: null });
      await ledger(6, 'ADJUST', 2, { site: null, warehouse: 'owner' });
      await expect(
        assertBulkSourceTimeline(tx, 'WAREHOUSE', source(1, 'owner'), at(2)),
      ).rejects.toThrow('-1 unidades');
    });
    it('matches direct-owner availability for returns in provider transit without borrowing future stock', async () => {
      await ledger(1, 'ADJUST', 5, { site: null, warehouse: 'owner' });
      await ledger(2, 'ON_SITE', 5, { warehouse: null });
      await ledger(4, 'TRANSIT', 2, { warehouse: null });
      await expect(
        assertBulkSourceTimeline(tx, 'OWNER', source(1, 'owner'), at(3)),
      ).rejects.toThrow();
      await expect(
        assertBulkSourceTimeline(tx, 'OWNER', source(2, 'owner'), at(5)),
      ).resolves.toBeUndefined();
    });
    it('keeps catalogue opening balances available irrespective of audit date', async () => {
      await ledger(6, 'ADJUST', 5, { opening: true, site: null });
      await expect(
        assertBulkSourceTimeline(
          tx,
          'WAREHOUSE',
          source(5, 'warehouse'),
          at(2),
        ),
      ).resolves.toBeUndefined();
    });
    it('sums repeated candidate rows and retains exact decimal quantities', async () => {
      await ledger(1, 'ON_SITE', '0.3', { warehouse: null });
      await expect(
        assertBulkSourceTimeline(
          tx,
          'WORKSITE',
          [...source(0.1), ...source(0.2)],
          at(2),
        ),
      ).resolves.toBeUndefined();
      await ledger(4, 'IN', '0.000000000000000000000000000001');
      await expect(
        assertBulkSourceTimeline(
          tx,
          'WORKSITE',
          [...source(0.1), ...source(0.2)],
          at(2),
        ),
      ).rejects.toThrow();
    });
    it('appends after an existing return at the exact instant without rewriting its order', async () => {
      await ledger(1, 'ON_SITE', 5, { warehouse: null });
      await ledger(2, 'IN', 4);
      await expect(
        assertBulkSourceTimeline(tx, 'WORKSITE', source(2), at(2)),
      ).rejects.toThrow();
      await expect(
        assertBulkSourceTimeline(tx, 'WORKSITE', source(1), at(2)),
      ).resolves.toBeUndefined();
    });
  },
);
