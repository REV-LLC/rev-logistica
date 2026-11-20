import {
  attendanceTiming,
  attendanceOverlaps,
  attendanceRangeCandidates,
} from './attendance-timing';
import {
  AttendanceJournalsService,
  attendancePeriod,
} from './attendance-journals.service';

const source = () => ({
  id: 'journal',
  employeeId: 'employee',
  enteredAt: new Date('2026-11-14T12:00:00Z'),
  leftAt: new Date('2026-11-17T21:00:00Z'),
  checkOutReportId: 'exit',
  checkInReport: null,
  checkOutReport: null,
  customerWorksite: { worksite: { name: 'COLEGIO' } },
  activityNote: {
    reviewStatus: 'CORRECTED',
    verifiedEnteredAt: new Date('2026-11-14T12:00:00Z'),
    verifiedLeftAt: new Date('2026-11-14T21:00:00Z'),
    sourceInvalidatedAt: null,
    reviewedSourceExitId: 'exit',
  },
});

describe('Effective attendance times after office corrections', () => {
  it('uses the corrected day and 9 hours instead of the original 81, without mutating evidence', () => {
    const original = source();
    const result = attendanceTiming(original);
    expect(result).toMatchObject({
      enteredAt: original.enteredAt,
      leftAt: new Date('2026-11-14T21:00:00Z'),
      hours: 9,
      corrected: true,
    });
    expect(original.leftAt.toISOString()).toBe('2026-11-17T21:00:00.000Z');
    expect(
      attendanceOverlaps(
        original,
        attendancePeriod('2026-11-14', '2026-11-14'),
      ),
    ).toBe(true);
    expect(
      attendanceOverlaps(
        original,
        attendancePeriod('2026-11-17', '2026-11-17'),
      ),
    ).toBe(false);
  });
  it.each(['SUGGESTED', 'DISMISSED'])(
    'ignores unaccepted dates in %s notes',
    (status) => {
      const row = source();
      row.activityNote.reviewStatus = status;
      expect(attendanceTiming(row)).toMatchObject({
        leftAt: row.leftAt,
        hours: 81,
        corrected: false,
      });
    },
  );
  it('ignores stale corrections after the source exit changes or evidence is invalidated', () => {
    const row = source();
    row.checkOutReportId = 'new-exit';
    expect(attendanceTiming(row).corrected).toBe(false);
    const invalid = { ...source(), checkInReport: { deletedAt: new Date() } };
    expect(attendanceTiming(invalid).corrected).toBe(false);
  });
  it('includes reviewed candidates even when the original dates are outside the selected period', () => {
    const where = attendanceRangeCandidates(
      attendancePeriod('2026-11-14', '2026-11-14'),
    );
    expect(where.OR).toHaveLength(2);
    expect(where.OR?.[1]).toHaveProperty('activityNote.is.verifiedEnteredAt');
  });
  it('recalculates employee totals and does not flag a healthy open jornada as pending review', async () => {
    const open = {
      ...source(),
      id: 'open',
      enteredAt: new Date('2026-11-20T12:00:00Z'),
      leftAt: null,
      checkOutReportId: null,
      activityNote: null,
    };
    const prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([{ id: 'employee', user: null }]),
      },
      worksiteAttendance: {
        findMany: jest.fn().mockResolvedValue([open, source()]),
      },
    };
    const service = new AttendanceJournalsService(prisma as never);
    const result = await service.employees('2026-11-01', '2026-11-30');
    expect(result.employees[0]).toMatchObject({
      journeys: 2,
      open: 1,
      pendingReview: 0,
      reportedHours: 9,
    });
    const singleDay = await service.employees('2026-11-17', '2026-11-17');
    expect(singleDay.employees[0]).toMatchObject({
      journeys: 0,
      reportedHours: 0,
    });
  });
  it('returns effective fields while retaining original dates and filters moved journals out of the period', async () => {
    const prisma = {
      worksiteAttendance: { findMany: jest.fn().mockResolvedValue([source()]) },
    };
    const service = new AttendanceJournalsService(prisma as never);
    const result = await service.journals(
      'employee',
      '2026-11-14',
      '2026-11-14',
    );
    expect(result.journals[0]).toMatchObject({
      leftAt: source().leftAt,
      effective: {
        hours: 9,
        leftAt: source().activityNote.verifiedLeftAt,
        corrected: true,
      },
    });
    expect(
      (await service.journals('employee', '2026-11-17', '2026-11-17')).journals,
    ).toEqual([]);
  });
  it('fills pagination past candidates that no longer overlap after correction', async () => {
    const outside = Array.from({ length: 21 }, (_, i) => ({
      ...source(),
      id: `outside-${i}`,
    }));
    const inside = { ...source(), id: 'inside', activityNote: null };
    const prisma = {
      worksiteAttendance: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(outside)
          .mockResolvedValueOnce([inside]),
      },
    };
    const result = await new AttendanceJournalsService(
      prisma as never,
    ).journals('employee', '2026-11-17', '2026-11-17');
    expect(result.journals.map((row) => row.id)).toEqual(['inside']);
    expect(prisma.worksiteAttendance.findMany.mock.calls[1][0].cursor).toEqual({
      id: 'outside-20',
    });
  });
});
