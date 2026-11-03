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
  const run = { id: 800, name: 'CI', event: 'push', head_branch: 'production', head_sha: sourceSha, head_repository: { id: 42 }, workflow_id: 7, status: 'completed', conclusion: 'success', run_started_at: '2026-11-03T17:00:00Z' };
  const jobs = ['Build API and Web', 'Web request regressions'].map((name) => ({ name, status: 'completed', conclusion: 'success' }));
  const changes = {};
  const request = async (route) => {
    if (Object.hasOwn(changes, route)) return changes[route];
    if (route.endsWith('/commits/production')) return { sha: sourceSha, commit: { tree: { sha: treeSha } } };
    if (route.endsWith('/actions/workflows/ci.yml')) return { id: 7 };
    if (route.endsWith('/actions/runs/800')) return run;
    if (route.includes('/jobs?')) return { jobs };
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
