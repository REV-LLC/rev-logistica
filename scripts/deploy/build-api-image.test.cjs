const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { IMAGE_REPOSITORY, CACHE_REF, RAILPACK_SHA256, FRONTEND, BUILD_VALUES, validateProof, privatePackage, readPackageMetadata, ensurePrivatePackage, prepareArguments, buildArguments, createBuildEnvironment, validatePlanSecrets, verifyDigest, verifyPublishedImage, exportReleaseContext } = require('./build-api-image.cjs');

test('a reset metadata connection is retried with fresh connections before private-package validation', async () => {
  const requests = [];
  const sleeps = [];
  const metadata = { visibility: 'private', repository: { id: 42 } };
  const result = await readPackageMetadata('test-only-token', {
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (requests.length === 1) throw new TypeError('ECONNRESET with sensitive transport details');
      return new Response(JSON.stringify(metadata), { status: 200 });
    },
    sleep: async (ms) => sleeps.push(ms),
  });
  privatePackage(result, '42');
  assert.deepEqual(result, metadata);
  assert.equal(requests.length, 2);
  assert.deepEqual(sleeps, [250]);
  for (const { url, options } of requests) {
    assert.equal(url, 'https://api.github.com/orgs/REV-LLC/packages/container/rev-logistica-api');
    assert.equal(options.headers.connection, 'close');
    assert.equal(options.redirect, 'error');
    assert(options.signal instanceof AbortSignal);
  }
});

test('network exhaustion and repeated server failures fail closed within the retry budget without raw errors', async (t) => {
  const timeouts = [];
  t.mock.method(AbortSignal, 'timeout', (ms) => { timeouts.push(ms); return new AbortController().signal; });
  for (const fail of [async () => { throw new Error('test-only-token transport detail'); }, async () => new Response('server failure', { status: 503 })]) {
    let attempts = 0;
    const sleeps = [];
    await assert.rejects(readPackageMetadata('test-only-token', { fetchImpl: async () => { attempts++; return fail(); }, sleep: async (ms) => sleeps.push(ms) }), (error) => {
      assert.equal(error.message, 'Package visibility could not be checked after 3 attempts; refusing to publish');
      return true;
    });
    assert.equal(attempts, 3);
    assert.deepEqual(sleeps, [250, 500]);
  }
  assert.deepEqual(timeouts, Array(6).fill(6000));
  assert(3 * 6000 + 250 + 500 < 20_000);
});

test('authorization failures never retry and a missing package still returns null', async () => {
  for (const status of [401, 403, 404]) {
    let attempts = 0;
    const read = readPackageMetadata('test-only-token', { fetchImpl: async () => { attempts++; return new Response('', { status }); }, sleep: async () => assert.fail('Authorization and 404 must not retry') });
    if (status === 404) assert.equal(await read, null);
    else await assert.rejects(read, new RegExp(`\\(${status}\\); refusing to publish`));
    assert.equal(attempts, 1);
  }
});

test('retried metadata never bypasses the public-package publication guard', async () => {
  let attempts = 0;
  const metadata = await readPackageMetadata('test-only-token', { fetchImpl: async () => ++attempts === 1 ? new Response('', { status: 502 }) : new Response(JSON.stringify({ visibility: 'public', repository: { id: 42 } }), { status: 200 }), sleep: async () => {} });
  assert.throws(() => privatePackage(metadata, '42'), /must be private/);
  assert.equal(attempts, 2);
});

test('malformed metadata fails closed immediately without exposing response data', async () => {
  let attempts = 0;
  await assert.rejects(readPackageMetadata('test-only-token', { fetchImpl: async () => { attempts++; return new Response('test-only-token invalid JSON', { status: 200 }); }, sleep: async () => assert.fail('Malformed metadata must not retry') }), { message: 'Package metadata response is unreadable; refusing to publish' });
  assert.equal(attempts, 1);
});

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
  assert(args.includes('id=RAILPACK_NODE_VERSION,env=RAILPACK_NODE_VERSION'));
  assert(!args.some((arg) => /GH_TOKEN|RAILWAY_TOKEN|ghp_|github_pat_/.test(arg)));
});

