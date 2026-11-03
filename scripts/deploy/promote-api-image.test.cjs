'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { configFromEnv, createClients, promote, deploymentPatch, validateStagingEvidence, RequestFailure } = require('./promote-api-image.cjs');

const NOW = Date.parse('2026-11-04T12:00:00Z');
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NEW = `ghcr.io/rev-llc/api@sha256:${'a'.repeat(64)}`;
const OLD = `ghcr.io/rev-llc/api@sha256:${'b'.repeat(64)}`;
function environment(action = 'staging') {
  return {
    RAILWAY_PROJECT_ID: uuid(1), RAILWAY_SERVICE_ID: uuid(2),
    RAILWAY_ENVIRONMENT_ID: action === 'staging' ? uuid(3) : uuid(4),
    STAGING_ENVIRONMENT_ID: uuid(3), PRODUCTION_ENVIRONMENT_ID: uuid(4),
    IMAGE_REPOSITORY: 'ghcr.io/rev-llc/api', IMAGE_REF: NEW,
    EXPECTED_SOURCE_SHA: 'c'.repeat(40), EXPECTED_SOURCE_TREE: 'd'.repeat(40),
    SOURCE_CI_RUN_ID: '100', SOURCE_BUILD_RUN_ID: '200', GITHUB_RUN_ID: '200',
    GITHUB_REPOSITORY: 'REV-LLC/rev-logistica', GITHUB_REPOSITORY_ID: '1126773540',
    API_HEALTH_URL: `https://${action === 'staging' ? 'staging' : 'production'}.example.test/health`,
    EVIDENCE_PATH: 'output.json', STAGING_EVIDENCE_PATH: 'staging.json',
    ROLLBACK_EVIDENCE_PATH: 'rollback.json', ROLLBACK_ENVIRONMENT: 'production',
  };
}
function stagingProof(c) {
  return { schemaVersion: 1, action: 'staging', success: true,
    projectId: c.projectId, serviceId: c.serviceId, environmentId: c.stagingId,
    sourceSha: c.sourceSha, sourceTree: c.sourceTree, ciRunId: c.ciRunId,
    buildRunId: c.buildRunId, imageRef: c.imageRef, imageDigest: c.digest,
    deploymentId: uuid(20), healthCheck: { ok: true }, verifiedAt: new Date(NOW - 1000).toISOString() };
}

