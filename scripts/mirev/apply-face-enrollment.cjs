// Apply only this additive MiREV migration, never pending migrations for REV.
const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const migration = '20261117220000_mirev_face_enrollment';
(async () => {
  if (process.env.RAILWAY_PROJECT_ID !== 'bec9984e-3e3a-48c8-9d75-8c87d591b931' || process.env.RAILWAY_ENVIRONMENT_ID !== '72a66cb9-3fc8-4c61-979a-56435cd20e8a' || !process.env.DATABASE_PUBLIC_URL) throw new Error('Wrong target environment');
  const db = new Client({ connectionString: process.env.DATABASE_PUBLIC_URL });
  await db.connect();
  try {
    await db.query('BEGIN');
    const {rows} = await db.query('select current_schema() as schema');
    if (rows[0].schema !== 'public') throw new Error('Wrong database schema');
    const existing = await db.query('select to_regclass(\'"MiRevFaceEnrollment"\') as table_name');
    if (!existing.rows[0].table_name) await db.query(readFileSync(resolve(__dirname, '../../apps/api/prisma/migrations', migration, 'migration.sql'), 'utf8'));
    await db.query('COMMIT');
    console.log('MiREV enrollment table ready in production/public. Existing tables unchanged.');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { await db.end(); }
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'resolve', '--applied', migration], {
    cwd: resolve(__dirname, '../../apps/api'), env: { ...process.env, DATABASE_URL: process.env.DATABASE_PUBLIC_URL }, stdio: 'inherit',
  });
})().catch(error => { console.error(error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]')); process.exitCode = 1; });
