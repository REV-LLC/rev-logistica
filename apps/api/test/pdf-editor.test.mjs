// Run after `npm run build --workspace apps/api`.
import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PdfDocument } from 'ts-pdf-edit';

const require = createRequire(import.meta.url);
const PDFKit = require('pdfkit');
const sharp = require('sharp');
const { PDFDocument, PDFName, StandardFonts } = require('pdf-lib');
const { createCanvas, Path2D, DOMMatrix, ImageData } = require('@napi-rs/canvas');
// Both PDF.js versions can install canvas globals. Keep paths and matrices
// from the same native implementation used by the independent renderer.
Object.assign(globalThis, { Path2D, DOMMatrix, ImageData });
const { PdfEditorService } = require('../dist/src/pdf-editor/pdf-editor.service.js');
const service = new PdfEditorService();

async function fixture() {
  const png = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#1c7ed6' } }).png().toBuffer();
  return new Promise((resolve) => {
    const pdf = new PDFKit({ compress: true });
    const chunks = [];
    pdf.on('data', (chunk) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.fontSize(18).text('Factura original', 50, 50);
    pdf.image(png, 50, 110, { width: 60 });
    pdf.addPage().text('Segunda pagina intacta', 50, 50);
    pdf.end();
  });
}

test('replaces original text, preserves case, leaves other pages intact, and supports a second edit', async () => {
  const bytes = await fixture();
  const initial = await service.inspect(bytes, '0');
  const run = initial.texts.find((item) => item.text === 'Factura original');
  assert.ok(run);
  const first = await service.edit(bytes, { page: '0', kind: 'text', index: String(run.index), original: run.text, replacement: 'Factura final' });
  const saved = Buffer.from(first.pdf, 'base64');
  const doc = await PdfDocument.open(new Uint8Array(saved));
  try {
    assert.match((await doc.getPage(0).text()).plainText, /Factura final/);
    assert.doesNotMatch((await doc.getPage(0).text()).plainText, /original/);
    assert.match((await doc.getPage(1).text()).plainText, /Segunda pagina intacta/);
  } finally { await doc.close(); }
  const next = await service.inspect(saved, '0');
  const updated = next.texts.find((item) => item.text.includes('final'));
  assert.ok(updated);
  const second = await service.edit(saved, { page: '0', kind: 'text', index: String(updated.index), original: updated.text, replacement: 'Factura fin' });
  const final = await service.inspect(Buffer.from(second.pdf, 'base64'), '0');
  assert.ok(final.texts.some((item) => item.text.includes('fin')));
});

test('rejects invalid files, pages, stale text, and image editing', async () => {
  const bytes = await fixture();
  await assert.rejects(service.inspect(Buffer.from('invalid'), '0'), /PDF válido/);
  await assert.rejects(service.inspect(bytes, '-1'), /página no existe/);
  await assert.rejects(service.inspect(bytes, '99'), /página no existe/);
  await assert.rejects(service.edit(bytes, { page: '0', kind: 'text', index: '0', original: 'stale', replacement: 'Updated' }), /texto cambió/);
  await assert.rejects(service.edit(bytes, { page: '0', kind: 'image', index: '0' }), /dedicado a texto/);
});

test('HTTP endpoints enforce authentication and office/admin roles, and accept multipart PDFs', async () => {
  process.env.JWT_SECRET ||= 'pdf-editor-test-only-secret';
  const { Test } = require('@nestjs/testing');
  const { JwtService } = require('@nestjs/jwt');
  const { PrismaService } = require('../dist/src/prisma/prisma.service.js');
  const { PdfEditorController } = require('../dist/src/pdf-editor/pdf-editor.controller.js');
  const request = require('supertest');
  const module = await Test.createTestingModule({
    controllers: [PdfEditorController],
    providers: [PdfEditorService,
      { provide: JwtService, useValue: { verifyAsync: async (token) => {
        if (!['ADMIN', 'OFFICE', 'DRIVER'].includes(token)) throw new Error('Invalid token');
        return { sub: 'test', role: token };
      } } },
      { provide: PrismaService, useValue: {} },
    ],
  }).compile();
  const app = module.createNestApplication();
  await app.init();
  try {
    const server = app.getHttpServer();
    await request(server).post('/pdf-editor/inspect').expect(401);
    await request(server).post('/pdf-editor/inspect').set('Authorization', 'Bearer DRIVER').expect(403);
    const bytes = await fixture();
    const inspect = await request(server).post('/pdf-editor/inspect').set('Authorization', 'Bearer OFFICE').field('page', '0').attach('pdf', bytes, 'sample.pdf').expect(201);
    assert.equal(inspect.body.pageCount, 2);
    assert.equal(inspect.headers['cache-control'], 'no-store');
    const run = inspect.body.texts[0];
    const edit = await request(server).post('/pdf-editor/edit').set('Authorization', 'Bearer ADMIN').field('page', '0').field('kind', 'text').field('index', String(run.index)).field('original', run.text).field('replacement', 'Case Mixto').attach('pdf', bytes, 'sample.pdf').expect(201);
    const after = await service.inspect(Buffer.from(edit.body.pdf, 'base64'), '0');
    assert.ok(after.texts.some((item) => item.text.includes('Case Mixto')));
  } finally { await app.close(); }
});

async function generatedFixture(source, options = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRomanBold);
  const page = doc.addPage([612, 792]);
  page.node.set(PDFName.of('Resources'), doc.context.obj({ Font: { F1: font.ref } }));
  const content = doc.context.register(doc.context.flateStream(source));
  page.node.set(PDFName.of('Contents'), content);
  if (options.sharedPage) {
    const second = doc.addPage([612, 792]);
    second.node.set(PDFName.of('Resources'), page.node.get(PDFName.of('Resources')));
    second.node.set(PDFName.of('Contents'), content);
  }
  return new Uint8Array(await doc.save());
}

