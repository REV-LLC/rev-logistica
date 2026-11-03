'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { findReusableValidation, createApi } = require('./ci-reuse.cjs');

// REST response shapes from workflow runs, Git commits, and jobs (latest attempt).
const NOW = Date.parse('2026-11-03T17:00:00Z');
const TREE = 'a'.repeat(40);
const SOURCE_SHA = 'b'.repeat(40);
const PR_HEAD_SHA = 'c'.repeat(40);
const context = {
  repository: 'REV-LLC/rev-logistica', repositoryId: 1126773540,
  runId: 200, eventName: 'pull_request', refName: '319/merge',
};
const requiredSteps = {
  'Build API and Web': ['Test CI reuse gate', 'Install dependencies',
    'Generate Prisma client', 'Build API', 'Test PDF editor text fidelity',
    'Test API inventory and document regressions', 'Build Web',
    'Prune API runtime dependencies', 'Verify API runtime'],
  'Web request regressions': ['Test CI reuse gate', 'Install web dependencies', 'Test web regressions'],
};

function fixture() {
  const currentRun = {
    id: 200, event: 'pull_request', workflow_id: 1234,
    path: '.github/workflows/ci.yml', head_sha: PR_HEAD_SHA,
    head_branch: 'dev', repository: { id: context.repositoryId },
    head_repository: { id: context.repositoryId },
  };
  const sourceRun = {
    ...structuredClone(currentRun), id: 100, event: 'push',
    head_sha: SOURCE_SHA, head_branch: 'dev',
    status: 'completed', conclusion: 'success', run_attempt: 1,
    created_at: '2026-11-03T16:00:00Z',
  };
  const jobs = {
    total_count: 2,
    jobs: Object.entries(requiredSteps).map(([name, steps], index) => ({
      id: 300 + index, run_id: 100, name, status: 'completed', conclusion: 'success',
      steps: ['Set up job', 'Checkout', 'Setup Node', steps[0],
        'Determine reusable validation', 'Reuse previous validation',
        ...steps.slice(1), 'Post Setup Node', 'Post Checkout', 'Complete job'].map((name, index) => ({
        name, number: index + 1, status: 'completed',
        conclusion: name === 'Reuse previous validation' ? 'skipped' : 'success',
      })),
    })),
  };
  return { currentRun, sourceRun, jobs,
    commit: { sha: SOURCE_SHA, tree: { sha: TREE } } };
}

async function decide(change = () => {}, contextChange = {}) {
  const f = fixture();
  change(f);
  const requests = [];
  const api = async (path) => {
    requests.push(path);
    if (path.endsWith('/actions/runs/200')) return f.currentRun;
    if (path.includes('/actions/workflows/ci.yml/runs?')) return { workflow_runs: [f.sourceRun] };
    if (path.includes('/git/commits/')) return f.commit;
    if (path.endsWith('/jobs?filter=latest&per_page=100')) return f.jobs;
    throw new Error('Unexpected request');
  };
  const result = await findReusableValidation({ context: { ...context, ...contextChange },
    currentTree: TREE, api, now: NOW });
  return { result, requests };
}

test('reuses the checkout tree, not the PR head SHA, and links the fully validated push', async () => {
  const { result, requests } = await decide();
  assert.deepEqual(result, { reuse: true, reason: 'same-tree-fully-validated',
    runId: 100, sourceCommit: SOURCE_SHA, tree: TREE });
  assert(requests.some((p) => p.includes(`/git/commits/${SOURCE_SHA}`)));
  assert(!requests.some((p) => p.includes(`/git/commits/${PR_HEAD_SHA}`)));
});

test('production push can reuse an identical fully validated dev tree', async () => {
  const { result } = await decide((f) => { f.currentRun.event = 'push'; },
    { eventName: 'push', refName: 'production' });
  assert.equal(result.reuse, true);
});

