'use strict';

const fs = require('node:fs');
const path = require('node:path');
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const REPOSITORY = /^[a-z0-9.-]+(?::[0-9]+)?\/[a-z0-9._/-]+$/;
const RUNTIME = Object.freeze({
  startCommand: 'npm --workspace apps/api run start:prod',
  preDeployCommand: ['npx prisma migrate deploy --schema apps/api/prisma/schema.prisma'],
  healthcheckPath: '/health', healthcheckTimeout: 120,
  restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 10,
});
const DEPLOYMENT_FIELDS = 'id status environmentId serviceId deploymentStopped canRedeploy canRollback meta';
const INSTANCE_QUERY = `query Instance($serviceId:String!,$environmentId:String!){
  serviceInstance(serviceId:$serviceId,environmentId:$environmentId){
    serviceId environmentId source{image repo}
    domains{serviceDomains{domain} customDomains{domain}}
    latestDeployment{${DEPLOYMENT_FIELDS}}
    activeDeployments{${DEPLOYMENT_FIELDS}}
  }
}`;
const DEPLOYMENT_QUERY = `query Deployment($id:String!){deployment(id:$id){${DEPLOYMENT_FIELDS}}}`;
const PATCH = `mutation Patch($environmentId:String!,$patch:EnvironmentConfig!,$message:String!){
  environmentPatchCommit(environmentId:$environmentId,patch:$patch,
    skipDeploys:true,commitMessage:$message)
}`;
const DEPLOY = `mutation Deploy($environmentId:String!,$serviceId:String!){
  serviceInstanceDeployV2(environmentId:$environmentId,serviceId:$serviceId)
}`;
const NATIVE_ROLLBACK = 'mutation Rollback($id:String!){deploymentRollback(id:$id)}';
const fail = (message) => { throw new Error(message); };
class RequestFailure extends Error {
  constructor(provider, rejected = false) {
    super(`${provider} request failed`);
    this.rejected = rejected;
  }
}
const id = (value) => Number.isSafeInteger(value) && value > 0;
const cleanPath = (value) => typeof value === 'string' && value.split('@')[0];

function imageDigest(ref, repository) {
  if (typeof ref !== 'string' || !ref.startsWith(`${repository}@`)) fail('Image repository mismatch');
  const digest = ref.slice(repository.length + 1);
  if (!DIGEST.test(digest)) fail('An immutable sha256 image reference is required');
  return digest;
}

function configFromEnv(env, action) {
  if (!['staging', 'production', 'rollback'].includes(action)) fail('Select staging, production, or rollback');
  const role = action === 'rollback' ? env.ROLLBACK_ENVIRONMENT : action;
  if (!['staging', 'production'].includes(role)) fail('Rollback environment is required');
  const c = {
    action, role, projectId: env.RAILWAY_PROJECT_ID, serviceId: env.RAILWAY_SERVICE_ID,
    environmentId: env.RAILWAY_ENVIRONMENT_ID,
    stagingId: env.STAGING_ENVIRONMENT_ID, productionId: env.PRODUCTION_ENVIRONMENT_ID,
    repository: env.GITHUB_REPOSITORY, repositoryId: Number(env.GITHUB_REPOSITORY_ID),
    imageRepository: env.IMAGE_REPOSITORY, imageRef: env.IMAGE_REF,
    sourceSha: env.EXPECTED_SOURCE_SHA, sourceTree: env.EXPECTED_SOURCE_TREE,
    ciRunId: Number(env.SOURCE_CI_RUN_ID), buildRunId: Number(env.SOURCE_BUILD_RUN_ID),
    currentRunId: Number(env.GITHUB_RUN_ID), healthUrl: env.API_HEALTH_URL,
    outputPath: env.EVIDENCE_PATH, stagingEvidencePath: env.STAGING_EVIDENCE_PATH,
    rollbackEvidencePath: env.ROLLBACK_EVIDENCE_PATH,
    pullUser: env.GHCR_PULL_USERNAME, pullToken: env.GHCR_PULL_TOKEN,
    allowInitialGitSource: env.ALLOW_INITIAL_GIT_SOURCE === 'true',
  };
  for (const key of ['projectId', 'serviceId', 'environmentId', 'stagingId', 'productionId']) {
    if (!UUID.test(c[key] || '')) fail('Invalid Railway target identifiers');
  }
  if (c.stagingId === c.productionId || c.environmentId !==
      (role === 'staging' ? c.stagingId : c.productionId)) fail('Railway environment mismatch');
  if (!/^[\w.-]+\/[\w.-]+$/.test(c.repository || '') || !id(c.repositoryId) ||
      !id(c.ciRunId) || !id(c.buildRunId) || !id(c.currentRunId) ||
      !SHA.test(c.sourceSha || '') || !SHA.test(c.sourceTree || '')) fail('Invalid release identity');
  if (!REPOSITORY.test(c.imageRepository || '') || c.imageRepository.includes('..') ||
      c.imageRepository.endsWith('/')) fail('Invalid image repository');
  c.digest = imageDigest(c.imageRef, c.imageRepository);
  const health = new URL(c.healthUrl);
  if (health.protocol !== 'https:' || health.username || health.password || health.search ||
      health.hash || health.pathname !== '/health') fail('An HTTPS /health URL without credentials is required');
  if (!c.outputPath) fail('EVIDENCE_PATH is required');
  if (Boolean(c.pullUser) !== Boolean(c.pullToken)) fail('Registry credentials must be supplied as a pair');
  if (c.pullToken && !c.imageRepository.startsWith('ghcr.io/')) fail('GHCR credentials cannot be sent to another registry');
  if (action === 'production' && !c.stagingEvidencePath) fail('Staging evidence is required');
  if (action === 'rollback' && !c.rollbackEvidencePath) fail('Rollback evidence is required');
  return c;
}

