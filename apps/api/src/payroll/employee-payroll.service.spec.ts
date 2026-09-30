import { Prisma } from '@prisma/client';
import { EmployeePayrollService } from './employee-payroll.service';
function setup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'employee' }]),
    employeeSalary: {
      findFirst: jest.fn().mockResolvedValue({ revision: 2 }),
      create: jest.fn().mockImplementation(async ({ data }) => data),
    },
  };
  const prisma = { employee: { findMany: jest.fn() }, $transaction: jest.fn(async fn => fn(tx)) };
  return { tx, prisma, service: new EmployeePayrollService(prisma as never) };
}
const input = { effectiveFrom: '2026-09-16', monthlySalary: '2000000.00', note: 'Ajuste acordado', expectedRevision: 2 };
describe('employee salary history', () => {
  it('appends an audited revision without overwriting history', async () => {
    const { service, tx } = setup();
    const result = await service.save('employee', input, 'author');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ revision: 3, createdBy: 'author', note: input.note });
    expect(result.monthlySalary.toFixed(2)).toBe('2000000.00');
  });
  it('rejects stale edits after locking the employee', async () => {
    const { service, tx } = setup();
    await expect(service.save('employee', { ...input, expectedRevision: 1 }, 'author')).rejects.toThrow('Otro usuario');
    expect(tx.employeeSalary.create).not.toHaveBeenCalled();
  });
  it('rejects missing employees and dates before startup', async () => {
    const { service, tx } = setup(); tx.$queryRaw.mockResolvedValue([]);
    await expect(service.save('employee', input, 'author')).rejects.toThrow('Empleado no encontrado');
    await expect(service.save('employee', { ...input, effectiveFrom: '2026-09-15' }, 'author')).rejects.toThrow('configuración inicial');
  });
  it('selects by effective date then revision, excluding scheduled future salaries', async () => {
    const { service, prisma } = setup();
    const row = (revision: number, date: string, salary: string) => ({ revision, effectiveFrom: new Date(date), monthlySalary: new Prisma.Decimal(salary) });
    prisma.employee.findMany.mockResolvedValue([{ id: 'employee', salaries: [
      row(4, '2026-09-16', '1900000'), row(3, '2026-10-01', '2500000'),
      row(2, '2026-09-20', '2000000'), row(1, '2026-09-16', '1750905'),
    ] }]);
    const result = await service.list('2026-09-26');
    expect(result.employees[0].latestRevision).toBe(4);
    expect(result.employees[0].current?.monthlySalary).toBe('2000000.00');
    expect((await service.list('2026-09-16')).employees[0].current?.monthlySalary).toBe('1900000.00');
    expect((await service.list('2026-09-01')).employees[0].current).toBeNull();
  });
});
