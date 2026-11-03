'use strict';

// Reuse evidence, never artifacts or a branch name alone. The complete Git tree
// includes this script, the workflow, lockfile, tests, and application sources.
const { execFileSync } = require('node:child_process');
const { appendFileSync } = require('node:fs');

const WORKFLOW_PATH = '.github/workflows/ci.yml';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_CANDIDATES = 20;
const SHA = /^[0-9a-f]{40}$/;
const VALIDATION_STEPS = {
  'Build API and Web': [
    'Install dependencies',
    'Generate Prisma client',
    'Build API',
    'Test PDF editor text fidelity',
    'Test API inventory and document regressions',
    'Build Web',
    'Prune API runtime dependencies',
    'Verify API runtime',
  ],
  'Web request regressions': [
    'Install web dependencies',
    'Test web regressions',
  ],
};

const miss = (reason) => ({ reuse: false, reason });
const isId = (value) => Number.isSafeInteger(value) && value > 0;
const workflowPath = (value) =>
  typeof value === 'string' ? value.split('@')[0] : undefined;

function trustedRun(run, context, workflowId, now) {
  const created = Date.parse(run?.created_at);
  return (
    isId(run?.id) &&
    run.id !== context.runId &&
    run.event === 'push' &&
    ['dev', 'production'].includes(run.head_branch) &&
    run.status === 'completed' &&
    run.conclusion === 'success' &&
    run.repository?.id === context.repositoryId &&
    run.head_repository?.id === context.repositoryId &&
    run.workflow_id === workflowId &&
    workflowPath(run.path) === WORKFLOW_PATH &&
    SHA.test(run.head_sha) &&
    Number.isFinite(created) &&
    created <= now &&
    now - created <= MAX_AGE_MS
  );
}

function hasFullValidation(data, expectedRunId) {
  const names = Object.keys(VALIDATION_STEPS);
  // Fail closed if the workflow grows new jobs until its evidence rules are
  // updated too. Duplicate names/attempts and partial pages cannot prove success.
  if (!Array.isArray(data?.jobs) || data.total_count !== names.length ||
      data.jobs.length !== names.length) return false;
  return names.every((name) => {
    const matching = data.jobs.filter((job) => job.name === name);
    if (matching.length !== 1) return false;
    const job = matching[0];
    if (job.run_id !== expectedRunId || job.status !== 'completed' || job.conclusion !== 'success' ||
        !Array.isArray(job.steps)) return false;
    // A future validation step must not be silently treated as optional. Full
    // evidence has no skipped/failed steps except this workflow's reuse branch.
    if (new Set(job.steps.map((step) => step.name)).size !== job.steps.length ||
        job.steps.filter((step) => step.name === 'Reuse previous validation').length !== 1 ||
        !job.steps.every((step) => typeof step.name === 'string' && step.name &&
          step.status === 'completed' && step.conclusion ===
            (step.name === 'Reuse previous validation' ? 'skipped' : 'success'))) return false;
    return ['Test CI reuse gate', ...VALIDATION_STEPS[name]].every((stepName) => {
      const steps = job.steps.filter((step) => step.name === stepName);
      return steps.length === 1 && steps[0].status === 'completed' &&
        steps[0].conclusion === 'success';
    });
  });
}

