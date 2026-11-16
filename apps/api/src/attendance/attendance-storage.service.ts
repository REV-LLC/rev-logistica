import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Existing R2 also serves public assets. Only authenticated API responses decrypt
// attendance photos; an R2/CDN URL exposes ciphertext, never a face image.
@Injectable()
export class AttendanceStorageService {
  private config() {
    const {
      R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY,
      R2_BUCKET,
      ATTENDANCE_EVIDENCE_KEY,
    } = process.env;
    if (
      !R2_ACCOUNT_ID ||
      !R2_ACCESS_KEY_ID ||
      !R2_SECRET_ACCESS_KEY ||
      !R2_BUCKET ||
      !/^[0-9a-f]{64}$/i.test(ATTENDANCE_EVIDENCE_KEY ?? '')
    )
      throw new ServiceUnavailableException(
        'Almacenamiento de asistencia sin configurar',
      );
    return {
      key: Buffer.from(ATTENDANCE_EVIDENCE_KEY!, 'hex'),
      bucket: R2_BUCKET,
      client: new S3Client({
        region: 'auto',
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: R2_ACCESS_KEY_ID,
          secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
      }),
    };
  }
  async put(key: string, image: Buffer) {
    const c = this.config();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', c.key, iv);
    cipher.setAAD(Buffer.from(key));
    const encrypted = Buffer.concat([cipher.update(image), cipher.final()]);
    await c.client.send(
      new PutObjectCommand({
        Bucket: c.bucket,
        Key: key,
        Body: Buffer.concat([iv, cipher.getAuthTag(), encrypted]),
        ContentType: 'application/octet-stream',
        CacheControl: 'no-store',
      }),
    );
  }
  async get(key: string) {
    const c = this.config();
    const obj = await c.client.send(
      new GetObjectCommand({ Bucket: c.bucket, Key: key }),
    );
    if (!obj.Body)
      throw new ServiceUnavailableException('Evidencia no disponible');
    const body = Buffer.from(await obj.Body.transformToByteArray());
    const decipher = createDecipheriv(
      'aes-256-gcm',
      c.key,
      body.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(key));
    decipher.setAuthTag(body.subarray(12, 28));
    return Buffer.concat([
      decipher.update(body.subarray(28)),
      decipher.final(),
    ]);
  }
  async remove(key: string) {
    const c = this.config();
    await c.client.send(
      new DeleteObjectCommand({ Bucket: c.bucket, Key: key }),
    );
  }
}
