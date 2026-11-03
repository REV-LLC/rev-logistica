// Run after pruning dev dependencies. This imports the app without starting a
// server or connecting to a database, and exercises the PDF/native resources.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'apps/api');
const apiRequire = createRequire(path.join(apiRoot, 'package.json'));

async function checkRuntime() {
  for (const relative of [
    'dist/src/main.js',
    'dist/src/app.module.js',
    'prisma/schema.prisma',
    'prisma/migrations/migration_lock.toml',
    'prisma.config.ts',
    'assets/rev-logo.png',
  ]) {
    assert(fs.existsSync(path.join(apiRoot, relative)), `Missing runtime file: ${relative}`);
  }

  const clientDirectory = path.dirname(apiRequire.resolve('.prisma/client/default'));
  assert(
    fs.readdirSync(clientDirectory).some((name) => name.startsWith('libquery_engine') || name.startsWith('query-engine')),
    'The generated Prisma client is missing its native engine',
  );
  const engineDirectory = path.dirname(apiRequire.resolve('@prisma/engines/package.json'));
  assert(
    fs.readdirSync(engineDirectory).some((name) => name.startsWith('schema-engine')),
    'Prisma migrations are missing their schema engine',
  );
  assert(fs.existsSync(apiRequire.resolve('prisma/build/index.js')), 'The Prisma migration CLI is missing');
  assert.equal(typeof apiRequire('@prisma/client').PrismaClient, 'function');

  // Importing AuthModule validates this variable in production mode. The import
  // check uses no HTTP listener and needs no deployment credential in CI.
  process.env.JWT_SECRET ||= 'runtime-import-check-only';
  apiRequire('reflect-metadata');
  assert.equal(typeof apiRequire('./dist/src/app.module.js').AppModule, 'function');

  const bcrypt = apiRequire('bcrypt');
  assert(bcrypt.compareSync('runtime-check', bcrypt.hashSync('runtime-check', 4)));
  const sharp = apiRequire('sharp');
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } }).png().toBuffer();
  assert.equal((await sharp(png).metadata()).format, 'png');

  const PDFDocument = apiRequire('pdfkit');
  const pdf = await new Promise((resolve, reject) => {
    const document = new PDFDocument();
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.text('API runtime check');
    document.end();
  });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  // Exercise the ESM PDF engine and its packaged WASM after dev packages go away.
  const { PdfDocument } = await import('ts-pdf-edit');
  const document = await PdfDocument.open(new Uint8Array(pdf));
  try {
    assert.equal(document.pageCount, 1);
  } finally {
    await document.close();
  }
  console.log('API runtime OK: compiled app, Prisma CLI/client/engines, logo, bcrypt, sharp, PDF fonts and WASM');
}

checkRuntime().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
