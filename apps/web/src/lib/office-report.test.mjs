import assert from 'node:assert/strict';
import test from 'node:test';
import { columnLabel, displayOfficeValue, officeExcelValue } from './office-report.ts';

test('Spanish labels and enum values do not translate proper names', () => {
  assert.equal(columnLabel('item_name'), 'Artículo');
  assert.equal(columnLabel('saldo_valido'), 'Saldo válido');
  assert.equal(columnLabel('cantidad_en_obra'), 'Cantidad en obra');
  assert.equal(displayOfficeValue('tipo_ubicacion', 'WORKSITE'), 'En obra');
  assert.equal(displayOfficeValue('propiedad', 'INTERNAL'), 'Propiedad de REV');
  assert.equal(displayOfficeValue('control', 'BULK'), 'Por cantidad');
  assert.equal(displayOfficeValue('customer_name', 'INTERNAL'), 'INTERNAL');
  assert.equal(displayOfficeValue('activo', false), 'No');
  assert.equal(displayOfficeValue('cantidad', 0), '0');
  assert.equal(displayOfficeValue('cantidad', null), '—');
});

test('Excel numbers stay usable and arbitrary precision is not rounded', () => {
  assert.equal(officeExcelValue('cantidad', '12', 'number'), 12);
  assert.equal(officeExcelValue('cantidad', '0', 'number'), 0);
  assert.equal(officeExcelValue('tarifa', '12.25', 'number'), 12.25);
  assert.equal(officeExcelValue('tarifa', '1234567890123456.12', 'number'), '1234567890123456.12');
  assert.equal(officeExcelValue('serial', '00123', 'text'), '00123');
  assert.equal(officeExcelValue('cantidad', null, 'number'), null);
});

test('untrusted formula and hyperlink objects become inert text', () => {
  assert.equal(officeExcelValue('nombre', '=SUM(1,2)', 'text'), '=SUM(1,2)');
  assert.equal(officeExcelValue('nombre', { formula: '1+1' }), '{"formula":"1+1"}');
  assert.equal(officeExcelValue('nombre', { hyperlink: 'https://example.com' }), '{"hyperlink":"https://example.com"}');
});

test('Excel timestamps use Bogotá wall time and preserve invalid dates as text', () => {
  assert.equal(officeExcelValue('fecha', '2026-09-15T03:00:00Z', 'datetime').toISOString(), '2026-09-14T22:00:00.000Z');
  assert.equal(officeExcelValue('fecha', '2026-09-15', 'date').toISOString(), '2026-09-15T00:00:00.000Z');
  assert.equal(displayOfficeValue('fecha', '2026-09-15', 'date'), '15/09/2026');
  assert.equal(officeExcelValue('fecha', 'sin fecha', 'date'), 'sin fecha');
});
