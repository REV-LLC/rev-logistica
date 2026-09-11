import { ForbiddenException, HttpException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TabletService } from './tablet.service';

describe('TabletService PIN identification', () => {
  const setup = async () => {
    const user = {
      active: true,
      role: 'WAREHOUSE_TABLET',
      warehouse: { id: 'warehouse', active: true },
      pinWindowEndsAt: null as Date | null,
      pinAttempts: 0,
    };
    const employee = {
      id: 'employee',
      name: 'Ana',
      lastName: 'Pérez',
      active: true,
    };
    const credential = { employee, pinHash: await bcrypt.hash('0042', 4) };
    const prisma = {
      $queryRaw: jest.fn(),
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        update: jest.fn(),
      },
      employeeTabletPin: {
        findUnique: jest.fn().mockResolvedValue(credential),
      },
      tabletDocumentAuthorization: { create: jest.fn(), update: jest.fn() },
      document: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((work: (tx: unknown) => unknown) =>
      work(prisma),
    );
    return {
      user,
      employee,
      prisma,
      service: new TabletService(prisma as never),
    };
  };
  it('identifies a leading-zero PIN and returns no PIN or stored hashes', async () => {
    const { service, prisma } = await setup();
    const result = await service.verifyPin('tablet', '0042');
    expect(result.employee).toEqual({ id: 'employee', name: 'Ana Pérez' });
    expect(result.token).toHaveLength(64);
    expect(
      prisma.tabletDocumentAuthorization.create.mock.calls[0][0].data.tokenHash,
    ).not.toBe(result.token);
    expect(JSON.stringify(result)).not.toContain('pinHash');
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
  it('does not issue authorization for an incorrect PIN', async () => {
    const { service, prisma } = await setup();
    await expect(service.verifyPin('tablet', '1234')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.tabletDocumentAuthorization.create).not.toHaveBeenCalled();
  });
  it('blocks the sixth attempt before checking credentials', async () => {
    const { service, prisma, user } = await setup();
    user.pinAttempts = 5;
    user.pinWindowEndsAt = new Date(Date.now() + 60_000);
    await expect(service.verifyPin('tablet', '0042')).rejects.toMatchObject({
      status: 429,
    } as Partial<HttpException>);
    expect(prisma.employeeTabletPin.findUnique).not.toHaveBeenCalled();
  });
  it('allows a new attempt after the lock window expires', async () => {
    const { service, user } = await setup();
    user.pinAttempts = 5;
    user.pinWindowEndsAt = new Date(0);
    await expect(service.verifyPin('tablet', '0042')).resolves.toHaveProperty(
      'token',
    );
  });
  it('rejects an inactive employee', async () => {
    const { service, employee, prisma } = await setup();
    employee.active = false;
    await expect(service.verifyPin('tablet', '0042')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.tabletDocumentAuthorization.create).not.toHaveBeenCalled();
  });
  it('prevents taking over another employee’s draft', async () => {
    const { service, prisma } = await setup();
    prisma.document.findUnique.mockResolvedValue({
      createdBy: 'tablet',
      status: 'IN_PROGRESS',
      warehouseId: 'warehouse',
      performedByEmployeeId: 'other',
      tabletAuthorizationId: 'grant',
    });
    await expect(
      service.verifyPin('tablet', '0042', 'doc'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tabletDocumentAuthorization.update).not.toHaveBeenCalled();
  });
  it('renews only the same employee’s in-progress document', async () => {
    const { service, prisma } = await setup();
    prisma.document.findUnique.mockResolvedValue({
      createdBy: 'tablet',
      status: 'IN_PROGRESS',
      warehouseId: 'warehouse',
      performedByEmployeeId: 'employee',
      tabletAuthorizationId: 'grant',
    });
    await expect(
      service.verifyPin('tablet', '0042', 'doc'),
    ).resolves.toHaveProperty('token');
    expect(prisma.tabletDocumentAuthorization.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'grant' } }),
    );
    expect(prisma.tabletDocumentAuthorization.create).not.toHaveBeenCalled();
  });
});
