const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const REPOSITORY = 'REV-LLC/rev-logistica';
const DELIVERY_FILES = [
  '.github/workflows/api-image-promotion.yml',
  '.github/scripts/api-image-source.cjs',
  'scripts/deploy/build-api-image.cjs',
  'scripts/deploy/promote-api-image.cjs',
  'scripts/deploy/recover-api-image.cjs',
];
const SHA = /^[0-9a-f]{40}$/;
const RUN_ID = /^[1-9][0-9]*$/;

function selectSource(eventName, event, environment) {
  if (eventName === 'push') {
    assert.equal(environment.GITHUB_REF, 'refs/heads/production', 'Push delivery must use production');
    assert.equal(event.ref, 'refs/heads/production', 'Push event must target production');
    assert.equal(event.deleted, false, 'Deleted branches cannot be delivered');
    assert.equal(String(event.repository?.id), environment.GITHUB_REPOSITORY_ID, 'Foreign push repository');
    assert.equal(event.after, environment.GITHUB_SHA, 'Push SHA differs from the production revision');
    return { sha: event.after, ciRunId: String(environment.SOURCE_CI_RUN_ID || '') };
  }
  if (eventName === 'workflow_run') {
    const run = event.workflow_run;
    assert(run && run.event === 'push' && run.head_branch === 'production', 'Only production push CI can trigger promotion');
    assert(run.status === 'completed' && run.conclusion === 'success' && run.name === 'CI', 'The triggering CI must have succeeded');
    assert.equal(String(run.head_repository?.id), environment.GITHUB_REPOSITORY_ID, 'Foreign CI repository');
    return { sha: run.head_sha, ciRunId: String(run.id) };
  }
  assert.equal(eventName, 'workflow_dispatch', 'Unsupported event');
  assert.equal(environment.GITHUB_REF, 'refs/heads/production', 'Manual delivery must use the production branch');
  assert.equal(event.inputs?.source_sha, environment.GITHUB_SHA, 'The requested SHA must be the dispatched production revision');
  return { sha: event.inputs.source_sha, ciRunId: String(event.inputs.source_ci_run_id || '') };
}

