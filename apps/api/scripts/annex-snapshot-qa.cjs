// Run after restoring production into an isolated local PostgreSQL database.
// Never imports AppModule: no email, WhatsApp, cron jobs or production credentials.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PrismaClient, Prisma } = require('@prisma/client');
const { AnnexSourceService } = require('../dist/src/annexes/annex-source.service');
const { AnnexesService } = require('../dist/src/annexes/annexes.service');
const { inventoryBusinessDay } = require('../dist/src/inventory/business-date-ledger-order');
const connection = new URL(process.env.DATABASE_URL || '');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(connection.hostname) || !connection.pathname.startsWith('/rev_annex_qa'))
  throw new Error('This audit only runs against a local rev_annex_qa database.');
const output = process.env.ANNEX_QA_OUTPUT;
if (!output || !path.isAbsolute(output)) throw new Error('Set an absolute ANNEX_QA_OUTPUT directory.');
fs.mkdirSync(output, { recursive: true, mode: 0o700 });
const from = process.env.ANNEX_QA_FROM || '2026-09-16';
const to = process.env.ANNEX_QA_TO || '2026-09-30';
const through = process.env.ANNEX_QA_THROUGH || '2026-09-27';
const D = Prisma.Decimal;
const db = new PrismaClient();
(async () => {
  const source = new AnnexSourceService(db), service = new AnnexesService(db);
  const author = await db.user.upsert({ where: { email: 'annex-qa@local.invalid' },
    create: { email: 'annex-qa@local.invalid', passwordHash: 'LOCAL_QA_LOGIN_DISABLED', role: 'ADMIN', active: false }, update: {} });
  const sites = await db.customerWorksite.findMany({ select: { id: true, customerId: true, alias: true, customer: { select: { name: true } }, worksite: { select: { name: true } } }, orderBy: { id: 'asc' } });
  const report = { period: { from, to, through }, createdAt: new Date().toISOString(), localOnly: true,
    summary: { worksites: sites.length, withLedger: 0, withDailyRentals: 0, withHourlyDays: 0, generated: 0, empty: 0, errors: 0, quantityChecks: 0, arithmeticChecks: 0, sourceIssues: {}, calculationIssues: {} }, results: [] };
  for (const site of sites) {
    try {
      const prepared = await source.prepare(site.id, from, to, through);
      const { input, result, sourceIssues, ledgerCount } = prepared;
      const s = report.summary;
      s.withLedger += Number(ledgerCount > 0); s.withDailyRentals += Number(input.rentals.length > 0); s.withHourlyDays += Number(input.machineDays.length > 0);
      for (const i of sourceIssues) s.sourceIssues[i.code] = (s.sourceIssues[i.code] || 0) + 1;
      for (const i of result.issues) s.calculationIssues[i.code] = (s.calculationIssues[i.code] || 0) + 1;
      const ledger = await db.stockLedger.findMany({ where: { customerWorksiteId: site.id, effectiveAt: { lt: new Date(Date.parse(through + 'T05:00:00Z') + 86400000) } },
        select: { id: true, skuId: true, assetId: true, ownerWarehouseId: true, quantity: true, movementType: true, effectiveAt: true } });
      const key = r => `${r.assetId || r.skuId}:${r.ownerWarehouseId}`;
      const rowById = new Map(ledger.map(r => [r.id, r]));
      const lots = new Map(input.rentals.map(r => [r.id, r]));
      const includedGroups = new Set(input.rentals.map(r => {
        const raw = rowById.get(r.source.reference); assert.ok(raw, 'Original inventory movement must exist');
        assert.equal(inventoryBusinessDay(raw.effectiveAt), r.deliveredOn);
        assert.equal(raw.quantity.abs().toString(), r.quantity); return key(raw);
      }));
      for (const group of includedGroups) {
        const movements = ledger.filter(r => key(r) === group);
        for (let time = Date.parse(from); time <= Date.parse(through); time += 86400000) {
          const day = new Date(time).toISOString().slice(0, 10);
          // Independent daily balance from raw movements, without the FIFO adapter.
          const expected = movements.reduce((balance, r) => {
            const date = inventoryBusinessDay(r.effectiveAt);
            const entering = ['OUT', 'ON_SITE'].includes(r.movementType);
            if (entering ? date <= day : date < day) return entering ? balance.plus(r.quantity.abs()) : balance.minus(r.quantity.abs());
            return balance;
          }, new D(0));
          const actual = result.lines.filter(l => l.kind === 'DAY' && l.date === day && key(rowById.get(lots.get(l.key.slice(0, -11)).source.reference)) === group)
            .reduce((sum, l) => sum.plus(l.quantity), new D(0));
          assert.equal(actual.toString(), expected.toString(), `Daily quantity mismatch ${site.id} ${group} ${day}`); s.quantityChecks++;
        }
      }
      let net = new D(0);
      for (const line of result.lines) {
        const amount = new D(line.quantity).times(line.billableUnits).times(line.effectivePrice).toDecimalPlaces(2, D.ROUND_HALF_UP);
        assert.equal(amount.toFixed(2), line.net, 'Independent line amount'); net = net.plus(amount); s.arithmeticChecks++;
      }
      assert.equal(net.toFixed(2), result.totals.rentalNet);
      let saved;
      if (input.rentals.length || input.machineDays.length) {
        const existing = (await service.list(site.id)).find(d => d.periodFrom.toISOString().slice(0, 10) === from && d.periodTo.toISOString().slice(0, 10) === to);
        const payload = { customerWorksiteId: site.id, expectedRevision: existing?.revision || 0, reason: 'PRUEBA LOCAL · copia de producción · generación automática', input, sourceIssues };
        saved = await service.save(payload, author.id);
        const reopened = await service.get(saved.id);
        assert.deepEqual(reopened.revisions[0].input, input); assert.deepEqual(reopened.revisions[0].result, result);
        s.generated++;
      } else s.empty++;
      report.results.push({ site, ledgerCount, draftId: saved?.id, revision: saved?.revision, input, result, sourceIssues,
        reviewStatus: !ledgerCount ? 'NO_LEDGER' : !saved ? 'NO_CALCULABLE_LINES' : sourceIssues.length || result.issues.length ? 'REVIEW_REQUIRED' : 'CALCULATED' });
    } catch (e) { report.summary.errors++; report.results.push({ site, error: e.message }); }
  }
  const example = report.results.find(r => r.draftId && r.input.rentals.length && r.input.period.through > r.input.period.from);
  if (example) {
    const saved = await service.get(example.draftId);
    const payload = { customerWorksiteId: example.site.id, expectedRevision: saved.revision, reason: 'PRUEBA LOCAL · guardado concurrente', input: example.input, sourceIssues: example.sourceIssues };
    const results = await Promise.allSettled([service.save(payload, author.id), service.save(payload, author.id)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const rejected = results.find(r => r.status === 'rejected'); assert.equal(rejected.reason.getStatus(), 409);
    const fresh = await service.get(example.draftId);
    const before = (await service.history(example.draftId)).length;
    await assert.rejects(service.save({ ...payload, expectedRevision: fresh.revision, input: { ...example.input, period: { from, to: new Date(Date.parse(through) - 86400000).toISOString().slice(0, 10), through: new Date(Date.parse(through) - 86400000).toISOString().slice(0, 10) } } }, author.id), /solapado/);
    assert.equal((await service.history(example.draftId)).length, before);
    report.persistenceChecks = { concurrentSaves: '1 saved, 1 rejected with 409', overlap: 'rejected without another revision', roundTripCount: report.summary.generated };
  }
  fs.writeFileSync(path.join(output, 'audit.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ summary: report.summary, persistenceChecks: report.persistenceChecks, errors: report.results.filter(r => r.error) }, null, 2));
  if (report.summary.errors) process.exitCode = 1;
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