function fixture(action = 'staging', extra = {}) {
  const c = configFromEnv({ ...environment(action), ...extra }, action);
  const f = { c, mutations: [], writes: [], time: NOW, polls: ['BUILDING', 'SUCCESS'], healthCalls: [],
    commit: { sha: c.sourceSha, tree: { sha: c.sourceTree } },
    ref: { object: { sha: c.sourceSha } },
    ci: { id: 100, event: 'push', head_branch: 'production', head_sha: c.sourceSha,
      repository: { id: c.repositoryId }, head_repository: { id: c.repositoryId },
      status: 'completed', conclusion: 'success', path: '.github/workflows/ci.yml' },
    delivery: { id: 200, event: 'workflow_dispatch', head_branch: 'production', head_sha: c.sourceSha,
      repository: { id: c.repositoryId }, head_repository: { id: c.repositoryId },
      status: 'in_progress', path: '.github/workflows/api-image-promotion.yml' },
    jobs: { total_count: 3, jobs: [
      { name: 'Build immutable API image', run_id: 200, status: 'completed', conclusion: 'success' },
      { name: 'Deploy and verify staging', run_id: 200, status: 'completed', conclusion: 'success' },
      { name: 'Promote verified digest to production', run_id: 200, status: 'in_progress', conclusion: null },
    ] },
  };
  f.proof = stagingProof(c);
  f.previous = { id: uuid(10), status: 'SUCCESS', serviceId: c.serviceId, environmentId: c.environmentId,
    deploymentStopped: false, canRedeploy: true, canRollback: true,
    meta: { imageDigest: OLD.split('@')[1], commitHash: 'e'.repeat(40), branch: 'production',
      irrelevantSecret: 'never-persist-this-secret' } };
  f.instance = { serviceId: c.serviceId, environmentId: c.environmentId,
    source: { image: OLD, repo: null }, latestDeployment: structuredClone(f.previous),
    domains: { serviceDomains: [], customDomains: [{ domain: new URL(c.healthUrl).hostname }] },
    activeDeployments: [structuredClone(f.previous)] };
  f.clients = {
    github: async (route) => {
      if (route.endsWith('/git/ref/heads/production')) return f.ref;
      if (route.includes('/git/commits/')) return f.commit;
      if (route.endsWith('/actions/runs/100')) return f.ci;
      if (route.endsWith('/actions/runs/200')) return f.delivery;
      if (route.includes('/jobs?')) return f.jobs;
      throw new Error(`Unexpected fixture route: ${route}`);
    },
    railway: async (query, variables) => {
      if (query.includes('query TokenScope')) return { projectToken: f.scope || { projectId: c.projectId, environmentId: c.environmentId } };
      if (query.includes('query Instance')) return { serviceInstance: structuredClone(f.instance) };
      if (query.includes('query Deployment')) {
        if (variables.id === f.previous.id) return { deployment: structuredClone(f.previous) };
        const status = f.polls.length > 1 ? f.polls.shift() : f.polls[0];
        const d = { ...structuredClone(f.instance.latestDeployment), status,
          meta: { imageDigest: f.runningDigest || f.instance.source.image?.split('@')[1] || f.previous.meta.imageDigest } };
        if (f.wrongDeployment) d.environmentId = uuid(99);
        return { deployment: d };
      }
      f.mutations.push({ query, variables: structuredClone(variables) });
      if (query.includes('mutation Patch')) {
        const patch = variables.patch.services[c.serviceId];
        f.instance.source = { image: patch.source.image, repo: patch.source.repo };
        return { environmentPatchCommit: uuid(30) };
      }
      if (query.includes('mutation Deploy')) {
        if (f.deployError) {
          if (f.createdDespiteError) f.instance.latestDeployment = {
            id: uuid(11), status: 'SUCCESS', serviceId: c.serviceId, environmentId: c.environmentId,
            deploymentStopped: false, meta: { imageDigest: f.candidateDigest || c.digest },
          };
          if (f.concurrentActiveDeployment) f.instance.activeDeployments.push({
            id: uuid(99), status: 'BUILDING', deploymentStopped: false,
          });
          throw f.deployError;
        }
        f.instance.latestDeployment = { id: uuid(11), status: 'SUCCESS', serviceId: c.serviceId,
          environmentId: c.environmentId, deploymentStopped: false, meta: { imageDigest: c.digest } };
        return { serviceInstanceDeployV2: uuid(11) };
      }
      if (query.includes('mutation Rollback')) {
        f.instance.latestDeployment = { ...structuredClone(f.previous), id: uuid(12), status: 'SUCCESS' };
        return { deploymentRollback: true };
      }
      throw new Error('Unexpected fixture operation');
    },
    health: async (url) => { f.healthCalls.push(url); return f.healthBody || { ok: true, service: 'rev-logistica-api' }; },
  };
  f.options = {
    readEvidence: async (name) => name === 'rollback.json' ? f.rollbackProof : f.proof,
    writeEvidence: async (_name, data) => { f.writes.push(structuredClone(data)); },
    clock: () => f.time, sleep: async (ms) => { f.time += ms; }, timeoutMs: 15_000,
  };
  return f;
}

test('staging configures only its service/environment and verifies exact deployed digest', async () => {
  const f = fixture();
  const e = await promote(f.c, f.clients, f.options);
  assert.equal(e.success, true);
  assert.equal(e.imageRef, NEW);
  assert.equal(e.previousImageRef, OLD);
  assert.equal(e.phase, 'healthy');
  assert.equal(f.mutations.length, 2);
  assert.match(f.mutations[0].query, /skipDeploys:true/);
  assert(!f.mutations[0].query.includes('environmentPatchCommitStaged'));
  assert.equal(f.mutations[0].variables.environmentId, f.c.stagingId);
  assert.deepEqual(Object.keys(f.mutations[0].variables.patch.services), [f.c.serviceId]);
  const patch = f.mutations[0].variables.patch.services[f.c.serviceId];
  assert.equal(patch.source.image, NEW);
  assert.equal(patch.source.repo, null);
  assert.equal(patch.source.autoUpdates.type, 'disabled');
  assert.deepEqual(patch.deploy.preDeployCommand, ['npx prisma migrate deploy --schema apps/api/prisma/schema.prisma']);
  assert.equal(patch.deploy.healthcheckPath, '/health');
  assert(!('variables' in patch));
  assert(!JSON.stringify(e).includes('never-persist-this-secret'));
});

