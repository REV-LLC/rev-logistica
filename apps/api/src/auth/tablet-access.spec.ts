import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  assertTabletWarehouse,
  resolveTabletDocumentAccess,
  tabletPinLookup,
  tabletTokenHash,
} from './tablet-access';

describe('warehouse tablet document authorization', () => {
  const make = () => {
    const grant = {
      id: 'grant',
      userId: 'tablet',
      warehouseId: 'warehouse',
      employeeId: 'employee',
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        active: true,
        role: 'WAREHOUSE_TABLET',
        warehouseId: 'warehouse',
        warehouse: { active: true },
      },
      employee: {
        active: true,
        name: 'Ana',
        lastName: 'Pérez',
        tabletPin: { employeeId: 'employee' },
      },
      document: null as { id: string } | null,
    };
    const prisma = {
      tabletDocumentAuthorization: {
        findUnique: jest.fn().mockResolvedValue(grant),
      },
    };
    return { grant, prisma };
  };
  it('rejects a missing PIN authorization before querying or creating a document', async () => {
    const { prisma } = make();
    await expect(
      resolveTabletDocumentAccess(prisma as never, 'tablet'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      prisma.tabletDocumentAuthorization.findUnique,
    ).not.toHaveBeenCalled();
  });
  it('derives the employee and warehouse from the server authorization', async () => {
    const { prisma } = make();
    await expect(
      resolveTabletDocumentAccess(prisma as never, 'tablet', 'token'),
    ).resolves.toEqual({
      warehouseId: 'warehouse',
      performedByEmployeeId: 'employee',
      performedByEmployeeName: 'Ana Pérez',
      tabletAuthorizationId: 'grant',
    });
    expect(prisma.tabletDocumentAuthorization.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenHash: tabletTokenHash('token') },
      }),
    );
  });
  it.each([
    'foreign-account',
    'expired',
    'inactive-employee',
    'inactive-account',
    'changed-warehouse',
    'disabled-pin',
  ])('rejects %s', async (reason) => {
    const { grant, prisma } = make();
    if (reason === 'expired') grant.expiresAt = new Date(0);
    if (reason === 'inactive-employee') grant.employee.active = false;
    if (reason === 'inactive-account') grant.user.active = false;
    if (reason === 'changed-warehouse') grant.user.warehouseId = 'other';
    if (reason === 'disabled-pin') grant.employee.tabletPin = null as never;
    await expect(
      resolveTabletDocumentAccess(
        prisma as never,
        reason === 'foreign-account' ? 'other' : 'tablet',
        'token',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('allows editing only the bound document, never another document or a new one', async () => {
    const { grant, prisma } = make();
    grant.document = { id: 'doc' };
    await expect(
      resolveTabletDocumentAccess(prisma as never, 'tablet', 'token', 'doc'),
    ).resolves.toBeDefined();
    await expect(
      resolveTabletDocumentAccess(prisma as never, 'tablet', 'token', 'other'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      resolveTabletDocumentAccess(prisma as never, 'tablet', 'token'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects a warehouse override', () => {
    expect(() => assertTabletWarehouse('assigned', 'other')).toThrow(
      BadRequestException,
    );
    expect(() => assertTabletWarehouse('assigned', 'assigned')).not.toThrow();
  });
  it('keys PIN lookups without exposing the PIN', () => {
    expect(tabletPinLookup('0042')).toHaveLength(64);
    expect(tabletPinLookup('0042')).not.toEqual(tabletTokenHash('0042'));
  });
});
