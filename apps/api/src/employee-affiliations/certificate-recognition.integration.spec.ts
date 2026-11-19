import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CertificateRecognitionController } from './certificate-recognition.controller';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import PDFDocument from 'pdfkit';
import { CertificateTextReader } from './certificate-text-reader';
import { CertificateRecognitionService } from './certificate-recognition.service';
import { CertificateRecognitionWorker } from './certificate-recognition.worker';
import { analyzeCertificate } from './certificate-analysis';
const url = process.env.EMPLOYEE_CERTIFICATE_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'real local certificate reader, queue, assignment and review',
  () => {
    let db: PrismaClient,
      service: CertificateRecognitionService,
      reader: CertificateTextReader,
      worker: CertificateRecognitionWorker,
      employee: any,
      office: any,
      eps: any,
      otherEps: any,
      arl: any;
    const blobs = new Map<string, Buffer>();
    const text = (brand = 'SANITAS', kind = 'EPS') =>
      `${kind} ${brand}\nCERTIFICADO DE AFILIACION\nANA MARIA PEREZ\nCEDULA 1234567890\nESTADO ACTIVO\nFECHA DE EXPEDICION: 19/11/2026`;
    async function pdf(content: string, image?: Buffer) {
      return new Promise<Buffer>((resolve) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const chunks: Buffer[] = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        if (image) doc.image(image, 0, 0, { width: 595 });
        else doc.fontSize(20).text(content, { lineGap: 8 });
        doc.end();
      });
    }
    async function queue(
      buffer: Buffer,
      mime = 'application/pdf',
      kind = 'EPS',
    ) {
      const key = randomUUID();
      blobs.set(key, buffer);
      const current = await db.employee.findUniqueOrThrow({
        where: { id: employee.id },
      });
      const created = await db.fileObject.create({
        data: {
          id: key,
          entityType: 'EMPLOYEE',
          entityId: employee.id,
          category: kind,
          fileType: kind,
          storageKey: 'https://fixture.invalid/' + key,
          objectKey: key,
          mimeType: mime,
          sizeBytes: buffer.length,
          createdBy: office.id,
          employeeDocument: {
            create: {
              employeeId: employee.id,
              affiliationRecognition: {
                create: {
                  employeeId: employee.id,
                  sourceFileObjectId: key,
                  kind,
                  expectedProviderId:
                    kind === 'EPS' ? current.epsId : current.arlId,
                },
              },
            },
          },
        },
        include: {
          employeeDocument: { include: { affiliationRecognition: true } },
        },
      });
      return created.employeeDocument!.affiliationRecognition!;
    }
    beforeAll(async () => {
      const target = new URL(url!);
      if (
        !['localhost', '127.0.0.1'].includes(target.hostname) ||
        target.pathname !== '/certificate_qa'
      )
        throw Error('Disposable local certificate_qa only');
      db = new PrismaClient({ datasourceUrl: url });
      await db.$executeRawUnsafe(
        'TRUNCATE TABLE "Employee", "User", "FileObject", "EmployeeAffiliationProvider" CASCADE',
      );
      employee = await db.employee.create({
        data: {
          name: 'ANA MARIA',
          lastName: 'PEREZ',
          documentId: '1234567890',
          role: 'OTHER',
        },
      });
      office = await db.user.create({
        data: {
          email: 'office@certificate-fixture.invalid',
          passwordHash: 'fixture-not-used',
          role: 'OFFICE',
        },
      });
      eps = await db.employeeAffiliationProvider.create({
        data: { kind: 'EPS', name: 'Sanitas', normalizedName: 'sanitas' },
      });
      otherEps = await db.employeeAffiliationProvider.create({
        data: { kind: 'EPS', name: 'Sura', normalizedName: 'sura' },
      });
      arl = await db.employeeAffiliationProvider.create({
        data: { kind: 'ARL', name: 'Positiva', normalizedName: 'positiva' },
      });
      service = new CertificateRecognitionService(db as any);
      reader = new CertificateTextReader();
      worker = new CertificateRecognitionWorker(db as any, service, reader);
      worker.download = async (key) => blobs.get(key)!;
    });
    afterAll(async () => {
      await db?.$disconnect();
    });
    it('reads an actual text PDF and assigns EPS while preserving ARL and the source file', async () => {
      const buffer = await pdf(text()),
        parsed = await reader.read(buffer, 'application/pdf');
      expect(parsed.method).toBe('PDF_TEXT');
      const job = await queue(buffer);
      await worker.tick();
      const result = await db.employeeAffiliationRecognition.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(result).toMatchObject({
        status: 'APPLIED',
        candidateProviderId: eps.id,
        identityVerified: true,
      });
      const person = await db.employee.findUniqueOrThrow({
        where: { id: employee.id },
      });
      expect(person).toMatchObject({
        epsId: eps.id,
        eps: 'Sanitas',
        arlId: null,
      });
      expect(
        await db.fileObject.findUnique({
          where: { id: job.sourceFileObjectId },
        }),
      ).not.toBeNull();
    });
    it('uses real Spanish OCR for an image and a scanned PDF', async () => {
      const input = join(tmpdir(), 'ocr-source.pdf'),
        output = join(tmpdir(), 'ocr-source');
      await writeFile(input, await pdf(text('POSITIVA', 'ARL')));
      execFileSync('pdftoppm', [
        '-singlefile',
        '-scale-to',
        '2000',
        '-png',
        input,
        output,
      ]);
      const image = await readFile(output + '.png');
      const scanned = await reader.read(
        await pdf('', image),
        'application/pdf',
      );
      expect(scanned.method).toBe('PDF_OCR');
      expect(scanned.text).toContain('1234567890');
      const job = await queue(image, 'image/png', 'ARL');
      await worker.tick();
      expect(
        await db.employeeAffiliationRecognition.findUnique({
          where: { id: job.id },
        }),
      ).toMatchObject({
        status: 'APPLIED',
        readerMethod: 'IMAGE_OCR',
        candidateProviderId: arl.id,
      });
      expect(
        await db.employee.findUnique({ where: { id: employee.id } }),
      ).toMatchObject({ epsId: eps.id, arlId: arl.id });
    }, 90000);
    it('does not overwrite a different office assignment, and supports explicit reviewed assignment', async () => {
      await db.employee.update({
        where: { id: employee.id },
        data: { epsId: otherEps.id, eps: otherEps.name },
      });
      const job = await queue(await pdf(text()));
      await worker.tick();
      expect(
        await db.employeeAffiliationRecognition.findUnique({
          where: { id: job.id },
        }),
      ).toMatchObject({ status: 'REVIEW', reason: 'DIFFERENT_CURRENT' });
      expect(
        await db.employee.findUnique({ where: { id: employee.id } }),
      ).toMatchObject({ epsId: otherEps.id, arlId: arl.id });
      await expect(
        service.review(office.id, job.id, {
          action: 'ASSIGN',
          providerId: eps.id,
          expectedCurrentId: otherEps.id,
          confirmed: false,
        }),
      ).rejects.toThrow();
      await service.review(office.id, job.id, {
        action: 'ASSIGN',
        providerId: eps.id,
        expectedCurrentId: otherEps.id,
        confirmed: true,
      });
      expect(
        await db.employee.findUnique({ where: { id: employee.id } }),
      ).toMatchObject({ epsId: eps.id, arlId: arl.id });
      expect(
        await db.employeeAffiliationRecognition.findUnique({
          where: { id: job.id },
        }),
      ).toMatchObject({ status: 'APPLIED', reviewedBy: office.id });
    });
    it('preserves a concurrent change, rejects stale manual confirmation and ignores expired leases', async () => {
      await db.employee.update({
        where: { id: employee.id },
        data: { epsId: null, eps: null },
      });
      const queued = await queue(await pdf(text()));
      const job = await service.claim();
      expect(job!.id).toBe(queued.id);
      const decision = analyzeCertificate({
        text: text(),
        kind: 'EPS',
        employee,
        otherDocuments: [],
        providers: [eps, otherEps, arl],
        now: new Date('2026-11-19T15:00:00Z'),
      });
      await db.employee.update({
        where: { id: employee.id },
        data: { epsId: otherEps.id, eps: otherEps.name },
      });
      await service.finish(job!.id, job!.leaseToken!, decision, 'PDF_TEXT');
      expect(
        await db.employeeAffiliationRecognition.findUnique({
          where: { id: job!.id },
        }),
      ).toMatchObject({ status: 'REVIEW', reason: 'CONCURRENT_CHANGE' });
      await expect(
        service.review(office.id, job!.id, {
          action: 'ASSIGN',
          providerId: eps.id,
          expectedCurrentId: null,
          confirmed: true,
        }),
      ).rejects.toThrow();
      const stale = await queue(await pdf(text()));
      const claimed = await service.claim();
      expect(claimed!.id).toBe(stale.id);
      await db.employeeAffiliationRecognition.update({
        where: { id: stale.id },
        data: { leaseUntil: new Date(0) },
      });
      await service.finish(
        stale.id,
        claimed!.leaseToken!,
        decision,
        'PDF_TEXT',
      );
      expect(
        await db.employee.findUnique({ where: { id: employee.id } }),
      ).toMatchObject({ epsId: otherEps.id });
      await db.employeeAffiliationRecognition.update({
        where: { id: stale.id },
        data: { attempts: 2 },
      });
      await service.claim();
      expect(
        await db.employeeAffiliationRecognition.findUnique({
          where: { id: stale.id },
        }),
      ).toMatchObject({ status: 'REVIEW', reason: 'PROCESSING_INTERRUPTED' });
    });
    it('protects the HTTP review endpoints and requires explicit office confirmation', async () => {
      const employeeUser = await db.user.create({
        data: {
          email: 'employee@certificate-fixture.invalid',
          passwordHash: 'fixture',
          role: 'EMPLOYEE',
        },
      });
      const module = await Test.createTestingModule({
        imports: [
          JwtModule.register({ secret: 'isolated-certificate-http-fixture' }),
        ],
        controllers: [CertificateRecognitionController],
        providers: [
          JwtAuthGuard,
          RolesGuard,
          { provide: PrismaService, useValue: db },
          { provide: CertificateRecognitionService, useValue: service },
        ],
      }).compile();
      const app = module.createNestApplication();
      await app.init();
      const jwt = module.get(JwtService),
        token = (user: any) =>
          jwt.sign({ sub: user.id, role: user.role }, { expiresIn: '5m' });
      try {
        await request(app.getHttpServer())
          .get('/employee-affiliations/certificates')
          .expect(401);
        const denied = await request(app.getHttpServer())
          .get('/employee-affiliations/certificates')
          .set('Authorization', 'Bearer ' + token(employeeUser));
        expect([401, 403]).toContain(denied.status);
        const rows = await request(app.getHttpServer())
          .get('/employee-affiliations/certificates')
          .set('Authorization', 'Bearer ' + token(office))
          .expect(200);
        expect(rows.body.length).toBeGreaterThan(0);
        expect(JSON.stringify(rows.body)).not.toContain('objectKey');
        const pending =
          await db.employeeAffiliationRecognition.findFirstOrThrow({
            where: { status: 'REVIEW' },
          });
        await request(app.getHttpServer())
          .post(`/employee-affiliations/certificates/${pending.id}/review`)
          .set('Authorization', 'Bearer ' + token(office))
          .send({
            action: 'ASSIGN',
            providerId: eps.id,
            expectedCurrentId: otherEps.id,
            confirmed: false,
          })
          .expect(400);
      } finally {
        await app.close();
      }
    });
    it('is idempotent, excludes operational evidence and does not expose raw OCR/storage keys to office', async () => {
      await service.enqueueMissing();
      const before = await db.employeeAffiliationRecognition.count();
      await service.enqueueMissing();
      expect(await db.employeeAffiliationRecognition.count()).toBe(before);
      await db.fileObject.create({
        data: {
          entityType: 'EMPLOYEE',
          entityId: employee.id,
          category: 'EVIDENCIA_WHATSAPP',
          fileType: 'EVIDENCIA_WHATSAPP',
          storageKey: 'fixture',
          createdBy: office.id,
        },
      });
      await service.enqueueMissing();
      expect(await db.employeeAffiliationRecognition.count()).toBe(before);
      const list = await service.list(office.id);
      expect(JSON.stringify(list)).not.toContain('storageKey');
      expect(JSON.stringify(list)).not.toContain('objectKey');
      await db.user.update({
        where: { id: office.id },
        data: { active: false },
      });
      await expect(service.list(office.id)).rejects.toThrow();
      await db.user.update({
        where: { id: office.id },
        data: { active: true },
      });
    });
  },
);
