import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const day = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
const time = (date: Date) =>
  new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
export async function syncAttendanceActivity(
  tx: Prisma.TransactionClient,
  attendanceId: string,
  actorId: string,
) {
  // One suggestion per jornada; lock the source and existing note against office edits.
  await tx.$queryRaw`SELECT id FROM "WorksiteAttendance" WHERE id = ${attendanceId} FOR UPDATE`;
  const a = await tx.worksiteAttendance.findUniqueOrThrow({
    where: { id: attendanceId },
    include: {
      customerWorksite: { include: { worksite: true, customer: true } },
      checkInReport: { select: { deletedAt: true } },
      checkOutReport: { select: { deletedAt: true } },
    },
  });
  await tx.$queryRaw`SELECT id FROM "EmployeeActivityNote" WHERE "sourceAttendanceId" = ${attendanceId} FOR UPDATE`;
  const previous = await tx.employeeActivityNote.findUnique({
    where: { sourceAttendanceId: attendanceId },
  });
  const invalid = Boolean(
    a.checkInReport.deletedAt || a.checkOutReport?.deletedAt,
  );
  if (invalid) {
    if (previous && !previous.sourceInvalidatedAt)
      await tx.employeeActivityNote.update({
        where: { id: previous.id },
        data: { sourceInvalidatedAt: new Date() },
      });
    return;
  }
  const text =
    `Sugerencia del sistema: en obra ${a.customerWorksite.worksite.name} (${a.customerWorksite.customer.name}).\nEntrada: ${day(a.enteredAt)} ${time(a.enteredAt)}.\n${a.leftAt ? `Salida: ${day(a.leftAt)} ${time(a.leftAt)}.\nTiempo de presencia reportado: ${((a.leftAt.getTime() - a.enteredAt.getTime()) / 3600000).toFixed(2)} h.` : 'Salida pendiente; jornada abierta.'}`.slice(
      0,
      5000,
    );
  if (previous) {
    // Reviewed, corrected and dismissed notes are owned by office from this point.
    if (previous.reviewStatus === 'SUGGESTED')
      await tx.employeeActivityNote.update({
        where: { id: previous.id },
        data: { description: text, systemSuggestion: text },
      });
  } else {
    await tx.employeeActivityNote.create({
      data: {
        employeeId: a.employeeId,
        customerWorksiteId: a.customerWorksiteId,
        type: 'WORKSITE',
        date: new Date(`${day(a.enteredAt)}T00:00:00Z`),
        description: text,
        systemSuggestion: text,
        sourceAttendanceId: a.id,
        reviewStatus: 'SUGGESTED',
        createdByUserId: actorId,
      },
    });
  }
}

export function attendancePeriod(from?: string, to?: string) {
  const today = day(new Date());
  const startDay = from ?? today,
    endDay = to ?? startDay;
  const parse = (value: string) => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
    )
      throw new BadRequestException('Selecciona fechas válidas.');
    return new Date(`${value}T00:00:00-05:00`);
  };
  const start = parse(startDay),
    end = new Date(parse(endDay).getTime() + 86400000);
  if (end <= start || end.getTime() - start.getTime() > 93 * 86400000)
    throw new BadRequestException(
      'Selecciona un período de máximo 93 días, con inicio anterior al fin.',
    );
  return { start, end, from: startDay, to: endDay };
}
const evidenceReport = {
  select: {
    id: true,
    occurredAt: true,
    deletedAt: true,
    location: true,
    evidence: {
      select: { fileObject: { select: { id: true, originalName: true } } },
    },
  },
} as const;
@Injectable()
export class AttendanceJournalsService {
  constructor(private readonly prisma: PrismaService) {}
  async employees(from?: string, to?: string) {
    const period = attendancePeriod(from, to);
    const where = {
      enteredAt: { lt: period.end },
      OR: [{ leftAt: { gte: period.start } }, { leftAt: null }],
    };
    const [employees, journeys] = await Promise.all([
      this.prisma.employee.findMany({
        where: {
          OR: [{ active: true }, { worksiteAttendance: { some: where } }],
        },
        select: { id: true, name: true, lastName: true, active: true },
        orderBy: [{ name: 'asc' }, { lastName: 'asc' }],
      }),
      this.prisma.worksiteAttendance.findMany({
        where,
        orderBy: [{ enteredAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          employeeId: true,
          enteredAt: true,
          leftAt: true,
          checkOutReportId: true,
          customerWorksite: {
            select: { worksite: { select: { name: true } } },
          },
          checkInReport: { select: { deletedAt: true } },
          checkOutReport: { select: { deletedAt: true } },
          activityNote: {
            select: {
              reviewStatus: true,
              sourceInvalidatedAt: true,
              reviewedSourceExitId: true,
            },
          },
        },
      }),
    ]);
    const groups = new Map<string, typeof journeys>();
    for (const a of journeys) {
      const group = groups.get(a.employeeId) ?? [];
      group.push(a);
      groups.set(a.employeeId, group);
    }
    return {
      from: period.from,
      to: period.to,
      employees: employees.map((e) => {
        const items = groups.get(e.id) ?? [];
        const valid = items.filter(
          (a) =>
            !a.checkInReport.deletedAt &&
            !a.checkOutReport?.deletedAt &&
            !a.activityNote?.sourceInvalidatedAt,
        );
        return {
          ...e,
          journeys: items.length,
          open: valid.filter((a) => !a.leftAt).length,
          pendingReview: items.filter(
            (a) =>
              a.activityNote?.reviewStatus !== 'DISMISSED' &&
              (!a.activityNote ||
                a.activityNote.reviewStatus === 'SUGGESTED' ||
                a.activityNote.reviewedSourceExitId !== a.checkOutReportId ||
                a.activityNote.sourceInvalidatedAt ||
                a.checkInReport.deletedAt ||
                a.checkOutReport?.deletedAt),
          ).length,
          reportedHours: valid.reduce(
            (sum, a) =>
              sum +
              (a.leftAt
                ? Math.max(
                    0,
                    Math.min(a.leftAt.getTime(), period.end.getTime()) -
                      Math.max(a.enteredAt.getTime(), period.start.getTime()),
                  ) / 3600000
                : 0),
            0,
          ),
          latestWorksite: items[0]?.customerWorksite.worksite.name ?? null,
          lastEntry: items[0]?.enteredAt ?? null,
          lastExit: items[0]?.leftAt ?? null,
        };
      }),
    };
  }
  async journals(
    employeeId: string,
    from?: string,
    to?: string,
    cursor?: string,
  ) {
    const period = attendancePeriod(from, to);
    const rows = await this.prisma.worksiteAttendance.findMany({
      where: {
        employeeId,
        enteredAt: { lt: period.end },
        OR: [{ leftAt: { gte: period.start } }, { leftAt: null }],
      },
      orderBy: [{ enteredAt: 'desc' }, { id: 'desc' }],
      take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        customerWorksite: {
          select: {
            worksite: { select: { name: true } },
            customer: { select: { name: true } },
          },
        },
        checkInReport: evidenceReport,
        checkOutReport: evidenceReport,
        activityNote: {
          select: {
            id: true,
            reviewStatus: true,
            description: true,
            sourceInvalidatedAt: true,
            reviewedAt: true,
            reviewedSourceExitId: true,
          },
        },
      },
    });
    return {
      journals: rows.slice(0, 20),
      nextCursor: rows.length > 20 ? rows[19].id : null,
    };
  }
}