for (const [description, change] of Object.entries({
  'different tree, including a changed workflow or lockfile': (f) => { f.commit.tree.sha = 'd'.repeat(40); },
  'commit response identifies another commit': (f) => { f.commit.sha = PR_HEAD_SHA; },
  'commit response has no tree': (f) => { delete f.commit.tree; },
  'fork source': (f) => { f.sourceRun.head_repository.id += 1; },
  'other repository': (f) => { f.sourceRun.repository.id += 1; },
  'fork PR currently under test': (f) => { f.currentRun.head_repository.id += 1; },
  'other current workflow': (f) => { f.currentRun.path = '.github/workflows/unrelated.yml'; },
  'different workflow ID': (f) => { f.sourceRun.workflow_id += 1; },
  'different source workflow path': (f) => { f.sourceRun.path = '.github/workflows/unrelated.yml'; },
  'pull request source, whose head SHA does not prove its tested merge tree': (f) => { f.sourceRun.event = 'pull_request'; },
  'untrusted push branch': (f) => { f.sourceRun.head_branch = 'codex/feature'; },
  'current run as its own evidence': (f) => { f.sourceRun.id = 200; },
  'in-progress source': (f) => { f.sourceRun.status = 'in_progress'; },
  'cancelled source': (f) => { f.sourceRun.conclusion = 'cancelled'; },
  'failed source': (f) => { f.sourceRun.conclusion = 'failure'; },
  'neutral source': (f) => { f.sourceRun.conclusion = 'neutral'; },
  'source older than 24 hours': (f) => { f.sourceRun.created_at = '2026-11-02T16:59:59Z'; },
  'source timestamp in the future': (f) => { f.sourceRun.created_at = '2026-11-03T17:00:01Z'; },
  'invalid source timestamp': (f) => { f.sourceRun.created_at = 'not-a-date'; },
  'invalid source SHA': (f) => { f.sourceRun.head_sha = '../branch'; },
  'missing web regressions': (f) => { f.jobs.jobs.pop(); },
  'duplicate job names': (f) => { f.jobs.jobs[1].name = f.jobs.jobs[0].name; },
  'partial jobs page': (f) => { f.jobs.total_count = 3; },
  'jobs from another run': (f) => { f.jobs.jobs[0].run_id = 99; },
  'failed web regressions': (f) => { f.jobs.jobs[1].conclusion = 'failure'; },
  'skipped tests in a green job': (f) => {
    f.jobs.jobs[0].steps.find((step) => step.name === 'Test API inventory and document regressions').conclusion = 'skipped';
  },
  'source run itself reused validation': (f) => {
    f.jobs.jobs.forEach((job) => job.steps.forEach((step) => {
      if (step.name === 'Reuse previous validation') step.conclusion = 'success';
      else if (requiredSteps[job.name].includes(step.name) && step.name !== 'Test CI reuse gate')
        step.conclusion = 'skipped';
    }));
  },
  'missing gate regression test': (f) => {
    f.jobs.jobs[0].steps = f.jobs.jobs[0].steps.filter((step) => step.name !== 'Test CI reuse gate');
  },
  'duplicate validation step name': (f) => {
    f.jobs.jobs[0].steps.push(f.jobs.jobs[0].steps.find((step) => step.name === 'Build API'));
  },
  'validation still running': (f) => { f.jobs.jobs[0].steps[1].status = 'in_progress'; },
  'missing production runtime smoke check': (f) => {
    f.jobs.jobs[0].steps = f.jobs.jobs[0].steps.filter((step) => step.name !== 'Verify API runtime');
  },
  'failed production runtime smoke check': (f) => {
    f.jobs.jobs[0].steps.find((step) => step.name === 'Verify API runtime').conclusion = 'failure';
  },
  'missing dependency prune before the runtime smoke check': (f) => {
    f.jobs.jobs[0].steps = f.jobs.jobs[0].steps.filter((step) => step.name !== 'Prune API runtime dependencies');
  },
  'new unlisted step was skipped': (f) => {
    f.jobs.jobs[0].steps.push({ name: 'New validation', status: 'completed', conclusion: 'skipped' });
  },
  'new unlisted step failed but the job continued': (f) => {
    f.jobs.jobs[0].steps.push({ name: 'New validation', status: 'completed', conclusion: 'failure' });
  },
})) {
  test(`runs full CI for ${description}`, async () => {
    const { result } = await decide(change);
    assert.equal(result.reuse, false);
  });
}

test('missing commit metadata and API failures fall back to full CI', async () => {
  for (const api of [async () => { throw new Error('secret error response'); }, async () => null]) {
    const result = await findReusableValidation({ context, currentTree: TREE, api, now: NOW });
    assert.equal(result.reuse, false);
    assert(!JSON.stringify(result).includes('secret'));
  }
});

test('unsupported events and untrusted push branches do not query evidence', async () => {
  for (const extra of [{ eventName: 'pull_request_target' },
    { eventName: 'workflow_dispatch', refName: 'production' },
    { eventName: 'push', refName: 'codex/feature' }, { repositoryId: NaN }]) {
    const { result, requests } = await decide(() => {}, extra);
    assert.equal(result.reuse, false);
    assert.equal(requests.length, 0);
  }
});

test('API client sends token only as a header and refuses redirects/errors', async () => {
  let seen;
  const api = createApi({ token: 'private-token', fetchImpl: async (url, options) => {
    seen = { url, options }; return { ok: true, json: async () => ({ id: 1 }) };
  } });
  assert.deepEqual(await api('/repos/REV-LLC/rev-logistica/actions/runs/1'), { id: 1 });
  assert(!seen.url.includes('private-token'));
  assert.equal(seen.options.headers.authorization, 'Bearer private-token');
  assert.equal(seen.options.redirect, 'error');
  const failed = createApi({ token: 'private-token', fetchImpl: async () => ({ ok: false }) });
  await assert.rejects(failed('/repos/REV-LLC/rev-logistica/actions/runs/1'), /unavailable/);
  for (const apiUrl of ['http://api.github.com', 'https://name:pass@api.github.com',
    'https://api.github.com?token=secret']) assert.throws(() => createApi({ token: 'private-token', apiUrl }));
});

test('lookup has a total time budget and does not delay a full CI fallback indefinitely', async () => {
  let time = 100;
  const api = createApi({ token: 'private-token', clock: () => time, requestBudgetMs: 20,
    fetchImpl: async () => { throw new Error('must not fetch after deadline'); } });
  time = 121;
  await assert.rejects(api('/repos/REV-LLC/rev-logistica/actions/runs/1'), /budget/);
});

test('CLI with missing credentials emits reuse=false without leaking environment values', () => {
  const folder = mkdtempSync(join(tmpdir(), 'ci-reuse-test-'));
  try {
    const output = join(folder, 'output');
    const summary = join(folder, 'summary');
    const result = spawnSync(process.execPath, [join(__dirname, 'ci-reuse.cjs')], {
      encoding: 'utf8', env: { PATH: process.env.PATH, GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary, PRIVATE_VALUE: 'never-print-this' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(output, 'utf8'), /^reuse=false\n/);
    assert.match(readFileSync(summary, 'utf8'), /Full CI required/);
    assert(!`${result.stdout}${result.stderr}`.includes('never-print-this'));
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
