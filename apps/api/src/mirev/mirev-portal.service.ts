import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeesService } from '../transport/employees.service';

@Injectable()
export class MiRevPortalService {
  constructor(private readonly prisma: PrismaService, private readonly employees: EmployeesService) {}

  async documents(userId: string) {
    const employeeId = await this.employees.ownEmployeeId(userId);
    return this.prisma.fileObject.findMany({
      where: { entityType: 'EMPLOYEE', entityId: employeeId, employeeDocument: { is: { employeeId } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, category: true, displayName: true, originalName: true, mimeType: true, sizeBytes: true, expiresAt: true, createdAt: true },
    });
  }

  async document(userId: string, id: string) {
    const employeeId = await this.employees.ownEmployeeId(userId);
    const file = await this.prisma.fileObject.findFirst({
      where: { id, entityType: 'EMPLOYEE', entityId: employeeId, employeeDocument: { is: { employeeId } } },
      select: { objectKey: true, originalName: true, displayName: true, mimeType: true },
    });
    if (!file) throw new NotFoundException('Documento no encontrado.');
    if (!file.objectKey) throw new ServiceUnavailableException('Este documento necesita ser actualizado por oficina.');
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) throw new ServiceUnavailableException('Documentos temporalmente no disponibles.');
    const client = new S3Client({ region: 'auto', endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } });
    try {
      const object = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: file.objectKey }));
      if (!object.Body) throw new Error('Missing object');
      return { body: await object.Body.transformToByteArray(), name: file.displayName || file.originalName || 'documento', type: file.mimeType || 'application/octet-stream' };
    } catch { throw new ServiceUnavailableException('No pudimos descargar el documento. Vuelve a intentar.'); }
    finally { client.destroy(); }
  }
}
