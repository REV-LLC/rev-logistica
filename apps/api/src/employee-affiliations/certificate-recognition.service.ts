import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CertificateDecision,
  certificateReasons,
} from './certificate-analysis';
import { randomUUID } from 'node:crypto';
@Injectable()
export class CertificateRecognitionService {
  constructor(private readonly db: PrismaService) {}
  private async staff(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { active: true, role: true },
    });
    if (!user?.active || !['ADMIN', 'OFFICE'].includes(user.role))
      throw new ForbiddenException('Solo oficina puede revisar certificados.');
  }
  async list(userId: string) {
    await this.staff(userId);
    const select = {
      id: true,
      kind: true,
      status: true,
      reason: true,
      createdAt: true,
      appliedAt: true,
      identityVerified: true,
      issuedAt: true,
      candidateProviderId: true,
      employee: {
        select: {
          id: true,
          name: true,
          lastName: true,
          epsId: true,
          arlId: true,
          eps: true,
          arl: true,
        },
      },
      candidateProvider: { select: { id: true, name: true, active: true } },
      employeeDocument: {
        select: {
          fileObject: {
            select: {
              id: true,
              displayName: true,
              originalName: true,
              mimeType: true,
            },
          },
        },
      },
    } as const;
    const [pending, recent] = await Promise.all([
      this.db.employeeAffiliationRecognition.findMany({
        where: { status: { in: ['PENDING', 'PROCESSING', 'REVIEW'] } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 100,
        select,
      }),
      this.db.employeeAffiliationRecognition.findMany({
        where: { status: { in: ['APPLIED', 'DISMISSED'] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        select,
      }),
    ]);
    const rows = [...pending, ...recent];
    return rows.map((row) => ({
      ...row,
      message: row.reason
        ? certificateReasons[row.reason] || 'Requiere revisión de oficina.'
        : null,
    }));
  }
  async enqueueMissing() {
    await this.db
      .$executeRaw`INSERT INTO "EmployeeAffiliationRecognition" (id,"employeeDocumentId","employeeId","sourceFileObjectId",kind,"expectedProviderId","updatedAt")
   SELECT f.id,d.id,d."employeeId",f.id,f.category,CASE WHEN f.category='EPS' THEN e."epsId" ELSE e."arlId" END,NOW()
   FROM "EmployeeDocument" d JOIN "FileObject" f ON f.id=d."fileObjectId" JOIN "Employee" e ON e.id=d."employeeId"
   WHERE f."entityType"='EMPLOYEE' AND f."entityId"=d."employeeId" AND f.category IN ('EPS','ARL') AND f."fileType"<>'EVIDENCIA_WHATSAPP'
    AND NOT EXISTS (SELECT 1 FROM "WhatsappReportEvidence" w WHERE w."fileObjectId"=f.id)
    AND NOT EXISTS (SELECT 1 FROM "WhatsappInboundMessage" w WHERE w."evidenceFileObjectId"=f.id)
   ON CONFLICT ("employeeDocumentId") DO NOTHING`;
  }
  async claim() {
    const now = new Date();
    await this.db.employeeAffiliationRecognition.updateMany({
      where: {
        status: 'PROCESSING',
        attempts: { gte: 2 },
        leaseUntil: { lt: now },
      },
      data: {
        status: 'REVIEW',
        reason: 'PROCESSING_INTERRUPTED',
        leaseToken: null,
        leaseUntil: null,
      },
    });
    const id = randomUUID();
    const rows = await this.db.$queryRaw<
      Array<{ id: string }>
    >`UPDATE "EmployeeAffiliationRecognition" SET status='PROCESSING',attempts=attempts+1,"leaseToken"=${id},"leaseUntil"=NOW()+INTERVAL '240 seconds',"updatedAt"=NOW() WHERE id=(SELECT id FROM "EmployeeAffiliationRecognition" WHERE (status='PENDING' OR (status='PROCESSING' AND "leaseUntil"<NOW())) AND attempts<2 ORDER BY "createdAt",id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`;
    if (!rows.length) return null;
    return this.db.employeeAffiliationRecognition.findUnique({
      where: { id: rows[0].id },
      include: {
        employee: true,
        employeeDocument: { include: { fileObject: true } },
      },
    });
  }
  async finish(
    id: string,
    leaseToken: string,
    decision: CertificateDecision,
    readerMethod: string | null,
  ) {
    return this.db.$transaction(async (tx) => {
      if (decision.providerId)
        await tx.$queryRaw`SELECT id FROM "EmployeeAffiliationProvider" WHERE id=${decision.providerId} FOR UPDATE`;
      const initial = await tx.employeeAffiliationRecognition.findUnique({
        where: { id },
        select: { employeeId: true },
      });
      if (!initial) return;
      await tx.$queryRaw`SELECT id FROM "Employee" WHERE id=${initial.employeeId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "EmployeeAffiliationRecognition" WHERE id=${id} FOR UPDATE`;
      const job = await tx.employeeAffiliationRecognition.findUnique({
        where: { id },
        include: {
          employee: true,
          employeeDocument: { include: { fileObject: true } },
        },
      });
      if (
        !job ||
        job.status !== 'PROCESSING' ||
        job.leaseToken !== leaseToken ||
        !job.leaseUntil ||
        job.leaseUntil < new Date()
      )
        return;
      let reason = decision.reason;
      const file = job.employeeDocument?.fileObject;
      if (
        !file ||
        file.id !== job.sourceFileObjectId ||
        file.entityType !== 'EMPLOYEE' ||
        file.entityId !== job.employeeId ||
        file.category !== job.kind ||
        file.fileType !== job.kind
      )
        reason = 'DOCUMENT_REMOVED';
      if (!job.employee.active) reason = 'EMPLOYEE_INACTIVE';
      const actor = file
        ? await tx.user.findUnique({
            where: { id: file.createdBy },
            select: { active: true, role: true },
          })
        : null;
      if (file && (!actor?.active || !['ADMIN', 'OFFICE'].includes(actor.role)))
        reason = 'SOURCE_NOT_OFFICE';
      const current =
        job.kind === 'EPS' ? job.employee.epsId : job.employee.arlId;
      if (current !== job.expectedProviderId && current !== decision.providerId)
        reason = 'CONCURRENT_CHANGE';
      if (!reason && current && current !== decision.providerId)
        reason = 'DIFFERENT_CURRENT';
      const provider = decision.providerId
        ? await tx.employeeAffiliationProvider.findUnique({
            where: { id: decision.providerId },
          })
        : null;
      if (
        !reason &&
        (!provider || provider.kind !== job.kind || !provider.active)
      )
        reason = 'INACTIVE_ENTITY';
      if (!reason && !decision.identityVerified)
        reason = 'IDENTITY_UNCONFIRMED';
      if (!reason) {
        await tx.employee.update({
          where: { id: job.employeeId },
          data:
            job.kind === 'EPS'
              ? { epsId: provider!.id, eps: provider!.name }
              : { arlId: provider!.id, arl: provider!.name },
        });
      }
      return tx.employeeAffiliationRecognition.update({
        where: { id },
        data: {
          status: reason ? 'REVIEW' : 'APPLIED',
          reason,
          candidateProviderId: provider?.id || null,
          identityVerified: decision.identityVerified,
          issuedAt: decision.issuedAt,
          readerMethod,
          previousProviderId: current,
          appliedAt: reason ? null : new Date(),
          leaseToken: null,
          leaseUntil: null,
        },
      });
    });
  }
  async review(
    userId: string,
    id: string,
    body: {
      action?: unknown;
      providerId?: unknown;
      expectedCurrentId?: unknown;
      confirmed?: unknown;
    },
  ) {
    await this.staff(userId);
    if (body.action !== 'ASSIGN' && body.action !== 'DISMISS')
      throw new BadRequestException('Selecciona una acción.');
    const uuid = (value: unknown) =>
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      );
    if (
      body.action === 'ASSIGN' &&
      (!uuid(body.providerId) ||
        (body.expectedCurrentId !== null && !uuid(body.expectedCurrentId)) ||
        body.confirmed !== true)
    )
      throw new BadRequestException(
        'Revisa el certificado y confirma la entidad y el empleado.',
      );
    return this.db.$transaction(async (tx) => {
      if (body.action === 'ASSIGN')
        await tx.$queryRaw`SELECT id FROM "EmployeeAffiliationProvider" WHERE id=${body.providerId as string} FOR UPDATE`;
      const initial = await tx.employeeAffiliationRecognition.findUnique({
        where: { id },
        select: { employeeId: true },
      });
      if (!initial) throw new NotFoundException('Certificado no encontrado.');
      await tx.$queryRaw`SELECT id FROM "Employee" WHERE id=${initial.employeeId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "EmployeeAffiliationRecognition" WHERE id=${id} FOR UPDATE`;
      const job = await tx.employeeAffiliationRecognition.findUnique({
        where: { id },
        include: { employee: true, employeeDocument: { select: { id: true } } },
      });
      if (!job || job.status !== 'REVIEW')
        throw new ConflictException(
          'El certificado cambió o todavía se está revisando. Actualiza la lista.',
        );
      if (body.action === 'DISMISS')
        return tx.employeeAffiliationRecognition.update({
          where: { id },
          data: {
            status: 'DISMISSED',
            reviewedBy: userId,
            reviewedAt: new Date(),
          },
        });
      if (!job.employee.active || !job.employeeDocument)
        throw new BadRequestException(
          'El empleado o el documento ya no está disponible.',
        );
      const current =
        job.kind === 'EPS' ? job.employee.epsId : job.employee.arlId;
      if (current !== body.expectedCurrentId)
        throw new ConflictException(
          'La afiliación cambió. Actualiza antes de confirmar.',
        );
      const provider = await tx.employeeAffiliationProvider.findUnique({
        where: { id: body.providerId as string },
      });
      if (!provider?.active || provider.kind !== job.kind)
        throw new BadRequestException(
          'Selecciona una entidad activa de la categoría correcta.',
        );
      await tx.employee.update({
        where: { id: job.employeeId },
        data:
          job.kind === 'EPS'
            ? { epsId: provider.id, eps: provider.name }
            : { arlId: provider.id, arl: provider.name },
      });
      return tx.employeeAffiliationRecognition.update({
        where: { id },
        data: {
          status: 'APPLIED',
          candidateProviderId: provider.id,
          previousProviderId: current,
          reviewedBy: userId,
          reviewedAt: new Date(),
          appliedAt: new Date(),
        },
      });
    });
  }
}
