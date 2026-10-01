// Release regression: only the fresh isolated copy without a salary migration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
require('./commercial-qa-target.cjs');
assert.equal(new URL(process.env.DATABASE_URL).pathname, '/equipment_commercial_no_payroll_20261001');
const { PrismaClient, Prisma } = require('@prisma/client');
const db = new PrismaClient();
const base = 'http://127.0.0.1:3059';
let token;
async function api(method, route, body, expected) {
  const response = await fetch(base + route, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(result)}`);
  return result;
}
(async () => {
  try {
    const root = path.resolve(__dirname, '../../..');
    assert(!fs.existsSync(path.join(root, 'apps/api/prisma/migrations/20260926120000_employee_salary_history')));
    assert(!Prisma.dmmf.datamodel.models.some(model => model.name === 'EmployeeSalary'));
    const [schema] = await db.$queryRaw`SELECT to_regclass('public."EmployeeSalary"')::text AS salary_table,
      (SELECT count(*)::int FROM "_prisma_migrations" WHERE migration_name='20260926120000_employee_salary_history') AS salary_migrations`;
    assert.equal(schema.salary_table, null);
    assert.equal(schema.salary_migrations, 0);
    const login = await api('POST', '/auth/login', { email: 'qa-config-office@example.invalid', password: 'Only-local-QA-20260923!' }, 201);
    token = login.access_token ?? login.accessToken;
    assert(token);
    await api('GET', '/employee-payroll', undefined, 404);
    const employee = await api('POST', '/employees', { name: 'QA REMOVAL', lastName: randomUUID(), role: 'OFFICE' }, 201);
    await api('PATCH', `/employees/${employee.id}`, { role: 'OTHER' }, 200);
    const listed = await api('GET', '/employees', undefined, 200);
    assert.equal(listed.find(row => row.id === employee.id).role, 'OTHER');
    const deleted = await api('DELETE', `/employees/${employee.id}`, undefined, 200);
    assert.equal(deleted.deleted, true);
    assert.equal(await db.employee.findUnique({ where: { id: employee.id } }), null);
    assert.equal((await fetch('http://127.0.0.1:3159/employees/payroll')).status, 404);
    console.log('PASS no salary migration, table, generated model, API or web route; employee HTTP create/edit/list/delete works');
  } finally { await db.$disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