async function verifySource({ eventName, event, environment, request, checkoutSha, now = Date.now(),
  mode = 'verify', clock = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  discoveryTimeoutMs = 60_000, ciTimeoutMs = 15 * 60_000 }) {
  assert(['prepare', 'wait', 'verify'].includes(mode), 'Unsupported source verification mode');
  const initialClock = clock();
  assert.equal(environment.GITHUB_REPOSITORY, REPOSITORY, 'Unexpected repository');
  const source = selectSource(eventName, event, environment);
  assert(SHA.test(source.sha), 'A full source SHA is required');
  if (eventName !== 'push' || mode !== 'prepare') assert(RUN_ID.test(source.ciRunId), 'A source CI run is required');
  assert(SHA.test(environment.WORKFLOW_DEFINITION_SHA || ''), 'Missing workflow definition SHA');
  assert.equal(checkoutSha, source.sha, 'Checkout differs from the release');

  const prefix = `/repos/${REPOSITORY}`;
  const head = await request(`${prefix}/commits/production`);
  assert.equal(head.sha, source.sha, 'Production moved; start a new delivery');
  const workflow = await request(`${prefix}/actions/workflows/ci.yml`);
  assert(Number.isSafeInteger(workflow.id) && workflow.id > 0, 'Missing CI workflow identity');
  if (!source.ciRunId) {
    const deadline = clock() + discoveryTimeoutMs;
    while (!source.ciRunId) {
      const params = new URLSearchParams({ branch: 'production', event: 'push', head_sha: source.sha, per_page: '100' });
      const list = await request(`${prefix}/actions/workflows/ci.yml/runs?${params}`);
      assert(Array.isArray(list.workflow_runs), 'Missing CI runs response');
      const matches = list.workflow_runs.filter((run) => run.workflow_id === workflow.id &&
        run.event === 'push' && run.head_branch === 'production' && run.head_sha === source.sha &&
        String(run.repository?.id) === environment.GITHUB_REPOSITORY_ID &&
        String(run.head_repository?.id) === environment.GITHUB_REPOSITORY_ID && RUN_ID.test(String(run.id)));
      matches.sort((a, b) => b.id - a.id);
      if (matches.length) source.ciRunId = String(matches[0].id);
      else {
        assert(clock() < deadline, 'The exact production CI run was not discovered within 60 seconds');
        await sleep(Math.min(5000, deadline - clock()));
      }
    }
  }
  const deadline = clock() + ciTimeoutMs;
  let run;
  while (true) {
    run = await request(`${prefix}/actions/runs/${source.ciRunId}`);
    assert.equal(String(run.id), source.ciRunId, 'CI run identity mismatch');
    assert.equal(run.workflow_id, workflow.id, 'The run is not the CI workflow');
    assert.equal(run.head_sha, source.sha, 'CI validated another commit');
    assert.equal(run.head_branch, 'production', 'CI must validate production');
    assert(['push', 'workflow_dispatch'].includes(run.event), 'Untrusted CI event');
    if (eventName === 'push') assert.equal(run.event, 'push', 'Push delivery requires push CI');
    assert.equal(String(run.repository?.id), environment.GITHUB_REPOSITORY_ID, 'CI repository mismatch');
    assert.equal(String(run.head_repository?.id), environment.GITHUB_REPOSITORY_ID, 'CI head repository mismatch');
    const started = Date.parse(run.run_started_at || run.created_at);
    const observedNow = now + clock() - initialClock;
    assert(Number.isFinite(started) && started <= observedNow && observedNow - started <= 24 * 60 * 60 * 1000, 'CI evidence must be from the last 24 hours');
    if (run.status === 'completed') {
      assert.equal(run.conclusion, 'success', 'CI did not succeed');
      break;
    }
    assert(['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(run.status) &&
      run.conclusion == null, 'Invalid pending CI state');
    if (mode === 'prepare') break;
    assert.equal(mode, 'wait', 'CI is incomplete');
    assert(clock() < deadline, 'Timed out waiting for the exact production CI run');
    await sleep(Math.min(10_000, deadline - clock()));
  }
  const ciValidated = run.status === 'completed';
  if (ciValidated) {
    const data = await request(`${prefix}/actions/runs/${source.ciRunId}/jobs?filter=latest&per_page=100`);
    assert(Array.isArray(data.jobs) && data.total_count === data.jobs.length, 'Incomplete CI jobs response');
    for (const name of ['Build API and Web', 'Web request regressions']) {
      const matches = data.jobs.filter((job) => job.name === name);
      assert.equal(matches.length, 1, `Expected exactly one CI job: ${name}`);
      assert.equal(String(matches[0].run_id), source.ciRunId, `Wrong CI job run: ${name}`);
      assert.equal(matches[0].status, 'completed', `Incomplete CI job: ${name}`);
      assert.equal(matches[0].conclusion, 'success', `Unsuccessful CI job: ${name}`);
    }
  }
  // workflow_run uses the default branch's definition. It must execute exactly
  // the delivery code reviewed in this production release, even if SHAs differ.
  const deliveryBlobs = {};
  for (const file of DELIVERY_FILES) {
    const releaseFile = await request(`${prefix}/contents/${file}?ref=${source.sha}`);
    const definitionFile = await request(`${prefix}/contents/${file}?ref=${environment.WORKFLOW_DEFINITION_SHA}`);
    assert.equal(releaseFile.type, 'file', `Missing delivery file: ${file}`);
    assert(SHA.test(releaseFile.sha || ''), `Missing delivery blob: ${file}`);
    assert.equal(releaseFile.sha, definitionFile.sha, `Delivery definition differs from production: ${file}`);
    deliveryBlobs[file] = releaseFile.sha;
  }
  assert(SHA.test(head.commit?.tree?.sha || ''), 'Missing source tree');
  const currentHead = await request(`${prefix}/commits/production`);
  assert.equal(currentHead.sha, source.sha, 'Production moved while validating CI; start a new delivery');
  assert.equal(currentHead.commit?.tree?.sha, head.commit.tree.sha, 'Production source tree changed');
  return {
    version: 1,
    repository: REPOSITORY,
    repositoryId: environment.GITHUB_REPOSITORY_ID,
    sourceSha: source.sha,
    sourceTree: head.commit.tree.sha,
    sourceCiRunId: source.ciRunId,
    sourceBuildRunId: environment.GITHUB_RUN_ID,
    workflowDefinitionSha: environment.WORKFLOW_DEFINITION_SHA,
    deliveryBlobs,
    ciValidated,
    ...(ciValidated ? { ciVerifiedAt: new Date(clock()).toISOString() } : {}),
    verifiedAt: new Date(clock()).toISOString(),
  };
}

function githubRequest(token) {
  return async (route) => {
    const response = await fetch(`https://api.github.com${route}`, {
      redirect: 'error',
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`GitHub verification failed (${response.status})`);
    return response.json();
  };
}

async function main() {
  const environment = process.env;
  assert(environment.GH_TOKEN, 'Missing read token for CI verification');
  const event = JSON.parse(fs.readFileSync(environment.GITHUB_EVENT_PATH, 'utf8'));
  const mode = process.argv[2] || 'verify';
  const proof = await verifySource({
    mode,
    eventName: environment.GITHUB_EVENT_NAME,
    event,
    environment,
    request: githubRequest(environment.GH_TOKEN),
    checkoutSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  });
  fs.writeFileSync(environment.SOURCE_EVIDENCE_PATH, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
  if (environment.GITHUB_OUTPUT) fs.appendFileSync(environment.GITHUB_OUTPUT, `source-sha=${proof.sourceSha}\nsource-tree=${proof.sourceTree}\nsource-ci-run-id=${proof.sourceCiRunId}\n`);
  if (mode === 'wait' && environment.BUILD_EVIDENCE_PATH && fs.existsSync(environment.BUILD_EVIDENCE_PATH)) {
    const build = JSON.parse(fs.readFileSync(environment.BUILD_EVIDENCE_PATH, 'utf8'));
    for (const key of ['sourceSha', 'sourceTree', 'sourceCiRunId', 'sourceBuildRunId']) {
      assert.equal(build[key], proof[key], 'Build evidence does not match the completed CI gate');
    }
    fs.writeFileSync(environment.BUILD_EVIDENCE_PATH, `${JSON.stringify({ ...build, ciValidated: true, ciVerifiedAt: proof.ciVerifiedAt }, null, 2)}\n`, { mode: 0o600 });
  }
  console.log(`Verified production ${proof.sourceSha}, tree ${proof.sourceTree}, CI run ${proof.sourceCiRunId}: ${proof.ciValidated ? 'passed' : 'pending; deployment remains gated'}`);
}

module.exports = { DELIVERY_FILES, selectSource, verifySource };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
