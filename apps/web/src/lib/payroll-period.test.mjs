import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bogotaPayrollMonth, payrollPeriod, monthlySalaryTotal } from './payroll-period.ts';

test('quincenas preserve real month boundaries and 15 nominal payable days', () => {
  assert.deepEqual(payrollPeriod('2026-10', 'FIRST'), { from: '2026-10-01', to: '2026-10-15', defaultDays: 15 });
  for (const [month, end] of [['2026-10', '31'], ['2026-09', '30'], ['2026-02', '28'], ['2028-02', '29']]) {
    assert.deepEqual(payrollPeriod(month, 'SECOND'), { from: `${month}-16`, to: `${month}-${end}`, defaultDays: 15 });
  }
});
test('invalid month rejected instead of date overflow', () => {
  for (const month of ['2026-00', '2026-13', '2026-1', 'bad']) assert.throws(() => payrollPeriod(month, 'FIRST'));
});
test('Bogotá calendar controls payroll month, not UTC or browser timezone', () => {
  assert.equal(bogotaPayrollMonth(new Date('2026-10-01T02:00:00Z')), '2026-09');
});
test('monthly total preview is exact decimal cents and excludes invalid input', () => {
  assert.equal(monthlySalaryTotal('1750905', '249095'), '2000000.00');
  assert.equal(monthlySalaryTotal('1000.10', '0.20'), '1000.30');
  for (const value of ['', '-1', '1e3', '1.123', 'Infinity']) assert.equal(monthlySalaryTotal(value, '1'), null);
});
