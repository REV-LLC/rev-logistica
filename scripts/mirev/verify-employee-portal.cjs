const { Client } = require('pg');
(async () => {
  if (process.env.RAILWAY_PROJECT_ID !== 'bec9984e-3e3a-48c8-9d75-8c87d591b931' || process.env.RAILWAY_ENVIRONMENT_ID !== '72a66cb9-3fc8-4c61-979a-56435cd20e8a' || !process.env.DATABASE_PUBLIC_URL) throw new Error('Wrong target environment');
  const db = new Client({ connectionString: process.env.DATABASE_PUBLIC_URL }); await db.connect();
  try {
    await db.query('BEGIN READ ONLY');
    const columns = (await db.query(`SELECT column_name, is_nullable, character_maximum_length FROM information_schema.columns WHERE table_schema='public' AND table_name='Employee' AND column_name IN ('eps','arl') ORDER BY column_name`)).rows;
    const migration = (await db.query(`SELECT count(*)::int AS applied FROM "_prisma_migrations" WHERE migration_name='20261119170000_mirev_employee_portal' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`)).rows[0];
    const records = (await db.query(`SELECT (SELECT count(*)::int FROM "MiRevMedicalLeave") AS medical_leaves, (SELECT count(*)::int FROM "MiRevMedicalDiagnosis") AS diagnoses, (SELECT count(eps)::int FROM "Employee") AS eps_configured, (SELECT count(arl)::int FROM "Employee") AS arl_configured`)).rows[0];
    await db.query('COMMIT'); console.log(JSON.stringify({ schema: 'public', columns, migration, records }));
  } finally { await db.end(); }
})().catch(error => { console.error(error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]')); process.exitCode = 1; });
