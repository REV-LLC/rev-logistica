import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type LoanInput = { type: 'OPENING' | 'CHARGE' | 'PAYMENT'; date: string; detail: string; amount: string; requestId: string };
export function summarizeLoans(entries: Array<{ type: string; amount: Prisma.Decimal }>) {
  let opening = new Prisma.Decimal(0), charges = new Prisma.Decimal(0), payments = new Prisma.Decimal(0);
  for (const entry of entries) {
    if (entry.type === 'OPENING') opening = opening.plus(entry.amount);
    else if (entry.type === 'PAYMENT') payments = payments.plus(entry.amount);
    else charges = charges.plus(entry.amount);
  }
  return { opening: opening.toFixed(2), charges: charges.toFixed(2), payments: payments.toFixed(2), balance: opening.plus(charges).minus(payments).toFixed(2) };
}
@Injectable()
export class EmployeeLoansService {
  constructor(private readonly prisma: PrismaService) {}
  async list() {
    const rows = await this.prisma.$queryRaw<Array<{
      id: string; name: string; lastName: string; documentId: string | null;
      opening: Prisma.Decimal | null; balance: Prisma.Decimal;
      lastPaymentAmount: Prisma.Decimal | null; lastPaymentDate: Date | null;
    }>>(Prisma.sql`
      SELECT e.id, e.name, e."lastName", e."documentId",
        totals.opening, COALESCE(totals.balance, 0) AS balance,
        payment.amount AS "lastPaymentAmount", payment.date AS "lastPaymentDate"
      FROM "Employee" e
      LEFT JOIN LATERAL (
        SELECT sum(amount) FILTER (WHERE type = 'OPENING') AS opening,
          sum(CASE WHEN type = 'PAYMENT' THEN -amount ELSE amount END) AS balance
        FROM "EmployeeLoanEntry" WHERE "employeeId" = e.id
      ) totals ON true
      LEFT JOIN LATERAL (
        SELECT amount, date FROM "EmployeeLoanEntry"
        WHERE "employeeId" = e.id AND type = 'PAYMENT'
        ORDER BY date DESC NULLS LAST, "createdAt" DESC, "sourceRow" DESC NULLS LAST, id DESC
        LIMIT 1
      ) payment ON true
      ORDER BY e.name, e."lastName", e.id
    `);
    return rows.map(({ opening, balance, lastPaymentAmount, lastPaymentDate, ...employee }) => ({
      ...employee, opening: opening?.toFixed(2) ?? null, balance: balance.toFixed(2),
      lastPayment: lastPaymentAmount === null ? null : {
        amount: lastPaymentAmount.toFixed(2), date: lastPaymentDate,
      },
    }));
  }
  async get(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: {
      id: true, name: true, lastName: true,
      loanEntries: { orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] },
    } });
    if (!employee) throw new NotFoundException('Empleado no encontrado');
    const { loanEntries, ...person } = employee;
    return { employee: person, entries: loanEntries, ...summarizeLoans(loanEntries) };
  }
  async add(employeeId: string, input: LoanInput, userId: string) {
    const date = new Date(`${input.date}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) throw new BadRequestException('Fecha inválida');
    const amount = new Prisma.Decimal(input.amount);
    if (amount.isNegative() || (amount.isZero() && input.type !== 'OPENING')) throw new BadRequestException('El valor debe ser mayor que cero');
    await this.prisma.$transaction(async tx => {
      const employee = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Employee" WHERE "id" = ${employeeId} FOR UPDATE`);
      if (!employee.length) throw new NotFoundException('Empleado no encontrado');
      const existing = await tx.employeeLoanEntry.findUnique({ where: { employeeId_requestId: { employeeId, requestId: input.requestId } } });
      if (existing) {
        if (existing.type !== input.type || existing.detail !== input.detail.trim() || !existing.amount.equals(amount) || existing.date?.getTime() !== date.getTime()) throw new ConflictException('El movimiento ya fue registrado con otros datos');
        return;
      }
      const opening = await tx.employeeLoanEntry.findFirst({ where: { employeeId, type: 'OPENING' } });
      if (input.type === 'OPENING' && opening) throw new ConflictException('El saldo inicial ya está registrado');
      if (input.type !== 'OPENING' && !opening) throw new BadRequestException('Registra primero el saldo inicial');
      if (opening?.date && date < opening.date) throw new BadRequestException('La fecha no puede ser anterior al saldo inicial');
      await tx.employeeLoanEntry.create({ data: { employeeId, type: input.type, date, detail: input.detail.trim(), amount, requestId: input.requestId, createdById: userId } });
    });
    return this.get(employeeId);
  }
}
