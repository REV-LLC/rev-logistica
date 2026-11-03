const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DELIVERY_FILES, selectSource, verifySource } = require('./api-image-source.cjs');
const { dispatchInput } = require('./dispatch-api-image.cjs');
const sourceSha = 'a'.repeat(40);
const definitionSha = 'b'.repeat(40);
const treeSha = 'c'.repeat(40);
const now = Date.parse('2026-11-03T18:00:00Z');

function fixture() {
  const environment = { GITHUB_REPOSITORY: 'REV-LLC/rev-logistica', GITHUB_REPOSITORY_ID: '42', GITHUB_REF: 'refs/heads/production', GITHUB_SHA: sourceSha, WORKFLOW_DEFINITION_SHA: definitionSha, GITHUB_RUN_ID: '900' };
  const event = { inputs: { source_sha: sourceSha, source_ci_run_id: '800' } };
  const run = { id: 800, name: 'CI', event: 'push', head_branch: 'production', head_sha: sourceSha, repository: { id: 42 }, head_repository: { id: 42 }, workflow_id: 7, status: 'completed', conclusion: 'success', run_started_at: '2026-11-03T17:00:00Z' };
  const jobs = ['Build API and Web', 'Web request regressions'].map((name) => ({ name, run_id: 800, status: 'completed', conclusion: 'success' }));
  const changes = {};
  const request = async (route) => {
    if (Object.hasOwn(changes, route)) return changes[route];
    if (route.endsWith('/commits/production')) return { sha: sourceSha, commit: { tree: { sha: treeSha } } };
    if (route.endsWith('/actions/workflows/ci.yml')) return { id: 7 };
    if (route.endsWith('/actions/runs/800')) return run;
    if (route.includes('/jobs?')) return { jobs, total_count: jobs.length };
    if (route.includes('/actions/workflows/ci.yml/runs?')) return { workflow_runs: [run] };
    if (route.includes('/contents/')) return { type: 'file', sha: 'd'.repeat(40) };
    throw new Error(`Unexpected verification request: ${route}`);
  };
  return { eventName: 'workflow_dispatch', event, environment, checkoutSha: sourceSha, request, run, jobs, changes, now };
}

test('accepts exact current production source with both successful CI jobs and matching delivery blobs', async () => {
  const proof = await verifySource(fixture());
  assert.equal(proof.sourceSha, sourceSha);
  assert.equal(proof.sourceTree, treeSha);
  assert.equal(proof.sourceCiRunId, '800');
  assert.equal(Object.keys(proof.deliveryBlobs).length, DELIVERY_FILES.length);
});

for (const [name, mutate] of [
  ['manual dev ref', (f) => { f.environment.GITHUB_REF = 'refs/heads/dev'; }],
  ['input differs from dispatched source', (f) => { f.event.inputs.source_sha = definitionSha; }],
  ['checkout mismatch', (f) => { f.checkoutSha = definitionSha; }],
  ['foreign repository', (f) => { f.environment.GITHUB_REPOSITORY = 'other/repo'; }],
  ['production moved', (f) => { f.changes['/repos/REV-LLC/rev-logistica/commits/production'] = { sha: definitionSha }; }],
  ['wrong CI workflow', (f) => { f.run.workflow_id = 8; }],
  ['wrong CI SHA', (f) => { f.run.head_sha = definitionSha; }],
  ['fork CI', (f) => { f.run.head_repository.id = 50; }],
  ['PR CI event', (f) => { f.run.event = 'pull_request'; }],
  ['failed CI', (f) => { f.run.conclusion = 'failure'; }],
  ['unfinished CI', (f) => { f.run.status = 'in_progress'; }],
  ['stale CI', (f) => { f.run.run_started_at = '2026-10-01T00:00:00Z'; }],
  ['future evidence', (f) => { f.run.run_started_at = '2026-12-01T00:00:00Z'; }],
  ['missing CI job', (f) => { f.jobs.pop(); }],
  ['duplicate CI job', (f) => { f.jobs.push(f.jobs[0]); }],
  ['skipped CI job', (f) => { f.jobs[0].conclusion = 'skipped'; }],
  ['changed delivery definition', (f) => { f.changes[`/repos/REV-LLC/rev-logistica/contents/${DELIVERY_FILES[0]}?ref=${definitionSha}`] = { type: 'file', sha: 'e'.repeat(40) }; }],
  ['missing workflow identity', (f) => { f.changes['/repos/REV-LLC/rev-logistica/actions/workflows/ci.yml'] = {}; }],
]) {
  test(`rejects ${name}`, async () => {
    const f = fixture(); mutate(f);
    await assert.rejects(verifySource(f));
  });
}

test('secret-free listener dispatches only the verified production branch', () => {
  const f = fixture();
  const body = dispatchInput({ workflow_run: f.run }, f.environment);
  assert.deepEqual(body, { ref: 'production', inputs: { source_sha: sourceSha, source_ci_run_id: '800' } });
});

for (const [name, mutate] of [
  ['fork', (run) => { run.head_repository.id = 2; }],
  ['pull request', (run) => { run.event = 'pull_request'; }],
  ['failed run', (run) => { run.conclusion = 'failure'; }],
  ['dev branch', (run) => { run.head_branch = 'dev'; }],
  ['wrong workflow', (run) => { run.name = 'unrelated'; }],
]) {
  test(`listener refuses ${name}`, () => {
    const f = fixture(); mutate(f.run);
    assert.throws(() => dispatchInput({ workflow_run: f.run }, f.environment));
  });
}

test('direct workflow_run source selection cannot accept an untrusted event', () => {
  const f = fixture(); f.run.event = 'pull_request';
  assert.throws(() => selectSource('workflow_run', { workflow_run: f.run }, f.environment));
});

