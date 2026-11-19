import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { MiRevMedicalService, medicalData, medicalDay, validateDiagnosis } from './mirev-medical.service';
import { MiRevPortalService } from './mirev-portal.service';

const now = new Date('2026-11-19T15:00:00Z');
const body = () => ({ clientRequestId: '232876dc-e4fa-4c94-9a86-a2812fbdf6ee', description: 'Consulta médica', providerType: 'EPS', latitude: '3.4', longitude: '-76.5', accuracyMeters: '20', locationCapturedAt: now.toISOString() });

describe('MiREV medical leave validation', () => {
  it('uses Colombia day boundaries rather than UTC midnight', () => {
    expect(medicalDay(new Date('2026-11-20T04:59:59Z')).day.toISOString()).toBe('2026-11-19T00:00:00.000Z');
    expect(medicalDay(new Date('2026-11-20T05:00:00Z')).start.toISOString()).toBe('2026-11-20T05:00:00.000Z');
  });
  it.each(['', 'NaN', 'Infinity', '91'])('rejects invalid latitude %s', latitude => {
    expect(() => medicalData({ ...body(), latitude }, now)).toThrow(BadRequestException);
  });
  it('rejects expired or future GPS instead of silently registering without a location', () => {
    for (const delta of [-120001, 30001]) expect(() => medicalData({ ...body(), locationCapturedAt: new Date(+now + delta).toISOString() }, now)).toThrow(BadRequestException);
  });
  it('limits descriptions and provider selection', () => {
    expect(() => medicalData({ ...body(), description: 'x'.repeat(501) }, now)).toThrow(BadRequestException);
    expect(() => medicalData({ ...body(), providerType: 'OTHER' }, now)).toThrow(BadRequestException);
  });
  it('validates diagnosis bytes rather than trusting the file extension or MIME', () => {
    expect(() => validateDiagnosis({ buffer: Buffer.from('<script>alert(1)</script>'), mimetype: 'application/pdf', originalname: 'diagnosis.pdf' })).toThrow(BadRequestException);
    expect(validateDiagnosis({ buffer: Buffer.from('%PDF-1.7'), mimetype: 'application/pdf', originalname: '../medical.pdf' }).name).not.toContain('/');
  });
});

describe('MiREV ownership and office access', () => {
  const employees = { ownEmployeeId: jest.fn().mockResolvedValue('own-employee') };
  const storage = { put: jest.fn(), remove: jest.fn(), get: jest.fn() };
  let db: any, service: MiRevMedicalService;
  beforeEach(() => {
    jest.clearAllMocks();
    db = { user: { findUnique: jest.fn() }, employee: { update: jest.fn(), findMany: jest.fn() }, attendancePunch: { findFirst: jest.fn().mockResolvedValue(null) }, miRevMedicalLeave: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() }, $queryRaw: jest.fn() };
    db.$transaction = async (fn: (tx: unknown) => unknown) => fn(db);
    service = new MiRevMedicalService(db, employees as any, storage as any);
  });
  it('requires a selfie server-side if no non-rejected check-in exists today', async () => {
    await expect(service.create('user', { ...body(), locationCapturedAt: new Date().toISOString() })).rejects.toThrow('toma una selfie');
    expect(storage.put).not.toHaveBeenCalled();
    const query = db.attendancePunch.findFirst.mock.calls[0][0];
    expect(query.where).toMatchObject({ employeeId: 'own-employee', kind: 'CHECK_IN', status: { not: 'REJECTED' } });
  });
  it('does not require a selfie after today entry and ignores forged employee IDs', async () => {
    db.attendancePunch.findFirst.mockResolvedValue({ id: 'today-entry' });
    db.employee.findUnique = jest.fn().mockResolvedValue({ eps: 'EPS registrada', arl: 'ARL registrada', userId: 'user', active: true, user: { active: true } });
    db.miRevMedicalLeave.create.mockResolvedValue({ id: 'leave' });
    await service.create('user', { ...body(), locationCapturedAt: new Date().toISOString(), employeeId: 'someone-else', sourceEntryId: 'forged' });
    expect(db.miRevMedicalLeave.create.mock.calls[0][0].data).toMatchObject({ employeeId: 'own-employee', sourceEntryId: 'today-entry', providerName: 'EPS registrada', selfieKey: null });
    expect(storage.put).not.toHaveBeenCalled();
  });
  it('does not accept a forged sourceEntryId as a substitute for a check-in', async () => {
    await expect(service.create('user', { ...body(), locationCapturedAt: new Date().toISOString(), sourceEntryId: 'forged', selfieRequired: false })).rejects.toThrow('toma una selfie');
  });
  it('prevents a second leave on the same day', async () => {
    db.attendancePunch.findFirst.mockResolvedValue({ id: 'today-entry' });
    db.employee.findUnique = jest.fn().mockResolvedValue({ userId: 'user', active: true, user: { active: true } });
    db.miRevMedicalLeave.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'existing' });
    await expect(service.create('user', { ...body(), locationCapturedAt: new Date().toISOString() })).rejects.toThrow(ConflictException);
    expect(db.miRevMedicalLeave.create).not.toHaveBeenCalled();
  });
  it('denies attaching a diagnosis to another employee leave before uploading', async () => {
    await expect(service.diagnosis('user', 'other-leave', { buffer: Buffer.from('%PDF-1.7'), mimetype: 'application/pdf', originalname: 'diagnosis.pdf' })).rejects.toThrow(NotFoundException);
    expect(db.miRevMedicalLeave.findFirst).toHaveBeenCalledWith({ where: { id: 'other-leave', employeeId: 'own-employee' }, select: { id: true } });
    expect(storage.put).not.toHaveBeenCalled();
  });
  it.each([Role.EMPLOYEE, Role.DRIVER, Role.OPERATOR])('denies affiliation updates for %s', async role => {
    db.user.findUnique.mockResolvedValue({ role, active: true });
    await expect(service.updateDetails('user', 'employee', { eps: 'EPS', arl: 'ARL' })).rejects.toThrow(ForbiddenException);
    expect(db.employee.update).not.toHaveBeenCalled();
  });
  it('denies inactive office accounts', async () => {
    db.user.findUnique.mockResolvedValue({ role: Role.OFFICE, active: false });
    await expect(service.office('user')).rejects.toThrow(ForbiddenException);
  });
  it('allows active office to save real nullable employee fields', async () => {
    db.user.findUnique.mockResolvedValue({ role: Role.OFFICE, active: true });
    await service.updateDetails('office', 'employee', { eps: ' EPS ', arl: '' });
    expect(db.employee.update).toHaveBeenCalledWith({ where: { id: 'employee' }, data: { eps: 'EPS', arl: null }, select: { id: true, eps: true, arl: true } });
  });
  it('scopes employee documents and downloads to the authenticated employee', async () => {
    db.fileObject = { findMany: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) };
    const portal = new MiRevPortalService(db, employees as any);
    await portal.documents('user');
    expect(db.fileObject.findMany.mock.calls[0][0].where).toEqual({ entityType: 'EMPLOYEE', entityId: 'own-employee' });
    await expect(portal.document('user', 'another-file')).rejects.toThrow(NotFoundException);
    expect(db.fileObject.findFirst.mock.calls[0][0].where).toEqual({ id: 'another-file', entityType: 'EMPLOYEE', entityId: 'own-employee' });
  });
});
