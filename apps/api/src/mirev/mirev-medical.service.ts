import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeesService } from '../transport/employees.service';
import { AttendanceStorageService } from '../attendance/attendance-storage.service';

type Attachment = { buffer: Buffer; originalname: string; mimetype: string };
const diagnosisSelect = { id: true, name: true, mimeType: true, sizeBytes: true, createdAt: true } as const;
const leaveSelect = { id: true, day: true, description: true, providerType: true, providerName: true, latitude: true, longitude: true, accuracyMeters: true, locationCapturedAt: true, createdAt: true, diagnoses: { select: diagnosisSelect } } as const;
export function medicalDay(now: Date) {
  const value = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return { day: new Date(`${value}T00:00:00Z`), start: new Date(`${value}T00:00:00-05:00`), end: new Date(new Date(`${value}T00:00:00-05:00`).getTime() + 86400000) };
}
export function medicalData(body: Record<string, unknown>, now: Date) {
  if (typeof body.clientRequestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.clientRequestId)) throw new BadRequestException('Solicitud inválida.');
  if (typeof body.description !== 'string' || !body.description.trim() || body.description.trim().length > 500) throw new BadRequestException('Describe brevemente el motivo (máximo 500 caracteres).');
  if (!['EPS','ARL'].includes(String(body.providerType))) throw new BadRequestException('Selecciona EPS o ARL.');
  const number = (key: string, min: number, max: number) => {
    const value = body[key];
    if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') throw new BadRequestException('Obtén tu ubicación antes de registrar.');
    const result = Number(value);
    if (!Number.isFinite(result) || result < min || result > max) throw new BadRequestException('Ubicación inválida.');
    return result;
  };
  const latitude = number('latitude', -90, 90), longitude = number('longitude', -180, 180), accuracyMeters = number('accuracyMeters', 0, 100000);
  const locationCapturedAt = new Date(String(body.locationCapturedAt));
  if (!Number.isFinite(locationCapturedAt.getTime()) || now.getTime() - locationCapturedAt.getTime() > 120000 || locationCapturedAt.getTime() - now.getTime() > 30000) throw new BadRequestException('La ubicación venció. Vuelve a obtenerla.');
  return { description: body.description.trim(), providerType: String(body.providerType), latitude, longitude, accuracyMeters, locationCapturedAt };
}
export function validateDiagnosis(file?: Attachment) {
  if (!file?.buffer?.length || file.buffer.length > 10 * 1024 * 1024) throw new BadRequestException('Adjunta un diagnóstico de menos de 10 MB.');
  const b = file.buffer;
  const valid = (file.mimetype === 'application/pdf' && b.subarray(0,5).equals(Buffer.from('%PDF-')))
    || (file.mimetype === 'image/jpeg' && b[0] === 255 && b[1] === 216 && b[2] === 255)
    || (file.mimetype === 'image/png' && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    || (file.mimetype === 'image/webp' && b.subarray(0,4).toString() === 'RIFF' && b.subarray(8,12).toString() === 'WEBP');
  if (!valid) throw new BadRequestException('Adjunta un PDF o una imagen JPG, PNG o WEBP.');
  return { name: file.originalname.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0,180) || 'diagnostico', mimeType: file.mimetype, sizeBytes: b.length };
}

