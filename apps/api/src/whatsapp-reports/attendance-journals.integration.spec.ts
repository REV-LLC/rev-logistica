import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeActivitiesService } from '../employee-activities/employee-activities.service';
import {
  AttendanceJournalsService,
  attendancePeriod,
  syncAttendanceActivity,
} from './attendance-journals.service';
import { WhatsappReportRecordsService } from './whatsapp-report-records.service';

const url = process.env.WHATSAPP_TEST_DATABASE_URL;
if (
  url &&
  (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
    !/^\/whatsapp_qa_[a-z0-9_]+$/.test(new URL(url).pathname))
)
  throw new Error('Isolated local test database required');
(url ? describe : describe.skip)(
  'Attendance journals and auditable activity suggestions with PostgreSQL',
  () => {
    const prisma = new PrismaService({
      datasources: {
        db: {
          url: url ?? 'postgresql://unused@localhost:1/whatsapp_qa_unused',
        },
      },
    });
    const activities = new EmployeeActivitiesService(prisma);
    const journals = new AttendanceJournalsService(prisma);
    let employeeId: string, actorId: string, siteId: string;
    beforeAll(async () => {
      await prisma.$connect();
      actorId = (
        await prisma.user.create({
          data: {
            email: `${randomUUID()}@example.invalid`,
            role: 'OFFICE',
            passwordHash: 'disabled',
          },
        })
      ).id;
      employeeId = (
        await prisma.employee.create({
          data: { name: 'Jornadas QA', role: 'HEAVY_MACHINERY_OPERATOR' },
        })
      ).id;
      const customer = await prisma.customer.create({
        data: { name: 'Cliente jornadas QA' },
      });
      const site = await prisma.worksite.create({
        data: { name: 'Obra jornadas QA' },
      });
      siteId = (
        await prisma.customerWorksite.create({
          data: { customerId: customer.id, worksiteId: site.id },
        })
      ).id;
    });
    afterAll(async () => prisma.$disconnect());
    async function create(enteredAt = '2026-11-13T12:00:00Z', closed = true) {
      const entry = await prisma.whatsappReport.create({
        data: {
          employeeId,
          customerWorksiteId: siteId,
          kind: 'CHECK_IN',
          description: 'Entrada QA',
          occurredAt: new Date(enteredAt),
          sourceMessageId: randomUUID(),
        },
      });
      const exit = closed
        ? await prisma.whatsappReport.create({
            data: {
              employeeId,
              customerWorksiteId: siteId,
              kind: 'CHECK_OUT',
              description: 'Salida QA',
              occurredAt: new Date(new Date(enteredAt).getTime() + 8 * 3600000),
              sourceMessageId: randomUUID(),
            },
          })
        : null;
      const a = await prisma.worksiteAttendance.create({
        data: {
          employeeId,
          customerWorksiteId: siteId,
          enteredAt: entry.occurredAt,
          leftAt: exit?.occurredAt,
          checkInReportId: entry.id,
          checkOutReportId: exit?.id,
        },
      });
      await prisma.$transaction((tx) =>
        syncAttendanceActivity(tx, a.id, actorId),
      );
      return {
        ...a,
        note: await prisma.employeeActivityNote.findUniqueOrThrow({
          where: { sourceAttendanceId: a.id },
        }),
      };
    }
    it('creates one source-linked note without inventing an asset, updates it on exit and keeps retries idempotent', async () => {
      const a = await create('2026-11-10T04:30:00Z', false);
      expect(a.note.assetId).toBeNull();
      expect(a.note.date.toISOString()).toBe('2026-11-09T00:00:00.000Z');
      expect(a.note.reviewStatus).toBe('SUGGESTED');
      expect(a.note.description).toContain(
        'Sugerencia del sistema: en obra Obra jornadas QA',
      );
      const exit = await prisma.whatsappReport.create({
        data: {
          employeeId,
          customerWorksiteId: siteId,
          kind: 'CHECK_OUT',
          description: 'Salida QA',
          occurredAt: new Date('2026-11-10T12:30:00Z'),
          sourceMessageId: randomUUID(),
        },
      });
      await prisma.worksiteAttendance.update({
        where: { id: a.id },
        data: { leftAt: exit.occurredAt, checkOutReportId: exit.id },
      });
      await prisma.$transaction((tx) =>
        syncAttendanceActivity(tx, a.id, actorId),
      );
      await prisma.$transaction((tx) =>
        syncAttendanceActivity(tx, a.id, actorId),
      );
      const notes = await prisma.employeeActivityNote.findMany({
        where: { sourceAttendanceId: a.id },
      });
      expect(notes).toHaveLength(1);
      expect(notes[0].description).toContain('8.00 h');
    });
    it('audits confirmation and correction, preserves raw reports and never overwrites office edits', async () => {
      const a = await create();
      const confirmed = await activities.review(
        employeeId,
        a.note.id,
        'CONFIRM',
        actorId,
      );
      expect(confirmed.reviewStatus).toBe('CONFIRMED');
      const corrected = await activities.update(
        employeeId,
        a.note.id,
        {
          date: '2026-11-13',
          customerWorksiteId: siteId,
          description: 'Office verificó la obra y agregó una observación.',
          verifiedEnteredAt: '2026-11-13T13:00:00Z',
          verifiedLeftAt: '2026-11-13T20:00:00Z',
        },
        actorId,
      );
      expect(corrected.reviewStatus).toBe('CORRECTED');
      expect(corrected.assetId).toBeNull();
      expect(corrected.verifiedEnteredAt?.toISOString()).toBe(
        '2026-11-13T13:00:00.000Z',
      );
      expect(corrected.verifiedLeftAt?.toISOString()).toBe(
        '2026-11-13T20:00:00.000Z',
      );
      await prisma.$transaction((tx) =>
        syncAttendanceActivity(tx, a.id, actorId),
      );
      expect(
        (
          await prisma.employeeActivityNote.findUniqueOrThrow({
            where: { id: a.note.id },
          })
        ).description,
      ).toBe(corrected.description);
      const history = await prisma.employeeActivityReview.findMany({
        where: { noteId: a.note.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(history.map((r) => r.action)).toEqual(['CONFIRM', 'CORRECT']);
      expect(history.every((r) => r.userId === actorId)).toBe(true);
      expect(history[1].previousData).toMatchObject({
        description: a.note.description,
      });
      expect(
        (
          await prisma.whatsappReport.findUniqueOrThrow({
            where: { id: a.checkInReportId },
          })
        ).description,
      ).toBe('Entrada QA');
    });
    it('keeps discarded suggestions and reviewed open notes from being regenerated or overwritten', async () => {
      const a = await create('2026-11-12T12:00:00Z', false);
      await expect(
        activities.review(employeeId, a.note.id, 'CONFIRM', actorId),
      ).rejects.toThrow('jornada está abierta');
      await activities.update(
        employeeId,
        a.note.id,
        {
          date: '2026-11-12',
          customerWorksiteId: siteId,
          description: 'Observación de oficina antes de la salida',
        },
        actorId,
      );
      const exit = await prisma.whatsappReport.create({
        data: {
          employeeId,
          customerWorksiteId: siteId,
          kind: 'CHECK_OUT',
          description: 'Salida',
          occurredAt: new Date('2026-11-12T20:00:00Z'),
          sourceMessageId: randomUUID(),
        },
      });
      await prisma.worksiteAttendance.update({
        where: { id: a.id },
        data: { leftAt: exit.occurredAt, checkOutReportId: exit.id },
      });
      await prisma.$transaction((tx) =>
        syncAttendanceActivity(tx, a.id, actorId),
      );
      expect(
        (
          await prisma.employeeActivityNote.findUniqueOrThrow({
            where: { id: a.note.id },
          })
        ).description,
      ).toBe('Observación de oficina antes de la salida');
      const summary = await journals.employees('2026-11-12', '2026-11-12');
      expect(
        summary.employees.find((e) => e.id === employeeId)?.pendingReview,
      ).toBeGreaterThan(0);
      await activities.remove(employeeId, a.note.id, actorId);
      await expect(
        activities.review(employeeId, a.note.id, 'CONFIRM', actorId),
      ).rejects.toThrow('descartada');
      await prisma.$transaction((tx) =>
        syncAttendanceActivity(tx, a.id, actorId),
      );
      expect(
        (
          await prisma.employeeActivityNote.findUniqueOrThrow({
            where: { id: a.note.id },
          })
        ).reviewStatus,
      ).toBe('DISMISSED');
    });
    it('invalidates the source when a marking is deleted and blocks confirmation without removing the jornada', async () => {
      const a = await create('2026-11-11T12:00:00Z');
      await new WhatsappReportRecordsService(prisma).deleteReport(
        a.checkInReportId,
        actorId,
      );
      expect(
        (
          await prisma.employeeActivityNote.findUniqueOrThrow({
            where: { id: a.note.id },
          })
        ).sourceInvalidatedAt,
      ).not.toBeNull();
      await expect(
        activities.review(employeeId, a.note.id, 'CONFIRM', actorId),
      ).rejects.toThrow('reporte eliminado');
      expect(
        await prisma.worksiteAttendance.findUnique({ where: { id: a.id } }),
      ).not.toBeNull();
      await activities.remove(employeeId, a.note.id, actorId);
      expect(
        (await journals.employees('2026-11-11', '2026-11-11')).employees.find(
          (e) => e.id === employeeId,
        )?.pendingReview,
      ).toBe(0);
    });
    it('scopes review by employee and active office account, and rolls back an invalid batch', async () => {
      const a = await create('2026-11-08T12:00:00Z'),
        b = await create('2026-11-08T21:00:00Z', false);
      await expect(
        activities.review(randomUUID(), a.note.id, 'CONFIRM', actorId),
      ).rejects.toThrow('este empleado');
      const driver = await prisma.user.create({
        data: {
          email: `${randomUUID()}@example.invalid`,
          role: 'DRIVER',
          passwordHash: 'disabled',
        },
      });
      await expect(
        activities.review(employeeId, a.note.id, 'CONFIRM', driver.id),
      ).rejects.toThrow('ADMIN y OFFICE');
      await expect(
        activities.reviewBatch(employeeId, [a.note.id, b.note.id], actorId),
      ).rejects.toThrow('jornada está abierta');
      expect(
        (
          await prisma.employeeActivityNote.findUniqueOrThrow({
            where: { id: a.note.id },
          })
        ).reviewStatus,
      ).toBe('SUGGESTED');
      const c = await create('2026-11-07T12:00:00Z');
      expect(
        await activities.reviewBatch(
          employeeId,
          [a.note.id, c.note.id],
          actorId,
        ),
      ).toEqual({ confirmed: 2 });
    });
    it('rejects invalid reviewed times and inactive reviewers without changing the note or audit log', async () => {
      const a = await create('2026-11-03T12:00:00Z');
      const payload = {
        date: '2026-11-03',
        customerWorksiteId: siteId,
        description: 'Revisión QA',
        verifiedEnteredAt: '2026-11-03T20:00:00Z',
        verifiedLeftAt: '2026-11-03T12:00:00Z',
      };
      await expect(
        activities.update(employeeId, a.note.id, payload, actorId),
      ).rejects.toThrow('posterior');
      await expect(
        activities.update(
          employeeId,
          a.note.id,
          {
            ...payload,
            verifiedEnteredAt: '2026-11-03T12:00:00Z',
            verifiedLeftAt: null,
          },
          actorId,
        ),
      ).rejects.toThrow('salida revisada');
      const inactive = await prisma.user.create({
        data: {
          email: `${randomUUID()}@example.invalid`,
          role: 'OFFICE',
          active: false,
          passwordHash: 'disabled',
        },
      });
      await expect(
        activities.review(employeeId, a.note.id, 'CONFIRM', inactive.id),
      ).rejects.toThrow('ADMIN y OFFICE');
      expect(
        await prisma.employeeActivityReview.count({
          where: { noteId: a.note.id },
        }),
      ).toBe(0);
      expect(
        await prisma.employeeActivityNote.findUniqueOrThrow({
          where: { id: a.note.id },
        }),
      ).toEqual(a.note);
    });

    it('paginates journals and limits queries to the employee and local period, including overnight overlaps', async () => {
      const outsider = await prisma.employee.create({
        data: { name: 'Sin reportes QA', role: 'OTHER' },
      });
      for (let i = 0; i < 21; i++)
        await create(
          `2026-11-05T${String(5 + (i % 18)).padStart(2, '0')}:00:00Z`,
        );
      const first = await journals.journals(
        employeeId,
        '2026-11-05',
        '2026-11-05',
      );
      expect(first.journals).toHaveLength(20);
      expect(first.nextCursor).not.toBeNull();
      const second = await journals.journals(
        employeeId,
        '2026-11-05',
        '2026-11-05',
        first.nextCursor!,
      );
      expect(second.journals).toHaveLength(1);
      expect(
        new Set([...first.journals, ...second.journals].map((a) => a.id)).size,
      ).toBe(21);
      expect(
        (await journals.journals(outsider.id, '2026-11-05', '2026-11-05'))
          .journals,
      ).toEqual([]);
      const summary = await journals.employees('2026-11-05', '2026-11-05');
      expect(summary.employees.find((e) => e.id === outsider.id)).toMatchObject(
        { journeys: 0, reportedHours: 0 },
      );
      const overnight = await journals.journals(
        employeeId,
        '2026-11-10',
        '2026-11-10',
      );
      expect(
        overnight.journals.some(
          (a) => a.enteredAt.toISOString() === '2026-11-10T04:30:00.000Z',
        ),
      ).toBe(true);
    });
  },
);
describe('Attendance period validation', () => {
  it('uses Colombian calendar boundaries and rejects invalid or excessively broad ranges', () => {
    expect(
      attendancePeriod('2026-11-01', '2026-11-01').start.toISOString(),
    ).toBe('2026-11-01T05:00:00.000Z');
    for (const [from, to] of [
      ['2026-02-30', '2026-03-01'],
      ['2026-11-14', '2026-11-13'],
      ['2026-01-01', '2026-12-31'],
    ])
      expect(() => attendancePeriod(from, to)).toThrow();
  });
});
