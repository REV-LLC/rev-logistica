import { AttendanceJournalsService } from './attendance-journals.service';

describe('Attendance employee profile metadata', () => {
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