function createClients(env, fetchImpl = fetch) {
  if (!env.RAILWAY_TOKEN || !env.GH_TOKEN) fail('Scoped Railway and GitHub credentials are required');
  async function request(url, options, name) {
    let r;
    try {
      r = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15_000) });
    } catch { throw new RequestFailure(name); }
    if (!r.ok) throw new RequestFailure(name, [400, 401, 403, 404, 422].includes(r.status));
    try { return await r.json(); } catch { throw new RequestFailure(name); }
  }
  return {
    github: (route) => {
      if (!route.startsWith('/repos/')) fail('Invalid GitHub API route');
      return request(`https://api.github.com${route}`, { headers: {
        accept: 'application/vnd.github+json', authorization: `Bearer ${env.GH_TOKEN}`,
        'x-github-api-version': '2022-11-28',
      } }, 'GitHub');
    },
    railway: async (query, variables = {}) => {
      const r = await request('https://backboard.railway.com/graphql/v2', {
        method: 'POST', headers: { 'content-type': 'application/json', 'Project-Access-Token': env.RAILWAY_TOKEN },
        body: JSON.stringify({ query, variables }),
      }, 'Railway');
      // GraphQL error text can include submitted credentials. Never propagate it.
      if (r.errors || !r.data) {
        const beforeExecution = new Set(['GRAPHQL_PARSE_FAILED', 'GRAPHQL_VALIDATION_FAILED', 'UNAUTHENTICATED', 'FORBIDDEN']);
        const rejected = Array.isArray(r.errors) && r.errors.length > 0 &&
          r.errors.every((e) => beforeExecution.has(e?.extensions?.code));
        throw new RequestFailure('Railway GraphQL', rejected);
      }
      return r.data;
    },
    health: async (url) => request(url, { method: 'GET', headers: { accept: 'application/json' } }, 'Health'),
  };
}

async function checkHead(c, github) {
  const ref = await github(`/repos/${c.repository}/git/ref/heads/production`);
  if (ref?.object?.sha !== c.sourceSha) fail('Production HEAD changed; release must be revalidated');
}