async function render(bytes, page = 0) {
  // Independent PDF.js 5 renderer; the editor engine extracts using PDF.js 4.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const previousWorker = globalThis.pdfjsWorker;
  globalThis.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const doc = await task.promise;
    const current = await doc.getPage(page + 1);
    const viewport = current.getViewport({ scale: 2 });
    const canvas = createCanvas(viewport.width, viewport.height);
    await current.render({ canvas, viewport }).promise;
    return { pixels: canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
  } finally { await task.destroy(); globalThis.pdfjsWorker = previousWorker; }
}

function diffOutside(before, after, box) {
  assert.equal(after.width, before.width); assert.equal(after.height, before.height);
  let outside = 0, inside = 0; const bounds = [Infinity, Infinity, 0, 0];
  for (let y = 0; y < before.height; y++) for (let x = 0; x < before.width; x++) {
    const offset = (y * before.width + x) * 4;
    if ([0, 1, 2, 3].some((channel) => before.pixels[offset + channel] !== after.pixels[offset + channel])) {
      if (x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]) inside++;
      else { outside++; bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y); bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y); }
    }
  }
  return { outside, inside, bounds };
}

const spaced = 'q\n0.12 0.34 0.56 rg\nBT\n/F1 16 Tf\n1.3 Tc\n2.5 Tw\n92 Tz\n3 Ts\n1 0 0 1 50 700 Tm\n[(AV) 120 (ATAR) -30 ( 12345)] TJ\n(TAIL) Tj\n0 -45 Td\n(Next row remains intact) Tj\nET\nQ';

test('preserves font resources, size, color, character/word spacing, scale, kerning, and subsequent text pixels', async () => {
  const bytes = await generatedFixture(spaced);
  const initial = await service.inspect(bytes, '0');
  const hit = initial.texts.find((item) => item.text === 'AVATAR 12345');
  assert.ok(hit?.editable);
  assert.equal(hit.font, 'Times-Bold'); assert.equal(hit.size, 16);
  assert.equal(hit.charSpacing, 1.3); assert.equal(hit.wordSpacing, 2.5); assert.equal(hit.horizontalScale, 92);
  const result = await service.edit(bytes, { page: '0', kind: 'text', index: String(hit.index), original: hit.text, replacement: 'AVATAR 54321' });
  const saved = new Uint8Array(Buffer.from(result.pdf, 'base64'));
  const after = await service.inspect(saved, '0');
  const edited = after.texts.find((item) => item.text === 'AVATAR 54321');
  for (const property of ['font', 'size', 'charSpacing', 'wordSpacing', 'horizontalScale']) assert.equal(edited[property], hit[property]);
  const oldDoc = await PDFDocument.load(bytes), newDoc = await PDFDocument.load(saved);
  assert.equal(newDoc.getPage(0).node.Resources().toString(), oldDoc.getPage(0).node.Resources().toString());
  const visual = diffOutside(await render(bytes), await render(saved), [245, 145, 410, 200]);
  assert.ok(visual.inside > 0, 'replacement changes visible pixels');
  assert.equal(visual.outside, 0, 'all untouched pixels must remain identical');
});