@Injectable()
export class MiRevMedicalService {
  constructor(private readonly prisma: PrismaService, private readonly employees: EmployeesService, private readonly storage: AttendanceStorageService) {}
  async staff(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { active: true, role: true } });
    if (!user?.active || (user.role !== Role.ADMIN && user.role !== Role.OFFICE)) throw new ForbiddenException('Solo oficina puede configurar EPS y ARL.');
  }
  private entry(employeeId: string, now: Date) {
    const { start, end } = medicalDay(now);
    return this.prisma.attendancePunch.findFirst({ where: { employeeId, kind: 'CHECK_IN', status: { not: 'REJECTED' }, occurredAt: { gte: start, lt: end } }, orderBy: { occurredAt: 'desc' }, select: { id: true } });
  }
  async today(userId: string) {
    const employeeId = await this.employees.ownEmployeeId(userId), now = new Date();
    const [entry, leave] = await Promise.all([
      this.entry(employeeId, now),
      this.prisma.miRevMedicalLeave.findUnique({ where: { employeeId_day: { employeeId, day: medicalDay(now).day } }, select: leaveSelect }),
    ]);
    return { selfieRequired: !entry, leave };
  }
  async create(userId: string, body: Record<string, unknown>, selfie?: Buffer) {
    const employeeId = await this.employees.ownEmployeeId(userId), now = new Date();
    const data = medicalData(body, now), clientRequestId = String(body.clientRequestId);
    // Hash stable form fields so a network retry can use refreshed GPS without duplicating a leave.
    const requestHash = createHash('sha256').update(JSON.stringify({ description: data.description, providerType: data.providerType })).digest('hex');
    const prior = await this.prisma.miRevMedicalLeave.findUnique({ where: { employeeId_clientRequestId: { employeeId, clientRequestId } }, select: { ...leaveSelect, requestHash: true } });
    if (prior) {
      if (prior.requestHash !== requestHash) throw new ConflictException('La solicitud cambió. Abre un formulario nuevo.');
      const { requestHash: _, ...result } = prior; return result;
    }
    const sourceEntry = await this.entry(employeeId, now);
    let selfieKey: string | null = null;
    if (!sourceEntry) {
      if (!selfie?.length || selfie.length > 5 * 1024 * 1024) throw new BadRequestException('Como no has marcado entrada hoy, toma una selfie para registrar la incapacidad.');
      let image: Buffer;
      try {
        const metadata = await sharp(selfie, { limitInputPixels: 20000000 }).metadata();
        if (!metadata.width || !metadata.height || metadata.width < 120 || metadata.height < 120) throw new Error();
        image = await sharp(selfie, { limitInputPixels: 20000000 }).rotate().resize(1024,1024,{ fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      } catch { throw new BadRequestException('No pudimos leer la selfie. Tómala nuevamente.'); }
      selfieKey = `attendance-encrypted/medical-selfies/${employeeId}/${randomUUID()}.bin`;
      await this.storage.put(selfieKey, image);
    }
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${employeeId} FOR UPDATE`;
        const employee = await tx.employee.findUnique({ where: { id: employeeId }, select: { eps: true, arl: true, active: true, userId: true, user: { select: { active: true } } } });
        if (!employee?.active || employee.userId !== userId || !employee.user?.active) throw new ForbiddenException('Tu cuenta cambió. Inicia sesión nuevamente.');
        if (await tx.miRevMedicalLeave.findUnique({ where: { employeeId_day: { employeeId, day: medicalDay(now).day } }, select: { id: true } })) throw new ConflictException('Ya tienes una incapacidad registrada hoy. Actualiza el inicio para verla.');
        return tx.miRevMedicalLeave.create({ data: { ...data, employeeId, userId, clientRequestId, requestHash, day: medicalDay(now).day, sourceEntryId: sourceEntry?.id, selfieKey, providerName: data.providerType === 'EPS' ? employee.eps : employee.arl }, select: leaveSelect });
      });
    } catch (error) { if (selfieKey) await this.storage.remove(selfieKey).catch(() => undefined); throw error; }
  }
  async diagnosis(userId: string, medicalLeaveId: string, file?: Attachment) {
    const employeeId = await this.employees.ownEmployeeId(userId), metadata = validateDiagnosis(file);
    const leave = await this.prisma.miRevMedicalLeave.findFirst({ where: { id: medicalLeaveId, employeeId }, select: { id: true } });
    if (!leave) throw new NotFoundException('Incapacidad no encontrada.');
    const evidenceKey = `attendance-encrypted/medical-diagnoses/${employeeId}/${medicalLeaveId}/${randomUUID()}.bin`;
    await this.storage.put(evidenceKey, file!.buffer);
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${employeeId} FOR UPDATE`;
        const actor = await tx.user.findUnique({ where: { id: userId }, select: { active: true, employee: { select: { id: true, active: true } } } });
        if (!actor?.active || !actor.employee?.active || actor.employee.id !== employeeId) throw new ForbiddenException('Tu cuenta cambió.');
        if (await tx.miRevMedicalDiagnosis.count({ where: { medicalLeaveId } }) >= 5) throw new BadRequestException('Esta incapacidad ya tiene 5 soportes. Contacta a oficina.');
        return tx.miRevMedicalDiagnosis.create({ data: { ...metadata, medicalLeaveId, evidenceKey }, select: diagnosisSelect });
      });
    } catch (error) { await this.storage.remove(evidenceKey).catch(() => undefined); throw error; }
  }
  async office(userId: string) {
    await this.staff(userId);
    return this.prisma.employee.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, lastName: true, eps: true, arl: true } });
  }
  async updateDetails(userId: string, employeeId: string, body: { eps?: unknown; arl?: unknown }) {
    await this.staff(userId);
    const normalize = (value: unknown) => {
      if (typeof value !== 'string' || value.trim().length > 160) throw new BadRequestException('Revisa EPS y ARL (máximo 160 caracteres).');
      return value.trim() || null;
    };
    return this.prisma.employee.update({ where: { id: employeeId }, data: { eps: normalize(body.eps), arl: normalize(body.arl) }, select: { id: true, eps: true, arl: true } });
  }
}