async function validateRelease(c, github) {
  if (c.currentRunId !== c.buildRunId) fail('Image must be promoted by its own delivery run');
  const base = `/repos/${c.repository}`;
  const [commit, ci, delivery, jobs] = await Promise.all([
    github(`${base}/git/commits/${c.sourceSha}`), github(`${base}/actions/runs/${c.ciRunId}`),
    github(`${base}/actions/runs/${c.buildRunId}`),
    github(`${base}/actions/runs/${c.buildRunId}/jobs?filter=latest&per_page=100`),
  ]);
  if (commit?.sha !== c.sourceSha || commit.tree?.sha !== c.sourceTree) fail('Release Git tree mismatch');
  if (ci?.id !== c.ciRunId || !['push', 'workflow_dispatch'].includes(ci.event) || ci.head_branch !== 'production' ||
      ci.head_sha !== c.sourceSha || ci.repository?.id !== c.repositoryId ||
      ci.head_repository?.id !== c.repositoryId || ci.status !== 'completed' ||
      ci.conclusion !== 'success' || cleanPath(ci.path) !== '.github/workflows/ci.yml') fail('Release CI evidence is not valid');
  if (delivery?.id !== c.buildRunId || delivery.repository?.id !== c.repositoryId ||
      delivery.head_repository?.id !== c.repositoryId || !SHA.test(delivery.head_sha || '') ||
      delivery.event !== 'workflow_dispatch' ||
      cleanPath(delivery.path) !== '.github/workflows/api-image-promotion.yml' ||
      !['in_progress', 'completed'].includes(delivery.status)) fail('Untrusted delivery run');
  if (delivery.head_sha !== c.sourceSha || delivery.head_branch !== 'production') fail('Delivery must target production HEAD');
  if (!Array.isArray(jobs?.jobs) || jobs.total_count !== jobs.jobs.length) fail('Incomplete delivery jobs evidence');
  for (const name of ['Build immutable API image', ...(c.action === 'production' ? ['Deploy and verify staging'] : [])]) {
    const matches = jobs.jobs.filter((job) => job.name === name);
    if (matches.length !== 1 || matches[0].run_id !== c.buildRunId ||
        matches[0].status !== 'completed' || matches[0].conclusion !== 'success') fail('Required delivery job has not succeeded');
  }
  await checkHead(c, github);
}

function validateStagingEvidence(c, e, now) {
  if (e?.schemaVersion !== 1 || e.action !== 'staging' || e.success !== true ||
      e.projectId !== c.projectId || e.serviceId !== c.serviceId || e.environmentId !== c.stagingId ||
      e.sourceSha !== c.sourceSha || e.sourceTree !== c.sourceTree || e.ciRunId !== c.ciRunId ||
      e.buildRunId !== c.buildRunId || e.imageRef !== c.imageRef || e.imageDigest !== c.digest ||
      !UUID.test(e.deploymentId || '') || e.healthCheck?.ok !== true ||
      !Number.isFinite(Date.parse(e.verifiedAt)) || Date.parse(e.verifiedAt) > now ||
      now - Date.parse(e.verifiedAt) > 24 * 60 * 60 * 1000) fail('Staging evidence is missing, stale, or for another image');
}

function assertInstance(c, s) {
  if (!s || s.serviceId !== c.serviceId || s.environmentId !== c.environmentId) fail('Railway returned another service or environment');
}
function assertHealthDomain(c, s) {
  const domains = [...(s.domains?.serviceDomains || []), ...(s.domains?.customDomains || [])];
  if (!domains.some((item) => item.domain === new URL(c.healthUrl).hostname)) fail('Healthcheck URL is not a domain of the intended Railway service');
}
function observedDigest(d) {
  // DeploymentMeta is an opaque JSON scalar. Only this allowlisted field may
  // leave memory; never log or persist complete metadata/configuration.
  return typeof d?.meta?.imageDigest === 'string' ? d.meta.imageDigest : undefined;
}
function assertDeployment(c, d, deploymentId) {
  if (!d || d.id !== deploymentId || d.serviceId !== c.serviceId ||
      d.environmentId !== c.environmentId) fail('Railway returned another deployment');
}

function deploymentPatch(c, imageRef, includeCredentials = true) {
  const deploy = { ...RUNTIME, preDeployCommand: [...RUNTIME.preDeployCommand] };
  if (includeCredentials && c.pullToken) deploy.registryCredentials = { username: c.pullUser, password: c.pullToken };
  return { services: { [c.serviceId]: {
    source: { image: imageRef, repo: null, branch: null, commitSha: null, autoUpdates: { type: 'disabled' } },
    configFile: null, build: { buildCommand: null }, deploy,
  } } };
}

function previousSourcePatch(c, evidence) {
  const patch = deploymentPatch(c, evidence.previousImageRef, false);
  if (!evidence.previousImageRef) {
    const git = evidence.previousGitSource;
    if (!git || git.repo !== c.repository || git.branch !== 'production' ||
        !SHA.test(git.commitSha || '')) fail('The previous source cannot be safely restored');
    patch.services[c.serviceId].source = { ...git, image: null };
    patch.services[c.serviceId].configFile = '/railway.json';
  } else imageDigest(evidence.previousImageRef, c.imageRepository);
  return patch;
}