test('exports intermediate build stages to a separate max-mode registry cache while retaining local image smoke', () => {
  const tag = `${IMAGE_REPOSITORY}:test`;
  const args = buildArguments('/repo', '/tmp/work', tag);
  assert.equal(CACHE_REF, `${IMAGE_REPOSITORY}:buildcache-v2`);
  assert(args.includes(`type=registry,ref=${CACHE_REF},mode=max`));
  assert(args.includes(`type=registry,ref=${CACHE_REF}`));
  assert(args.includes(`type=registry,ref=${IMAGE_REPOSITORY}:buildcache`));
  assert(!args.includes('type=inline'));
  assert(!args.includes('--push'));
  assert(args.includes('--load'));
  assert.notEqual(CACHE_REF, tag);
});

test('every plan binding is supplied consistently to prepare, Docker, its hash and the isolated child environment', () => {
  const prepare = prepareArguments('/repo', '/tmp/work');
  const build = buildArguments('/repo', '/tmp/work', `${IMAGE_REPOSITORY}:test`);
  const environment = createBuildEnvironment({ PATH: '/bin', HOME: '/runner', DOCKER_CONFIG: '/isolated', DATABASE_URL: 'must-not-use-real-database', RAILPACK_NODE_VERSION: 'wrong', GH_TOKEN: 'must-not-pass', RAILWAY_TOKEN: 'must-not-pass', JWT_SECRET: 'must-not-pass' });
  assert.deepEqual(environment, { PATH: '/bin', HOME: '/runner', DOCKER_CONFIG: '/isolated', ...BUILD_VALUES });
  const suppliedNames = [];
  for (let i = 0; i < build.length; i++) if (build[i] === '--secret') suppliedNames.push(build[i + 1]);
  assert.deepEqual(suppliedNames, Object.keys(BUILD_VALUES).map((name) => `id=${name},env=${name}`));
  for (const [name, value] of Object.entries(BUILD_VALUES)) assert(prepare.includes(`${name}=${value}`));
  const hash = crypto.createHash('sha256').update(Object.entries(BUILD_VALUES).map(([name, value]) => `${name}=${value}`).join('\n')).digest('hex');
  assert(build.includes(`secrets-hash=${hash}`));
  validatePlanSecrets({ secrets: Object.keys(BUILD_VALUES) });
});

test('unknown or malformed required plan secrets fail closed before Docker', () => {
  for (const secrets of [['DATABASE_URL', 'JWT_SECRET'], ['DATABASE_URL', '*'], ['__proto__'], [null], 'DATABASE_URL', undefined]) {
    assert.throws(() => validatePlanSecrets({ secrets }));
  }
});

test('actual Railpack prepares the scoped Git context with both supplied build bindings', { skip: !process.env.RAILPACK_TEST_BINARY }, (t) => {
  const workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'api-railpack-plan-test-'));
  t.after(() => fs.rmSync(workDirectory, { recursive: true, force: true }));
  const repository = path.resolve(__dirname, '../..');
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
  const context = exportReleaseContext(repository, workDirectory, sourceSha);
  assert(fs.existsSync(path.join(context, 'apps/web/package.json')));
  assert(!fs.existsSync(path.join(context, 'apps/web/src')));
  execFileSync(process.env.RAILPACK_TEST_BINARY, prepareArguments(context, workDirectory), { env: createBuildEnvironment(process.env), stdio: ['ignore', 'pipe', 'pipe'] });
  const plan = JSON.parse(fs.readFileSync(path.join(workDirectory, 'railpack-plan.json'), 'utf8'));
  validatePlanSecrets(plan);
  assert.deepEqual([...plan.secrets].sort(), Object.keys(BUILD_VALUES).sort());
  const args = buildArguments(context, workDirectory, `${IMAGE_REPOSITORY}:test`);
  const environment = createBuildEnvironment(process.env);
  for (const name of plan.secrets) {
    assert(args.includes(`id=${name},env=${name}`));
    assert.equal(environment[name], BUILD_VALUES[name]);
  }
});

test('accepts only immutable digests in the fixed private package', () => {
  assert.equal(verifyDigest(`sha256:${'c'.repeat(64)}`), `${IMAGE_REPOSITORY}@sha256:${'c'.repeat(64)}`);
  for (const ref of ['latest', `${IMAGE_REPOSITORY}:latest`, 'sha256:short', 'sha256:' + 'X'.repeat(64)]) assert.throws(() => verifyDigest(ref));
});

