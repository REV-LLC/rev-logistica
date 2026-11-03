const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { IMAGE_REPOSITORY, RAILPACK_SHA256, FRONTEND, validateProof, privatePackage, ensurePrivatePackage, prepareArguments, buildArguments, verifyDigest, verifyPublishedImage } = require('./build-api-image.cjs');

test('binds the unique build tag to reviewed source and current workflow run', () => {
  const proof = { repository: 'REV-LLC/rev-logistica', sourceSha: 'a'.repeat(40), sourceTree: 'b'.repeat(40), sourceBuildRunId: '123' };
  assert.equal(validateProof(proof, { GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2' }), `${IMAGE_REPOSITORY}:sha-${'a'.repeat(40)}-123-2`);
  assert.throws(() => validateProof(proof, { GITHUB_RUN_ID: '124', GITHUB_RUN_ATTEMPT: '2' }));
  assert.throws(() => validateProof({ ...proof, sourceSha: 'production' }, { GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2' }));
});

test('rejects public, internal, unlinked or foreign GHCR packages before uploading application code', () => {
  privatePackage({ visibility: 'private', repository: { id: 42 } }, '42');
  for (const visibility of ['public', 'internal', undefined]) assert.throws(() => privatePackage({ visibility, repository: { id: 42 } }, '42'));
  assert.throws(() => privatePackage({ visibility: 'private', repository: { id: 7 } }, '42'));
  assert.throws(() => privatePackage({ visibility: 'private' }, '42'));
});

test('first package bootstrap uploads only a synthetic empty image, then requires private metadata', async (t) => {
  const workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'api-package-test-'));
  t.after(() => fs.rmSync(workDirectory, { recursive: true, force: true }));
  const calls = [];
  let request = 0;
  await ensurePrivatePackage({ workDirectory, repositoryId: '42', sleep: async () => {}, github: async () => ++request === 1 ? null : { visibility: 'private', repository: { id: 42 } }, run: (binary, args) => calls.push([binary, ...args]) });
  assert.equal(calls.length, 2);
  assert(calls.every((args) => args.includes(`${IMAGE_REPOSITORY}:bootstrap-private`)));
  const dockerfile = fs.readFileSync(path.join(workDirectory, 'bootstrap/Dockerfile'), 'utf8');
  assert(dockerfile.startsWith('FROM scratch\n'));
  assert(!/\b(?:COPY|ADD|RUN)\b/.test(dockerfile));
});

test('an existing public package is rejected without building or uploading anything', async () => {
  const calls = [];
  await assert.rejects(ensurePrivatePackage({ repositoryId: '42', github: async () => ({ visibility: 'public', repository: { id: 42 } }), run: (...args) => calls.push(args) }));
  assert.deepEqual(calls, []);
});

test('403 or metadata lookup failures never authorize publication', async () => {
  const calls = [];
  await assert.rejects(ensurePrivatePackage({ repositoryId: '42', github: async () => { throw new Error('403'); }, run: (...args) => calls.push(args) }));
  assert.deepEqual(calls, []);
});

test('bootstrap followed by public or unavailable metadata fails closed before any app image', async (t) => {
  for (const response of [null, { visibility: 'public', repository: { id: 42 } }]) {
    const workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'api-package-test-'));
    t.after(() => fs.rmSync(workDirectory, { recursive: true, force: true }));
    const calls = [];
    let request = 0;
    await assert.rejects(ensurePrivatePackage({ workDirectory, repositoryId: '42', sleep: async () => {}, github: async () => ++request === 1 ? null : response, run: (binary, args) => calls.push([binary, ...args]) }));
    assert.equal(calls.length, 2);
    assert(calls.every((args) => args.includes(`${IMAGE_REPOSITORY}:bootstrap-private`)));
  }
});

test('uses the exact official archive checksum and immutable matching frontend', () => {
  assert.equal(RAILPACK_SHA256, '248a8f60f36854aabed6124113631078a802de3461660855fc4de9c26065c1fb');
  assert.equal(FRONTEND, 'ghcr.io/railwayapp/railpack-frontend@sha256:355ef61fae6f2551103cd8b10c710cb07167dd353d561f15c69b8d7ac1c676cc');
});

test('plans the API with synthetic build configuration and no deployment secrets', () => {
  const args = prepareArguments('/repo', '/tmp/work');
  assert(args.includes('RAILPACK_NODE_VERSION=22.23.4'));
  assert(args.includes('DATABASE_URL=postgresql://build:build@127.0.0.1:1/build'));
  assert(args.includes('npm --workspace apps/api exec prisma generate && npm --workspace apps/api run build'));
  assert(!args.some((arg) => /GH_TOKEN|RAILWAY_TOKEN|SMTP|WHATSAPP|JWT_SECRET/.test(arg)));
});

test('builds exactly once for amd64, loads for smoke testing and does not push before validation', () => {
  const args = buildArguments('/repo', '/tmp/work', `${IMAGE_REPOSITORY}:test`);
  assert.deepEqual(args.slice(0, 4), ['buildx', 'build', '--platform', 'linux/amd64']);
  assert(args.includes('--load'));
  assert(!args.includes('--push'));
  assert(args.includes(`BUILDKIT_SYNTAX=${FRONTEND}`));
  assert(args.includes('id=DATABASE_URL,env=DATABASE_URL'));
  assert(!args.some((arg) => /GH_TOKEN|RAILWAY_TOKEN|ghp_|github_pat_/.test(arg)));
});

test('accepts only immutable digests in the fixed private package', () => {
  assert.equal(verifyDigest(`sha256:${'c'.repeat(64)}`), `${IMAGE_REPOSITORY}@sha256:${'c'.repeat(64)}`);
  for (const ref of ['latest', `${IMAGE_REPOSITORY}:latest`, 'sha256:short', 'sha256:' + 'X'.repeat(64)]) assert.throws(() => verifyDigest(ref));
});

test('registry digest must resolve to the exact local image that passed the runtime smoke', () => {
  const digest = `sha256:${'d'.repeat(64)}`;
  const localImage = { Id: `sha256:${'e'.repeat(64)}` };
  assert.equal(verifyPublishedImage({ digest }, { config: { digest: localImage.Id } }, localImage), `${IMAGE_REPOSITORY}@${digest}`);
  assert.throws(() => verifyPublishedImage({ digest }, { config: { digest } }, localImage));
  assert.throws(() => verifyPublishedImage({ digest }, {}, localImage));
});