function sameActiveDeployments(a, b) {
  const state = (s) => (s.activeDeployments || []).map((d) =>
    `${d.id}:${d.status}:${d.deploymentStopped === true}`).sort();
  return JSON.stringify(state(a)) === JSON.stringify(state(b));
}

async function reconcileDeployFailure(c, before, evidence, error, clients, options) {
  const { clock, sleep, writeEvidence } = options;
  const definiteRejection = error instanceof RequestFailure && error.rejected;
  evidence.deployRequestOutcome = definiteRejection ? 'rejected' : 'ambiguous';
  const attempts = definiteRejection ? 1 : 6;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { serviceInstance: observed } = await clients.railway(INSTANCE_QUERY,
      { serviceId: c.serviceId, environmentId: c.environmentId });
    assertInstance(c, observed);
    if (observed.source?.image !== evidence.imageRef || observed.source?.repo) fail('Source changed during deployment reconciliation');
    const latest = observed.latestDeployment;
    if (latest) assertDeployment(c, latest, latest.id);
    if (latest?.id !== before.latestDeployment?.id && UUID.test(latest?.id || '') &&
        observedDigest(latest) === evidence.imageDigest) {
      assertDeployment(c, latest, latest.id);
      evidence.deploymentIdAdopted = true;
      return latest.id;
    }
    // A definite rejection plus the unchanged, still-running baseline proves
    // no deployment was created. Restore only configuration, never redeploy.
    // A transport timeout cannot provide that proof and must remain fail-closed.
    const baseline = before.latestDeployment;
    const oldRunning = baseline && observed.activeDeployments?.some((d) =>
      d.id === baseline.id && d.status === 'SUCCESS' && !d.deploymentStopped);
    if (definiteRejection && oldRunning && latest?.id === baseline.id &&
        latest.status === 'SUCCESS' && !latest.deploymentStopped &&
        observedDigest(latest) === evidence.previousImageDigest && sameActiveDeployments(before, observed)) {
      const patch = previousSourcePatch(c, evidence);
      const restored = await clients.railway(PATCH, { environmentId: c.environmentId, patch,
        message: 'Restore previous API source after a rejected deployment request' });
      if (!restored.environmentPatchCommit) fail('Previous source configuration could not be restored');
      const { serviceInstance: after } = await clients.railway(INSTANCE_QUERY,
        { serviceId: c.serviceId, environmentId: c.environmentId });
      assertInstance(c, after);
      const expected = patch.services[c.serviceId].source;
      if ((after.source?.image || null) !== (expected.image || null) ||
          (after.source?.repo || null) !== (expected.repo || null) ||
          after.latestDeployment?.id !== baseline.id || !sameActiveDeployments(before, after)) fail('Concurrent change prevented confirmation of the restored source');
      const health = await clients.health(c.healthUrl);
      if (health?.ok !== true || health.service !== 'rev-logistica-api') fail('Previous API health could not be confirmed');
      evidence.failurePhase = 'configured'; evidence.phase = 'config-restored'; evidence.success = false;
      evidence.configurationRestored = true; evidence.previousDeploymentStillRunning = true;
      evidence.restoredAt = new Date(clock()).toISOString();
      await writeEvidence(c.outputPath, evidence);
      fail('Deployment was rejected; the previous source configuration and running API were preserved');
    }
    if (attempt + 1 < attempts) await sleep(5_000);
  }
  fail('Deployment response was ambiguous; an operator must reconcile the configuration before retrying');
}

async function waitHealthy(c, deploymentId, expectedDigest, clients, options) {
  const { clock, sleep, timeoutMs } = options;
  const deadline = clock() + timeoutMs;
  while (clock() < deadline) {
    const { deployment: d } = await clients.railway(DEPLOYMENT_QUERY, { id: deploymentId });
    assertDeployment(c, d, deploymentId);
    if (['FAILED', 'CRASHED', 'REMOVED', 'SKIPPED'].includes(d.status) || d.deploymentStopped) fail('Deployment failed or was superseded');
    if (d.status === 'SUCCESS') {
      if (observedDigest(d) !== expectedDigest) fail('Running image digest does not match the verified image');
      const body = await clients.health(c.healthUrl);
      if (body?.ok !== true || body.service !== 'rev-logistica-api') fail('API health response is not valid');
      return d;
    }
    await sleep(5_000);
  }
  fail('Deployment health verification timed out');
}

