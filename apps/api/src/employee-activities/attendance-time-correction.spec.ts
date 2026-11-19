import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReviewActivityDto } from './employee-activities.dto';
import { EmployeeActivitiesService } from './employee-activities.service';

function fixture() {
  const source = {
    enteredAt: new Date('2026-11-18T12:00:00Z'),
    leftAt: new Date('2026-11-18T20:00:00Z'),
    checkInReportId: 'entry-report',
    checkOutReportId: 'exit-report',
    checkInReport: { deletedAt: null },
    checkOutReport: { deletedAt: null },
  };
  const note = {
    id: 'note',
    employeeId: 'employee',
    description: 'Texto original',
    date: new Date('2026-11-18T00:00:00Z'),
    endDate: null,
    customerWorksiteId: 'worksite',
    assetId: null,
    warehouseId: null,
    type: 'WORKSITE',
    reviewStatus: 'CONFIRMED',
    sourceInvalidatedAt: null,
    verifiedEnteredAt: source.enteredAt,
    verifiedLeftAt: source.leftAt,
    sourceAttendance: source,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: 'authenticated-office' }),
    },
    employeeActivityNote: {
      findFirst: jest.fn().mockResolvedValue(note),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...note, ...data }),
        ),
    },
    employeeActivityReview: { create: jest.fn().mockResolvedValue({}) },
    worksiteAttendance: { update: jest.fn() },
  };
  const service = new EmployeeActivitiesService({
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
  } as never);
  return { service, tx, note, source };
}
const times = {
  verifiedEnteredAt: '2026-11-18T13:15:00Z',
  verifiedLeftAt: '2026-11-18T22:20:00Z',
};

describe('Attendance time correction from the report modal', () => {
  it('audits the authenticated actor and both versions without changing source reports or activity text', async () => {
    const { service, tx, source } = fixture();
    const result = await service.review(
      'employee',
      'note',
      'CORRECT',
      'authenticated-office',
      times,
    );
    expect(result.reviewStatus).toBe('CORRECTED');
    expect(tx.employeeActivityNote.update.mock.calls[0][0].data).toEqual({
      verifiedEnteredAt: new Date(times.verifiedEnteredAt),
      verifiedLeftAt: new Date(times.verifiedLeftAt),
      reviewStatus: 'CORRECTED',
      reviewedAt: expect.any(Date),
      reviewedByUserId: 'authenticated-office',
      reviewedSourceExitId: 'exit-report',
    });
    expect(tx.employeeActivityReview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        noteId: 'note',
        userId: 'authenticated-office',
        action: 'CORRECT',
        previousData: expect.objectContaining({
          verifiedEnteredAt: '2026-11-18T12:00:00.000Z',
          verifiedLeftAt: '2026-11-18T20:00:00.000Z',
          description: 'Texto original',
        }),
        nextData: expect.objectContaining({
          verifiedEnteredAt: '2026-11-18T13:15:00.000Z',
          verifiedLeftAt: '2026-11-18T22:20:00.000Z',
          sourceEnteredAt: source.enteredAt.toISOString(),
          sourceLeftAt: source.leftAt.toISOString(),
        }),
      }),
    });
    expect(tx.worksiteAttendance.update).not.toHaveBeenCalled();
  });
  it.each([
    { ...times, verifiedLeftAt: '2026-11-18T12:00:00Z' },
    { ...times, verifiedEnteredAt: '2026-11-18T13:15:00' },
    { ...times, verifiedEnteredAt: '2026-02-30T13:15:00Z' },
    { ...times, verifiedEnteredAt: undefined },
    { ...times, verifiedLeftAt: null },
  ])(
    'rejects invalid times or removal of a reported exit: %j',
    async (correction) => {
      const { service, tx } = fixture();
      await expect(
        service.review(
          'employee',
          'note',
          'CORRECT',
          'authenticated-office',
          correction,
        ),
      ).rejects.toThrow();
      expect(tx.employeeActivityNote.update).not.toHaveBeenCalled();
      expect(tx.employeeActivityReview.create).not.toHaveBeenCalled();
    },
  );
  it('requires an active Admin or Office and scopes the note to the selected employee', async () => {
    const { service, tx } = fixture();
    tx.user.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.review('employee', 'note', 'CORRECT', 'intruder', times),
    ).rejects.toThrow(ForbiddenException);
    tx.employeeActivityNote.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.review(
        'other-employee',
        'note',
        'CORRECT',
        'authenticated-office',
        times,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(tx.employeeActivityNote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'note', employeeId: 'other-employee' },
      }),
    );
    expect(tx.employeeActivityReview.create).not.toHaveBeenCalled();
  });
  it('does not allow confirm or dismiss actions to silently change times', async () => {
    const { service, tx } = fixture();
    await expect(
      service.review(
        'employee',
        'note',
        'CONFIRM',
        'authenticated-office',
        times,
      ),
    ).rejects.toThrow('Usa Corregir horas');
    expect(tx.employeeActivityNote.update).not.toHaveBeenCalled();
  });
  it('validates correction transport and rejects a forged responsible user', async () => {
    expect(
      await validate(plainToInstance(ReviewActivityDto, { action: 'CONFIRM' })),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(ReviewActivityDto, { action: 'CORRECT', ...times }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(ReviewActivityDto, { action: 'CORRECT' })),
    ).not.toHaveLength(0);
    const errors = await validate(
      plainToInstance(ReviewActivityDto, {
        action: 'CORRECT',
        ...times,
        userId: 'forged',
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors.map((error) => error.property)).toContain('userId');
  });
});
