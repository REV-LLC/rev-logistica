import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateRecognitionService } from './certificate-recognition.service';
import {
  CertificateReadError,
  CertificateTextReader,
} from './certificate-text-reader';
import { analyzeCertificate, CertificateKind } from './certificate-analysis';
@Injectable()
export class CertificateRecognitionWorker
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private lastSeedAt = 0;
  constructor(
    private readonly db: PrismaService,
    private readonly recognition: CertificateRecognitionService,
    private readonly reader: CertificateTextReader,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'production') {
      this.timer = setInterval(() => {
        void this.tick().catch(() => undefined);
      }, 5000);
      this.timer.unref();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async download(key: string) {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } =
      process.env;
    if (
      !R2_ACCOUNT_ID ||
      !R2_ACCESS_KEY_ID ||
      !R2_SECRET_ACCESS_KEY ||
      !R2_BUCKET
    )
      throw new CertificateReadError('UNREADABLE');
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
    try {
      const response = await client.send(
        new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
      if (!response.Body) throw new CertificateReadError('UNREADABLE');
      if ((response.ContentLength || 0) > 10 * 1024 * 1024)
        throw new CertificateReadError('TOO_LARGE');
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        size += chunk.length;
        if (size > 10 * 1024 * 1024)
          throw new CertificateReadError('TOO_LARGE');
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } finally {
      client.destroy();
    }
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (Date.now() - this.lastSeedAt > 60000) {
        await this.recognition.enqueueMissing();
        this.lastSeedAt = Date.now();
      }
      const job = await this.recognition.claim();
      if (!job || !job.leaseToken) return;
      let decision = {
          providerId: null as string | null,
          identityVerified: false,
          issuedAt: null as Date | null,
          reason: 'UNREADABLE' as string | null,
        },
        method: string | null = null;
      try {
        const file = job.employeeDocument?.fileObject;
        if (
          !file ||
          file.id !== job.sourceFileObjectId ||
          file.entityType !== 'EMPLOYEE' ||
          file.entityId !== job.employeeId ||
          file.category !== job.kind ||
          file.fileType !== job.kind ||
          !file.objectKey
        )
          throw new CertificateReadError('DOCUMENT_REMOVED');
        if (!['EPS', 'ARL'].includes(job.kind))
          throw new CertificateReadError('WRONG_KIND');
        if ((file.sizeBytes || 0) > 10 * 1024 * 1024)
          throw new CertificateReadError('TOO_LARGE');
        const providers = await this.db.employeeAffiliationProvider.findMany({
            where: { kind: job.kind },
          }),
          others = await this.db.employee.findMany({
            where: { id: { not: job.employeeId } },
            select: { documentId: true },
          });
        const buffer = await this.download(file.objectKey);
        let result = await this.reader.read(buffer, file.mimeType || '');
        method = result.method;
        const analyze = (text: string) =>
          analyzeCertificate({
            text,
            kind: job.kind as CertificateKind,
            employee: job.employee,
            otherDocuments: others.map((e) => e.documentId),
            providers,
            now: new Date(),
            expiresAt: file.expiresAt,
          });
        decision = analyze(result.text);
        if (
          decision.reason &&
          [
            'UNREADABLE',
            'ENTITY_UNKNOWN',
            'IDENTITY_UNCONFIRMED',
            'DATE_UNCONFIRMED',
            'WRONG_KIND',
            'STATUS_UNCONFIRMED',
          ].includes(decision.reason) &&
          result.method === 'PDF_TEXT'
        ) {
          const ocr = await this.reader.read(buffer, file.mimeType || '', true);
          method = 'PDF_TEXT_AND_OCR';
          decision = analyze(result.text + '\n' + ocr.text);
        }
      } catch (error) {
        decision.reason =
          error instanceof CertificateReadError ? error.reason : 'UNREADABLE';
      }
      await this.recognition.finish(job.id, job.leaseToken, decision, method);
    } finally {
      this.busy = false;
    }
  }
}
