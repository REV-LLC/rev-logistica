const { Client } = require('pg');
(async () => {
  if (process.env.RAILWAY_PROJECT_ID !== 'bec9984e-3e3a-48c8-9d75-8c87d591b931' || process.env.RAILWAY_ENVIRONMENT_ID !== '72a66cb9-3fc8-4c61-979a-56435cd20e8a' || !process.env.DATABASE_PUBLIC_URL) throw new Error('Wrong target environment');
  const db = new Client({ connectionString: process.env.DATABASE_PUBLIC_URL }); await db.connect();
  try {
    await db.query('BEGIN READ ONLY');
    if ((await db.query('SELECT current_schema() AS schema')).rows[0].schema !== 'public') throw new Error('Wrong database schema');
    const applied = (await db.query(`SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE migration_name='20261119190000_employee_affiliation_catalog' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`)).rows[0].count;
    const counts = (await db.query(`SELECT (SELECT count(*)::int FROM "EmployeeAffiliationProvider") AS providers, count("epsId")::int AS eps_assigned, count("arlId")::int AS arl_assigned FROM "Employee"`)).rows[0];
    const invalid = (await db.query(`SELECT count(*)::int AS count FROM "Employee" e LEFT JOIN "EmployeeAffiliationProvider" p ON p.id=e."epsId" LEFT JOIN "EmployeeAffiliationProvider" a ON a.id=e."arlId" WHERE (e."epsId" IS NOT NULL AND (p.id IS NULL OR p.kind<>'EPS' OR e.eps IS DISTINCT FROM p.name)) OR (e."arlId" IS NOT NULL AND (a.id IS NULL OR a.kind<>'ARL' OR e.arl IS DISTINCT FROM a.name))`)).rows[0].count;
    await db.query('COMMIT'); console.log(JSON.stringify({ schema: 'public', applied, ...counts, inconsistent_assignments: invalid }));
    if (applied !== 1 || invalid !== 0) throw new Error('Catalog validation failed');
  } finally { await db.end(); }
})().catch(error => { console.error(error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]')); process.exitCode = 1; });
