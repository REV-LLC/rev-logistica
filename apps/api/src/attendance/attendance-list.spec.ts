import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AttendanceService } from './attendance.service';

describe('Attendance punch type filtering', () => {
  const actor = { sub: 'office', role: Role.OFFICE };
  function fixture() {
    const db = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: actor.sub, active: true, role: actor.role }),
      },
      attendancePunch: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AttendanceService(
      db as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { db, service };
  }
  it.each(['CHECK_IN', 'CHECK_OUT'])(
    'applies %s before pagination and preserves the status filter',
    async (kind) => {
      const { db, service } = fixture();
      await service.list(actor, 'cursor', 'PENDING', kind);
      expect(db.attendancePunch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { kind, status: 'PENDING' },
          take: 50,
          cursor: { id: 'cursor' },
          skip: 1,
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        }),
      );
    },
  );
  it('rejects an unsupported type without querying punches', async () => {
    const { db, service } = fixture();
    await expect(
      service.list(actor, undefined, undefined, 'ALL'),
    ).rejects.toThrow(BadRequestException);
    expect(db.attendancePunch.findMany).not.toHaveBeenCalled();
  });
  it('keeps the existing active Admin/Office permission boundary', async () => {
    const { db, service } = fixture();
    db.user.findUnique.mockResolvedValueOnce({
      id: actor.sub,
      active: true,
      role: Role.DRIVER,
    });
    await expect(
      service.list(
        { sub: actor.sub, role: Role.DRIVER },
        undefined,
        undefined,
        'CHECK_IN',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(db.attendancePunch.findMany).not.toHaveBeenCalled();
  });
});
