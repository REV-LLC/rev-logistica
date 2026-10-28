import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function load(file, deps = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((id) => deps[id] ?? require(id), module, module.exports);
  return module.exports;
}
const reportLib = load('./balance-report.ts');
const { buildBalanceWorkbook } = load('./balance-excel.ts', { './balance-report': reportLib });
const baseRow = { itemKey: 'sku:plank', reference: 'Tablón', identification: '', controlType: 'BULK', isImplement: false,
  ownerId: 'rev', ownerName: 'REV', ownerCategory: 'INTERNAL', ownerWarehouseId: 'own', ownerWarehouseName: 'Bodega REV',
  locationType: 'WORKSITE', locationId: 'site1', locationName: 'Las Mercedes', customerId: 'customer1', customerName: 'Cliente', worksiteName: 'Las Mercedes', worksiteAlias: '', quantity: 3, source: 'INVENTORY' };
const makeReport = (rows, kind = 'general') => ({ report: kind, title: 'Saldos de inventario', queriedAt: '2026-10-28T02:00:00Z',
  filters: { customer: null, worksite: null, provider: null, warehouse: null, ownership: 'ALL' },
  scope: 'Inventario actual', warnings: [], rowCount: rows.length, rows });

test('query paths whitelist the fields that belong to each report, resetting stale selectors', () => {
  assert.equal(reportLib.balanceReportPath({ report: 'general', customerId: 'stale', warehouseId: 'stale' }), '/inventory/reports/balances?report=general');
  assert.equal(reportLib.balanceReportPath({ report: 'worksites', customerId: 'c', customerWorksiteId: 's', ownership: 'PROVIDER' }), '/inventory/reports/balances?report=worksites&customerId=c&customerWorksiteId=s&ownership=PROVIDER');
  assert.equal(reportLib.balanceReportPath({ report: 'providers', providerId: 'p', customerId: 'stale', ownership: 'INTERNAL' }), '/inventory/reports/balances?report=providers&providerId=p');
});

test('summary groups by IDs, separating same-name clients, references, units and owners', () => {
  const rows = [baseRow, { ...baseRow, locationId: 'site2', quantity: 2 },
    { ...baseRow, customerId: 'customer2', quantity: 4 }, { ...baseRow, ownerWarehouseId: 'ally', quantity: 6 },
    { ...baseRow, itemKey: 'sku:other', quantity: 7 }];
  const summary = reportLib.summarizeBalances(makeReport(rows, 'customers'));
  assert.equal(summary.length, 4);
  assert.equal(summary[0].quantity, 5);
  assert.equal(reportLib.summarizeBalances(makeReport(rows, 'worksites')).length, 5);
});

test('general totals separate warehouse/worksite/transit/unknown and reconcile to detailed quantities', () => {
  const rows = [baseRow, { ...baseRow, locationType: 'WAREHOUSE', quantity: 2.5 },
    { ...baseRow, locationType: 'TRANSIT', quantity: 1 }, { ...baseRow, locationType: 'UNKNOWN', quantity: -1 }];
  const [summary] = reportLib.summarizeBalances(makeReport(rows));
  assert.equal(summary.quantity, 5.5);
  assert.equal(summary.warehouseQuantity, 2.5);
  assert.equal(summary.worksiteQuantity, 3);
  assert.equal(summary.transitQuantity, 1);
  assert.equal(summary.unknownQuantity, -1);
});

test('real XLSX reopens with numeric quantities, no executable formulas, readable labels, full detail and frozen headers', async () => {
  const report = makeReport([baseRow, { ...baseRow, itemKey: 'asset:bucket', reference: '=HYPERLINK("https://example.test")', identification: '#2', controlType: 'SERIAL', isImplement: true, quantity: 1 }], 'worksites');
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Excel generation must use only the received snapshot'); };
  try {
    const book = await buildBalanceWorkbook(report);
    const reopened = new ExcelJS.Workbook(); await reopened.xlsx.load(await book.xlsx.writeBuffer());
    assert.deepEqual(reopened.worksheets.map((sheet) => sheet.name), ['Saldos', 'Detalle por ubicación']);
    const detail = reopened.getWorksheet('Detalle por ubicación');
    assert.equal(detail.getCell('L7').value, 3);
    assert.equal(detail.getCell('L7').type, ExcelJS.ValueType.Number);
    assert.equal(detail.getCell('H8').type, ExcelJS.ValueType.String);
    assert.equal(detail.getCell('H8').formula, undefined);
    assert.equal(detail.getCell('I8').value, '#2');
    assert.equal(detail.getCell('K8').value, 'Sí');
    assert.equal(detail.views[0].ySplit, 6);
    assert.equal(detail.autoFilter, 'A6:L8');
    assert.equal(reopened.getWorksheet('Saldos').getCell('D8').value, '=HYPERLINK("https://example.test") #2');
    assert(!JSON.stringify(reopened.worksheets.map((sheet) => sheet.getSheetValues())).includes('asset:bucket'));
  } finally { globalThis.fetch = oldFetch; }
});

test('empty reports preserve their headers; large report exports are never sliced to the preview size', async () => {
  const empty = await buildBalanceWorkbook(makeReport([], 'warehouses'));
  assert.match(String(empty.getWorksheet('Saldos').getCell('A7').value), /Sin saldos/);
  const rows = Array.from({ length: 210 }, (_, index) => ({ ...baseRow, itemKey: `sku:${index}` }));
  const full = await buildBalanceWorkbook(makeReport(rows));
  assert.equal(full.getWorksheet('Detalle por ubicación').rowCount, 216);
  assert.equal(full.getWorksheet('Saldos').rowCount, 216);
  await assert.rejects(buildBalanceWorkbook({ ...makeReport(rows), rowCount: 500 }), /incompleto/);
  await assert.rejects(buildBalanceWorkbook(makeReport([{ ...baseRow, quantity: NaN }])), /inválida/);
});

test('filenames use Bogotá date, safe readable scope and never technical identifiers', () => {
  const report = makeReport([baseRow]); report.filters.worksite = 'Obra / Peñón';
  assert.equal(reportLib.balanceReportFileName(report), 'REV-saldos-general-Obra-Penon-2026-10-27.xlsx');
});
