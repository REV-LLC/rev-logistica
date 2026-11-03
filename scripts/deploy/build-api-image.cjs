const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const REPOSITORY = 'REV-LLC/rev-logistica';
const IMAGE_REPOSITORY = 'ghcr.io/rev-llc/rev-logistica-api';
const PACKAGE_ROUTE = '/orgs/REV-LLC/packages/container/rev-logistica-api';
const RAILPACK_VERSION = '0.43.0';
// Official release asset + checksums.txt, verified against GitHub's asset digest:
// https://github.com/railwayapp/railpack/releases/tag/v0.43.0
const RAILPACK_SHA256 = '248a8f60f36854aabed6124113631078a802de3461660855fc4de9c26065c1fb';
const FRONTEND = 'ghcr.io/railwayapp/railpack-frontend@sha256:355ef61fae6f2551103cd8b10c710cb07167dd353d561f15c69b8d7ac1c676cc';
const BUILD_DATABASE_URL = 'postgresql://build:build@127.0.0.1:1/build';

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
  return ['prepare', directory, '--plan-out', path.join(workDirectory, 'railpack-plan.json'), '--info-out', path.join(workDirectory, 'railpack-info.json'), '--build-cmd', 'npm --workspace apps/api exec prisma generate && npm --workspace apps/api run build', '--start-cmd', 'npm --workspace apps/api run start:prod', '--env', 'RAILPACK_NODE_VERSION=22.23.4', '--env', `DATABASE_URL=${BUILD_DATABASE_URL}`, '--error-missing-start'];
}

function buildArguments(directory, workDirectory, imageTag) {
  const secretHash = crypto.createHash('sha256').update(`DATABASE_URL=${BUILD_DATABASE_URL}`).digest('hex');
  return ['buildx', 'build', '--platform', 'linux/amd64', '--build-arg', `BUILDKIT_SYNTAX=${FRONTEND}`, '--build-arg', `secrets-hash=${secretHash}`, '--build-arg', 'cache-key=rev-logistica-api', '--secret', 'id=DATABASE_URL,env=DATABASE_URL', '--cache-from', `type=registry,ref=${IMAGE_REPOSITORY}:buildcache`, '--cache-to', 'type=inline', '--provenance=false', '--load', '--tag', imageTag, '--metadata-file', path.join(workDirectory, 'build-metadata.json'), '--file', path.join(workDirectory, 'railpack-plan.json'), directory];
}

function verifyDigest(value) {
  assert(/^sha256:[0-9a-f]{64}$/.test(value), 'Registry did not return an immutable digest');
  return `${IMAGE_REPOSITORY}@${value}`;
}

function verifyPublishedImage(registry, manifest, localImage) {
  const imageRef = verifyDigest(registry.digest);
  assert.equal(manifest.config?.digest, localImage.Id, 'Registry tag differs from the locally smoke-tested image');
  return imageRef;
}

function exportReleaseContext(repositoryDirectory, workDirectory, sourceSha) {
  assert(/^[0-9a-f]{40}$/.test(sourceSha), 'A complete release commit is required');
  const context = path.join(workDirectory, 'context');
  fs.mkdirSync(context);
  const archive = path.join(workDirectory, 'source.tar');
  // Archive Git objects directly to a descriptor: no shell pipeline, output
  // buffering limit, checkout metadata, untracked .env, caches or runner logs.
  const output = fs.openSync(archive, 'wx', 0o600);
  try {
    execFileSync('git', ['archive', '--format=tar', sourceSha], { cwd: repositoryDirectory, stdio: ['ignore', output, 'inherit'] });
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
  const buildEnvironment = { PATH: environment.PATH, HOME: environment.HOME, DOCKER_CONFIG: environment.DOCKER_CONFIG, DATABASE_URL: BUILD_DATABASE_URL };
  const run = (binary, args, options = {}) => execFileSync(binary, args, { stdio: 'inherit', env: buildEnvironment, ...options });
  const github = async (route) => {
    const response = await fetch(`https://api.github.com${route}`, {
      redirect: 'error',
      headers: { authorization: `Bearer ${environment.GH_TOKEN}`, accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 404) return null;
    assert(response.ok, `Package visibility could not be checked (${response.status}); refusing to publish`);
    return response.json();
  };
  await ensurePrivatePackage({ github, run, workDirectory, repositoryId: environment.GITHUB_REPOSITORY_ID });

  const archive = path.join(workDirectory, 'railpack.tar.gz');
  run('curl', ['--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--tlsv1.2', `https://github.com/railwayapp/railpack/releases/download/v${RAILPACK_VERSION}/railpack-v${RAILPACK_VERSION}-x86_64-unknown-linux-musl.tar.gz`, '--output', archive]);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), RAILPACK_SHA256, 'Official Railpack checksum mismatch');
  run('tar', ['-xzf', archive, '-C', path.join(workDirectory, 'bin'), 'railpack']);
  const railpack = path.join(workDirectory, 'bin/railpack');
  const buildStartedAt = new Date().toISOString();
  run(railpack, prepareArguments(directory, workDirectory));
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
  // Mutable tag is only a build cache; staging and production never consume it.
  run('docker', ['tag', imageTag, `${IMAGE_REPOSITORY}:buildcache`]);
  run('docker', ['push', `${IMAGE_REPOSITORY}:buildcache`]);
  const evidence = { ...proof, imageRef, imageRepository: IMAGE_REPOSITORY, imageTag, platform: 'linux/amd64', railpackVersion: RAILPACK_VERSION, frontend: FRONTEND, railpackArchiveSha256: RAILPACK_SHA256, buildStartedAt, publishedAt: new Date().toISOString(), runtimeSmoke: 'passed', packageVisibility: 'private', localImageBytes: imageDetails.Size };
  fs.writeFileSync(environment.BUILD_EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  if (environment.GITHUB_OUTPUT) fs.appendFileSync(environment.GITHUB_OUTPUT, `image-ref=${imageRef}\nimage-repository=${IMAGE_REPOSITORY}\n`);
  if (environment.GITHUB_STEP_SUMMARY) fs.appendFileSync(environment.GITHUB_STEP_SUMMARY, `### Immutable API image\n\n- Source: \`${proof.sourceSha}\`\n- Tree: \`${proof.sourceTree}\`\n- CI run: ${proof.sourceCiRunId}\n- Image: \`${imageRef}\`\n- Platform: linux/amd64\n- Private package and runtime smoke: verified\n- Build started: ${buildStartedAt}\n- Published: ${evidence.publishedAt}\n`);
  console.log(`Published private immutable image ${imageRef}`);
}

module.exports = { IMAGE_REPOSITORY, RAILPACK_SHA256, FRONTEND, validateProof, privatePackage, ensurePrivatePackage, prepareArguments, buildArguments, verifyDigest, verifyPublishedImage, exportReleaseContext };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
