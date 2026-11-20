import { AttendanceJournalsService } from './attendance-journals.service';

describe('Attendance employee profile metadata', () => {
  it('includes PWA GPS evidence without filtering verified or approved punches or exposing private selfie keys', async () => {
    const punches = [
      {
        id: 'entry',
        kind: 'CHECK_IN',
        status: 'VERIFIED',
        latitude: 3.43,
        longitude: -76.53,
      },
      {
        id: 'exit',
        kind: 'CHECK_OUT',
        status: 'APPROVED',
        latitude: 3.49,
        longitude: -76.5,
      },
    ];
    const prisma = {
      worksiteAttendance: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 'journey',
              enteredAt: new Date('2026-11-18T12:00:00Z'),
              leftAt: new Date('2026-11-18T20:00:00Z'),
              activityNote: null,
              punches,
            },
          ]),
      },
    };
    const result = await new AttendanceJournalsService(
      prisma as never,
    ).journals('employee', '2026-11-18', '2026-11-18');
    expect(result.journals[0].punches).toEqual(punches);
    const query =
      prisma.worksiteAttendance.findMany.mock.calls[0][0].include.punches;
    expect(query).not.toHaveProperty('where');
    expect(query.select).toEqual({
      id: true,
      kind: true,
      status: true,
      occurredAt: true,
      latitude: true,
      longitude: true,
      accuracyMeters: true,
    });
  });
  it('returns reviewed hours and the last correction author without exposing account secrets', async () => {
    const lastCorrection = {
      userId: 'office',
      createdAt: new Date('2026-11-18T23:00:00Z'),
    };
    const prisma = {
      worksiteAttendance: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'journey',
            enteredAt: new Date('2026-11-18T12:00:00Z'),
            leftAt: new Date('2026-11-18T20:00:00Z'),
            activityNote: {
              id: 'note',
              verifiedEnteredAt: new Date('2026-11-18T13:00:00Z'),
              verifiedLeftAt: new Date('2026-11-18T22:00:00Z'),
              reviews: [lastCorrection],
            },
          },
        ]),
      },
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'office', employee: { name: 'ANA', lastName: 'PRUEBA' } },
          ]),
      },
    };
    const result = await new AttendanceJournalsService(
      prisma as never,
    ).journals('employee', '2026-11-18', '2026-11-18');
    expect(result.journals[0].activityNote).toMatchObject({
      verifiedEnteredAt: new Date('2026-11-18T13:00:00Z'),
      lastCorrection: {
        userId: 'office',
        name: 'ANA PRUEBA',
        at: lastCorrection.createdAt,
      },
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['office'] } },
      select: {
        id: true,
        employee: { select: { name: true, lastName: true } },
      },
    });
    expect(result.journals[0].activityNote).not.toHaveProperty('reviews');
  });
  it('returns job and account role separately without exposing the account object', async () => {
    const service = new AttendanceJournalsService({
      employee: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'operator',
            name: 'Operario',
            lastName: 'QA',
            active: true,
            role: 'HEAVY_MACHINERY_OPERATOR',
            user: null,
          },
          {
            id: 'admin',
            name: 'Administrador',
            lastName: 'QA',
            active: true,
            role: 'MACHINIST',
            user: { role: 'ADMIN' },
          },
        ]),
      },
      worksiteAttendance: { findMany: jest.fn().mockResolvedValue([]) },
    } as never);
    const result = await service.employees('2026-11-13', '2026-11-13');
    expect(result.employees[0]).toMatchObject({
      role: 'HEAVY_MACHINERY_OPERATOR',
      accountRole: null,
    });
    expect(result.employees[1]).toMatchObject({
      role: 'MACHINIST',
      accountRole: 'ADMIN',
    });
    expect(result.employees.every((e) => !('user' in e))).toBe(true);
  });
});
