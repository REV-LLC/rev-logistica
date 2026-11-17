jest.mock('../whatsapp-reports/attendance-journals.service', () => ({
  syncAttendanceActivity: jest.fn(),
}));
import { AttendanceService } from './attendance.service';
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import sharp from 'sharp';
describe('PWA attendance service', () => {
  const actor = { sub: 'user', role: Role.EMPLOYEE };
  const employee = {
    id: 'employee',
    name: 'Pedro',
    lastName: 'Pérez',
    active: true,
  };
  const user = { id: actor.sub, role: actor.role, active: true, employee };
  const vector = Array(128)
    .fill(0)
    .map((_, i) => (i === 0 ? 1 : 0));
  const ref = {
    vector,
    modelVersion: 'sface-test',
    photoHash: 'hash',
    approvedAt: new Date(0),
  };
  const site = {
    worksite: {
      attendanceLatitude: 4,
      attendanceLongitude: -76,
      attendanceRadiusMeters: 200,
    },
  };
  let db: any;
  let storage: any;
  let face: any;
  let service: AttendanceService;
  let image: Buffer;
  const dto = () => ({
    requestId: 'request',
    kind: 'CHECK_IN' as const,
    customerWorksiteId: 'site',
    latitude: 4,
    longitude: -76,
    accuracyMeters: 10,
    locationCapturedAt: new Date().toISOString(),
  });
  beforeAll(async () => {
    image = await sharp({
      create: { width: 100, height: 100, channels: 3, background: '#aaa' },
    })
      .jpeg()
      .toBuffer();
  });
  beforeEach(() => {
    process.env.ATTENDANCE_ENABLED = 'true';
    db = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      attendancePunch: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(async ({ data }) => ({ ...data, id: 'punch' })),
      },
      employeeFaceReference: { findUnique: jest.fn().mockResolvedValue(ref) },
      worksiteAttendance: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'shift' }),
        update: jest.fn().mockResolvedValue({ id: 'shift' }),
      },
      customerWorksite: { findFirst: jest.fn().mockResolvedValue(site) },
      $queryRaw: jest.fn(),
    };
    db.$transaction = jest.fn((fn) => fn(db));
    storage = {
      put: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
    };
    face = {
      extract: jest
        .fn()
        .mockResolvedValue({ vector, modelVersion: 'sface-test', detectionScore: 0.98, detectionThreshold: 0.9 }),
    };
    service = new AttendanceService(db, {} as any, face, storage);
  });
  afterEach(() => {
    delete process.env.ATTENDANCE_ENABLED;
  });
  it('creates a shared shift and a verified punch with the server timestamp', async () => {
    const result = await service.punch(actor, dto(), image);
    expect(result.status).toBe('VERIFIED');
    expect(result.detectionScore).toBe(0.98);
    expect(result.detectionThreshold).toBe(0.9);
    expect(result.occurredAt).toBeInstanceOf(Date);
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(storage.put).toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it('backfills only detector metadata on the designated staging employee', async () => {
    const previous = { ...process.env };
    Object.assign(process.env, { ATTENDANCE_TEST_MODE: 'true', RAILWAY_ENVIRONMENT_ID: '53c93c9d-33e7-4137-a598-6648a6491886', RAILWAY_ENVIRONMENT_NAME: 'staging', AUTH_BYPASS_ENABLED: 'false', ATTENDANCE_TEST_EMPLOYEE_ID: employee.id });
    db.attendancePunch.findMany = jest.fn().mockResolvedValue([{ id: 'old', evidenceKey: 'private', modelVersion: 'sface-test' }]);
    db.attendancePunch.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    storage.get.mockResolvedValue(image);
    try {
      expect(await service.backfillDetection(actor)).toEqual({ results: [{ id: 'old', updated: true }] });
      expect(db.attendancePunch.updateMany).toHaveBeenCalledWith({
        where: { id: 'old', employeeId: employee.id, detectionScore: null },
        data: { detectionScore: .98, detectionThreshold: .9, detectionReprocessedAt: expect.any(Date) },
      });
      expect(db.attendancePunch.create).not.toHaveBeenCalled();
      expect(db.worksiteAttendance.create).not.toHaveBeenCalled();
      expect(db.worksiteAttendance.update).not.toHaveBeenCalled();
    } finally { process.env = previous; }
  });
  it('returns an existing request without uploading or advancing the shift', async () => {
    db.attendancePunch.findUnique.mockResolvedValue({
      id: 'old',
      employeeId: employee.id,
    });
    expect(await service.punch(actor, dto())).toEqual({
      id: 'old',
      employeeId: employee.id,
    });
    expect(face.extract).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rejects another employee’s idempotency key', async () => {
    db.attendancePunch.findUnique.mockResolvedValue({ employeeId: 'other' });
    await expect(service.punch(actor, dto(), image)).rejects.toThrow();
  });
  it('prevents a second entry across PWA and WhatsApp', async () => {
    db.worksiteAttendance.findFirst.mockResolvedValue({ id: 'whatsapp-shift' });
    await expect(service.punch(actor, dto(), image)).rejects.toThrow(
      'Ya tienes',
    );
    expect(db.attendancePunch.create).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalled();
  });
  it('blocks a new entry until a prior-day shift is explicitly checked out', async () => {
    const open = { id: 'yesterday-shift', enteredAt: new Date(Date.now() - 36 * 60 * 60 * 1000), customerWorksiteId: 'site' };
    db.worksiteAttendance.findFirst.mockResolvedValue(open);
    await expect(service.punch(actor, dto(), image)).rejects.toThrow('Registra la salida');
    expect(db.worksiteAttendance.findFirst).toHaveBeenCalledWith({ where: { employeeId: employee.id, leftAt: null } });
    expect(db.worksiteAttendance.create).not.toHaveBeenCalled();
    expect(db.attendancePunch.create).not.toHaveBeenCalled();
    const checkout = await service.punch(actor, { ...dto(), requestId: 'close-yesterday', kind: 'CHECK_OUT', attendanceId: open.id }, image);
    expect(checkout.kind).toBe('CHECK_OUT');
    expect(db.worksiteAttendance.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: open.id }, data: expect.objectContaining({ leftAt: expect.any(Date) }) }));
    db.worksiteAttendance.findFirst.mockResolvedValue(null);
    const next = await service.punch(actor, { ...dto(), requestId: 'today-entry' }, image);
    expect(next.kind).toBe('CHECK_IN');
    expect(db.worksiteAttendance.create).toHaveBeenCalledTimes(1);
  });
  it('rejects a stale checkout targeting a different shift', async () => {
    db.worksiteAttendance.findFirst.mockResolvedValue({
      id: 'new-shift',
      enteredAt: new Date(0),
    });
    await expect(
      service.punch(
        actor,
        { ...dto(), kind: 'CHECK_OUT', attendanceId: 'old-shift' },
        image,
      ),
    ).rejects.toThrow('jornada cambió');
  });
  it('uses the open shift’s worksite for checkout', async () => {
    db.worksiteAttendance.findFirst.mockResolvedValue({
      id: 'shift',
      customerWorksiteId: 'correct-site',
      enteredAt: new Date(0),
    });
    const result = await service.punch(
      actor,
      {
        ...dto(),
        kind: 'CHECK_OUT',
        attendanceId: 'shift',
        customerWorksiteId: 'wrong-site',
      },
      image,
    );
    expect(result.customerWorksiteId).toBe('correct-site');
    expect(db.worksiteAttendance.update).toHaveBeenCalled();
  });
  it('keeps evidence pending when a reference is absent', async () => {
    db.employeeFaceReference.findUnique.mockResolvedValue(null);
    const result = await service.punch(actor, dto(), image);
    expect(result.status).toBe('PENDING');
    expect(result.reasons).toContain('NO_APPROVED_REFERENCE');
  });
  it('keeps a service outage pending rather than falsely verifying it', async () => {
    face.extract.mockRejectedValue(new ServiceUnavailableException());
    const result = await service.punch(actor, dto(), image);
    expect(result.status).toBe('PENDING');
    expect(result.reasons).toContain('FACE_SERVICE_UNAVAILABLE');
  });
  it('rejects an unusable photo without creating a shift', async () => {
    face.extract.mockRejectedValue(new BadRequestException('Foto borrosa'));
    await expect(service.punch(actor, dto(), image)).rejects.toThrow(
      'Foto borrosa',
    );
    expect(db.worksiteAttendance.create).not.toHaveBeenCalled();
  });
  it('does not use an outdated or changed reference', async () => {
    db.employeeFaceReference.findUnique
      .mockResolvedValueOnce(ref)
      .mockResolvedValueOnce({ ...ref, photoHash: 'replaced' });
    expect((await service.punch(actor, dto(), image)).status).toBe('PENDING');
  });
  it('rechecks account status inside the transaction', async () => {
    db.user.findUnique
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({ ...user, active: false });
    await expect(service.punch(actor, dto(), image)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.attendancePunch.create).not.toHaveBeenCalled();
  });
  it('requires fresh location and never accepts a client attendance time', async () => {
    await expect(
      service.punch(
        actor,
        { ...dto(), locationCapturedAt: new Date(0).toISOString() },
        image,
      ),
    ).rejects.toThrow('ubicación');
    expect(face.extract).not.toHaveBeenCalled();
  });
  it('preserves evidence if a COMMIT response is lost after the record was saved', async () => {
    db.$transaction.mockRejectedValue(
      new Error('connection lost during commit'),
    );
    db.attendancePunch.findFirst.mockResolvedValue({ id: 'committed-punch' });
    await expect(service.punch(actor, dto(), image)).rejects.toThrow(
      'connection lost',
    );
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it('does not expose another employee’s evidence', async () => {
    db.attendancePunch.findUnique.mockResolvedValue({
      employeeId: 'other',
      evidenceKey: 'secret',
    });
    await expect(service.evidence(actor, 'id')).rejects.toThrow();
    expect(storage.get).not.toHaveBeenCalled();
  });
});
