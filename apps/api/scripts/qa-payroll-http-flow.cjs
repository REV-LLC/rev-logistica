// Isolated HTTP payroll regression. Keeps ONLY named QA fixtures for browser review.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
require('./commercial-qa-target.cjs');
assert.equal(new URL(process.env.DATABASE_URL).pathname, '/equipment_payroll_qa_20261001');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const base = 'http://127.0.0.1:3059';
const tokens = {};
const runId = randomUUID().slice(0, 8);
const manifest = { runId, cases: [] };
async function api(role, method, route, body, expected = 200) {
  const response = await fetch(base + route, { method, headers: { 'content-type': 'application/json', ...(tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(result)}`);
  return result;
}
const pass = name => { manifest.cases.push(name); console.log('PASS', name); };
(async () => {
  try {
    for (const role of ['OFFICE', 'ADMIN', 'DRIVER']) {
      const login = await api(role, 'POST', '/auth/login', { email: `qa-config-${role.toLowerCase()}@example.invalid`, password: 'Only-local-QA-20260923!' }, 201);
      tokens[role] = login.access_token ?? login.accessToken; assert(tokens[role]);
    }
    await api('NONE', 'GET', '/employee-payroll', undefined, 401);
    await api('DRIVER', 'GET', '/employee-payroll', undefined, 403);
    const initial = await api('OFFICE', 'GET', '/employee-payroll?date=2026-10-01');
    assert(initial.employees.length >= 16);
    assert(initial.employees.filter(e => !e.name.startsWith('QA NOMINA')).every(e => e.current?.provisional && e.current.totalMonthly === '2000000.00'));
    const publicEmployees = await api('DRIVER', 'GET', '/employees');
    assert(publicEmployees.every(e => !('salaries' in e) && !('monthlySalary' in e) && !('payrollReceipts' in e)));
    pass('Real JWT Office/Admin; anonymous401 and Driver403; no salary exposed in shared employees');
    const employee = await api('OFFICE', 'POST', '/employees', { name: 'QA NOMINA', lastName: runId.toUpperCase(), documentId: `QA-${runId}`, role: 'HEAVY_MACHINERY_OPERATOR' }, 201);
    manifest.employeeId = employee.id; manifest.employeeName = `QA NOMINA ${runId.toUpperCase()}`;
    const body = { from: '2026-10-01', to: '2026-10-15', days: 15, observations: 'Comprobante QA; no es un pago real.' };
    const provisional = await api('OFFICE', 'POST', `/employee-payroll/${employee.id}/preview`, body, 201);
    assert.equal(provisional.provisional, true); assert.equal(provisional.eligible, false);
    await api('OFFICE', 'POST', `/employee-payroll/${employee.id}/receipts`, { ...body, expectedSalaryRevision: 1, idempotencyKey: randomUUID() }, 400);
    const salary = { effectiveFrom: '2026-10-01', monthlySalary: '1750905', transportAllowance: '249095', regime: 'STANDARD', note: 'Condiciones ficticias confirmadas para QA', expectedRevision: 1 };
    await api('DRIVER', 'POST', `/employee-payroll/${employee.id}/salaries`, salary, 403);
    await api('OFFICE', 'POST', `/employee-payroll/${employee.id}/salaries`, salary, 201);
    await api('ADMIN', 'POST', `/employee-payroll/${employee.id}/salaries`, salary, 409);
    pass('New employee inherits provisional base+auxiliary; issuance blocked until explicit confirmation; stale salary409');
    const preview = await api('OFFICE', 'POST', `/employee-payroll/${employee.id}/preview`, body, 201);
    assert.equal(preview.eligible, true);
    for (const [key, value] of Object.entries({ totalMonthly: '2000000.00', salaryEarned: '875453', transportEarned: '124548', totalEarned: '1000001', healthDeduction: '35018', pensionDeduction: '35018', totalDeductions: '70036', netPay: '929965' })) assert.equal(preview[key], value, key);
    await api('OFFICE', 'POST', `/employee-payroll/${employee.id}/preview`, { ...body, days: 8, observations: '' }, 400);
    const partial = await api('OFFICE', 'POST', `/employee-payroll/${employee.id}/preview`, { ...body, days: 8, observations: 'Ingreso durante la quincena: ejemplo QA' }, 201);
    assert.equal(partial.days, 8); assert.equal(partial.eligible, true);
    await api('OFFICE', 'POST', `/employee-payroll/${employee.id}/preview`, { ...body, to: '2026-10-16' }, 400);
    pass('15 nominal days, editable8 with reason; 4%+4% excludes allowance, exact consistent peso totals; invalid period400');
    await api('OFFICE', 'POST', `/employee-payroll/${employee.id}/receipts`, { ...body, expectedSalaryRevision: 1, idempotencyKey: randomUUID() }, 409);
    const request = { ...body, expectedSalaryRevision: preview.expectedSalaryRevision, idempotencyKey: randomUUID() };
    const [one, two] = await Promise.all([api('OFFICE', 'POST', `/employee-payroll/${employee.id}/receipts`, request, 201), api('OFFICE', 'POST', `/employee-payroll/${employee.id}/receipts`, request, 201)]);
    assert.equal(one.id, two.id); assert.equal(one.paymentStatus, 'NOT_RECORDED'); manifest.receiptId = one.id;
    await api('OFFICE', 'POST', `/employee-payroll/${employee.id}/receipts`, { ...request, idempotencyKey: randomUUID() }, 409);
    await api('OFFICE', 'POST', `/employee-payroll/${employee.id}/receipts`, { ...request, days: 8 }, 409);
    assert.equal(await db.payrollReceipt.count({ where: { employeeId: employee.id } }), 1);
    pass('Concurrent/retried issuance creates exactly one immutable receipt; stale salary and duplicate period409; no fictional payment');
    await api('OFFICE', 'POST', `/employee-payroll/${employee.id}/salaries`, { ...salary, monthlySalary: '2000000', expectedRevision: 2 }, 409);
    await api('OFFICE', 'POST', `/employee-payroll/${employee.id}/salaries`, { ...salary, effectiveFrom: '2026-10-16', monthlySalary: '2000000', expectedRevision: 2 }, 201);
    const history = await api('ADMIN', 'GET', `/employee-payroll/${employee.id}/receipts?from=2026-10-01&to=2026-10-15`);
    assert.equal(history[0].monthlySalary, '1750905.00'); assert.equal(history[0].netPay, '929965');
    await api('OFFICE', 'DELETE', `/employees/${employee.id}`, undefined, 400);
    const response = await fetch(`${base}/employee-payroll/receipts/${one.id}/pdf`, { headers: { authorization: `Bearer ${tokens.OFFICE}` } });
    assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
    const pdf = Buffer.from(await response.arrayBuffer()); assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    manifest.pdfPath = `/private/tmp/qa-nomina-${runId}.pdf`; fs.writeFileSync(manifest.pdfPath, pdf, { mode: 0o600 });
    await api('DRIVER', 'GET', `/employee-payroll/receipts/${one.id}/pdf`, undefined, 403);
    pass('Future salary leaves earlier PDF snapshot unchanged; historical employee deletion blocked; PDF private and role-protected');
    // A separate account checks revocation without changing the original QA Office.
    const bcrypt = require('bcrypt');
    const revoked = await db.user.create({ data: { email: `qa-payroll-revoke-${runId}@example.invalid`, role: 'OFFICE', passwordHash: await bcrypt.hash('Only-local-QA-20260923!', 10) } });
    const login = await api('REVOKED', 'POST', '/auth/login', { email: revoked.email, password: 'Only-local-QA-20260923!' }, 201);
    tokens.REVOKED = login.access_token ?? login.accessToken;
    await db.user.update({ where: { id: revoked.id }, data: { active: false } });
    await api('REVOKED', 'GET', '/employee-payroll', undefined, 403);
    await db.user.delete({ where: { id: revoked.id } });
    pass('Deactivated Office token cannot read salary even before JWT expiry');
    manifest.result = 'PASS'; fs.writeFileSync(`/private/tmp/qa-payroll-http-${runId}.json`, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    console.log(`QA manifest: /private/tmp/qa-payroll-http-${runId}.json`);
  } finally { await db.$disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
