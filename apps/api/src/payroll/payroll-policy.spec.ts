import { Prisma } from '@prisma/client';
import { bogotaDate, calculatePayroll, payrollPeriod, payrollPolicy, provisionalSalaryData, salaryAmount } from './payroll-policy';
const d = (value: string) => new Prisma.Decimal(value);
describe('basic fortnight payroll arithmetic', () => {
  it('keeps displayed concepts, total and net consistent under HALF_UP rounding', () => {
    const result = calculatePayroll(d('1750905'), d('249095'), 15);
    expect(result).toMatchObject({ totalMonthly: '2000000.00', salaryEarned: '875453', transportEarned: '124548', totalEarned: '1000001', healthDeduction: '35018', pensionDeduction: '35018', totalDeductions: '70036', netPay: '929965' });
    expect(d(result.totalEarned).eq(d(result.salaryEarned).plus(result.transportEarned))).toBe(true);
    expect(d(result.netPay).eq(d(result.totalEarned).minus(result.totalDeductions))).toBe(true);
  });
  it('excludes transport from the contribution base and prorates days over 30', () => {
    const result = calculatePayroll(d('1800000'), d('249095'), 10);
    expect(result.salaryEarned).toBe('600000');
    expect(result.healthDeduction).toBe('24000');
    expect(result.pensionDeduction).toBe('24000');
    expect(result.transportEarned).toBe('83032');
    expect(result.netPay).toBe('635032');
    expect(calculatePayroll(d('1800000'), d('0'), 10).healthDeduction).toBe(result.healthDeduction);
  });
  it('accepts calendar boundaries including February and a 31-day month without inferring extra payable days', () => {
    expect(payrollPeriod('2026-02-16', '2026-02-28')).toBeDefined();
    expect(payrollPeriod('2026-10-16', '2026-10-31')).toBeDefined();
    for (const [from, to] of [['2026-02-16', '2026-02-30'], ['2026-10-01', '2026-10-31'], ['2026-10-15', '2026-10-31'], ['2026-10-16', '2026-11-15']]) expect(() => payrollPeriod(from, to)).toThrow();
    for (const days of [0, 16, 1.5, NaN]) expect(() => calculatePayroll(d('1800000'), d('0'), days)).toThrow();
  });
  it('does not extrapolate policy into another year or seed an unverified year', () => {
    expect(() => payrollPolicy('2027-01-01')).toThrow();
    expect(provisionalSalaryData('id', new Date('2027-01-02T12:00:00Z'))).toBeNull();
    expect(provisionalSalaryData('id', new Date('2026-10-01T12:00:00Z'))).toMatchObject({ provisional: true, revision: 1, monthlySalary: '1750905.00' });
    expect(bogotaDate(new Date('2026-10-02T02:00:00Z'))).toBe('2026-10-01');
  });
  it('rejects under-minimum and malformed salaries without floating-point parsing', () => {
    for (const value of ['1750904.99', '-1', '1e10', 'NaN', '1750905.001']) expect(() => salaryAmount(value, '2026-10-01')).toThrow();
    expect(salaryAmount('2000000.25', '2026-10-01').toFixed(2)).toBe('2000000.25');
  });
});
