import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EmployeePayrollService } from './employee-payroll.service';
import { PayrollAccessGuard } from './employee-payroll.controller';

const input = { from: '2026-10-01', to: '2026-10-15', days: 15 };
const salary = { id: 'salary-1', employeeId: 'employee-1', effectiveFrom: new Date('2026-10-01T00:00:00Z'), monthlySalary: new Prisma.Decimal('1750905'), transportAllowance: new Prisma.Decimal('249095'), revision: 1, provisional: false, regime: 'STANDARD', note: 'Confirmed', createdBy: 'office-1', createdAt: new Date() };
const employee = { id: 'employee-1', name: 'QA', lastName: 'SYNTHETIC', role: 'OFFICE', documentId: 'QA-ID', active: true, salaries: [salary] };
function setup(overrides = {}) {
  const actual = { ...employee, ...overrides };
  const tx = { $queryRaw: jest.fn().mockResolvedValue([{ id: employee.id }]), employee: { findUnique: jest.fn().mockResolvedValue(actual), findUniqueOrThrow: jest.fn().mockResolvedValue(actual) }, employeeSalary: { findFirst: jest.fn().mockResolvedValue(salary), create: jest.fn() }, payrollReceipt: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(({ data }) => ({ ...data, id: 'receipt-1', createdAt: new Date('2026-10-16T12:00:00Z') })) } };
  const prisma = { ...tx, $transaction: jest.fn().mockImplementation(fn => fn(tx)) };
  const pdf = { render: jest.fn() };
  return { tx, prisma, pdf, service: new EmployeePayrollService(prisma as never, pdf as never) };
}
describe('payroll history and issuance', () => {
  it('uses the salary effective at period start and blocks intra-period changes', async () => {
    const { service } = setup({ salaries: [{ ...salary, id: 'salary-2', effectiveFrom: new Date('2026-10-10T00:00:00Z'), revision: 2, monthlySalary: new Prisma.Decimal('2000000') }, salary] });
    const preview = await service.preview(employee.id, input);
    expect(preview.monthlySalary).toBe('1750905.00');
    expect(preview.expectedSalaryRevision).toBe(2);
    expect(preview.eligible).toBe(false);
    expect(preview.blockingReasons.join(' ')).toMatch(/tramos/);
  });
  it('exposes provisional preview but rejects issuance until salary is confirmed', async () => {
    const { service, tx } = setup({ salaries: [{ ...salary, provisional: true }] });
    expect((await service.preview(employee.id, input)).provisional).toBe(true);
    await expect(service.issue(employee.id, { ...input, expectedSalaryRevision: 1, idempotencyKey: 'key' }, 'office')).rejects.toThrow(BadRequestException);
    expect(tx.payrollReceipt.create).not.toHaveBeenCalled();
  });
  it.each([
    { salaries: [{ ...salary, regime: 'REVIEW_REQUIRED' }] },
    { salaries: [{ ...salary, monthlySalary: new Prisma.Decimal('7003620'), transportAllowance: new Prisma.Decimal('0') }] },
    { salaries: [{ ...salary, monthlySalary: new Prisma.Decimal('4000000') }] },
    { documentId: null }, { active: false }, { salaries: [] },
  ])('blocks unsupported or incomplete configuration %j', async overrides => {
    expect((await setup(overrides).service.preview(employee.id, input)).eligible).toBe(false);
  });
  it('requires an explanation for modified payable days', async () => {
    const { service } = setup();
    await expect(service.preview(employee.id, { ...input, days: 10 })).rejects.toThrow(/motivo/);
    expect((await service.preview(employee.id, { ...input, days: 10, observations: 'Ingreso durante el período' })).days).toBe(10);
  });
  it('detects stale salary edits and stale issuance before writes', async () => {
    const { service, tx } = setup();
    await expect(service.save(employee.id, { effectiveFrom: '2026-10-01', monthlySalary: '1750905', transportAllowance: '249095', note: 'Confirmación', expectedRevision: 0 }, 'office')).rejects.toThrow(ConflictException);
    await expect(service.issue(employee.id, { ...input, expectedSalaryRevision: 2, idempotencyKey: 'key' }, 'office')).rejects.toThrow(ConflictException);
    expect(tx.employeeSalary.create).not.toHaveBeenCalled();
    expect(tx.payrollReceipt.create).not.toHaveBeenCalled();
  });
  it('does not allow retroactive salary edits across a closed receipt', async () => {
    const { service, tx } = setup(); tx.payrollReceipt.findFirst.mockResolvedValue({ id: 'closed' } as never);
    await expect(service.save(employee.id, { effectiveFrom: '2026-10-01', monthlySalary: '1750905', transportAllowance: '249095', note: 'Cambio', expectedRevision: 1 }, 'office')).rejects.toThrow(/emitidos/);
  });
  it('returns the original snapshot for idempotent retry even after employee or salary changes', async () => {
    const { service, tx } = setup();
    const command = { ...input, expectedSalaryRevision: 1, idempotencyKey: 'key' };
    const first = await service.issue(employee.id, command, 'office');
    const saved = tx.payrollReceipt.create.mock.results[0].value;
    tx.payrollReceipt.findUnique.mockResolvedValue(saved);
    tx.employee.findUniqueOrThrow.mockResolvedValue({ ...employee, name: 'CHANGED', salaries: [] });
    const retry = await service.issue(employee.id, command, 'office');
    expect(retry).toEqual(first);
    expect(tx.payrollReceipt.create).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ status: 'ISSUED', paymentStatus: 'NOT_RECORDED', netPay: '929965', employee: { name: 'QA' } });
    await expect(service.issue(employee.id, { ...command, days: 10, observations: 'Changed' }, 'office')).rejects.toThrow(ConflictException);
  });
  it('rejects a second receipt for the same period instead of replacing the historical one', async () => {
    const { service, tx } = setup(); tx.payrollReceipt.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'other' } as never);
    await expect(service.issue(employee.id, { ...input, expectedSalaryRevision: 1, idempotencyKey: 'new-key' }, 'office')).rejects.toThrow(/Ya existe/);
    expect(tx.payrollReceipt.create).not.toHaveBeenCalled();
  });
});
describe('current payroll authorization', () => {
  it.each([{ active: false, role: 'OFFICE' }, { active: true, role: 'DRIVER' }, { active: true, role: 'WAREHOUSE_TABLET' }, { active: true, role: 'OPERATOR' }])('rejects current account state %j, even with an old privileged token', async user => {
    const guard = new PayrollAccessGuard({ user: { findUnique: jest.fn().mockResolvedValue(user) } } as never);
    const context = { switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'id' } }) }) };
    await expect(guard.canActivate(context as never)).rejects.toThrow(/permiso vigente/);
  });
  it.each(['ADMIN', 'OFFICE'])('permits active %s', async role => {
    const guard = new PayrollAccessGuard({ user: { findUnique: jest.fn().mockResolvedValue({ active: true, role }) } } as never);
    const context = { switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'id' } }) }) };
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });
});