test('production requires successful staging of that same digest within the same workflow run', async () => {
  const f = fixture('production');
  assert.equal((await promote(f.c, f.clients, f.options)).success, true);
  assert.equal(f.mutations[0].variables.environmentId, f.c.productionId);
});

test('an explicitly dispatched full CI run is valid evidence too', async () => {
  const f = fixture(); f.ci.event = 'workflow_dispatch';
  assert.equal((await promote(f.c, f.clients, f.options)).success, true);
});

for (const [name, change] of Object.entries({
  'project token from another environment': (f) => { f.scope = { projectId: f.c.projectId, environmentId: uuid(99) }; },
  'project token from another project': (f) => { f.scope = { projectId: uuid(99), environmentId: f.c.environmentId }; },
  'production HEAD advanced': (f) => { f.ref.object.sha = 'f'.repeat(40); },
  'source tree changed': (f) => { f.commit.tree.sha = 'f'.repeat(40); },
  'CI failed': (f) => { f.ci.conclusion = 'failure'; },
  'CI pending': (f) => { f.ci.status = 'in_progress'; },
  'CI from a PR': (f) => { f.ci.event = 'pull_request'; },
  'CI from dev with concurrent unreleased changes': (f) => { f.ci.head_branch = 'dev'; },
  'CI from another commit': (f) => { f.ci.head_sha = 'f'.repeat(40); },
  'CI from a fork': (f) => { f.ci.head_repository.id += 1; },
  'different CI workflow': (f) => { f.ci.path = '.github/workflows/other.yml'; },
  'delivery did not target production': (f) => { f.delivery.head_branch = 'dev'; },
  'delivery uses another definition commit': (f) => { f.delivery.head_sha = 'f'.repeat(40); },
  'unprivileged listener passed as delivery': (f) => { f.delivery.event = 'workflow_run'; },
  'image build was skipped': (f) => { f.jobs.jobs[0].conclusion = 'skipped'; },
  'image build did not finish': (f) => { f.jobs.jobs[0].status = 'in_progress'; },
  'partial delivery job response': (f) => { f.jobs.total_count = 100; },
  'image build job from another run': (f) => { f.jobs.jobs[0].run_id = 999; },
  'another deployment is in progress': (f) => { f.instance.latestDeployment.status = 'DEPLOYING'; },
  'latest deployment already failed': (f) => { f.instance.latestDeployment.status = 'FAILED'; },
  'baseline deployment belongs to another environment': (f) => { f.instance.latestDeployment.environmentId = uuid(99); },
  'baseline deployment ID is malformed': (f) => { f.instance.latestDeployment.id = 'invalid'; },
  'health URL points at another service': (f) => { f.instance.domains.customDomains[0].domain = 'wrong.example.test'; },
})) {
  test(`no mutation for ${name}`, async () => {
    const f = fixture(); change(f);
    await assert.rejects(promote(f.c, f.clients, f.options));
    assert.equal(f.mutations.length, 0);
  });
}

for (const [name, change] of Object.entries({
  'staging failed': (e) => { e.success = false; },
  'different digest': (e) => { e.imageDigest = OLD.split('@')[1]; },
  'different image reference': (e) => { e.imageRef = OLD; },
  'different source SHA': (e) => { e.sourceSha = 'f'.repeat(40); },
  'different Git tree': (e) => { e.sourceTree = 'f'.repeat(40); },
  'different build run': (e) => { e.buildRunId = 999; },
  'another environment': (e) => { e.environmentId = uuid(99); },
  'missing health proof': (e) => { delete e.healthCheck; },
  'stale proof': (e) => { e.verifiedAt = '2026-11-02T11:59:59Z'; },
  'future proof': (e) => { e.verifiedAt = '2026-11-04T12:00:01Z'; },
})) {
  test(`production refuses ${name} before changing its source`, async () => {
    const f = fixture('production'); change(f.proof);
    await assert.rejects(promote(f.c, f.clients, f.options));
    assert.equal(f.mutations.length, 0);
  });
}

