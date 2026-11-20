import { Prisma } from '@prisma/client';

type AttendanceTimingSource = {
  enteredAt: Date;
  leftAt: Date | null;
  checkOutReportId?: string | null;
  checkInReport?: { deletedAt?: Date | null } | null;
  checkOutReport?: { deletedAt?: Date | null } | null;
  activityNote?: {
    reviewStatus?: string | null;
    verifiedEnteredAt?: Date | null;
    verifiedLeftAt?: Date | null;
    sourceInvalidatedAt?: Date | null;
    reviewedSourceExitId?: string | null;
  } | null;
};

export function attendanceTiming(source: AttendanceTimingSource) {
  const note = source.activityNote;
  const reviewed = Boolean(
    note?.verifiedEnteredAt &&
    ['CONFIRMED', 'CORRECTED'].includes(note.reviewStatus ?? '') &&
    !note.sourceInvalidatedAt &&
    !source.checkInReport?.deletedAt &&
    !source.checkOutReport?.deletedAt &&
    (note.reviewedSourceExitId ?? null) === (source.checkOutReportId ?? null),
  );
  const enteredAt = reviewed ? note!.verifiedEnteredAt! : source.enteredAt;
  const leftAt = reviewed ? (note!.verifiedLeftAt ?? null) : source.leftAt;
  return {
    enteredAt,
    leftAt,
    hours: leftAt
      ? Math.max(0, (leftAt.getTime() - enteredAt.getTime()) / 3600000)
      : 0,
    corrected:
      reviewed &&
      (enteredAt.getTime() !== source.enteredAt.getTime() ||
        leftAt?.getTime() !== source.leftAt?.getTime()),
  };
}

export function attendanceOverlaps(
  source: AttendanceTimingSource,
  period: { start: Date; end: Date },
) {
  const timing = attendanceTiming(source);
  return (
    timing.enteredAt < period.end &&
    (!timing.leftAt || timing.leftAt >= period.start)
  );
}

// Fetch both original and reviewed candidates, then apply the effective interval.
// A correction can move an attendance into or out of the requested dates.
export function attendanceRangeCandidates(period: {
  start: Date;
  end: Date;
}): Prisma.WorksiteAttendanceWhereInput {
  return {
    OR: [
      {
        enteredAt: { lt: period.end },
        OR: [{ leftAt: { gte: period.start } }, { leftAt: null }],
      },
      {
        activityNote: {
          is: {
            reviewStatus: { in: ['CONFIRMED', 'CORRECTED'] },
            verifiedEnteredAt: { lt: period.end },
            OR: [
              { verifiedLeftAt: { gte: period.start } },
              { verifiedLeftAt: null },
            ],
          },
        },
      },
    ],
  };
}
