import { colombiaDay, dailyEmployeeEvents } from './attendance-dashboard';
import { AttendanceService } from './attendance.service';
import { Role } from '@prisma/client';

jest.mock('../whatsapp-reports/attendance-journals.service', () => ({ syncAttendanceActivity: jest.fn() }));

describe('dashboard attendance', () => {
  it.each([Role.ADMIN, Role.OFFICE])('allows %s to read all active employees without a history limit', async role => {
    const db = {
      user: { findUnique: jest.fn().mockResolvedValue({ active: true, role }) },
      employee: { findMany: jest.fn().mockResolvedValue([{ id: 'a', name: 'Ana', lastName: 'Díaz' }]) },
      worksiteAttendance: { findMany: jest.fn(async (_query: unknown) => []) },
    };
    const service = new AttendanceService(db as never, {} as never, {} as never, {} as never);
    const result = await service.dashboard({ sub: 'user', role });
    expect(result.employees[0]).toMatchObject({ id: 'a', entry: null, exit: null });
    expect(db.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { active: true } }));
    expect(db.worksiteAttendance.findMany.mock.calls[0][0]).not.toHaveProperty('take');
  });
  it('rejects a driver before reading employee attendance', async () => {
    const db = { user: { findUnique: jest.fn().mockResolvedValue({ active: true, role: Role.DRIVER }) }, employee: { findMany: jest.fn() } };
    const service = new AttendanceService(db as never, {} as never, {} as never, {} as never);
    await expect(service.dashboard({ sub: 'user', role: Role.DRIVER })).rejects.toThrow();
    expect(db.employee.findMany).not.toHaveBeenCalled();
  });
  it('uses Colombian midnight rather than UTC and an exclusive end', () => {
    const day = colombiaDay(new Date('2026-11-18T04:59:59Z'));
    expect(day.date).toBe('2026-11-17');
    expect(day.start.toISOString()).toBe('2026-11-17T05:00:00.000Z');
    expect(day.end.toISOString()).toBe('2026-11-18T05:00:00.000Z');
  });
  it('includes an overnight departure without marking an entry today', () => {
    const { start, end } = colombiaDay(new Date('2026-11-17T15:00:00Z'));
    const result = dailyEmployeeEvents([{ employeeId: 'a', enteredAt: new Date('2026-11-17T04:00:00Z'), leftAt: start, punches: [] }], start, end);
    expect(result.get('a')?.entry).toBeNull();
    expect(result.get('a')?.exit?.status).toBe('VERIFIED');
    expect(dailyEmployeeEvents([{ employeeId: 'b', enteredAt: end, leftAt: null, punches: [] }], start, end).get('b')?.entry).toBeNull();
  });
  it('preserves pending/rejected states and prioritizes a confirmed registration', () => {
    const { start, end } = colombiaDay(new Date('2026-11-17T15:00:00Z'));
    const make = (status: string, hour: number) => ({ employeeId: 'a', enteredAt: new Date(`2026-11-17T${hour}:00:00Z`), leftAt: null, punches: [{ kind: 'CHECK_IN', status, occurredAt: start }] });
    expect(dailyEmployeeEvents([make('PENDING', 12)], start, end).get('a')?.entry?.status).toBe('PENDING');
    expect(dailyEmployeeEvents([make('REJECTED', 12)], start, end).get('a')?.entry?.status).toBe('REJECTED');
    expect(dailyEmployeeEvents([make('VERIFIED', 12), make('PENDING', 13)], start, end).get('a')?.entry?.status).toBe('VERIFIED');
  });
});
