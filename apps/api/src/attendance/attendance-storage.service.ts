import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { isAttendanceTestMode } from './attendance-test-mode';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Existing R2 also serves public assets. Only authenticated API responses decrypt
// attendance photos; an R2/CDN URL exposes ciphertext, never a face image.
@Injectable()
export class AttendanceStorageService {
  private localPath(key: string) {
    if (!isAttendanceTestMode()) return null;
    if (!/^attendance-encrypted\/[a-f0-9-]+\/[a-f0-9-]+\.bin$/.test(key))
      throw new ServiceUnavailableException('Clave de evidencia inválida');
    return resolve('/attendance-test-data', key);
  }
  private config() {
    const {
      R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY,
      R2_BUCKET,
      ATTENDANCE_EVIDENCE_KEY,
    } = process.env;
    if (
      (!isAttendanceTestMode() && (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET)) ||
      !/^[0-9a-f]{64}$/i.test(ATTENDANCE_EVIDENCE_KEY ?? '')
    )
      throw new ServiceUnavailableException(
        'Almacenamiento de asistencia sin configurar',
      );
    return {
      key: Buffer.from(ATTENDANCE_EVIDENCE_KEY!, 'hex'),
      bucket: R2_BUCKET!,
      client: new S3Client({
        region: 'auto',
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: R2_ACCESS_KEY_ID!,
          secretAccessKey: R2_SECRET_ACCESS_KEY!,
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
    const local = this.localPath(key);
    if (local) {
      await mkdir(dirname(local), { recursive: true, mode: 0o700 });
      await writeFile(local, Buffer.concat([iv, cipher.getAuthTag(), encrypted]), { mode: 0o600, flag: 'wx' });
      return;
    }
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
    const local = this.localPath(key);
    let body: Buffer;
    if (local) body = await readFile(local);
    else {
      const obj = await c.client.send(new GetObjectCommand({ Bucket: c.bucket, Key: key }));
      if (!obj.Body) throw new ServiceUnavailableException('Evidencia no disponible');
      body = Buffer.from(await obj.Body.transformToByteArray());
    }
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
    const local = this.localPath(key);
    if (local) { await unlink(local).catch(error => { if (error.code !== 'ENOENT') throw error; }); return; }
    const c = this.config();
    await c.client.send(
      new DeleteObjectCommand({ Bucket: c.bucket, Key: key }),
    );
  }
}