test('keeps the original position of an unchanged suffix and following show operators after shortening', async () => {
  const bytes = await generatedFixture('BT /F1 18 Tf 1.5 Tc 3 Tw 1 0 0 1 50 700 Tm [(Cliente Largo) 100 ( 12345)] TJ (TAIL) Tj ET');
  const hit = (await service.inspect(bytes, '0')).texts.find((item) => item.text === 'Cliente Largo 12345');
  const result = await service.edit(bytes, { page: '0', kind: 'text', index: String(hit.index), original: hit.text, replacement: 'Cli 12345' });
  const saved = new Uint8Array(Buffer.from(result.pdf, 'base64'));
  const visual = diffOutside(await render(bytes), await render(saved), [95, 140, 360, 195]);
  assert.ok(visual.inside > 0);
  assert.equal(visual.outside, 0, JSON.stringify(visual));
});

test('rejects overflow and missing glyphs instead of changing the font, size, or spacing', async () => {
  const bytes = await fixture();
  const hit = (await service.inspect(bytes, '0')).texts.find((item) => item.editable);
  const fields = { page: '0', kind: 'text', index: String(hit.index), original: hit.text };
  await assert.rejects(service.edit(bytes, { ...fields, replacement: 'Una frase mucho mas larga que el espacio disponible para el texto original' }), /no cabe/);
  await assert.rejects(service.edit(bytes, { ...fields, replacement: 'Ω' }), /fuente original no contiene/);
  const unchanged = await service.inspect(bytes, '0');
  assert.ok(unchanged.texts.some((item) => item.text === hit.text));
});

test('reuses an embedded subset font through ToUnicode without modifying the font program', async () => {
  const fontPath = require.resolve('pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf');
  const bytes = await new Promise((resolve) => {
    const pdf = new PDFKit(); const chunks = [];
    pdf.on('data', (chunk) => chunks.push(chunk)); pdf.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    pdf.font(fontPath).fontSize(17).text('Certificado de Juan 12345', 50, 60);
    pdf.text('Ana 54321', 50, 100); pdf.end();
  });
  const hit = (await service.inspect(bytes, '0')).texts.find((item) => item.text === 'Certificado de Juan 12345');
  assert.ok(hit?.editable);
  assert.match(hit.font, /LiberationSans/);
  const result = await service.edit(bytes, { page: '0', kind: 'text', index: String(hit.index), original: hit.text, replacement: 'Certificado de Ana 12345' });
  const saved = new Uint8Array(Buffer.from(result.pdf, 'base64'));
  const after = await service.inspect(saved, '0');
  assert.ok(after.texts.some((item) => item.text === 'Certificado de Ana 12345' && item.font === hit.font && item.size === 17));
  const oldDoc = await PDFDocument.load(bytes), newDoc = await PDFDocument.load(saved);
  let checkedFontPrograms = 0;
  for (const [, object] of oldDoc.context.enumerateIndirectObjects()) {
    if (typeof object.get !== 'function') continue;
    for (const key of ['FontFile', 'FontFile2', 'FontFile3']) {
      const ref = object.get(PDFName.of(key));
      if (!ref) continue;
      checkedFontPrograms++;
      assert.deepEqual(newDoc.context.lookup(ref).getContents(), oldDoc.context.lookup(ref).getContents(), 'embedded font program is byte-identical');
    }
  }
  assert.ok(checkedFontPrograms > 0, 'at least one embedded font program must be checked');
  const visual = diffOutside(await render(bytes), await render(saved), [95, 110, 580, 165]);
  assert.equal(visual.outside, 0, JSON.stringify(visual));
  const doc = await PdfDocument.open(saved);
  try { assert.match((await doc.getPage(0).text()).plainText, /Certificado de Ana\s+12345/); } finally { await doc.close(); }
});

test('does not change another page that shares the original content stream', async () => {
  const bytes = await generatedFixture('BT /F1 18 Tf 1 0 0 1 50 700 Tm (12345) Tj ET', { sharedPage: true });
  const hit = (await service.inspect(bytes, '0')).texts.find((item) => item.editable);
  const result = await service.edit(bytes, { page: '0', kind: 'text', index: String(hit.index), original: hit.text, replacement: '54321' });
  const saved = new Uint8Array(Buffer.from(result.pdf, 'base64'));
  assert.ok((await service.inspect(saved, '0')).texts.some((item) => item.text === '54321'));
  assert.ok((await service.inspect(saved, '1')).texts.some((item) => item.text === '12345'));
  assert.deepEqual((await render(saved, 1)).pixels, (await render(bytes, 1)).pixels);
});

for (const operator of ["(12345) '", '2 1 (12345) "']) {
  test(`preserves the line advance and text state of the ${operator} operator`, async () => {
    const bytes = await generatedFixture(`BT /F1 18 Tf 30 TL 1 0 0 1 50 700 Tm (Header) Tj ${operator} (TAIL) Tj ET`);
    const hit = (await service.inspect(bytes, '0')).texts.find((item) => item.text === '12345');
    const result = await service.edit(bytes, { page: '0', kind: 'text', index: String(hit.index), original: hit.text, replacement: '54321' });
    const visual = diffOutside(await render(bytes), await render(new Uint8Array(Buffer.from(result.pdf, 'base64'))), [95, 210, 210, 252]);
    assert.ok(visual.inside > 0); assert.equal(visual.outside, 0, JSON.stringify(visual));
  });
}