function pushFixture() {
  const f = fixture();
  f.eventName = 'push';
  f.event = { ref: 'refs/heads/production', after: sourceSha, deleted: false, repository: { id: 42 } };
  return f;
}

test('production push prepares its exact image while its exact CI run is still in progress', async () => {
  const f = pushFixture(); f.mode = 'prepare';
  f.run.status = 'in_progress'; f.run.conclusion = null;
  const proof = await verifySource(f);
  assert.equal(proof.sourceCiRunId, '800');
  assert.equal(proof.ciValidated, false);
  assert.equal(proof.ciVerifiedAt, undefined);
});

test('CI completion gate waits for the bound run and requires both successful jobs', async () => {
  const f = pushFixture(); f.mode = 'wait'; f.environment.SOURCE_CI_RUN_ID = '800';
  f.run.status = 'queued'; f.run.conclusion = null;
  let clock = now;
  f.clock = () => clock;
  f.sleep = async (ms) => { clock += ms; f.run.status = 'completed'; f.run.conclusion = 'success'; };
  const proof = await verifySource(f);
  assert.equal(proof.ciValidated, true);
  assert.equal(proof.sourceCiRunId, '800');
  assert.equal(clock - now, 10_000);
});

test('prepare retries briefly when the matching push CI run has not appeared yet', async () => {
  const f = pushFixture(); f.mode = 'prepare';
  let clock = now;
  f.clock = () => clock; f.sleep = async (ms) => { clock += ms; };
  const request = f.request;
  let lists = 0;
  f.request = async (route) => route.includes('/actions/workflows/ci.yml/runs?') && lists++ === 0
    ? { workflow_runs: [] } : request(route);
  assert.equal((await verifySource(f)).sourceCiRunId, '800');
  assert.equal(clock - now, 5000);
});

test('CI discovered after preparation began is checked against the advancing clock', async () => {
  const f = pushFixture(); f.mode = 'prepare';
  let clock = now;
  f.clock = () => clock;
  f.sleep = async (ms) => { clock += ms; f.run.run_started_at = new Date(clock).toISOString(); };
  const request = f.request;
  let lists = 0;
  f.request = async (route) => route.includes('/actions/workflows/ci.yml/runs?') && lists++ === 0
    ? { workflow_runs: [] } : request(route);
  assert.equal((await verifySource(f)).sourceCiRunId, '800');
});

for (const [name, change] of Object.entries({
  'push from dev': (f) => { f.event.ref = 'refs/heads/dev'; },
  'deleted production branch': (f) => { f.event.deleted = true; },
  'foreign push repository': (f) => { f.event.repository.id = 99; },
  'push SHA differs from checkout': (f) => { f.event.after = definitionSha; },
  'CI already failed': (f) => { f.run.conclusion = 'failure'; },
  'CI run claims another repository': (f) => { f.environment.SOURCE_CI_RUN_ID = '800'; f.run.repository.id = 99; },
  'CI run claims another identity': (f) => { f.environment.SOURCE_CI_RUN_ID = '800'; f.run.id = 801; },
  'CI run is manual instead of push': (f) => { f.environment.SOURCE_CI_RUN_ID = '800'; f.run.event = 'workflow_dispatch'; },
  'unknown CI state': (f) => { f.run.status = 'unknown'; f.run.conclusion = null; },
})) {
  test(`parallel prepare refuses ${name}`, async () => {
    const f = pushFixture(); f.mode = 'prepare'; change(f);
    await assert.rejects(verifySource(f));
  });
}

test('CI gate fails immediately if the bound run finishes unsuccessfully', async () => {
  const f = pushFixture(); f.mode = 'wait'; f.environment.SOURCE_CI_RUN_ID = '800';
  f.run.status = 'in_progress'; f.run.conclusion = null;
  let clock = now;
  f.clock = () => clock;
  f.sleep = async (ms) => { clock += ms; f.run.status = 'completed'; f.run.conclusion = 'failure'; };
  await assert.rejects(verifySource(f), /did not succeed/);
});

test('CI gate cannot replace the selected run with another successful run for the SHA', async () => {
  const f = pushFixture(); f.mode = 'wait'; f.environment.SOURCE_CI_RUN_ID = '800';
  f.run.head_sha = definitionSha;
  await assert.rejects(verifySource(f), /another commit/);
});

test('CI gate refuses an unsuccessful required check even when the run is green', async () => {
  const f = pushFixture(); f.mode = 'wait'; f.environment.SOURCE_CI_RUN_ID = '800';
  f.jobs[1].conclusion = 'failure';
  await assert.rejects(verifySource(f), /Unsuccessful CI job/);
});

test('CI wait is bounded and never authorizes deployment on timeout', async () => {
  const f = pushFixture(); f.mode = 'wait'; f.environment.SOURCE_CI_RUN_ID = '800';
  f.run.status = 'in_progress'; f.run.conclusion = null; f.ciTimeoutMs = 20_000;
  let clock = now;
  f.clock = () => clock; f.sleep = async (ms) => { clock += ms; };
  await assert.rejects(verifySource(f), /Timed out/);
  assert.equal(clock - now, 20_000);
});

test('CI discovery is bounded and ignores runs for another SHA', async () => {
  const f = pushFixture(); f.mode = 'prepare'; f.run.head_sha = definitionSha;
  f.discoveryTimeoutMs = 10_000;
  let clock = now;
  f.clock = () => clock; f.sleep = async (ms) => { clock += ms; };
  await assert.rejects(verifySource(f), /not discovered/);
  assert.equal(clock - now, 10_000);
});