async function promote(c, clients, { readEvidence, writeEvidence,
  clock = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), timeoutMs = 600_000 } = {}) {
  const start = new Date(clock()).toISOString();
  const identity = await clients.railway('query TokenScope { projectToken { projectId environmentId } }');
  if (identity.projectToken?.projectId !== c.projectId || identity.projectToken?.environmentId !== c.environmentId) fail('Railway token does not match the intended project and environment');
  if (c.action !== 'rollback') await validateRelease(c, clients.github);
  if (c.action === 'production') validateStagingEvidence(c, await readEvidence(c.stagingEvidencePath), clock());
  const { serviceInstance: before } = await clients.railway(INSTANCE_QUERY, { serviceId: c.serviceId, environmentId: c.environmentId });
  assertInstance(c, before);
  assertHealthDomain(c, before);
  const inFlight = before.latestDeployment;
  if (inFlight && !['SUCCESS', 'FAILED', 'CRASHED', 'REMOVED', 'SKIPPED'].includes(inFlight.status)) fail('Another deployment is in progress');

  const old = before.latestDeployment;
  if (old) {
    if (!UUID.test(old.id || '')) fail('Baseline deployment ID is invalid');
    assertDeployment(c, old, old.id);
  }
  if (c.action !== 'rollback' && old && old.status !== 'SUCCESS') fail('A successful baseline deployment is required before changing images');
  if (c.action === 'production' && before.source?.image) {
    if (imageDigest(before.source.image, c.imageRepository) !== observedDigest(old)) fail('Previous production image is not a verified immutable digest');
  }
  const previousGitSource = before.source?.repo === c.repository &&
    old?.meta?.branch === 'production' && SHA.test(old.meta.commitHash || '')
    ? { repo: c.repository, branch: 'production', commitSha: old.meta.commitHash } : null;
  const nativeRecoveryAvailable = previousGitSource && old.status === 'SUCCESS' &&
    DIGEST.test(observedDigest(old) || '') && (old.canRollback === true || old.canRedeploy === true);
  if (c.action === 'production' && !before.source?.image &&
      (!c.allowInitialGitSource || !nativeRecoveryAvailable)) fail('First image delivery requires explicit bootstrap authorization and a recoverable Git deployment');

  let target = c.imageRef;
  let nativeRollback = null;
  if (c.action === 'rollback') {
    const e = await readEvidence(c.rollbackEvidencePath);
    if (e?.schemaVersion !== 1 || e.projectId !== c.projectId || e.serviceId !== c.serviceId ||
        e.environmentId !== c.environmentId || e.imageRef !== c.imageRef ||
        !UUID.test(e.deploymentId || '') || before.latestDeployment?.id !== e.deploymentId ||
        before.source?.image !== e.imageRef || !UUID.test(e.previousDeploymentId || '')) fail('Rollback evidence does not match the current deployment');
    const { deployment: prior } = await clients.railway(DEPLOYMENT_QUERY, { id: e.previousDeploymentId });
    assertDeployment(c, prior, e.previousDeploymentId);
    if (e.previousImageRef) {
      const priorDigest = imageDigest(e.previousImageRef, c.imageRepository);
      if (observedDigest(prior) !== priorDigest) fail('Previous image digest is not confirmed by Railway');
      target = e.previousImageRef;
    } else {
      const git = e.previousGitSource;
      if (e.previousSourceKind !== 'git' || git?.repo !== c.repository || git.branch !== 'production' ||
          !SHA.test(git.commitSha || '') || prior.meta?.commitHash !== git.commitSha ||
          prior.meta?.branch !== git.branch || !DIGEST.test(e.previousImageDigest || '') ||
          observedDigest(prior) !== e.previousImageDigest ||
          !(prior.canRollback === true || prior.canRedeploy === true)) fail('Native Git rollback is not confirmed by Railway');
      nativeRollback = { id: prior.id, git, digest: e.previousImageDigest };
      target = null;
    }
  } else {
    await checkHead(c, clients.github);
  }
  const evidence = { schemaVersion: 1, action: c.action, success: false, startedAt: start,
    projectId: c.projectId, serviceId: c.serviceId, environmentId: c.environmentId,
    sourceSha: c.sourceSha, sourceTree: c.sourceTree, ciRunId: c.ciRunId, buildRunId: c.buildRunId,
    imageRef: target, imageDigest: nativeRollback ? nativeRollback.digest : imageDigest(target, c.imageRepository),
    previousImageRef: before.source?.image?.startsWith(`${c.imageRepository}@`) ? before.source.image : null,
    previousSourceKind: before.source?.image ? 'image' : before.source?.repo ? 'git' : 'none',
    previousDeploymentId: before.latestDeployment?.id || null, phase: 'preflight',
    previousImageDigest: observedDigest(old) || null, previousGitSource,
    rollbackKind: before.source?.image ? 'registry-digest' : nativeRecoveryAvailable ? 'railway-native' : 'operator-required',
  };
  await writeEvidence(c.outputPath, evidence);
  try {
    const patch = deploymentPatch(c, target, c.action !== 'rollback');
    if (nativeRollback) {
      patch.services[c.serviceId].source = { ...nativeRollback.git, image: null };
      patch.services[c.serviceId].configFile = '/railway.json';
    }
    const committed = await clients.railway(PATCH, { environmentId: c.environmentId, patch,
      message: `API image ${c.action}: ${c.sourceSha} ${evidence.imageDigest}` });
    if (!committed.environmentPatchCommit) fail('Railway did not confirm the image configuration');
    evidence.phase = 'configured'; await writeEvidence(c.outputPath, evidence);
    if (nativeRollback) {
      const rolledBack = await clients.railway(NATIVE_ROLLBACK, { id: nativeRollback.id });
      if (rolledBack.deploymentRollback !== true) fail('Railway did not confirm the native rollback');
      const deadline = clock() + timeoutMs;
      while (!evidence.deploymentId && clock() < deadline) {
        const { serviceInstance: s } = await clients.railway(INSTANCE_QUERY, { serviceId: c.serviceId, environmentId: c.environmentId });
        assertInstance(c, s);
        if (s.latestDeployment?.id !== before.latestDeployment.id && UUID.test(s.latestDeployment?.id || '')) evidence.deploymentId = s.latestDeployment.id;
        else await sleep(5_000);
      }
      if (!evidence.deploymentId) fail('Native rollback did not create a recoverable deployment');
    } else {
      try {
        const deployed = await clients.railway(DEPLOY, { environmentId: c.environmentId, serviceId: c.serviceId });
        if (!UUID.test(deployed.serviceInstanceDeployV2 || '')) throw new RequestFailure('Railway deployment');
        evidence.deploymentId = deployed.serviceInstanceDeployV2;
      } catch (error) {
        evidence.deploymentId = await reconcileDeployFailure(c, before, evidence, error, clients,
          { clock, sleep, writeEvidence });
      }
    }
    evidence.phase = 'deploying';
    await writeEvidence(c.outputPath, evidence);
    await waitHealthy(c, evidence.deploymentId, evidence.imageDigest, clients, { clock, sleep, timeoutMs });
    const { serviceInstance: after } = await clients.railway(INSTANCE_QUERY, { serviceId: c.serviceId, environmentId: c.environmentId });
    assertInstance(c, after);
    if ((nativeRollback ? after.source?.repo !== c.repository || after.source?.image :
        after.source?.image !== target || after.source?.repo) ||
        after.latestDeployment?.id !== evidence.deploymentId) fail('Deployment was superseded by a concurrent configuration change');
    evidence.success = true; evidence.phase = 'healthy'; evidence.healthCheck = { ok: true };
    evidence.verifiedAt = new Date(clock()).toISOString();
    await writeEvidence(c.outputPath, evidence);
    return evidence;
  } catch {
    evidence.success = false; evidence.failurePhase ||= evidence.phase;
    if (evidence.phase !== 'config-restored') evidence.phase = 'failed';
    await writeEvidence(c.outputPath, evidence);
    fail('Image promotion failed. Inspect deployment status and sanitized evidence before retrying or rolling back.');
  }
}

async function main(env = process.env, action = process.argv[2]) {
  const config = configFromEnv(env, action);
  const evidence = await promote(config, createClients(env), {
    readEvidence: async (file) => JSON.parse(fs.readFileSync(file, 'utf8')),
    writeEvidence: async (file, data) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    },
  });
  process.stdout.write(`API ${action} verified: ${evidence.deploymentId} ${evidence.imageDigest}\n`);
}
if (require.main === module) main().catch(() => {
  // No raw request/response/errors: provider errors may contain credentials.
  process.stderr.write('API image promotion did not complete; check deployment status and sanitized evidence.\n');
  process.exitCode = 1;
});

module.exports = { configFromEnv, createClients, validateRelease, validateStagingEvidence,
  deploymentPatch, waitHealthy, promote, imageDigest, RUNTIME, RequestFailure };