test('production refuses a stage job that was not successful', async () => {
  const f = fixture('production'); f.jobs.jobs[1].conclusion = 'failure';
  await assert.rejects(promote(f.c, f.clients, f.options));
  assert.equal(f.mutations.length, 0);
});

test('registry credentials are optional, scoped to the target patch, and never persisted in evidence', async () => {
  const f = fixture('staging', { GHCR_PULL_USERNAME: 'read-only-user', GHCR_PULL_TOKEN: 'registry-password-secret' });
  const e = await promote(f.c, f.clients, f.options);
  const p = f.mutations[0].variables.patch.services[f.c.serviceId];
  assert.equal(p.deploy.registryCredentials.password, 'registry-password-secret');
  assert(!JSON.stringify(f.writes).includes('registry-password-secret'));
  assert(!JSON.stringify(e).includes('registry-password-secret'));
  assert(!('registryCredentials' in deploymentPatch(fixture().c, NEW).services[f.c.serviceId].deploy));
});

for (const [name, extra] of Object.entries({
  'mutable latest image': { IMAGE_REF: 'ghcr.io/rev-llc/api:latest' },
  'image in another repository': { IMAGE_REF: `ghcr.io/another/api@sha256:${'a'.repeat(64)}` },
  'wrong target environment': { RAILWAY_ENVIRONMENT_ID: uuid(4) },
  'same staging and production IDs': { PRODUCTION_ENVIRONMENT_ID: uuid(3) },
  'HTTP health URL': { API_HEALTH_URL: 'http://staging.example.test/health' },
  'credential-bearing health URL': { API_HEALTH_URL: 'https://user:password@staging.example.test/health' },
  'incomplete registry credential pair': { GHCR_PULL_TOKEN: 'password' },
  'credentials sent to another registry': { IMAGE_REPOSITORY: 'other.test/api', IMAGE_REF: `other.test/api@sha256:${'a'.repeat(64)}`, GHCR_PULL_USERNAME: 'user', GHCR_PULL_TOKEN: 'password' },
})) {
  test(`configuration refuses ${name}`, () => {
    assert.throws(() => configFromEnv({ ...environment(), ...extra }, 'staging'));
  });
}

for (const [name, change] of Object.entries({
  'running digest mismatch': (f) => { f.runningDigest = OLD.split('@')[1]; },
  'wrong deployment environment': (f) => { f.wrongDeployment = true; },
  'deployment crashed': (f) => { f.polls = ['CRASHED']; },
  'deployment never becomes healthy': (f) => { f.polls = ['BUILDING']; },
  'HTTP 200 from an unrelated app': (f) => { f.healthBody = { ok: true, service: 'other-service' }; },
  'API health is false': (f) => { f.healthBody = { ok: false, service: 'rev-logistica-api' }; },
})) {
  test(`records failure, not promotion success, for ${name}`, async () => {
    const f = fixture(); change(f);
    await assert.rejects(promote(f.c, f.clients, f.options));
    assert.equal(f.writes.at(-1).success, false);
    assert.equal(f.writes.at(-1).phase, 'failed');
    assert.equal(f.mutations.length, 2); // no blind automatic rollback over concurrent work
  });
}

test('first production migration from Git requires explicit authorization and native recovery evidence', async () => {
  const f = fixture('production'); f.instance.source = { repo: f.c.repository, image: null };
  await assert.rejects(promote(f.c, f.clients, f.options), /bootstrap/);
  assert.equal(f.mutations.length, 0);
  f.c.allowInitialGitSource = true;
  const e = await promote(f.c, f.clients, f.options);
  assert.equal(e.success, true);
  assert.equal(e.previousImageRef, null);
  assert.equal(e.rollbackKind, 'railway-native');
  assert.deepEqual(e.previousGitSource, { repo: f.c.repository, branch: 'production', commitSha: 'e'.repeat(40) });
});

