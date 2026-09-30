import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Colombian private-sector general regime. Date-bounded: never extrapolate a
// previous year's minimum wage into an unverified year.
export function civilDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Fecha inválida');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('Fecha inválida');
  }
  return date;
}

export function bogotaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function payrollPolicy(date: string) {
  civilDate(date);
  if (date < '2026-01-01' || date > '2026-12-31') {
    throw new BadRequestException('Falta configurar la política salarial para ese año');
  }
  return {
    country: 'CO', currency: 'COP', date,
    minimumMonthlySalary: '1750905.00',
    transportAllowanceReference: '249095.00',
    monthlyHourDivisor: date >= '2026-07-15' ? 210 : 220,
    weeklyHours: date >= '2026-07-15' ? 42 : 44,
    nightStart: '19:00', nightEnd: '06:00',
    nightRate: '0.35', extraDayRate: '0.25', extraNightRate: '0.75',
    restOrHolidayRate: date >= '2026-07-01' ? '0.90' : '0.80',
  };
}

export function salaryAmount(value: string, date: string) {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) throw new BadRequestException('Salario inválido: máximo dos decimales');
  const amount = new Prisma.Decimal(value);
  if (amount.lt(payrollPolicy(date).minimumMonthlySalary)) {
    throw new BadRequestException('El salario mensual de esta configuración de jornada completa no puede ser inferior al mínimo');
  }
  return amount;
}

export function ordinaryHourlyRate(salary: Prisma.Decimal, date: string) {
  // Display reference only; future payroll calculations must retain full precision.
  return salary.div(payrollPolicy(date).monthlyHourDivisor).toFixed(6);
}