test('smoke-tested local image ID must match the immutable registry config or manifest', () => {
  const digest = 'sha256:9bf38f97e3f75a0a6a7aae36c7768a65bb94f7e173f56daa204c5fa5cbd750ad';
  const config = 'sha256:5ceaed789e42659aa32f4bc37caf2288b5ab6c4d5b39f92cd4794f19094d542b';
  const other = `sha256:${'a'.repeat(64)}`;
  const manifest = {config:{digest:config}};
  for (const Id of [config, digest]) {
    assert.equal(verifyPublishedImage({digest}, manifest, {Id}), `${IMAGE_REPOSITORY}@${digest}`);
    assert.throws(() => verifyPublishedImage({digest}, {}, {Id}));
    assert.throws(() => verifyPublishedImage({digest}, {config:{digest:'invalid'}}, {Id}));
  }
  assert.throws(() => verifyPublishedImage({digest}, {config:{digest:other}}, {Id:config}));
  assert.throws(() => verifyPublishedImage({digest:other}, manifest, {Id:digest}));
  assert.throws(() => verifyPublishedImage({digest}, manifest, {Id:other}));
});

test('release context contains only reviewed API build inputs, excluding frontend, docs, CD and tracked or untracked env files', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'api-source-context-test-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const repository = path.join(temporary, 'repository');
  fs.mkdirSync(repository);
  const git = (args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init', '-q']);
  fs.mkdirSync(path.join(repository, 'scripts'));
  fs.writeFileSync(path.join(repository, 'package.json'), '{"name":"reviewed-source"}\n');
  fs.writeFileSync(path.join(repository, 'scripts/check-api-runtime.cjs'), 'console.log("reviewed checker")\n');
  const reviewed = {
    'package-lock.json': '{"lockfileVersion":3}\n',
    '.npmrc': 'fund=false\n',
    'railpack.json': '{"steps":{}}\n',
    'railway.json': '{"deploy":{}}\n',
    'apps/api/package.json': '{"name":"api"}\n',
    'apps/api/src/main.ts': 'console.log("reviewed API")\n',
    'apps/api/tsconfig.build.json': '{"extends":"./tsconfig.json"}\n',
    'apps/api/prisma/schema.prisma': '// reviewed schema\n',
    'apps/api/prisma/migrations/1_init/migration.sql': '-- reviewed migration\n',
    'apps/api/assets/rev-logo.png': 'reviewed asset',
    'apps/web/package.json': '{"name":"web"}\n',
  };
  const excluded = {
    'apps/web/src/main.tsx': 'frontend-only\n',
    'docs/deployment.md': 'documentation-only\n',
    '.github/workflows/ci.yml': 'workflow-only\n',
    'scripts/deploy/runner.cjs': 'delivery-only\n',
    'apps/api/.env': 'TRACKED_SECRET=must-not-enter-build\n',
    'apps/api/.env.production': 'TRACKED_SECRET=must-not-enter-cache\n',
  };
  for (const [relative, contents] of Object.entries({ ...reviewed, ...excluded })) {
    fs.mkdirSync(path.dirname(path.join(repository, relative)), { recursive: true });
    fs.writeFileSync(path.join(repository, relative), contents);
  }
  git(['add', '.']);
  git(['-c', 'user.name=Runtime test', '-c', 'user.email=runtime@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'reviewed tree']);
  const sha = git(['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(repository, 'package.json'), '{"name":"modified-checkout"}\n');
  fs.writeFileSync(path.join(repository, 'apps/api/src/main.ts'), 'console.log("modified checkout")\n');
  fs.writeFileSync(path.join(repository, '.env'), 'UNTRACKED_SECRET=must-not-enter-build\n');
  fs.writeFileSync(path.join(repository, 'runner.log'), 'not source\n');
  fs.mkdirSync(path.join(repository, 'node_modules'));
  fs.writeFileSync(path.join(repository, 'node_modules/cache'), 'not source\n');
  const workDirectory = path.join(temporary, 'build');
  fs.mkdirSync(workDirectory);
  const context = exportReleaseContext(repository, workDirectory, sha);
  assert.equal(fs.readFileSync(path.join(context, 'package.json'), 'utf8'), '{"name":"reviewed-source"}\n');
  assert.equal(fs.readFileSync(path.join(context, 'scripts/check-api-runtime.cjs'), 'utf8'), 'console.log("reviewed checker")\n');
  for (const [relative, contents] of Object.entries(reviewed)) assert.equal(fs.readFileSync(path.join(context, relative), 'utf8'), contents);
  for (const relative of ['.git', '.env', 'runner.log', 'node_modules', ...Object.keys(excluded)]) assert(!fs.existsSync(path.join(context, relative)));
  assert(!fs.existsSync(path.join(workDirectory, 'source.tar')));
  assert.throws(() => exportReleaseContext(repository, path.join(temporary, 'bad'), 'production'));
});
