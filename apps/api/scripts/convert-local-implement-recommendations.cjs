/*
 * Explicit local QA conversion, not a deployment migration.
 * Only configuration rules change. No identities, links, documents or stock
 * are created, deleted or rewritten. Preview is the default.
 */
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');

const DATABASE = 'configuration_ui_qa_20261002';
const SOURCE = 'LOCAL_IMPLEMENT_RECOMMENDATIONS_V1';
const MUTABLE_TABLES = new Set([
  'EquipmentConfiguration', 'EquipmentConfigurationEntry',
  'EquipmentConfigurationRevision', 'EquipmentConfigurationArchive',
]);

function localDatabaseUrl(value) {
  if (!value) throw new Error('Set IMPLEMENTS_QA_DATABASE_URL explicitly. DATABASE_URL is never used.');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== '127.0.0.1' || url.port !== '54414' ||
      url.pathname !== `/${DATABASE}` || url.search || url.hash)
    throw new Error('Only the explicitly authorized local QA database on 127.0.0.1:54414 is allowed.');
  return value;
}

function recommendedRule(entry) {
  return {
    ...entry,
    recommendation: Boolean(entry.recommendation || entry.familyId || entry.required ||
      entry.maximumQuantity != null || entry.defaultIncluded),
    required: false,
    maximumQuantity: null,
  };
}

function ruleChanged(entry) {
  const next = recommendedRule(entry);
  return next.recommendation !== entry.recommendation ||
    next.required !== entry.required || next.maximumQuantity !== entry.maximumQuantity;
}

// These are the ONLY three entry fields the conversion is allowed to change.
function unchangedEntry(entry) {
  const { recommendation, required, maximumQuantity, ...identity } = entry;
  return identity;
}

function unchangedConfiguration(configuration) {
  const { version, updatedAt, entries, ...identity } = configuration;
  return { ...identity, entries: entries.map(unchangedEntry) };
}

const quote = value => `"${value.replaceAll('"', '""')}"`;
const json = value => JSON.stringify(value);

async function fingerprints(client) {
  const tables = (await client.query(`SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      AND schemaname NOT LIKE 'pg_%' ORDER BY schemaname, tablename`)).rows;
  const result = [];
  for (const { schemaname, tablename } of tables) {
    if (schemaname === 'public' && MUTABLE_TABLES.has(tablename)) continue;
    // Hash row contents, not just IDs/counts. No personal data leaves the DB.
    const row = (await client.query(`SELECT count(*)::text AS count,
      md5(coalesce(string_agg(row_hash, '' ORDER BY row_hash), '')) AS hash
      FROM (SELECT md5(to_jsonb(t)::text) AS row_hash
        FROM ${quote(schemaname)}.${quote(tablename)} t) rows`)).rows[0];
    result.push({ table: `${schemaname}.${tablename}`, ...row });
  }
  return result;
}

async function configurations(client) {
  return (await client.query(`SELECT to_jsonb(c) || jsonb_build_object('entries',
    coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)
      FROM "EquipmentConfigurationEntry" e WHERE e."configurationId"=c.id), '[]'::jsonb)) AS value
    FROM "EquipmentConfiguration" c ORDER BY c.id`)).rows.map(row => row.value);
}

