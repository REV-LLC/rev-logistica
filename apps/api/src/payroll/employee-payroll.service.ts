import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { REV_INITIAL_WORK_SCHEDULE } from './rev-payroll-defaults';
import { bogotaDate, civilDate, ordinaryHourlyRate, payrollPolicy, salaryAmount } from './payroll-policy';

export type SalaryInput = { effectiveFrom: string; monthlySalary: string; note: string; expectedRevision: number };
@Injectable()
export class EmployeePayrollService {
  constructor(private readonly prisma: PrismaService) {}

  async list(date = bogotaDate()) {
    const asOf = civilDate(date);
    const policy = payrollPolicy(date);
    const employees = await this.prisma.employee.findMany({
      orderBy: [{ name: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, lastName: true, active: true,
        salaries: { orderBy: { revision: 'desc' } },
      },
    });
    return { policy, initialWorkSchedule: REV_INITIAL_WORK_SCHEDULE, employees: employees.map(({ salaries, ...employee }) => {
      const applicable = salaries.filter(s => s.effectiveFrom <= asOf)
        .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || b.revision - a.revision)[0];
      return { ...employee,
        latestRevision: salaries[0]?.revision ?? 0,
        current: applicable ? {
          ...applicable, monthlySalary: applicable.monthlySalary.toFixed(2),
          hourlyRate: ordinaryHourlyRate(applicable.monthlySalary, date),
        } : null,
        history: salaries.map(s => ({ ...s, monthlySalary: s.monthlySalary.toFixed(2) })),
      };
    }) };
  }

  async save(employeeId: string, input: SalaryInput, author: string) {
    const effectiveFrom = civilDate(input.effectiveFrom);
    const monthlySalary = salaryAmount(input.monthlySalary, input.effectiveFrom);
    if (!input.note.trim()) throw new BadRequestException('Indica el motivo del cambio');
    if (input.effectiveFrom < '2026-09-16') throw new BadRequestException('La configuración inicial comienza el 16 de septiembre de 2026');
    return this.prisma.$transaction(async tx => {
      const employees = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM "Employee" WHERE id = ${employeeId} FOR UPDATE
      `);
      if (!employees.length) throw new NotFoundException('Empleado no encontrado');
      const latest = await tx.employeeSalary.findFirst({ where: { employeeId }, orderBy: { revision: 'desc' } });
      if ((latest?.revision ?? 0) !== input.expectedRevision) {
        throw new ConflictException('Otro usuario modificó el salario. Actualiza la página antes de guardar.');
      }
      return tx.employeeSalary.create({ data: {
        employeeId, effectiveFrom, monthlySalary, revision: (latest?.revision ?? 0) + 1,
        note: input.note.trim(), createdBy: author,
      } });
    });
  }
}
