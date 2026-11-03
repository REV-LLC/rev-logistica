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

async function verifySource({ eventName, event, environment, request, checkoutSha, now = Date.now() }) {
  assert.equal(environment.GITHUB_REPOSITORY, REPOSITORY, 'Unexpected repository');
  const source = selectSource(eventName, event, environment);
  assert(SHA.test(source.sha), 'A full source SHA is required');
  assert(RUN_ID.test(source.ciRunId), 'A source CI run is required');
  assert(SHA.test(environment.WORKFLOW_DEFINITION_SHA || ''), 'Missing workflow definition SHA');
  assert.equal(checkoutSha, source.sha, 'Checkout differs from the release');

  const prefix = `/repos/${REPOSITORY}`;
  const head = await request(`${prefix}/commits/production`);
  assert.equal(head.sha, source.sha, 'Production moved; start a new delivery');
  const workflow = await request(`${prefix}/actions/workflows/ci.yml`);
  assert(Number.isSafeInteger(workflow.id) && workflow.id > 0, 'Missing CI workflow identity');
  const run = await request(`${prefix}/actions/runs/${source.ciRunId}`);
  assert.equal(run.workflow_id, workflow.id, 'The run is not the CI workflow');
  assert.equal(run.head_sha, source.sha, 'CI validated another commit');
  assert.equal(run.head_branch, 'production', 'CI must validate production');
  assert(['push', 'workflow_dispatch'].includes(run.event), 'Untrusted CI event');
  assert.equal(String(run.head_repository?.id), environment.GITHUB_REPOSITORY_ID, 'CI repository mismatch');
  assert.equal(run.status, 'completed', 'CI is incomplete');
  assert.equal(run.conclusion, 'success', 'CI did not succeed');
  const started = Date.parse(run.run_started_at || run.created_at);
  assert(Number.isFinite(started) && started <= now && now - started <= 24 * 60 * 60 * 1000, 'CI evidence must be from the last 24 hours');
  const { jobs } = await request(`${prefix}/actions/runs/${source.ciRunId}/jobs?filter=latest&per_page=100`);
  for (const name of ['Build API and Web', 'Web request regressions']) {
    const matches = jobs.filter((job) => job.name === name);
    assert.equal(matches.length, 1, `Expected exactly one CI job: ${name}`);
    assert.equal(matches[0].status, 'completed', `Incomplete CI job: ${name}`);
    assert.equal(matches[0].conclusion, 'success', `Unsuccessful CI job: ${name}`);
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
    verifiedAt: new Date().toISOString(),
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
  const proof = await verifySource({
    eventName: environment.GITHUB_EVENT_NAME,
    event,
    environment,
    request: githubRequest(environment.GH_TOKEN),
    checkoutSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  });
  fs.writeFileSync(environment.SOURCE_EVIDENCE_PATH, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
  if (environment.GITHUB_OUTPUT) fs.appendFileSync(environment.GITHUB_OUTPUT, `source-sha=${proof.sourceSha}\nsource-tree=${proof.sourceTree}\nsource-ci-run-id=${proof.sourceCiRunId}\n`);
  console.log(`Verified production ${proof.sourceSha}, tree ${proof.sourceTree}, CI run ${proof.sourceCiRunId}`);
}

module.exports = { DELIVERY_FILES, selectSource, verifySource };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