async function formFixture() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRomanBold);
  const leaf = doc.context.register(doc.context.flateStream('BT /F1 18 Tf 1 0 0 1 10 40 Tm [(12345)] TJ ET', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 220, 140],
    Group: { Type: 'Group', S: 'Transparency', I: true, CS: 'DeviceRGB' },
  }));
  const resources = doc.context.obj({ Font: { F1: font.ref }, XObject: { Leaf: leaf } });
  const outer = doc.context.register(doc.context.flateStream('q 1 0 0 1 10 20 cm /Leaf Do Q', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 250, 180], Matrix: [.8, 0, 0, .8, 0, 0], Resources: resources,
    Group: { Type: 'Group', S: 'Transparency', I: true, CS: 'DeviceRGB' },
  }));
  const pageResources = doc.context.obj({ XObject: { Outer: outer } });
  const page = doc.addPage([612, 792]);
  page.node.set(PDFName.of('Resources'), pageResources);
  page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream('0.4 Tc 1.7 Tw q 1 0 0 1 30 400 cm /Outer Do Q q 1 0 0 1 300 400 cm /Outer Do Q')));
  const second = doc.addPage([612, 792]);
  second.node.set(PDFName.of('Resources'), pageResources);
  second.node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream('0.4 Tc 1.7 Tw q 1 0 0 1 30 400 cm /Outer Do Q')));
  return new Uint8Array(await doc.save());
}

test('edits only the selected nested Form invocation, preserving transforms, inherited spacing, groups, and other pages', async () => {
  const bytes = await formFixture();
  const initial = await service.inspect(bytes, '0');
  const hits = initial.texts.filter((item) => item.text === '12345');
  assert.equal(hits.length, 2, 'no duplicate read-only fallbacks');
  assert.ok(hits.every((item) => item.editable));
  assert.notEqual(hits[0].index, hits[1].index);
  assert.ok(Math.abs(hits[0].size - 14.4) < 1e-6);
  assert.equal(hits[0].charSpacing, .4); assert.equal(hits[0].wordSpacing, 1.7);
  const result = await service.edit(bytes, { page: '0', kind: 'text', index: String(hits[0].index), original: hits[0].text, replacement: '54321' });
  const saved = new Uint8Array(Buffer.from(result.pdf, 'base64'));
  const after = await service.inspect(saved, '0');
  assert.equal(after.texts.filter((item) => item.text === '54321' && item.editable).length, 1);
  assert.equal(after.texts.filter((item) => item.text === '12345' && item.editable).length, 1);
  assert.equal((await service.inspect(saved, '1')).texts.filter((item) => item.text === '12345').length, 1);
  const visual = diffOutside(await render(bytes), await render(saved), [85, 650, 180, 705]);
  assert.ok(visual.inside > 0); assert.equal(visual.outside, 0, JSON.stringify(visual));
  assert.deepEqual((await render(bytes, 1)).pixels, (await render(saved, 1)).pixels);
  const original = await PDFDocument.load(bytes), edited = await PDFDocument.load(saved);
  let groupsChecked = 0;
  for (const [ref, object] of original.context.enumerateIndirectObjects()) {
    if (object.dict?.has(PDFName.of('Group'))) {
      groupsChecked++;
      assert.equal(edited.context.lookup(ref).dict.toString(), object.dict.toString(), 'original shared Form dictionary remains identical');
    }
  }
  assert.equal(groupsChecked, 2);
});

test('retains word gaps encoded as TJ numbers without adding space glyphs or changing other pixels', async () => {
  const bytes = await generatedFixture('BT /F1 18 Tf 1 0 0 1 50 700 Tm [(Total) -300 (12345)] TJ ET');
  const hit = (await service.inspect(bytes, '0')).texts.find((item) => item.text.startsWith('Total'));
  assert.ok(hit?.editable);
  assert.equal(hit.text, 'Total 12345', 'recover the visible word space without requiring a space glyph');
  const replacement = hit.text.replace('12345', '54321');
  const result = await service.edit(bytes, { page: '0', kind: 'text', index: String(hit.index), original: hit.text, replacement });
  const saved = new Uint8Array(Buffer.from(result.pdf, 'base64'));
  const visual = diffOutside(await render(bytes), await render(saved), [180, 140, 295, 190]);
  assert.ok(visual.inside > 0); assert.equal(visual.outside, 0, JSON.stringify(visual));
});
