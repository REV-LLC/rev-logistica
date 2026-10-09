/* Explicitly reviewed local QA operation. Preview is the default; no DATABASE_URL fallback. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const DATABASE = 'configuration_ui_qa_20261002';
const AUTHORIZED_ACCESSORY = 'c1b90a70-6c66-4b8b-a769-699382dd002a';
function localPromotionDatabaseUrl(value) {
  if (!value) throw new Error('Set IMPLEMENTS_QA_DATABASE_URL explicitly. DATABASE_URL is never used.');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '54414' ||
    url.pathname !== `/${DATABASE}` || url.search || url.hash)
    throw new Error('Only the explicitly authorized local QA database on 127.0.0.1:54414 is allowed.');
  return value;
}
function promotionArguments(args) {
  const arg = key => args.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
  const accessoryId = arg('accessory-id');
  if (accessoryId !== AUTHORIZED_ACCESSORY) throw new Error('This local script authorizes exactly the reviewed accessory ID, not a batch.');
  const input = { accessoryId, skuId: arg('sku-id'), effectiveAt: new Date(arg('effective-at') ?? ''),
    ...(arg('parent-legacy-origin-id') ? { parentLegacyOriginId: arg('parent-legacy-origin-id') } : {}),
    ...(arg('asset-description') ? { assetDescription: arg('asset-description') } : {}) };
  if (!input.skuId || !arg('actor-id') || !Number.isFinite(input.effectiveAt.getTime()))
    throw new Error('Provide exact --sku-id, --actor-id and --effective-at.');
  const apply = args.includes('--apply');
  if (apply && (!/^[0-9a-f]{64}$/.test(arg('expected-fingerprint') ?? '') || !arg('backup')))
    throw new Error('--apply requires the reviewed --expected-fingerprint and a verified --backup.');
  return { input, actorId: arg('actor-id'), apply, fingerprint: arg('expected-fingerprint'), backup: arg('backup') };
}
function verifiedPromotionBackup(filename) {
  const actual = fs.realpathSync(filename);
  if (!/^\/private\/tmp\/rev-bucket-identity-[^/]+\/qa-before\.dump$/.test(actual))
    throw new Error('Use the private backup created specifically for this local identity promotion.');
  const contents = fs.readFileSync(actual);
  if (contents.subarray(0, 5).toString() !== 'PGDMP') throw new Error('Backup is not a PostgreSQL custom dump.');
  const result = spawnSync('docker', ['exec', '-i', 'rev-transport-qa-6414', 'pg_restore', '--list'],
    { input: contents, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0 || !result.stdout.includes(`dbname: ${DATABASE}`))
    throw new Error('Could not verify the exact local database in this backup.');
  return { path: actual, bytes: contents.length, sha256: createHash('sha256').update(contents).digest('hex') };
}
const quote = value => `"${value.replaceAll('"', '""')}"`;
const mutableTables = new Set(['ImplementIdentityBridge', 'Asset', 'StockLedger', 'AssetInternalCounter',
  'EquipmentConfiguration', 'EquipmentConfigurationEntry', 'EquipmentConfigurationRevision', 'CommercialProfile', 'CommercialProfileRevision']);
async function protectedFingerprints(tx) {
  const tables = await tx.$queryRawUnsafe(`SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname NOT LIKE 'pg_%' ORDER BY schemaname,tablename`);
  const proof = [];
  for (const table of tables) {
    if (table.schemaname === 'public' && mutableTables.has(table.tablename)) continue;
    const rows = await tx.$queryRawUnsafe(`SELECT count(*)::text AS count,
      md5(coalesce(string_agg(row_hash,'' ORDER BY row_hash),'')) AS hash
      FROM (SELECT md5(to_jsonb(t)::text) AS row_hash FROM ${quote(table.schemaname)}.${quote(table.tablename)} t) rows`);
    proof.push({ table: `${table.schemaname}.${table.tablename}`, ...rows[0] });
  }
  return proof;
}
async function preservedRows(tx) {
  const tables = ['Asset', 'StockLedger', 'EquipmentConfigurationRevision', 'CommercialProfileRevision'];
  return Object.fromEntries(await Promise.all(tables.map(async table => [table,
    await tx.$queryRawUnsafe(`SELECT id,md5(to_jsonb(t)::text) AS hash FROM ${quote(table)} t ORDER BY id`)])));
}
async function run() {
  const options = promotionArguments(process.argv.slice(2));
  const backup = options.apply ? verifiedPromotionBackup(options.backup) : null;
  const { PrismaService } = require('../dist/src/prisma/prisma.service');
  const { ImplementPromotionService } = require('../dist/src/accessories/implement-promotion.service');
  const db = new PrismaService({ datasources: { db: { url: localPromotionDatabaseUrl(process.env.IMPLEMENTS_QA_DATABASE_URL) } } });
  const service = new ImplementPromotionService(db);
  try {
    const result = options.apply ? await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout='5s'");
      assert.equal((await tx.$queryRawUnsafe('SELECT current_database() AS name'))[0].name, DATABASE);
      const before = await protectedFingerprints(tx);
      const preserved = await preservedRows(tx);
      const promoted = await service.promoteInTransaction(tx, options.input, options.actorId, options.fingerprint);
      assert.deepEqual(await protectedFingerprints(tx), before, 'Documents, legacy custody or another protected table changed. Rolling back.');
      const after = await preservedRows(tx);
      for (const table of Object.keys(preserved)) {
        const byId = new Map(after[table].map(row => [row.id, row.hash]));
        for (const row of preserved[table]) assert.equal(byId.get(row.id), row.hash, `${table}: existing history changed. Rolling back.`);
      }
      return promoted;
    }, { isolationLevel: 'ReadCommitted', timeout: 60000 }) : await service.preview(options.input, options.actorId);
    const summary = result.status === 'READY' ? { mode: 'preview-local-only', status: result.status,
      fingerprint: result.fingerprint, source: { id: result.source.id, name: result.source.name },
      targetSku: { id: result.sku.id, name: result.sku.name, family: result.sku.assetFamily.name, subfamily: result.sku.assetSubfamily.name },
      location: result.location, parentLegacyOriginId: options.input.parentLegacyOriginId ?? null,
      assetDescription: options.input.assetDescription ?? result.source.name,
      existingConfigurations: result.configurations.length, dependentCommercialProfiles: result.commercial.referencingProfiles.length,
      copyOwnCommercialProfile: Boolean(result.commercial.ownRevision), openingRows: result.location.customerWorksiteId ? 2 : 1 }
      : { mode: options.apply ? 'apply-local-only' : 'preview-local-only', status: result.status,
        replayed: result.replayed ?? true, bridgeId: result.bridge.id, assetId: result.asset?.id ?? result.bridge.assetId,
        assetName: result.asset?.description ?? result.bridge.asset?.description,
        internalNumber: result.asset?.internalNumber ?? result.bridge.asset?.internalNumber,
        openingLedgerIds: result.openingLedgers?.map(row => row.id), legacyHistoryPreserved: true, backup };
    if (backup) {
      const reportPath = path.join(path.dirname(backup.path), `promotion-${result.bridge.id}-${Date.now()}.json`);
      fs.writeFileSync(reportPath, JSON.stringify({ ...summary, input: options.input }, null, 2), { flag: 'wx', mode: 0o600 });
      summary.reportPath = reportPath;
    }
    console.log(JSON.stringify(summary, null, 2));
  } finally { await db.$disconnect(); }
}
module.exports = { localPromotionDatabaseUrl, promotionArguments, verifiedPromotionBackup };
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
