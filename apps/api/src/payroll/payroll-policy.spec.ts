import { Prisma } from '@prisma/client';
import { bogotaDate, civilDate, ordinaryHourlyRate, payrollPolicy, salaryAmount } from './payroll-policy';

describe('Colombian payroll references', () => {
  it('uses date-effective legal boundaries', () => {
    expect(payrollPolicy('2026-06-30').restOrHolidayRate).toBe('0.80');
    expect(payrollPolicy('2026-07-01').restOrHolidayRate).toBe('0.90');
    expect(payrollPolicy('2026-07-14').monthlyHourDivisor).toBe(220);
    expect(payrollPolicy('2026-07-15').monthlyHourDivisor).toBe(210);
    expect(ordinaryHourlyRate(new Prisma.Decimal('1750905'), '2026-09-26')).toBe('8337.642857');
  });
  it('does not guess an unconfigured year or normalize invalid dates', () => {
    for (const date of ['2026-02-29', '2026-09-31', 'bad']) expect(() => civilDate(date)).toThrow();
    expect(() => payrollPolicy('2027-01-01')).toThrow();
  });
  it('keeps the Colombian civil day at the UTC boundary', () => {
    expect(bogotaDate(new Date('2026-09-27T02:00:00Z'))).toBe('2026-09-26');
  });
  it('rejects unsafe, under-minimum and over-precision salary values', () => {
    for (const amount of ['0', '-1', '1750904.99', '1750905.001', '1e7', 'NaN', 'Infinity']) {
      expect(() => salaryAmount(amount, '2026-09-26')).toThrow();
    }
    expect(salaryAmount('2000000.25', '2026-09-26').toFixed(2)).toBe('2000000.25');
  });
});
