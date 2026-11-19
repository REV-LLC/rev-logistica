// Apply only the additive affiliation catalog migration, preserving existing assignments.
const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const migration = '20261119190000_employee_affiliation_catalog';
(async () => {
  if (process.env.RAILWAY_PROJECT_ID !== 'bec9984e-3e3a-48c8-9d75-8c87d591b931' || process.env.RAILWAY_ENVIRONMENT_ID !== '72a66cb9-3fc8-4c61-979a-56435cd20e8a' || !process.env.DATABASE_PUBLIC_URL) throw new Error('Wrong target environment');
  const db = new Client({ connectionString: process.env.DATABASE_PUBLIC_URL }); await db.connect();
  try {
    await db.query('BEGIN');
    if ((await db.query('SELECT current_schema() AS schema')).rows[0].schema !== 'public') throw new Error('Wrong database schema');
    await db.query("SELECT pg_advisory_xact_lock(hashtext('mirev_affiliation_catalog_20261119'))");
    const tables = (await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('EmployeeAffiliationProvider')`)).rows;
    const columns = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Employee' AND column_name IN ('epsId','arlId')`)).rows;
    if (!tables.length && !columns.length) await db.query(readFileSync(resolve(__dirname, '../../apps/api/prisma/migrations', migration, 'migration.sql'), 'utf8'));
    else if (tables.length !== 1 || columns.length !== 2) throw new Error('Partially existing migration; manual review required');
    const result = await db.query(`SELECT count(*)::int AS employees, count("epsId")::int AS eps_assigned, count("arlId")::int AS arl_assigned, (SELECT count(*)::int FROM "EmployeeAffiliationProvider") AS providers FROM "Employee"`);
    await db.query('COMMIT'); console.log(JSON.stringify({ migration, schema: 'public', ...result.rows[0] }));
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { await db.end(); }
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'resolve', '--applied', migration], { cwd: resolve(__dirname, '../../apps/api'), env: { ...process.env, DATABASE_URL: process.env.DATABASE_PUBLIC_URL }, stdio: 'inherit' });
})().catch(error => { console.error(error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]')); process.exitCode = 1; });
