import { PrismaClient } from '@prisma/client';
import { syncAttendanceActivity } from '../src/whatsapp-reports/attendance-journals.service';

// Idempotent internal backfill; default is a count-only dry run. No source rows leave the database.
async function main() {
  const prisma = new PrismaClient();
  try {
    const actorId = process.env.WHATSAPP_REPORT_ACTOR_USER_ID?.trim();
    if (
      !actorId ||
      !(await prisma.user.findFirst({
        where: { id: actorId, active: true, role: { in: ['ADMIN', 'OFFICE'] } },
        select: { id: true },
      }))
    )
      throw new Error('Configure an active ADMIN/OFFICE audit actor.');
    const where = {
      activityNote: { is: null },
      checkInReport: { deletedAt: null },
      OR: [{ checkOutReportId: null }, { checkOutReport: { deletedAt: null } }],
    };
    const before = await prisma.worksiteAttendance.count({ where });
    if (!process.argv.includes('--apply')) {
      console.log(JSON.stringify({ dryRun: true, eligibleJournals: before }));
      return;
    }
    let cursor: string | undefined;
    while (true) {
      const rows = await prisma.worksiteAttendance.findMany({
        where,
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!rows.length) break;
      for (const row of rows)
        await prisma.$transaction((tx) =>
          syncAttendanceActivity(tx, row.id, actorId),
        );
      cursor = rows[rows.length - 1].id;
    }
    const remaining = await prisma.worksiteAttendance.count({ where });
    console.log(
      JSON.stringify({
        eligibleBefore: before,
        eligibleRemaining: remaining,
        completed: remaining === 0,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error(
    'Attendance suggestion backfill failed; originals were not modified.',
  );
  process.exitCode = 1;
});