async function findReusableValidation({ context, currentTree, api, now = Date.now() }) {
  try {
    if (!/^[\w.-]+\/[\w.-]+$/.test(context.repository ?? '') ||
        !isId(context.repositoryId) || !isId(context.runId) ||
        !['push', 'pull_request'].includes(context.eventName) ||
        !SHA.test(currentTree)) return miss('unsupported-context');
    if (context.eventName === 'push' &&
        !['dev', 'production'].includes(context.refName)) return miss('untrusted-branch');

    const base = `/repos/${context.repository}`;
    const currentRun = await api(`${base}/actions/runs/${context.runId}`);
    if (currentRun?.id !== context.runId || !isId(currentRun.workflow_id) ||
        currentRun.repository?.id !== context.repositoryId ||
        currentRun.head_repository?.id !== context.repositoryId ||
        currentRun.event !== context.eventName ||
        workflowPath(currentRun.path) !== WORKFLOW_PATH) return miss('untrusted-current-run');

    const since = new Date(now - MAX_AGE_MS).toISOString();
    const query = new URLSearchParams({
      event: 'push', status: 'success', created: `>=${since}`, per_page: '100',
    });
    const list = await api(`${base}/actions/workflows/ci.yml/runs?${query}`);
    if (!Array.isArray(list?.workflow_runs)) return miss('missing-runs');
    const candidates = list.workflow_runs
      .filter((run) => trustedRun(run, context, currentRun.workflow_id, now))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, MAX_CANDIDATES);
    const commitTrees = new Map();
    for (const run of candidates) {
      if (!commitTrees.has(run.head_sha)) {
        const commit = await api(`${base}/git/commits/${run.head_sha}`);
        // The REST commit object must identify the commit we asked for.
        commitTrees.set(run.head_sha,
          commit?.sha === run.head_sha && SHA.test(commit.tree?.sha)
            ? commit.tree.sha : null);
      }
      if (commitTrees.get(run.head_sha) !== currentTree) continue;
      const jobs = await api(`${base}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
      if (!hasFullValidation(jobs, run.id)) continue;
      return { reuse: true, reason: 'same-tree-fully-validated', runId: run.id,
        sourceCommit: run.head_sha, tree: currentTree };
    }
    return miss('no-matching-full-validation');
  } catch {
    // Permission/rate-limit/network errors must never turn into a green bypass.
    // Do not log exceptions or response bodies: they may contain credentials.
    return miss('lookup-unavailable');
  }
}

function createApi({ token, apiUrl = 'https://api.github.com', fetchImpl = fetch,
  requestBudgetMs = 20_000, clock = Date.now }) {
  const base = new URL(apiUrl);
  if (!token || base.protocol !== 'https:' || base.username || base.password ||
      base.search || base.hash) throw new Error('Invalid API configuration');
  const deadline = clock() + requestBudgetMs;
  return async (path) => {
    if (!path.startsWith('/repos/')) throw new Error('Invalid API path');
    const remaining = deadline - clock();
    if (remaining <= 0) throw new Error('Lookup budget exhausted');
    const response = await fetchImpl(`${base.href.replace(/\/$/, '')}${path}`, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
      signal: AbortSignal.timeout(Math.min(10_000, remaining)),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('GitHub API unavailable');
    return response.json();
  };
}

async function main(env = process.env) {
  let result;
  try {
    const currentTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    result = await findReusableValidation({
      currentTree,
      context: {
        repository: env.GITHUB_REPOSITORY,
        repositoryId: Number(env.GITHUB_REPOSITORY_ID),
        runId: Number(env.GITHUB_RUN_ID),
        eventName: env.GITHUB_EVENT_NAME,
        refName: env.GITHUB_REF_NAME,
      },
      api: createApi({ token: env.GH_TOKEN, apiUrl: env.GITHUB_API_URL }),
    });
  } catch {
    result = miss('lookup-unavailable');
  }
  const outputs = [`reuse=${result.reuse}`, `reason=${result.reason}`];
  if (result.reuse) outputs.push(`source-run-id=${result.runId}`);
  appendFileSync(env.GITHUB_OUTPUT, `${outputs.join('\n')}\n`);
  const url = result.reuse
    ? `${env.GITHUB_SERVER_URL || 'https://github.com'}/${env.GITHUB_REPOSITORY}/actions/runs/${result.runId}`
    : undefined;
  const summary = result.reuse
    ? `CI evidence reused: identical Git tree validated by [run ${result.runId}](${url}).\n`
    : `Full CI required (${result.reason}).\n`;
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, summary);
  process.stdout.write(summary);
  return result;
}

if (require.main === module) main().catch(() => {
  // Output-file errors fail the job rather than silently approving the check.
  process.stderr.write('Unable to write CI reuse decision.\n');
  process.exitCode = 1;
});

module.exports = { findReusableValidation, hasFullValidation, createApi, main };
