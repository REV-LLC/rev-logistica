import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { createWorksiteBalancePdf, balancePdfRows, defaultBalancePdfColumns, balancePdfColumns, worksiteBalancePdfFilename } = require('./worksite-balance-pdf.ts');
if (previous) require.extensions['.ts'] = previous; else delete require.extensions['.ts'];
const branding = { companyName: 'RENTA EQUIPOS DEL VALLE S.A.S.', logoUrl: `data:image/png;base64,${fs.readFileSync(new URL('../../public/branding/rev-logo.png', import.meta.url)).toString('base64')}` };
const options = { branding, generatedAt: new Date('2026-11-12T14:30:00Z') };
const fixture = () => ({ customerName: 'CONSTRUCTORA EJEMPLO S.A.S.', worksiteName: 'EDIFICIO DEL PARQUE', worksiteAlias: 'TORRE NORTE', address: 'Calle 25 # 10-45, Cali',
  bulk: [
    { skuId: 'collar', skuName: 'BASE COLLAR', ownerWarehouseName: 'PRIVADO-UNO', quantity: 5 },
    { skuId: 'collar', skuName: 'BASE COLLAR', ownerWarehouseName: 'PRIVADO-DOS', quantity: 10 },
  ], serial: [{ description: 'DEMOLEDOR BOSCH', serialOrEngine: 'SERIAL-100', ownerWarehouseName: 'PRIVADO-TRES', quantity: 1 }],
});
async function inspect(blob) {
  const raw = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map(match => {
    try { return inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'); } catch { return match[1]; }
  });
  return { raw, text: streams.join('\n'), pages: streams.filter(stream => stream.includes('Generado con FINGE')) };
}
test('client defaults omit all provenance and consolidate bulk by identity without merging individual equipment', async () => {
  assert.ok(!defaultBalancePdfColumns.includes('owner'));
  const data = fixture();
  assert.deepEqual(balancePdfRows(data, false).map(row => row.quantity), [15, 1]);
  const pdf = await inspect(await createWorksiteBalancePdf(data, options));
  for (const value of ['SALDO DE INVENTARIO', 'FINGE', branding.companyName, data.customerName, 'TORRE NORTE', 'BASE COLLAR', 'SERIAL-100']) assert.ok(pdf.text.includes(value), value);
  assert.match(pdf.raw, /\/Subtype \/Image/);
  assert.ok(!pdf.text.includes('PRIVADO'));
  assert.ok(!pdf.text.includes('procedencia'));
  assert.equal(pdf.pages.length, 1);
});
test('provenance appears only after explicit selection and preserves each owner balance', async () => {
  const data = fixture();
  assert.equal(balancePdfRows(data, true).length, 3);
  const pdf = await inspect(await createWorksiteBalancePdf(data, { ...options, columns: balancePdfColumns.map(column => column.key) }));
  for (const name of ['PRIVADO-UNO', 'PRIVADO-DOS', 'PRIVADO-TRES']) assert.ok(pdf.text.includes(name));
});
test('all 31 nonempty column combinations produce a PDF; hidden cells are not embedded', async () => {
  for (let mask = 1; mask < 32; mask++) {
    const columns = balancePdfColumns.filter((_, i) => mask & (1 << i)).map(column => column.key);
    const pdf = await inspect(await createWorksiteBalancePdf(fixture(), { ...options, columns }));
    assert.equal(pdf.pages.length, 1);
    assert.equal(pdf.text.includes('SERIAL-100'), columns.includes('identifier'));
    assert.equal(pdf.text.includes('BASE COLLAR'), columns.includes('reference'));
    assert.equal(pdf.text.includes('PRIVADO-UNO'), columns.includes('owner'));
  }
});
test('multi-page balances repeat identity, table headings and page numbers', async () => {
  const data = fixture();
  data.bulk = Array.from({ length: 100 }, (_, i) => ({ skuId: `sku-${i}`, skuName: `REFERENCIA ${String(i).padStart(3, '0')}`, quantity: i + 1, ownerWarehouseName: 'PRIVATE' }));
  const pdf = await inspect(await createWorksiteBalancePdf(data, options));
  assert.ok(pdf.pages.length > 2);
  for (const page of pdf.pages) for (const value of ['FINGE', data.customerName, 'Referencia', 'Saldo']) assert.ok(page.includes(value), value);
  assert.ok(pdf.text.includes('REFERENCIA 099'));
  assert.ok(!pdf.text.includes('PRIVATE'));
});
test('long cells continue on another page without dropping text or repeating numeric values', async () => {
  const data = fixture(); data.serial = [];
  data.bulk = [{ skuId: 'one', skuName: `${'DESCRIPCION EXTENSA '.repeat(1500)}MARCADOR-FINAL`, quantity: 12345 }];
  const pdf = await inspect(await createWorksiteBalancePdf(data, options));
  assert.ok(pdf.pages.length > 1); assert.ok(pdf.text.includes('MARCADOR-FINAL'));
  assert.equal((pdf.text.match(/12\.345/g) || []).length, 1);
});
test('empty balances are explicit; invalid selection and unavailable logo fail cleanly', async () => {
  const data = { ...fixture(), bulk: [], serial: [] };
  const pdf = await inspect(await createWorksiteBalancePdf(data, options));
  assert.ok(pdf.text.includes('Esta obra no tiene inventario'));
  await assert.rejects(() => createWorksiteBalancePdf(data, { columns: [] }), /al menos una columna/);
  await assert.rejects(() => createWorksiteBalancePdf(data, { branding: { companyName: 'Test', logoUrl: 'data:text/plain,invalid-image' } }));
  assert.equal(worksiteBalancePdfFilename(data), 'saldo-obra-torre-norte.pdf');
});
