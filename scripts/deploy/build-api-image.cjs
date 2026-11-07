const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const REPOSITORY = 'REV-LLC/rev-logistica';
const IMAGE_REPOSITORY = 'ghcr.io/rev-llc/rev-logistica-api';
const CACHE_REF = `${IMAGE_REPOSITORY}:buildcache-v2`;
const PACKAGE_ROUTE = '/orgs/REV-LLC/packages/container/rev-logistica-api';
const RAILPACK_VERSION = '0.43.0';
// Official release asset + checksums.txt, verified against GitHub's asset digest:
// https://github.com/railwayapp/railpack/releases/tag/v0.43.0
const RAILPACK_SHA256 = '248a8f60f36854aabed6124113631078a802de3461660855fc4de9c26065c1fb';
const FRONTEND = 'ghcr.io/railwayapp/railpack-frontend@sha256:355ef61fae6f2551103cd8b10c710cb07167dd353d561f15c69b8d7ac1c676cc';
const BUILD_VALUES = Object.freeze({
  DATABASE_URL: 'postgresql://build:build@127.0.0.1:1/build',
  RAILPACK_NODE_VERSION: '22.23.4',
});
const API_CONTEXT_PATHS = Object.freeze([
  'package.json',
  'package-lock.json',
  '.npmrc',
  'railpack.json',
  'railway.json',
  'apps/api',
  'apps/web/package.json',
  'scripts/check-api-runtime.cjs',
]);

function validateProof(proof, environment) {
  assert.equal(proof.repository, REPOSITORY);
  assert(/^[0-9a-f]{40}$/.test(proof.sourceSha));
  assert(/^[0-9a-f]{40}$/.test(proof.sourceTree));
  assert.equal(proof.sourceBuildRunId, environment.GITHUB_RUN_ID);
  assert(/^[1-9][0-9]*$/.test(proof.sourceBuildRunId));
  assert(/^[1-9][0-9]*$/.test(environment.GITHUB_RUN_ATTEMPT || ''));
  return `${IMAGE_REPOSITORY}:sha-${proof.sourceSha}-${proof.sourceBuildRunId}-${environment.GITHUB_RUN_ATTEMPT}`;
}

function privatePackage(metadata, repositoryId) {
  assert.equal(metadata.visibility, 'private', 'The GHCR package must be private; application code was not pushed');
  assert.equal(String(metadata.repository?.id), String(repositoryId), 'The package must be connected to the expected repository');
}

