import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const url = process.env.ACCESSORY_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (!['localhost', '127.0.0.1'].includes(target.hostname) || !/^\/accessory_qa_[a-z0-9_]+$/.test(target.pathname))
    throw new Error('Cutover tests require an isolated local accessory_qa_* database.');
}
const migration = (name: string) => readFileSync(resolve(__dirname, '../../prisma/migrations', name, 'migration.sql'), 'utf8')
  .replace(/^BEGIN;\s*$/gm, '').replace(/^COMMIT;\s*$/gm, '');
const handoff = migration('20260928120000_configuration_cutover');
const correction = migration('20260928121000_confirmed_mixer_half_bag');

(url ? describe : describe.skip)('Configuration cutover on isolated PostgreSQL', () => {
  let db: Client;
  beforeEach(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query('BEGIN');
  });
  afterEach(async () => {
    await db.query('ROLLBACK');
    await db.end();
  });
  const fingerprint = async (table: string) => (await db.query(`SELECT count(*)::text AS count,
    md5(string_agg(to_jsonb(t)::text, '' ORDER BY id)) AS hash FROM "${table}" t`)).rows;
  const fingerprints = async (tables: string[]) => {
    const values: unknown[] = [];
    for (const table of tables) values.push(await fingerprint(table));
    return values;
  };

  it('preserves all historical stock/documents and existing edited configurations on replay', async () => {
    const tables = ['DocumentItem', 'StockLedger', 'AccessoryBalance', 'AccessoryMovement', 'Asset', 'EquipmentConfiguration', 'EquipmentConfigurationEntry', 'EquipmentConfigurationRevision'];
    // A fresh clone may include assets created after the original deployment.
    // The first pass can create their missing recipes, but never change stock.
    const protectedTables = tables.slice(0, 5);
    const originalHistory = await fingerprints(protectedTables);
    await db.query(handoff);
    expect(await fingerprints(protectedTables)).toEqual(originalHistory);
    // Deployment replays run in separate transactions, where ON COMMIT DROP
    // clears this helper. Our rollback harness keeps a single transaction.
    await db.query('DROP TABLE pg_temp.configuration_cutover_assets');
    const before = await fingerprints(tables);
    await db.query(handoff);
    expect(await fingerprints(tables)).toEqual(before);
  });

  it('migrates an optional family choice without creating stock, defaults, motors or exclusive transport groups', async () => {
    const parentFamily = randomUUID(), childFamily = randomUUID(), sku = randomUUID(), asset = randomUUID();
    const owner = (await db.query('SELECT id FROM "Warehouse" LIMIT 1')).rows[0].id;
    await db.query('INSERT INTO "AssetFamily" (id,code,name,"controlType") VALUES ($1,$1,$1,\'SERIAL\')', [parentFamily]);
    await db.query('INSERT INTO "AssetFamily" (id,code,name,"controlType") VALUES ($1,\'MARTILLO_NEUMATICO\',\'APT\',\'SERIAL\') ON CONFLICT(code) DO NOTHING', [childFamily]);
    const child = (await db.query('SELECT id FROM "AssetFamily" WHERE code=\'MARTILLO_NEUMATICO\'')).rows[0].id;
    await db.query('INSERT INTO "AssetFamilyComponent" (id,"parentAssetFamilyId","componentAssetFamilyId","maximumQuantity","exclusiveGroup","updatedAt") VALUES ($1,$2,$3,1,\'LEGACY GROUP\',now())', [randomUUID(),parentFamily,child]);
    await db.query('INSERT INTO "Sku" (id,name,"assetFamilyId") VALUES ($1,$1,$2)',[sku,parentFamily]);
    await db.query('INSERT INTO "Asset" (id,"skuId","publicCode","internalNumber","warehouseOwnerId","warehouseCurrentId") VALUES ($1,$2,$1,1,$3,$3)',[asset,sku,owner]);
    const before = await fingerprint('StockLedger');
    await db.query(handoff);
    const entries = (await db.query('SELECT e.* FROM "EquipmentConfigurationEntry" e JOIN "EquipmentConfiguration" c ON c.id=e."configurationId" WHERE c."assetId"=$1',[asset])).rows;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({role:'ACCESSORY',familyId:child,assetId:null,accessoryId:null,quantity:1,maximumQuantity:1,defaultIncluded:false,required:false});
    expect(await fingerprint('StockLedger')).toEqual(before);
  });

  it('fails closed on unknown legacy classifications instead of guessing a component/accessory', async () => {
    const parent=randomUUID(), child=randomUUID();
    for (const id of [parent,child]) await db.query('INSERT INTO "AssetFamily" (id,code,name,"controlType") VALUES ($1,$1,$1,\'SERIAL\')',[id]);
    await db.query('INSERT INTO "AssetFamilyComponent" (id,"parentAssetFamilyId","componentAssetFamilyId","updatedAt") VALUES ($1,$2,$3,now())',[randomUUID(),parent,child]);
    await expect(db.query(handoff)).rejects.toThrow('Unreviewed legacy family rule');
  });

  it('does not modify other mixers or replay the confirmed correction twice', async () => {
    const before = await fingerprint('Asset');
    await db.query(correction);
    expect(await fingerprint('Asset')).toEqual(before);
  });

  it('rejects a conflicting identity for the explicitly confirmed mixer', async () => {
    const changed = await db.query('UPDATE "Asset" SET "internalNumber"=999 WHERE id=\'8ea3d2fa-5894-4fcb-b668-55423ac817ab\'');
    if (!changed.rowCount) return; // A clone without that production asset has no correction target.
    await expect(db.query(correction)).rejects.toThrow('Confirmed mixer #6 identity');
  });
});
