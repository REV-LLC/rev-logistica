import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { civilDate } from '../common/civil-date';
export { civilDate } from '../common/civil-date';

export const INITIAL_SALARY_DATE = '2026-10-01';
export function bogotaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function payrollPolicy(date: string) {
  civilDate(date);
  if (date < '2026-01-01' || date > '2026-12-31') throw new BadRequestException('Falta configurar la política salarial para ese año');
  return { country: 'CO', currency: 'COP', date, minimumMonthlySalary: '1750905.00', transportAllowanceReference: '249095.00', healthRate: '0.04', pensionRate: '0.04', monthlyDayDivisor: 30, nominalFortnightDays: 15, rounding: 'HALF_UP_PER_CONCEPT', version: 'CO-2026-BASIC-v1' };
}
export function payrollPeriod(from: string, to: string) {
  const start = civilDate(from), end = civilDate(to);
  payrollPolicy(from); payrollPolicy(to);
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const first = start.getUTCDate() === 1 && end.getUTCDate() === 15;
  const second = start.getUTCDate() === 16 && end.getUTCDate() === last;
  if (!sameMonth || (!first && !second)) throw new BadRequestException('Selecciona una quincena completa: 1-15 o 16-fin de mes');
  return { start, end };
}
export function moneyAmount(value: string, label: string) {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) throw new BadRequestException(`${label}: usa un valor positivo con máximo dos decimales`);
  return new Prisma.Decimal(value);
}
export function salaryAmount(value: string, date: string) {
  const amount = moneyAmount(value, 'Salario');
  if (amount.lt(payrollPolicy(date).minimumMonthlySalary)) throw new BadRequestException('El salario de jornada completa no puede ser inferior al mínimo');
  return amount;
}
export type PayrollAmounts = ReturnType<typeof calculatePayroll>;
export function calculatePayroll(monthlySalary: Prisma.Decimal, transportAllowance: Prisma.Decimal, days: number) {
  if (!Number.isInteger(days) || days < 1 || days > 15) throw new BadRequestException('Los días deben ser un entero entre 1 y 15');
  const peso = (value: Prisma.Decimal) => value.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  const salaryEarned = peso(monthlySalary.mul(days).div(30));
  const transportEarned = peso(transportAllowance.mul(days).div(30));
  const healthDeduction = peso(salaryEarned.mul('0.04'));
  const pensionDeduction = peso(salaryEarned.mul('0.04'));
  const totalEarned = salaryEarned.plus(transportEarned);
  const totalDeductions = healthDeduction.plus(pensionDeduction);
  return { monthlySalary: monthlySalary.toFixed(2), transportAllowance: transportAllowance.toFixed(2), totalMonthly: monthlySalary.plus(transportAllowance).toFixed(2), salaryEarned: salaryEarned.toFixed(0), transportEarned: transportEarned.toFixed(0), totalEarned: totalEarned.toFixed(0), healthDeduction: healthDeduction.toFixed(0), pensionDeduction: pensionDeduction.toFixed(0), totalDeductions: totalDeductions.toFixed(0), netPay: totalEarned.minus(totalDeductions).toFixed(0) };
}
export function provisionalSalaryData(employeeId: string, now = new Date()) {
  const date = bogotaDate(now);
  if (date < INITIAL_SALARY_DATE || date > '2026-12-31') return null;
  const policy = payrollPolicy(date);
  return { employeeId, effectiveFrom: civilDate(date), monthlySalary: policy.minimumMonthlySalary, transportAllowance: policy.transportAllowanceReference, revision: 1, provisional: true, regime: 'STANDARD', note: 'Mínimo y auxilio provisionales. Confirmar condiciones individuales antes de emitir nómina.' };
}
