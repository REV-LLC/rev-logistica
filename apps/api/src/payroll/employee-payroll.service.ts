import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeSalary, PayrollReceipt, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { bogotaDate, calculatePayroll, civilDate, moneyAmount, payrollPeriod, payrollPolicy, salaryAmount } from './payroll-policy';
import { PayrollPdfService, REV_PAYROLL_COMPANY } from './payroll-pdf.service';

export type SalaryInput = { effectiveFrom: string; monthlySalary: string; transportAllowance: string; note: string; expectedRevision: number; regime?: 'STANDARD' | 'REVIEW_REQUIRED' };
export type PreviewInput = { from: string; to: string; days: number; observations?: string };
export type ReceiptInput = PreviewInput & { expectedSalaryRevision: number; idempotencyKey: string };
const employeeSelect = { id: true, name: true, lastName: true, documentId: true, role: true, active: true, salaries: { orderBy: { revision: 'desc' as const } } };
type PayrollEmployee = Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>;

@Injectable()
export class EmployeePayrollService {
  constructor(private readonly prisma: PrismaService, private readonly pdf: PayrollPdfService) {}

  private serializeSalary(salary: EmployeeSalary) {
    return { ...salary, effectiveFrom: salary.effectiveFrom.toISOString().slice(0, 10), monthlySalary: salary.monthlySalary.toFixed(2), transportAllowance: salary.transportAllowance.toFixed(2), totalMonthly: salary.monthlySalary.plus(salary.transportAllowance).toFixed(2) };
  }
  private salaryAt(salaries: EmployeeSalary[], date: Date) {
    return salaries.filter(s => s.effectiveFrom <= date).sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || b.revision - a.revision)[0] ?? null;
  }
  private serializeEmployee(employee: PayrollEmployee, date: Date) {
    const { salaries, ...data } = employee;
    const current = this.salaryAt(salaries, date);
    return { ...data, latestRevision: salaries[0]?.revision ?? 0, current: current ? this.serializeSalary(current) : null, history: salaries.map(s => this.serializeSalary(s)) };
  }
  async list(date = bogotaDate()) {
    const asOf = civilDate(date), policy = payrollPolicy(date);
    const employees = await this.prisma.employee.findMany({ orderBy: [{ name: 'asc' }, { lastName: 'asc' }, { id: 'asc' }], select: employeeSelect });
    return { policy, employees: employees.map(e => this.serializeEmployee(e, asOf)) };
  }
  async save(employeeId: string, input: SalaryInput, author: string) {
    const effectiveFrom = civilDate(input.effectiveFrom);
    const monthlySalary = salaryAmount(input.monthlySalary, input.effectiveFrom);
    const transportAllowance = moneyAmount(input.transportAllowance, 'Auxilio de transporte');
    if (!input.note.trim()) throw new BadRequestException('Indica el motivo del cambio o confirmación');
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new BadRequestException('Revisión salarial inválida');
    const regime = input.regime ?? 'STANDARD';
    if (!['STANDARD', 'REVIEW_REQUIRED'].includes(regime)) throw new BadRequestException('Régimen inválido');
    return this.prisma.$transaction(async tx => {
      await this.lockEmployee(tx, employeeId);
      const latest = await tx.employeeSalary.findFirst({ where: { employeeId }, orderBy: { revision: 'desc' } });
      if ((latest?.revision ?? 0) !== input.expectedRevision) throw new ConflictException('Otro usuario modificó el salario. Actualiza antes de guardar.');
      // A closed period cannot be retroactively changed through salary configuration.
      const closed = await tx.payrollReceipt.findFirst({ where: { employeeId, periodTo: { gte: effectiveFrom } }, select: { id: true } });
      if (closed) throw new ConflictException('Hay comprobantes emitidos desde esa fecha. Usa una vigencia posterior al último período emitido.');
      const created = await tx.employeeSalary.create({ data: { employeeId, effectiveFrom, monthlySalary, transportAllowance, revision: (latest?.revision ?? 0) + 1, provisional: false, regime, note: input.note.trim(), createdBy: author } });
      return this.serializeSalary(created);
    });
  }
  private async lockEmployee(tx: Prisma.TransactionClient, employeeId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "Employee" WHERE id = ${employeeId} FOR UPDATE`);
    if (!rows.length) throw new NotFoundException('Empleado no encontrado');
  }
  private buildPreview(employee: PayrollEmployee, input: PreviewInput) {
    const { start, end } = payrollPeriod(input.from, input.to);
    const policy = payrollPolicy(input.from);
    const observations = input.observations?.trim() ?? '';
    if (observations.length > 1000) throw new BadRequestException('Las observaciones no pueden superar 1000 caracteres');
    if (!Number.isInteger(input.days) || input.days < 1 || input.days > 15) throw new BadRequestException('Los días deben ser un entero entre 1 y 15');
    if (input.days !== 15 && !observations) throw new BadRequestException('Indica el motivo de modificar los días liquidados');
    const salary = this.salaryAt(employee.salaries, start);
    const blockingReasons: string[] = [];
    if (!employee.active) blockingReasons.push('El empleado está inactivo; revisar su liquidación de retiro por separado.');
    if (!employee.documentId?.trim()) blockingReasons.push('Registra la cédula del empleado antes de emitir.');
    if (!salary) blockingReasons.push('No hay salario vigente al inicio de la quincena.');
    if (salary?.provisional) blockingReasons.push('Confirma el salario y el auxilio provisionales antes de emitir.');
    if (salary && salary.regime !== 'STANDARD') blockingReasons.push('El régimen requiere revisión; esta versión solo calcula el régimen general de jornada completa.');
    if (salary && salary.monthlySalary.gte(new Prisma.Decimal(policy.minimumMonthlySalary).mul(4))) blockingReasons.push('Requiere revisión de aportes adicionales y retenciones; el cálculo básico no cubre salarios desde 4 SMMLV.');
    if (salary && salary.transportAllowance.gt(0) && salary.monthlySalary.gt(new Prisma.Decimal(policy.minimumMonthlySalary).mul(2))) blockingReasons.push('El auxilio legal de transporte requiere revisar elegibilidad para salarios superiores a 2 SMMLV.');
    if (salary && salary.transportAllowance.gt(policy.transportAllowanceReference)) blockingReasons.push('El auxilio supera la referencia legal; revisar su clasificación e ingreso base de cotización.');
    if (salary && salary.monthlySalary.lt(policy.minimumMonthlySalary)) blockingReasons.push('Salario inferior al mínimo de jornada completa; requiere revisión.');
    if (employee.salaries.some(s => s.effectiveFrom > start && s.effectiveFrom <= end)) blockingReasons.push('Hay un cambio salarial dentro de la quincena. Se requiere liquidación por tramos, fuera del alcance inicial.');
    const amounts = salary ? calculatePayroll(salary.monthlySalary, salary.transportAllowance, input.days) : null;
    return { employeeId: employee.id, from: input.from, to: input.to, days: input.days, observations, expectedSalaryRevision: employee.salaries[0]?.revision ?? 0, salaryRevision: salary?.revision ?? null, salaryId: salary?.id ?? null, provisional: salary?.provisional ?? false, eligible: blockingReasons.length === 0, blockingReasons, policy, ...amounts };
  }
  async preview(employeeId: string, input: PreviewInput) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: employeeSelect });
    if (!employee) throw new NotFoundException('Empleado no encontrado');
    return this.buildPreview(employee, input);
  }
  private serializeReceipt(receipt: PayrollReceipt) {
    return { ...(receipt.snapshot as Prisma.JsonObject), id: receipt.id, createdAt: receipt.createdAt.toISOString(), status: 'ISSUED', paymentStatus: 'NOT_RECORDED' };
  }
  async period(from: string, to: string) {
    const { start, end } = payrollPeriod(from, to);
    const [employees, receipts] = await Promise.all([
      this.prisma.employee.findMany({ orderBy: [{ name: 'asc' }, { lastName: 'asc' }, { id: 'asc' }], select: employeeSelect }),
      this.prisma.payrollReceipt.findMany({ where: { periodFrom: start, periodTo: end }, orderBy: { createdAt: 'desc' } }),
    ]);
    return { policy: payrollPolicy(from), from, to, employees: employees.map(e => ({ ...this.serializeEmployee(e, start), preview: this.buildPreview(e, { from, to, days: 15 }), receipts: receipts.filter(r => r.employeeId === e.id).map(r => this.serializeReceipt(r)) })) };
  }
  async receipts(employeeId: string, from?: string, to?: string) {
    if (!(await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } }))) throw new NotFoundException('Empleado no encontrado');
    if (Boolean(from) !== Boolean(to)) throw new BadRequestException('Indica ambas fechas del período');
    const period = from && to ? payrollPeriod(from, to) : null;
    const receipts = await this.prisma.payrollReceipt.findMany({ where: { employeeId, ...(period ? { periodFrom: period.start, periodTo: period.end } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 });
    return receipts.map(r => this.serializeReceipt(r));
  }
  async issue(employeeId: string, input: ReceiptInput, author: string) {
    payrollPeriod(input.from, input.to);
    const canonical = { employeeId, from: input.from, to: input.to, days: input.days, observations: input.observations?.trim() ?? '', expectedSalaryRevision: input.expectedSalaryRevision };
    const requestHash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
    try {
      return await this.prisma.$transaction(async tx => {
        await this.lockEmployee(tx, employeeId);
        const existing = await tx.payrollReceipt.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (existing) {
          if (existing.requestHash !== requestHash || existing.employeeId !== employeeId) throw new ConflictException('La clave de emisión ya se utilizó con otros datos.');
          return this.serializeReceipt(existing);
        }
        const employee = await tx.employee.findUniqueOrThrow({ where: { id: employeeId }, select: employeeSelect });
        const preview = this.buildPreview(employee, input);
        if (preview.expectedSalaryRevision !== input.expectedSalaryRevision) throw new ConflictException('El salario cambió. Actualiza la previsualización antes de emitir.');
        if (!preview.eligible || !preview.salaryId) throw new BadRequestException(preview.blockingReasons.join(' '));
        const previous = await tx.payrollReceipt.findUnique({ where: { employeeId_periodFrom_periodTo: { employeeId, periodFrom: civilDate(input.from), periodTo: civilDate(input.to) } } });
        if (previous) throw new ConflictException('Ya existe un comprobante emitido para esta quincena. Descarga el existente.');
        const snapshot = { ...preview, employee: { id: employee.id, name: employee.name, lastName: employee.lastName, documentId: employee.documentId, role: employee.role }, company: REV_PAYROLL_COMPANY, status: 'ISSUED', paymentStatus: 'NOT_RECORDED', issuedBy: author };
        const created = await tx.payrollReceipt.create({ data: { employeeId, salaryId: preview.salaryId, periodFrom: civilDate(input.from), periodTo: civilDate(input.to), days: input.days, idempotencyKey: input.idempotencyKey, requestHash, snapshot: snapshot as unknown as Prisma.InputJsonValue, issuedBy: author } });
        return this.serializeReceipt(created);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Ya se emitió el comprobante o se utilizó la clave de emisión. Actualiza y descarga el existente.');
      throw error;
    }
  }
  async receiptPdf(receiptId: string) {
    const receipt = await this.prisma.payrollReceipt.findUnique({ where: { id: receiptId } });
    if (!receipt) throw new NotFoundException('Comprobante no encontrado');
    return this.pdf.render(this.serializeReceipt(receipt));
  }
}
