import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as report from './office-report.ts';

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL('./office-excel.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled)(
  specifier => specifier === './office-report' ? report : require(specifier), module, module.exports,
);
const { buildOfficeWorkbook } = module.exports;
const reply = {
  answer: 'Hay 12 unidades de prueba [1].', queriedAt: '2026-09-15T14:00:00Z', readOnly: true,
  evidence: [{ id: '1', title: 'Inventario de prueba', views: ['inventory_balances'],
    columns: ['articulo', 'cantidad', 'serial_number', 'tipo_ubicacion', 'fecha', 'dia', 'dato'],
    columnTypes: { cantidad: 'number', serial_number: 'text', fecha: 'datetime', dia: 'date' },
    rows: [{ articulo: '=HYPERLINK("https://example.com")', cantidad: '12.5', serial_number: '00123',
      tipo_ubicacion: 'WORKSITE', fecha: '2026-09-15T03:00:00Z', dia: '2026-09-15', dato: { formula: '1+1' } }],
    rowCount: 1, truncated: true, queriedAt: '2026-09-15T14:00:00Z' }],
};

test('exports and reopens real XLSX with Spanish, typed values, filters and partial warnings', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Export must not call a server or OpenAI'); };
  try {
    const built = await buildOfficeWorkbook(reply, 'Consulta de prueba');
    const buffer = await built.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(buffer);
    assert.deepEqual(reopened.worksheets.map(sheet => sheet.name), ['Resumen', 'Consulta 1']);
    assert.match(reopened.getWorksheet('Resumen').getCell('B8').value, /PARCIAL/);
    const sheet = reopened.getWorksheet('Consulta 1');
    assert.equal(sheet.getCell('A7').value, 'Artículo');
    assert.equal(sheet.getCell('B8').value, 12.5);
    assert.equal(sheet.getCell('C8').value, '00123');
    assert.equal(sheet.getCell('D8').value, 'En obra');
    assert.equal(sheet.getCell('E8').value.toISOString(), '2026-09-14T22:00:00.000Z');
    assert.equal(sheet.getCell('F8').value.toISOString(), '2026-09-15T00:00:00.000Z');
    assert.equal(sheet.getCell('A8').type, ExcelJS.ValueType.String);
    assert.equal(sheet.getCell('G8').type, ExcelJS.ValueType.String);
    assert.equal(sheet.getCell('A8').formula, undefined);
    assert.equal(sheet.autoFilter, 'A7:G8');
    assert.equal(sheet.views[0].ySplit, 7);
  } finally { globalThis.fetch = originalFetch; }
});

test('empty evidence table still preserves headers and explains scope', async () => {
  const book = await buildOfficeWorkbook({ ...reply, evidence: [{ ...reply.evidence[0], rows: [], rowCount: 0, truncated: false }] }, 'Sin coincidencias');
  const sheet = book.getWorksheet('Consulta 1');
  assert.equal(sheet.getCell('A7').value, 'Artículo');
  assert.match(sheet.getCell('A4').value, /0 filas/);
  assert.doesNotMatch(book.getWorksheet('Resumen').getCell('B8').value, /PARCIAL/);
});