async function readPackageMetadata(token, { fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetchImpl(`https://api.github.com${PACKAGE_ROUTE}`, {
        redirect: 'error',
        // Blocking Docker commands can outlive an idle pooled connection.
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', connection: 'close' },
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      // Do not expose raw transport errors or request headers.
    }
    if (response?.status === 404) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    if (response && !(response.status >= 500 && response.status <= 599)) {
      assert(response.ok, `Package visibility could not be checked (${response.status}); refusing to publish`);
      try {
        return await response.json();
      } catch (error) {
        // An interrupted or unreadable response cannot authorize publication.
        if (error instanceof SyntaxError) throw new Error('Package metadata response is unreadable; refusing to publish');
      }
    } else {
      await response?.body?.cancel().catch(() => {});
    }
    if (attempt < 2) await sleep(250 * (attempt + 1));
  }
  throw new Error('Package visibility could not be checked after 3 attempts; refusing to publish');
}

async function ensurePrivatePackage({ github, run, workDirectory, repositoryId, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  let metadata = await github(PACKAGE_ROUTE);
  if (!metadata) {
    // Bootstrap only an empty scratch image. Even if a hidden existing package
    // is public, no application source or dependency is uploaded by this step.
    const bootstrap = path.join(workDirectory, 'bootstrap');
    fs.mkdirSync(bootstrap);
    fs.writeFileSync(path.join(bootstrap, 'Dockerfile'), `FROM scratch\nLABEL org.opencontainers.image.source="https://github.com/${REPOSITORY}"\nLABEL description="Empty private-package bootstrap; no application files"\n`);
    run('docker', ['build', '--platform', 'linux/amd64', '--tag', `${IMAGE_REPOSITORY}:bootstrap-private`, bootstrap]);
    run('docker', ['push', `${IMAGE_REPOSITORY}:bootstrap-private`]);
    for (let attempt = 0; attempt < 10 && !metadata; attempt++) {
      await sleep(2000);
      metadata = await github(PACKAGE_ROUTE);
    }
    assert(metadata, 'Private package metadata is unavailable after bootstrap; application code was not pushed');
  }
  privatePackage(metadata, repositoryId);
}

function prepareArguments(directory, workDirectory) {
  const values = Object.entries(BUILD_VALUES).flatMap(([name, value]) => ['--env', `${name}=${value}`]);
  return ['prepare', directory, '--plan-out', path.join(workDirectory, 'railpack-plan.json'), '--info-out', path.join(workDirectory, 'railpack-info.json'), '--build-cmd', 'npm --workspace apps/api exec prisma generate && npm --workspace apps/api run build', '--start-cmd', 'npm --workspace apps/api run start:prod', ...values, '--error-missing-start'];
}

function buildArguments(directory, workDirectory, imageTag) {
  const secretHash = crypto.createHash('sha256').update(Object.entries(BUILD_VALUES).map(([name, value]) => `${name}=${value}`).join('\n')).digest('hex');
  const secrets = Object.keys(BUILD_VALUES).flatMap((name) => ['--secret', `id=${name},env=${name}`]);
  return ['buildx', 'build', '--platform', 'linux/amd64', '--build-arg', `BUILDKIT_SYNTAX=${FRONTEND}`, '--build-arg', `secrets-hash=${secretHash}`, '--build-arg', 'cache-key=rev-logistica-api', ...secrets, '--cache-from', `type=registry,ref=${CACHE_REF}`, '--cache-from', `type=registry,ref=${IMAGE_REPOSITORY}:buildcache`, '--cache-to', `type=registry,ref=${CACHE_REF},mode=max`, '--provenance=false', '--load', '--tag', imageTag, '--metadata-file', path.join(workDirectory, 'build-metadata.json'), '--file', path.join(workDirectory, 'railpack-plan.json'), directory];
}

function createBuildEnvironment(environment) {
  return { PATH: environment.PATH, HOME: environment.HOME, DOCKER_CONFIG: environment.DOCKER_CONFIG, ...BUILD_VALUES };
}

function validatePlanSecrets(plan) {
  assert(Array.isArray(plan.secrets), 'Railpack plan must declare its build secrets');
  for (const name of plan.secrets) {
    assert(typeof name === 'string' && Object.hasOwn(BUILD_VALUES, name), `Railpack requested an unsupported build secret: ${name}`);
  }
}

function verifyDigest(value) {
  assert(/^sha256:[0-9a-f]{64}$/.test(value), 'Registry did not return an immutable digest');
  return `${IMAGE_REPOSITORY}@${value}`;
}

function verifyPublishedImage(registry, manifest, localImage) {
  const imageRef = verifyDigest(registry.digest);
  const configDigest = manifest.config?.digest;
  assert.match(configDigest, /^sha256:[0-9a-f]{64}$/, 'Published image has no valid config digest');
  // The raw manifest was fetched by immutable digest. Both identities below
  // therefore belong to that same registry image. Docker's classic store uses
  // its config ID while containerd can expose the manifest ID.
  assert.ok(localImage.Id === configDigest || localImage.Id === registry.digest,
    'Registry image differs from the locally smoke-tested image');
  return imageRef;
}

function exportReleaseContext(repositoryDirectory, workDirectory, sourceSha) {
  assert(/^[0-9a-f]{40}$/.test(sourceSha), 'A complete release commit is required');
  const tracked = execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', sourceSha, '--', ...API_CONTEXT_PATHS], { cwd: repositoryDirectory, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).split('\0').filter(Boolean);
  const files = tracked.filter((file) => !file.split('/').some((part) => part === '.env' || part.startsWith('.env.')));
  assert(files.length > 0, 'The reviewed tree has no API build context');
  const context = path.join(workDirectory, 'context');
  fs.mkdirSync(context);
  const archive = path.join(workDirectory, 'source.tar');
  // Archive Git objects directly to a descriptor: no shell pipeline, output
  // buffering limit, checkout metadata, untracked .env, caches or runner logs.
  const output = fs.openSync(archive, 'wx', 0o600);
  try {
    execFileSync('git', ['archive', '--format=tar', sourceSha, '--', ...files.map((file) => `:(literal)${file}`)], { cwd: repositoryDirectory, stdio: ['ignore', output, 'inherit'] });
  } finally {
    fs.closeSync(output);
  }
  const input = fs.openSync(archive, 'r');
  try {
    execFileSync('tar', ['-xf', '-', '-C', context], { stdio: [input, 'inherit', 'inherit'] });
  } finally {
    fs.closeSync(input);
    fs.unlinkSync(archive);
  }
  assert(!fs.existsSync(path.join(context, '.git')), 'Git metadata cannot enter the image context');
  return context;
}

async function main() {
  const environment = process.env;
  assert.equal(process.platform, 'linux', 'Build only on the Linux runner');
  assert.equal(process.arch, 'x64', 'Build only on the amd64 runner');
  assert(environment.GH_TOKEN, 'Missing package verification token');
  const proof = JSON.parse(fs.readFileSync(environment.SOURCE_EVIDENCE_PATH, 'utf8'));
  const imageTag = validateProof(proof, environment);
  const repositoryDirectory = fs.realpathSync(process.cwd());
  const workDirectory = fs.mkdtempSync(path.join(environment.RUNNER_TEMP, 'api-image-build-'));
  const directory = exportReleaseContext(repositoryDirectory, workDirectory, proof.sourceSha);
  fs.mkdirSync(path.join(workDirectory, 'bin'));
  // Build children receive no GitHub/Railway tokens or deployment configuration.
  const buildEnvironment = createBuildEnvironment(environment);
  const run = (binary, args, options = {}) => execFileSync(binary, args, { stdio: 'inherit', env: buildEnvironment, ...options });
  const github = () => readPackageMetadata(environment.GH_TOKEN);
  await ensurePrivatePackage({ github, run, workDirectory, repositoryId: environment.GITHUB_REPOSITORY_ID });

  const archive = path.join(workDirectory, 'railpack.tar.gz');
  run('curl', ['--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--tlsv1.2', `https://github.com/railwayapp/railpack/releases/download/v${RAILPACK_VERSION}/railpack-v${RAILPACK_VERSION}-x86_64-unknown-linux-musl.tar.gz`, '--output', archive]);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), RAILPACK_SHA256, 'Official Railpack checksum mismatch');
  run('tar', ['-xzf', archive, '-C', path.join(workDirectory, 'bin'), 'railpack']);
  const railpack = path.join(workDirectory, 'bin/railpack');
  const buildStartedAt = new Date().toISOString();
  run(railpack, prepareArguments(directory, workDirectory));
  validatePlanSecrets(JSON.parse(fs.readFileSync(path.join(workDirectory, 'railpack-plan.json'), 'utf8')));
  run('docker', buildArguments(directory, workDirectory, imageTag));
  const imageDetails = JSON.parse(execFileSync('docker', ['image', 'inspect', imageTag], { encoding: 'utf8', env: buildEnvironment }))[0];
  assert.equal(imageDetails.Os, 'linux');
  assert.equal(imageDetails.Architecture, 'amd64');
  assert(!directory.includes(':'), 'Unsupported workspace path');
  run('docker', ['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', '--entrypoint', 'node', '--mount', `type=bind,source=${path.join(directory, 'scripts/check-api-runtime.cjs')},target=/app/scripts/check-api-runtime.cjs,readonly`, imageTag, '/app/scripts/check-api-runtime.cjs']);
  // Re-check visibility immediately before the first application upload.
  privatePackage(await github(PACKAGE_ROUTE), environment.GITHUB_REPOSITORY_ID);
  run('docker', ['push', imageTag]);
  const registry = JSON.parse(execFileSync('docker', ['buildx', 'imagetools', 'inspect', imageTag, '--format', '{{json .Manifest}}'], { encoding: 'utf8', env: buildEnvironment }));
  const imageRef = verifyDigest(registry.digest);
  const manifest = JSON.parse(execFileSync('docker', ['buildx', 'imagetools', 'inspect', imageRef, '--raw'], { encoding: 'utf8', env: buildEnvironment }));
  verifyPublishedImage(registry, manifest, imageDetails);
  // BuildKit exported the separate max-mode cache; never replace it with the
  // final runtime image, which omits the intermediate install/build layers.
  const evidence = { ...proof, imageRef, imageRepository: IMAGE_REPOSITORY, imageTag, platform: 'linux/amd64', railpackVersion: RAILPACK_VERSION, frontend: FRONTEND, railpackArchiveSha256: RAILPACK_SHA256, buildStartedAt, publishedAt: new Date().toISOString(), runtimeSmoke: 'passed', packageVisibility: 'private', localImageBytes: imageDetails.Size };
  fs.writeFileSync(environment.BUILD_EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  if (environment.GITHUB_OUTPUT) fs.appendFileSync(environment.GITHUB_OUTPUT, `image-ref=${imageRef}\nimage-repository=${IMAGE_REPOSITORY}\n`);
  if (environment.GITHUB_STEP_SUMMARY) fs.appendFileSync(environment.GITHUB_STEP_SUMMARY, `### Immutable API image\n\n- Source: \`${proof.sourceSha}\`\n- Tree: \`${proof.sourceTree}\`\n- CI run: ${proof.sourceCiRunId}\n- Image: \`${imageRef}\`\n- Platform: linux/amd64\n- Private package and runtime smoke: verified\n- Build started: ${buildStartedAt}\n- Published: ${evidence.publishedAt}\n`);
  console.log(`Published private immutable image ${imageRef}`);
}

module.exports = { IMAGE_REPOSITORY, CACHE_REF, RAILPACK_SHA256, FRONTEND, BUILD_VALUES, API_CONTEXT_PATHS, validateProof, privatePackage, readPackageMetadata, ensurePrivatePackage, prepareArguments, buildArguments, createBuildEnvironment, validatePlanSecrets, verifyDigest, verifyPublishedImage, exportReleaseContext };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
