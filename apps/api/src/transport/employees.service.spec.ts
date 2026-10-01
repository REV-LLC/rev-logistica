import { EmployeesService } from './employees.service';

describe('employee management with provisional salary history', () => {
  function setup() {
    const employee = { id: 'employee-1', name: 'QA', lastName: 'EMPLOYEE' };
    const tx = { employee: { create: jest.fn().mockResolvedValue(employee), delete: jest.fn().mockResolvedValue(employee) }, employeeSalary: { create: jest.fn(), count: jest.fn().mockResolvedValue(0) }, employeeVehicle: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    const prisma = { $transaction: jest.fn().mockImplementation(callback => callback(tx)) };
    return { employee, tx, service: new EmployeesService(prisma as never) };
  }
  afterEach(() => jest.useRealTimers());
  it('creates one provisional salary linked to employee rather than a separate user salary', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-01T12:00:00Z'));
    const { employee, tx, service } = setup();
    await expect(service.createEmployee({ name: 'QA', lastName: 'EMPLOYEE', role: 'OFFICE' })).resolves.toEqual(employee);
    expect(tx.employeeSalary.create).toHaveBeenCalledWith({ data: expect.objectContaining({ employeeId: employee.id, revision: 1, provisional: true, monthlySalary: '1750905.00', transportAllowance: '249095.00' }) });
  });
  it('does not invent an automatic wage for an unconfigured year', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-01-02T12:00:00Z'));
    const { tx, service } = setup();
    await service.createEmployee({ name: 'QA', lastName: 'EMPLOYEE', role: 'OFFICE' });
    expect(tx.employeeSalary.create).not.toHaveBeenCalled();
  });
  it('protects historical salary records and leaves deactivation available', async () => {
    const { tx, service } = setup(); tx.employeeSalary.count.mockResolvedValue(1);
    await expect(service.deleteEmployee('employee-1')).rejects.toThrow(/Desactívalo/);
    expect(tx.employee.delete).not.toHaveBeenCalled();
    expect(tx.employeeVehicle.deleteMany).not.toHaveBeenCalled();
  });
  it('retains existing deletion for employees without salary history', async () => {
    const { tx, service } = setup();
    await expect(service.deleteEmployee('employee-1')).resolves.toEqual({ deleted: true });
    expect(tx.employeeVehicle.deleteMany).toHaveBeenCalledWith({ where: { employeeId: 'employee-1' } });
  });
});
