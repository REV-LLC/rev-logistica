import { AttendanceService } from './attendance.service';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { Role } from '@prisma/client';
import sharp from 'sharp';
jest.mock('../whatsapp-reports/attendance-journals.service', () => ({ syncAttendanceActivity: jest.fn() }));

describe('MiREV first facial enrollment', () => {
  const actor = { sub: 'account', role: Role.EMPLOYEE };
  const user = { active: true, role: actor.role, employee: { id: 'own', active: true } };
  let image: Buffer, db: any, storage: any, face: any, service: AttendanceService;
  const previousMode = process.env.MIREV_API_ONLY;
  const previousEnabled = process.env.ATTENDANCE_ENABLED;
  beforeAll(async () => { image = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#aaa' } }).jpeg().toBuffer(); });
  beforeEach(() => {
    process.env.MIREV_API_ONLY = 'true'; process.env.ATTENDANCE_ENABLED = 'true';
    db = { user: { findUnique: jest.fn().mockResolvedValue(user) }, miRevFaceEnrollment: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) }, employeeFaceReference: { upsert: jest.fn() }, $queryRaw: jest.fn() };
    db.$transaction = jest.fn(async run => run(db));
    storage = { put: jest.fn().mockResolvedValue(undefined), remove: jest.fn().mockResolvedValue(undefined) };
    face = { extract: jest.fn().mockResolvedValue({ vector: Array(128).fill(.1), modelVersion: 'sface-test' }) };
    service = new AttendanceService(db, {} as any, face, storage);
  });
  afterEach(() => { if (previousMode === undefined) delete process.env.MIREV_API_ONLY; else process.env.MIREV_API_ONLY = previousMode; if (previousEnabled === undefined) delete process.env.ATTENDANCE_ENABLED; else process.env.ATTENDANCE_ENABLED = previousEnabled; });
  it('requires self-enrollment even when an old profile reference exists', async () => {
    expect(await service.enrollmentStatus(actor)).toEqual({ required: true, enrolledAt: null });
  });
  it('stores the encrypted selfie and actual face vector for the authenticated employee', async () => {
    expect((await service.enrollFace(actor, image)).enrolled).toBe(true);
    const data = db.miRevFaceEnrollment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ employeeId: 'own', userId: 'account', modelVersion: 'sface-test' });
    expect(data.evidenceKey).toMatch(/^attendance-encrypted\/enrollment\/own\/.+\.bin$/);
    expect(data.photoHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storage.put).toHaveBeenCalledWith(data.evidenceKey, expect.any(Buffer));
    expect(db.employeeFaceReference.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { employeeId: 'own' }, update: expect.objectContaining({ photoHash: data.photoHash, approvedByUserId: 'account', vector: Array(128).fill(.1) }) }));
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it('never replaces a completed enrollment on a repeated request', async () => {
    db.miRevFaceEnrollment.findUnique.mockResolvedValue({ createdAt: new Date(0) });
    expect(await service.enrollFace(actor, image)).toEqual({ enrolled: true, enrolledAt: new Date(0) });
    expect(face.extract).not.toHaveBeenCalled(); expect(db.employeeFaceReference.upsert).not.toHaveBeenCalled();
    expect((await service.enrollmentStatus(actor)).required).toBe(false);
  });
  it('requires successful detection before saving a reference', async () => {
    face.extract.mockRejectedValue(new ServiceUnavailableException());
    await expect(service.enrollFace(actor, image)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(storage.put).not.toHaveBeenCalled(); expect(db.miRevFaceEnrollment.create).not.toHaveBeenCalled();
  });
  it('cleans up unused selfie when a concurrent enrollment already finished', async () => {
    db.miRevFaceEnrollment.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ createdAt: new Date(0) });
    await service.enrollFace(actor, image);
    expect(db.employeeFaceReference.upsert).not.toHaveBeenCalled(); expect(storage.remove).toHaveBeenCalledTimes(1);
  });
  it('rechecks the account before saving and removes evidence on failure', async () => {
    db.user.findUnique.mockResolvedValueOnce(user).mockResolvedValueOnce({ ...user, active: false });
    await expect(service.enrollFace(actor, image)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.miRevFaceEnrollment.create).not.toHaveBeenCalled(); expect(storage.remove).toHaveBeenCalledTimes(1);
  });
  it('blocks direct punch requests before self-enrollment', async () => {
    await expect(service.punch(actor, {} as any, image)).rejects.toThrow('Primero registra tu rostro');
    expect(face.extract).not.toHaveBeenCalled();
  });
});