function verifiedBackup(filename) {
  if (!filename) throw new Error('--apply requires --backup=/private/tmp/rev-implement-conversion-*/qa-before.dump');
  const actual = fs.realpathSync(filename);
  if (!/^\/private\/tmp\/rev-implement-conversion-[^/]+\/qa-before\.dump$/.test(actual))
    throw new Error('Backup must be in the private local conversion directory.');
  const contents = fs.readFileSync(actual);
  if (contents.subarray(0, 5).toString() !== 'PGDMP') throw new Error('Backup is not a PostgreSQL custom dump.');
  const check = spawnSync('docker', ['exec', '-i', 'rev-transport-qa-6414', 'pg_restore', '--list'],
    { input: contents, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (check.status !== 0 || !check.stdout.includes(`dbname: ${DATABASE}`))
    throw new Error('Backup does not identify the authorized QA database or could not be validated.');
  fs.chmodSync(actual, 0o600);
  return { path: actual, bytes: contents.length, sha256: createHash('sha256').update(contents).digest('hex') };
}

async function run() {
  const apply = process.argv.includes('--apply');
  const backupArg = process.argv.find(arg => arg.startsWith('--backup='))?.slice('--backup='.length);
  const backup = apply ? verifiedBackup(backupArg) : null;
  const client = new Client({ connectionString: localDatabaseUrl(process.env.IMPLEMENTS_QA_DATABASE_URL) });
  await client.connect();
  let committed = false;
  let report;
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='30s'");
    assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name, DATABASE);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('equipment-configuration', 0))");
    const before = await configurations(client);
    const affected = before.filter(config => config.entries.some(ruleChanged));
    const entries = before.flatMap(config => config.entries);
    report = {
      mode: apply ? 'apply-local-only' : 'preview', database: DATABASE,
      configurations: before.length, entries: entries.length,
      changedConfigurations: affected.length, changedEntries: entries.filter(ruleChanged).length,
      requiredBefore: entries.filter(entry => entry.required).length,
      cappedBefore: entries.filter(entry => entry.maximumQuantity != null).length,
      recommendationsAfter: entries.map(recommendedRule).filter(entry => entry.recommendation).length,
      automaticUnitLinks: 0, backup,
    };
    if (!apply || !affected.length) {
      await client.query('ROLLBACK');
      console.log(json(report));
      return;
    }
    const protectedBefore = await fingerprints(client);
    for (const config of affected) {
      const archiveId = `implement-recommendations-v1:${config.id}`;
      if ((await client.query('SELECT 1 FROM "EquipmentConfigurationArchive" WHERE id=$1', [archiveId])).rowCount)
        throw new Error('A previously converted configuration has new rules. Review manually; do not overwrite its original backup.');
      await client.query(`INSERT INTO "EquipmentConfigurationArchive" (id, source, payload)
        VALUES ($1, $2, $3::jsonb)`, [archiveId, SOURCE, json(config)]);
      for (const entry of config.entries.filter(ruleChanged)) {
        const next = recommendedRule(entry);
        await client.query(`UPDATE "EquipmentConfigurationEntry" SET
          recommendation=$1, required=false, "maximumQuantity"=NULL
          WHERE id=$2 AND "configurationId"=$3`, [next.recommendation, entry.id, config.id]);
      }
      await client.query(`UPDATE "EquipmentConfiguration" SET version=version+1, "updatedAt"=now() WHERE id=$1`, [config.id]);
    }
    const after = await configurations(client);
    assert.deepEqual(after.map(unchangedConfiguration), before.map(unchangedConfiguration),
      'Conversion changed a target, identity, quantity, default selection, role, order or notes. Rolling back.');
    assert.deepEqual(await fingerprints(client), protectedBefore,
      'Conversion changed documents, inventory, movements or another protected table. Rolling back.');
    for (const config of affected) {
      const updated = after.find(row => row.id === config.id);
      assert.equal(updated.version, config.version + 1);
      await client.query(`INSERT INTO "EquipmentConfigurationRevision"
        (id, "configurationId", before, after, "createdBy") VALUES ($1,$2,$3::jsonb,$4::jsonb,$5)`,
        [randomUUID(), config.id, json(config), json(updated), SOURCE]);
    }
    report.protectedTables = protectedBefore;
    report.protectedTablesUnchanged = protectedBefore.length;
    report.linksAndOtherConfigurationFieldsUnchanged = true;
    const reportPath = path.join(path.dirname(backup.path), 'conversion-report.json');
    // Generated verification evidence, never a source file or production artifact.
    fs.writeFileSync(reportPath, json({ ...report, status: 'verified-before-commit' }), { flag: 'wx', mode: 0o600 });
    await client.query('COMMIT');
    committed = true;
    console.log(json({ ...report, protectedTables: undefined, reportPath, status: 'committed' }));
  } catch (error) {
    if (!committed) await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

module.exports = { localDatabaseUrl, recommendedRule, ruleChanged, unchangedConfiguration, fingerprints };
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