test('first production image delivery refuses an unrecoverable Git baseline', async () => {
  const f = fixture('production', { ALLOW_INITIAL_GIT_SOURCE: 'true' });
  f.instance.source = { repo: f.c.repository, image: null };
  f.instance.latestDeployment.canRollback = false;
  f.instance.latestDeployment.canRedeploy = false;
  await assert.rejects(promote(f.c, f.clients, f.options), /recoverable/);
  assert.equal(f.mutations.length, 0);
});

test('rollback pins the prior digest only after confirming its Railway deployment', async () => {
  const f = fixture('production');
  const evidence = await promote(f.c, f.clients, f.options);
  f.rollbackProof = evidence; f.polls = ['SUCCESS'];
  const c = { ...f.c, action: 'rollback', rollbackEvidencePath: 'rollback.json' };
  const e = await promote(c, f.clients, f.options);
  assert.equal(e.success, true);
  assert.equal(e.imageRef, OLD);
  assert.equal(f.instance.source.image, OLD);
});

test('rollback refuses stale evidence when another deployment replaced the candidate', async () => {
  const f = fixture('production');
  f.rollbackProof = await promote(f.c, f.clients, f.options);
  f.instance.latestDeployment.id = uuid(99);
  const count = f.mutations.length;
  await assert.rejects(promote({ ...f.c, action: 'rollback', rollbackEvidencePath: 'rollback.json' }, f.clients, f.options));
  assert.equal(f.mutations.length, count);
});

test('first-transition rollback restores pinned Git configuration and the cached native image', async () => {
  const f = fixture('production', { ALLOW_INITIAL_GIT_SOURCE: 'true' });
  f.instance.source = { repo: f.c.repository, image: null };
  f.rollbackProof = await promote(f.c, f.clients, f.options);
  f.polls = ['SUCCESS'];
  const e = await promote({ ...f.c, action: 'rollback', rollbackEvidencePath: 'rollback.json' }, f.clients, f.options);
  assert.equal(e.success, true);
  assert.equal(e.imageRef, null);
  assert.equal(e.imageDigest, OLD.split('@')[1]);
  assert(f.mutations.some((m) => m.query.includes('deploymentRollback')));
  const restored = f.mutations[2].variables.patch.services[f.c.serviceId];
  assert.equal(restored.source.repo, f.c.repository);
  assert.equal(restored.source.commitSha, 'e'.repeat(40));
  assert.equal(restored.configFile, '/railway.json');
});

test('HTTP clients do not leak provider errors or forward credentials to health endpoints', async () => {
  const seen = [];
  const clients = createClients({ RAILWAY_TOKEN: 'railway-secret', GH_TOKEN: 'github-secret' }, async (url, options) => {
    seen.push({ url, options });
    return { ok: true, json: async () => url.includes('graphql') ? { data: { projectToken: {} } } : { ok: true } };
  });
  await clients.health('https://staging.example.test/health');
  assert(!seen[0].options.headers.authorization);
  assert(!seen[0].options.headers['Project-Access-Token']);
  await clients.railway('query TokenScope { projectToken { projectId environmentId } }');
  assert.equal(seen[1].options.headers['Project-Access-Token'], 'railway-secret');
  assert.equal(seen[1].options.redirect, 'error');
  const failed = createClients({ RAILWAY_TOKEN: 'railway-secret', GH_TOKEN: 'github-secret' }, async () => {
    throw new Error('upstream response containing railway-secret');
  });
  await assert.rejects(failed.railway('query{}'), (e) => !e.message.includes('railway-secret'));
});

test('a definite deploy rejection restores the previous digest configuration without creating another deployment', async () => {
  const f = fixture('production'); f.deployError = new RequestFailure('Railway GraphQL', true);
  await assert.rejects(promote(f.c, f.clients, f.options));
  const e = f.writes.at(-1);
  assert.equal(e.phase, 'config-restored');
  assert.equal(e.success, false);
  assert.equal(e.configurationRestored, true);
  assert.equal(e.previousDeploymentStillRunning, true);
  assert.equal(e.deploymentId, undefined);
  assert.equal(f.instance.source.image, OLD);
  assert.equal(f.instance.latestDeployment.id, f.previous.id);
  assert.equal(f.mutations.filter((m) => m.query.includes('mutation Deploy')).length, 1);
  assert.equal(f.mutations.filter((m) => m.query.includes('mutation Patch')).length, 2);
});

