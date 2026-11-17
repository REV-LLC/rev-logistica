import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeesService } from '../transport/employees.service';
import { AttendanceStorageService } from './attendance-storage.service';
import { FaceClientService } from './face-client.service';
import {
  cosineSimilarity,
  distanceMeters,
  verificationReasons,
} from './attendance-rules';
import { syncAttendanceActivity } from '../whatsapp-reports/attendance-journals.service';
import { isAttendanceTestMode } from './attendance-test-mode';
import { TestSetupDto, PunchDto, ReviewDto, SiteLocationDto } from './attendance.dto';

type Actor = { sub: string; role: Role };
const siteSelect = {
  id: true,
  alias: true,
  worksite: {
    select: {
      id: true,
      name: true,
      attendanceLatitude: true,
      attendanceLongitude: true,
      attendanceRadiusMeters: true,
    },
  },
  customer: { select: { name: true } },
} satisfies Prisma.CustomerWorksiteSelect;
const punchSelect = {
  id: true,
  requestId: true,
  employeeId: true,
  attendanceId: true,
  kind: true,
  occurredAt: true,
  status: true,
  reasons: true,
  similarity: true,
  threshold: true,
  modelVersion: true,
  referencePhotoHash: true,
  latitude: true,
  longitude: true,
  accuracyMeters: true,
  distanceMeters: true,
  reviewedAt: true,
  reviewNote: true,
  reviewedByUserId: true,
  employee: { select: { name: true, lastName: true } },
  customerWorksite: { select: siteSelect },
} satisfies Prisma.AttendancePunchSelect;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
    private readonly face: FaceClientService,
    private readonly storage: AttendanceStorageService,
  ) {}
  private enabled() {
    if (process.env.ATTENDANCE_ENABLED !== 'true')
      throw new ServiceUnavailableException(
        'Las marcaciones PWA todavía no están habilitadas',
      );
  }
  async actor(actor: Actor, admin = false) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      include: { employee: true },
    });
    if (
      !user?.active ||
      user.role !== actor.role ||
      user.role === Role.WAREHOUSE_TABLET
    )
      throw new ForbiddenException('La cuenta no está habilitada');
    if (
      admin &&
      ![Role.ADMIN, Role.OFFICE].includes(user.role as 'ADMIN' | 'OFFICE')
    )
      throw new ForbiddenException();
    if (!admin && !user.employee?.active)
      throw new ForbiddenException(
        'Tu cuenta necesita un empleado activo vinculado. Contacta a oficina.',
      );
    return user;
  }
  async me(actor: Actor) {
    this.enabled();
    const user = await this.actor(actor);
    const employee = user.employee!;
    const [open, recent, reference, worksites] = await Promise.all([
      this.prisma.worksiteAttendance.findFirst({
        where: { employeeId: employee.id, leftAt: null },
        include: { customerWorksite: { select: siteSelect } },
      }),
      this.prisma.attendancePunch.findMany({
        where: { employeeId: employee.id },
        orderBy: { occurredAt: 'desc' },
        take: 20,
        select: punchSelect,
      }),
      this.prisma.employeeFaceReference.findUnique({
        where: { employeeId: employee.id },
        select: { approvedAt: true },
      }),
      this.prisma.customerWorksite.findMany({
        where: {
          active: true,
          worksite: { active: true },
          customer: { active: true },
        },
        select: siteSelect,
        orderBy: { worksite: { name: 'asc' } },
      }),
    ]);
    return {
      employee: {
        id: employee.id,
        name: `${employee.name} ${employee.lastName}`.trim(),
      },
      open,
      recent,
      referenceReady: Boolean(reference),
      testMode: isAttendanceTestMode(),
      worksites,
    };
  }
  async testSetup(actor: Actor, dto: TestSetupDto, image?: Buffer) {
    if (!isAttendanceTestMode()) throw new NotFoundException();
    this.enabled();
    const user = await this.actor(actor);
    if (user.employee!.id !== process.env.ATTENDANCE_TEST_EMPLOYEE_ID || user.role !== Role.EMPLOYEE)
      throw new ForbiddenException('Solo la cuenta ficticia puede configurar esta prueba');
    if (Math.abs(Date.now() - new Date(dto.locationCapturedAt).getTime()) > 120000)
      throw new BadRequestException('Actualiza la ubicación e intenta nuevamente');
    const jpeg = await this.normalize(image);
    const extraction = await this.face.extract(jpeg);
    const photoHash = createHash('sha256').update(jpeg).digest('hex');
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Employee" WHERE id = ${user.employee!.id} FOR UPDATE`;
      if (await tx.worksiteAttendance.findFirst({ where: { employeeId: user.employee!.id, leftAt: null } }))
        throw new ConflictException('Cierra la jornada antes de configurar otra prueba');
      const site = await tx.customerWorksite.findUnique({ where: { id: process.env.ATTENDANCE_TEST_SITE_ID } });
      if (!site) throw new ServiceUnavailableException('Obra de prueba sin configurar');
      const data = { vector: extraction.vector, modelVersion: extraction.modelVersion, photoHash, approvedByUserId: actor.sub, approvedAt: new Date() };
      await tx.employeeFaceReference.upsert({ where: { employeeId: user.employee!.id }, create: { employeeId: user.employee!.id, ...data }, update: data });
      await tx.worksite.update({ where: { id: site.worksiteId }, data: { attendanceLatitude: dto.latitude, attendanceLongitude: dto.longitude, attendanceRadiusMeters: 200 } });
    });
    // Only the reference vector is retained; the enrollment photo is discarded.
    return { ready: true, radiusMeters: 200 };
  }
  private async normalize(image?: Buffer) {
    if (!image?.length || image.length > 5 * 1024 * 1024)
      throw new BadRequestException(
        'La selfie es obligatoria y debe pesar menos de 5 MB',
      );
    try {
      return await sharp(image, { limitInputPixels: 20000000 })
        .rotate()
        .resize({
          width: 1024,
          height: 1024,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      throw new BadRequestException('La imagen no se puede leer');
    }
  }
  private threshold() {
    const value = Number(process.env.FACE_MATCH_THRESHOLD ?? 0.45);
    if (!Number.isFinite(value) || value < 0.2 || value > 0.95)
      throw new ServiceUnavailableException('Umbral facial inválido');
    return value;
  }
  async punch(actor: Actor, dto: PunchDto, image?: Buffer) {
    this.enabled();
    const occurredAt = new Date();
    const user = await this.actor(actor);
    const employeeId = user.employee!.id;
    const previous = await this.prisma.attendancePunch.findUnique({
      where: { requestId: dto.requestId },
      select: punchSelect,
    });
    if (previous) {
      if (previous.employeeId !== employeeId)
        throw new ConflictException('Identificador de marcación en uso');
      return previous;
    }
    const capturedAt = new Date(dto.locationCapturedAt);
    if (Math.abs(occurredAt.getTime() - capturedAt.getTime()) > 120000)
      throw new BadRequestException(
        'Actualiza la ubicación e intenta nuevamente',
      );
    const jpeg = await this.normalize(image);
    const ref = await this.prisma.employeeFaceReference.findUnique({
      where: { employeeId },
    });
    let extraction: Awaited<ReturnType<FaceClientService['extract']>> | null =
      null;
    try {
      extraction = await this.face.extract(jpeg);
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) throw error;
    }
    const threshold = this.threshold();
    const key = `attendance-encrypted/${employeeId}/${randomUUID()}.bin`;
    await this.storage.put(key, jpeg);
    let used = false;
    let inserted = false;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Same lock and partial unique index as WhatsApp: one open shift across channels.
        await tx.$queryRaw`SELECT id FROM "Employee" WHERE id = ${employeeId} FOR UPDATE`;
        const currentUser = await tx.user.findUnique({
          where: { id: actor.sub },
          include: { employee: true },
        });
        if (
          !currentUser?.active ||
          currentUser.role !== actor.role ||
          currentUser.employee?.id !== employeeId ||
          !currentUser.employee.active
        )
          throw new ForbiddenException();
        const duplicate = await tx.attendancePunch.findUnique({
          where: { requestId: dto.requestId },
          select: punchSelect,
        });
        if (duplicate) {
          if (duplicate.employeeId !== employeeId)
            throw new ConflictException('Identificador de marcación en uso');
          return duplicate;
        }
        const open = await tx.worksiteAttendance.findFirst({
          where: { employeeId, leftAt: null },
        });
        if (dto.kind === 'CHECK_IN' && open)
          throw new ConflictException(
            'Ya tienes una entrada abierta. Registra la salida.',
          );
        if (
          dto.kind === 'CHECK_OUT' &&
          (!open ||
            open.id !== dto.attendanceId ||
            occurredAt <= open.enteredAt)
        )
          throw new ConflictException(
            'La jornada cambió. Actualiza antes de registrar la salida.',
          );
        const siteId =
          dto.kind === 'CHECK_OUT'
            ? open!.customerWorksiteId
            : dto.customerWorksiteId;
        if (!siteId) throw new BadRequestException('Selecciona una obra');
        const site = await tx.customerWorksite.findFirst({
          where: {
            id: siteId,
            ...(dto.kind === 'CHECK_IN'
              ? {
                  active: true,
                  worksite: { active: true },
                  customer: { active: true },
                }
              : {}),
          },
          select: siteSelect,
        });
        if (!site) throw new BadRequestException('La obra no está disponible');
        const currentRef = await tx.employeeFaceReference.findUnique({
          where: { employeeId },
        });
        const compatible = Boolean(
          ref &&
          currentRef &&
          ref.photoHash === currentRef.photoHash &&
          ref.approvedAt.getTime() === currentRef.approvedAt.getTime() &&
          extraction &&
          ref.modelVersion === extraction.modelVersion,
        );
        const similarity = compatible
          ? cosineSimilarity(ref!.vector, extraction!.vector)
          : null;
        const w = site.worksite;
        const distance =
          w.attendanceLatitude !== null && w.attendanceLongitude !== null
            ? distanceMeters(
                dto.latitude,
                dto.longitude,
                w.attendanceLatitude,
                w.attendanceLongitude,
              )
            : null;
        const reasons = verificationReasons({
          similarity,
          threshold,
          referenceCompatible: compatible,
          distance,
          radius: w.attendanceRadiusMeters,
          accuracy: dto.accuracyMeters,
        });
        if (!extraction) reasons.push('FACE_SERVICE_UNAVAILABLE');
        const attendance =
          dto.kind === 'CHECK_IN'
            ? await tx.worksiteAttendance.create({
                data: {
                  employeeId,
                  customerWorksiteId: siteId,
                  enteredAt: occurredAt,
                },
              })
            : await tx.worksiteAttendance.update({
                where: { id: open!.id },
                data: { leftAt: occurredAt },
              });
        const punch = await tx.attendancePunch.create({
          data: {
            requestId: dto.requestId,
            employeeId,
            createdByUserId: actor.sub,
            customerWorksiteId: siteId,
            attendanceId: attendance.id,
            kind: dto.kind,
            occurredAt,
            latitude: dto.latitude,
            longitude: dto.longitude,
            accuracyMeters: dto.accuracyMeters,
            locationCapturedAt: capturedAt,
            distanceMeters: distance,
            similarity,
            threshold,
            modelVersion: extraction?.modelVersion,
            referencePhotoHash: ref?.photoHash,
            evidenceKey: key,
            status: reasons.length ? 'PENDING' : 'VERIFIED',
            reasons,
          },
          select: punchSelect,
        });
        await syncAttendanceActivity(tx, attendance.id, actor.sub);
        inserted = true;
        return punch;
      });
      used = inserted;
      return result;
    } finally {
      if (!used) {
        // A lost COMMIT response may still have saved the record. Never remove
        // its evidence unless a successful read proves the object is unreferenced.
        try {
          const referenced = await this.prisma.attendancePunch.findFirst({
            where: { evidenceKey: key },
            select: { id: true },
          });
          if (!referenced) await this.storage.remove(key);
        } catch {
          /* Keep encrypted evidence when database outcome is uncertain. */
        }
      }
    }
  }
  async references(actor: Actor) {
    await this.actor(actor, true);
    return this.prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        lastName: true,
        user: { select: { active: true, email: true, role: true } },
        faceReference: {
          select: { photoHash: true, modelVersion: true, approvedAt: true },
        },
      },
    });
  }
  private async candidate(employeeId: string) {
    const photo = await this.employees.getEmployeePhoto(employeeId);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of photo.body) {
      size += chunk.length;
      if (size > 5 * 1024 * 1024)
        throw new BadRequestException('Foto demasiado grande');
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const photoHash = createHash('sha256').update(buffer).digest('hex');
    const extraction = await this.face.extract(await this.normalize(buffer));
    return { ...extraction, photoHash };
  }
  async analyze(actor: Actor, employeeId: string) {
    await this.actor(actor, true);
    const { vector: _vector, ...result } = await this.candidate(employeeId);
    return result;
  }
  async approveReference(
    actor: Actor,
    employeeId: string,
    expectedHash: string,
  ) {
    await this.actor(actor, true);
    const c = await this.candidate(employeeId);
    if (c.photoHash !== expectedHash)
      throw new ConflictException(
        'La foto cambió. Revísala otra vez antes de aprobar.',
      );
    const data = {
      vector: c.vector,
      modelVersion: c.modelVersion,
      photoHash: c.photoHash,
      approvedByUserId: actor.sub,
      approvedAt: new Date(),
    };
    await this.prisma.employeeFaceReference.upsert({
      where: { employeeId },
      create: { employeeId, ...data },
      update: data,
    });
    return { approved: true };
  }
  async revokeReference(actor: Actor, employeeId: string) {
    await this.actor(actor, true);
    await this.prisma.employeeFaceReference.deleteMany({
      where: { employeeId },
    });
    return { revoked: true };
  }
  async list(actor: Actor, cursor?: string, status?: string) {
    await this.actor(actor, true);
    return this.prisma.attendancePunch.findMany({
      where: status ? { status } : {},
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: punchSelect,
    });
  }
  async shifts(actor: Actor) {
    await this.actor(actor, true);
    return this.prisma.worksiteAttendance.findMany({
      orderBy: { enteredAt: 'desc' },
      take: 100,
      include: {
        employee: { select: { name: true, lastName: true } },
        customerWorksite: { select: siteSelect },
      },
    });
  }
  async evidence(actor: Actor, id: string) {
    const user = await this.actor(
      actor,
      [Role.ADMIN, Role.OFFICE].includes(actor.role as 'ADMIN' | 'OFFICE'),
    );
    const punch = await this.prisma.attendancePunch.findUnique({
      where: { id },
    });
    if (
      !punch ||
      (![Role.ADMIN, Role.OFFICE].includes(user.role as 'ADMIN' | 'OFFICE') &&
        punch.employeeId !== user.employee?.id)
    )
      throw new NotFoundException();
    return this.storage.get(punch.evidenceKey);
  }
  async review(actor: Actor, id: string, dto: ReviewDto) {
    if (dto.note.trim().length < 5)
      throw new BadRequestException('Escribe el motivo de la decisión');
    await this.actor(actor, true);
    const result = await this.prisma.attendancePunch.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: dto.decision,
        reviewedAt: new Date(),
        reviewedByUserId: actor.sub,
        reviewNote: dto.note.trim(),
      },
    });
    if (!result.count)
      throw new ConflictException('La marcación ya fue revisada o no existe');
    return { reviewed: true };
  }
  async sites(actor: Actor) {
    await this.actor(actor, true);
    return this.prisma.customerWorksite.findMany({
      where: {
        active: true,
        worksite: { active: true },
        customer: { active: true },
      },
      select: siteSelect,
      orderBy: { worksite: { name: 'asc' } },
    });
  }
  async updateSite(actor: Actor, id: string, dto: SiteLocationDto) {
    await this.actor(actor, true);
    const site = await this.prisma.customerWorksite.findUnique({
      where: { id },
    });
    if (!site) throw new NotFoundException();
    await this.prisma.worksite.update({
      where: { id: site.worksiteId },
      data: {
        attendanceLatitude: dto.latitude,
        attendanceLongitude: dto.longitude,
        attendanceRadiusMeters: dto.radiusMeters,
      },
    });
    return { saved: true };
  }
}
