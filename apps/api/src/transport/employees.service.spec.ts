import { EmployeesService } from './employees.service';

describe('employee management without a salary module', () => {
  function setup() {
    const employee = { id: 'employee-1', name: 'QA', lastName: 'EMPLOYEE' };
    const tx = {
      employee: { create: jest.fn().mockResolvedValue(employee), delete: jest.fn().mockResolvedValue(employee) },
      employeeVehicle: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma = { $transaction: jest.fn().mockImplementation(callback => callback(tx)) };
    return { employee, tx, service: new EmployeesService(prisma as never) };
  }

  it('creates an employee using only the existing employee catalog', async () => {
    const { employee, tx, service } = setup();
    await expect(service.createEmployee({ name: 'QA', lastName: 'EMPLOYEE', role: 'OFFICE' })).resolves.toEqual(employee);
    expect(tx.employee.create).toHaveBeenCalledTimes(1);
    expect(tx.employee.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: 'QA', lastName: 'EMPLOYEE', userId: null }) });
  });

  it('keeps the existing vehicle cleanup and employee deletion without querying removed tables', async () => {
    const { tx, service } = setup();
    await expect(service.deleteEmployee('employee-1')).resolves.toEqual({ deleted: true });
    expect(tx.employeeVehicle.deleteMany).toHaveBeenCalledWith({ where: { employeeId: 'employee-1' } });
    expect(tx.employee.delete).toHaveBeenCalledWith({ where: { id: 'employee-1' } });
  });
});