test('a rejected first image deployment restores the pinned Git source while the old API keeps running', async () => {
  const f = fixture('production', { ALLOW_INITIAL_GIT_SOURCE: 'true' });
  f.instance.source = { repo: f.c.repository, image: null };
  f.deployError = new RequestFailure('Railway', true);
  await assert.rejects(promote(f.c, f.clients, f.options));
  const e = f.writes.at(-1);
  assert.equal(e.phase, 'config-restored');
  assert.equal(f.instance.source.repo, f.c.repository);
  const restore = f.mutations.at(-1).variables.patch.services[f.c.serviceId];
  assert.deepEqual(restore.source, { repo: f.c.repository, branch: 'production', commitSha: 'e'.repeat(40), image: null });
  assert.equal(restore.configFile, '/railway.json');
  assert.equal(f.mutations.filter((m) => m.query.includes('mutation Deploy')).length, 1);
});

test('a lost deploy response adopts the matching actual deployment ID and verifies that image', async () => {
  const f = fixture(); f.deployError = new RequestFailure('Railway'); f.createdDespiteError = true;
  const e = await promote(f.c, f.clients, f.options);
  assert.equal(e.success, true);
  assert.equal(e.deploymentId, uuid(11));
  assert.equal(e.deploymentIdAdopted, true);
  assert.equal(e.deployRequestOutcome, 'ambiguous');
  assert.equal(f.mutations.length, 2);
});

test('an ambiguous timeout without a proven deployment never silently restores or redeploys', async () => {
  const f = fixture(); f.deployError = new RequestFailure('Railway');
  await assert.rejects(promote(f.c, f.clients, f.options));
  const e = f.writes.at(-1);
  assert.equal(e.phase, 'failed');
  assert.equal(e.failurePhase, 'configured');
  assert.equal(e.deployRequestOutcome, 'ambiguous');
  assert.equal(e.configurationRestored, undefined);
  assert.equal(f.mutations.length, 2);
});

test('a concurrent active deployment blocks configuration restoration after a rejected request', async () => {
  const f = fixture(); f.deployError = new RequestFailure('Railway', true); f.concurrentActiveDeployment = true;
  await assert.rejects(promote(f.c, f.clients, f.options));
  assert.equal(f.writes.at(-1).configurationRestored, undefined);
  assert.equal(f.mutations.length, 2);
});

test('a newly observed deployment with another digest is never adopted or rolled back blindly', async () => {
  const f = fixture(); f.deployError = new RequestFailure('Railway', true);
  f.createdDespiteError = true; f.candidateDigest = OLD.split('@')[1];
  await assert.rejects(promote(f.c, f.clients, f.options));
  assert.equal(f.writes.at(-1).deploymentId, undefined);
  assert.equal(f.writes.at(-1).configurationRestored, undefined);
  assert.equal(f.mutations.length, 2);
});

test('API errors classify only explicit validation/auth rejections as safe pre-execution failures', async () => {
  for (const [code, rejected] of [['FORBIDDEN', true], ['GRAPHQL_VALIDATION_FAILED', true], ['INTERNAL_SERVER_ERROR', false]]) {
    const clients = createClients({ RAILWAY_TOKEN: 'secret', GH_TOKEN: 'secret' }, async () => ({
      ok: true, json: async () => ({ errors: [{ message: 'do not print secret', extensions: { code } }] }),
    }));
    await assert.rejects(clients.railway('mutation{}'), (e) =>
      e instanceof RequestFailure && e.rejected === rejected && !e.message.includes('secret'));
  }
});

test('staging evidence rejects invalid versions and malformed dates', () => {
  const f = fixture('production');
  for (const extra of [{ schemaVersion: 2 }, { verifiedAt: 'not-a-date' }, { deploymentId: 'wrong' }]) {
    assert.throws(() => validateStagingEvidence(f.c, { ...f.proof, ...extra }, NOW));
  }
});
