const assert = require('node:assert/strict');
const fs = require('node:fs');

function dispatchInput(event, environment) {
  assert.equal(environment.GITHUB_REPOSITORY, 'REV-LLC/rev-logistica');
  const run = event.workflow_run;
  assert(run && run.name === 'CI' && run.event === 'push');
  assert.equal(run.head_branch, 'production');
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'success');
  assert.equal(String(run.head_repository?.id), environment.GITHUB_REPOSITORY_ID);
  assert(/^[0-9a-f]{40}$/.test(run.head_sha));
  assert(/^[1-9][0-9]*$/.test(String(run.id)));
  return { ref: 'production', inputs: { source_sha: run.head_sha, source_ci_run_id: String(run.id) } };
}

async function main() {
  const environment = process.env;
  assert.equal(environment.API_IMAGE_PROMOTION_ENABLED, 'true', 'Image delivery is not activated');
  assert(environment.GH_TOKEN, 'Missing workflow dispatch token');
  const body = dispatchInput(JSON.parse(fs.readFileSync(environment.GITHUB_EVENT_PATH, 'utf8')), environment);
  const response = await fetch('https://api.github.com/repos/REV-LLC/rev-logistica/actions/workflows/api-image-promotion.yml/dispatches', {
    method: 'POST',
    redirect: 'error',
    headers: { authorization: `Bearer ${environment.GH_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, 204, `Production workflow dispatch failed (${response.status})`);
  console.log(`Dispatched production delivery of ${body.inputs.source_sha}, CI run ${body.inputs.source_ci_run_id}`);
}

module.exports = { dispatchInput };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
