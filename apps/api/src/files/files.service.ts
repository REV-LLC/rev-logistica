import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DocumentType, Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { Readable } from 'stream';
import { DocumentCustomerEmailsService } from '../document-emails/document-customer-emails.service';
import { PrismaService } from '../prisma/prisma.service';

export type UploadedBusinessFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export type FileEntityType =
  | 'DOCUMENT'
  | 'EMPLOYEE'
  | 'VEHICLE'
  | 'CUSTOMER'
  | 'ASSET';

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 12;
const STORAGE_PROVIDER = 'R2';
const EVIDENCE_FILE_TYPE = 'PHOTO_EVIDENCE';

const ENTITY_TYPES = new Set<FileEntityType>([
  'DOCUMENT',
  'EMPLOYEE',
  'VEHICLE',
  'CUSTOMER',
  'ASSET',
]);

const CATEGORIES_BY_ENTITY: Record<FileEntityType, Set<string>> = {
  DOCUMENT: new Set([
    'PHOTO_EVIDENCE',
    'SIGNATURE_RECEIVED',
    'DOCUMENTO',
    'FIRMA',
    'OTRO',
  ]),
  EMPLOYEE: new Set([
    'HOJA_VIDA',
    'CEDULA',
    'ARL',
    'EPS',
    'CURSO_ALTURAS',
    'CONTRATO',
    'CERTIFICADO',
    'GUIA_MOVILIDAD',
    'OTRO',
  ]),
  VEHICLE: new Set([
    'TARJETA_PROPIEDAD',
    'SOAT',
    'SEGURO',
    'TECNOMECANICA',
    'CONTRATO',
    'MANTENIMIENTO',
    'OTRO',
  ]),
  CUSTOMER: new Set([
    'RUT',
    'CAMARA_COMERCIO',
    'REPRESENTANTE_LEGAL',
    'CONTRATO',
    'CERTIFICADO',
    'OTRO',
  ]),
  ASSET: new Set([
    'PHOTO',
    'FICHA_TECNICA',
    'MANTENIMIENTO',
    'MANUAL',
    'CERTIFICADO',
    'OTRO',
  ]),
};

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/webp',
  'image/jpeg',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
]);

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentEmails: DocumentCustomerEmailsService,
  ) {}

  getCategories(entityType: string) {
    const normalized = this.normalizeEntityType(entityType);
    return [...CATEGORIES_BY_ENTITY[normalized]].map((value) => ({
      value,
      label: this.formatCategoryLabel(value),
    }));
  }

  async listEntityFiles(
    entityTypeInput: string,
    entityId: string,
    user: { id: string; role: Role },
  ) {
    const entityType = this.normalizeEntityType(entityTypeInput);
    await this.assertEntityAccess(entityType, entityId, user, 'read');
    return this.prisma.fileObject.findMany({
      where: { entityType, entityId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: this.fileSelect,
    });
  }

  async uploadEntityFiles(
    entityTypeInput: string,
    entityId: string,
    files: UploadedBusinessFile[] | undefined,
    payload: {
      category?: string;
      displayName?: string;
      expiresAt?: string;
    },
    user: { id: string; role: Role },
  ) {
    const entityType = this.normalizeEntityType(entityTypeInput);
    await this.assertEntityAccess(entityType, entityId, user, 'write');

    if (!files?.length) {
      throw new BadRequestException('At least one file is required');
    }
    if (files.length > MAX_FILES_PER_UPLOAD) {
      throw new BadRequestException(
        `Maximum ${MAX_FILES_PER_UPLOAD} files per upload`,
      );
    }

    const category = this.normalizeCategory(entityType, payload.category);
    const expiresAt = this.parseOptionalDate(payload.expiresAt, 'expiresAt');
    files.forEach((file) => this.validateFile(file));

    const config = this.getR2Config();
    const s3 = this.createR2Client(config);
    const uploaded: Array<{
      id: string;
      documentId: string | null;
      entityType: string | null;
      entityId: string | null;
      fileType: string;
      category: string | null;
      displayName: string | null;
      originalName: string | null;
      storageKey: string;
      objectKey: string | null;
      storageProvider: string;
      mimeType: string | null;
      sizeBytes: number | null;
      expiresAt: Date | null;
      createdAt: Date;
      createdBy: string;
    }> = [];
    for (const file of files) {
      const extension =
        EXTENSION_BY_MIME_TYPE[file.mimetype] ??
        this.inferExtension(file.originalname);
      const objectKey = `${entityType.toLowerCase()}/${entityId}/${category.toLowerCase()}/${randomUUID()}.${extension}`;
      await s3.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: objectKey,
          Body: file.buffer,
          ContentType: file.mimetype,
          Metadata: {
            originalName: this.sanitizeMetadataValue(file.originalname),
            category,
            entityType,
            entityId,
          },
        }),
      );

      const publicUrl = `${config.publicBaseUrl}/${objectKey}`;
      const created = await this.prisma.fileObject.create({
        data: {
          documentId: entityType === 'DOCUMENT' ? entityId : null,
          entityType,
          entityId,
          fileType: category,
          category,
          displayName: payload.displayName?.trim() || null,
          originalName: file.originalname,
          storageKey: publicUrl,
          objectKey,
          storageProvider: STORAGE_PROVIDER,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          expiresAt,
          createdBy: user.id,
        },
        select: this.fileSelect,
      });
      uploaded.push(created);
    }

    return { files: uploaded };
  }

  async uploadDocumentEvidence(
    documentId: string,
    files: UploadedBusinessFile[] | undefined,
    user: { id: string; role: Role },
  ) {
    const result = await this.uploadEntityFiles(
      'DOCUMENT',
      documentId,
      files,
      { category: EVIDENCE_FILE_TYPE },
      user,
    );

    try {
      await this.documentEmails.sendDraftIfNeeded(documentId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Draft customer email failed after evidence upload: ${message}`,
      );
    }

    return result;
  }

  async getFileDownload(fileId: string, user: { id: string; role: Role }) {
    const file = await this.prisma.fileObject.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        objectKey: true,
        storageKey: true,
        mimeType: true,
        originalName: true,
        displayName: true,
        createdBy: true,
      },
    });
    if (!file) throw new NotFoundException('File not found');
    if (!file.entityType || !file.entityId) {
      throw new BadRequestException(
        'File is not linked to a downloadable entity',
      );
    }
    await this.assertEntityAccess(file.entityType, file.entityId, user, 'read');
    if (!file.objectKey) {
      throw new BadRequestException('File does not have an R2 object key');
    }

    const config = this.getR2Config();
    const response = await this.createR2Client(config).send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: file.objectKey,
      }),
    );
    if (!response.Body) {
      throw new NotFoundException('File object not found');
    }

    return {
      body: response.Body as Readable,
      contentType:
        response.ContentType ?? file.mimeType ?? 'application/octet-stream',
      contentLength: response.ContentLength,
      etag: response.ETag,
      fileName:
        file.displayName?.trim() ||
        file.originalName?.trim() ||
        `${file.id}.bin`,
    };
  }

  async deleteFile(fileId: string, user: { id: string; role: Role }) {
    const file = await this.prisma.fileObject.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        objectKey: true,
      },
    });
    if (!file) throw new NotFoundException('File not found');
    if (!file.entityType || !file.entityId) {
      throw new BadRequestException('File is not linked to a removable entity');
    }
    await this.assertEntityAccess(
      file.entityType,
      file.entityId,
      user,
      'write',
    );

    if (file.objectKey) {
      const config = this.getR2Config();
      await this.createR2Client(config).send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: file.objectKey,
        }),
      );
    }

    await this.prisma.fileObject.delete({ where: { id: file.id } });
    return { ok: true };
  }

  async deleteFileForRetention(fileId: string) {
    const file = await this.prisma.fileObject.findUnique({
      where: { id: fileId },
      select: { id: true, objectKey: true },
    });
    if (!file) return { ok: true };

    if (file.objectKey) {
      const config = this.getR2Config();
      await this.createR2Client(config).send(
        new DeleteObjectCommand({ Bucket: config.bucket, Key: file.objectKey }),
      );
    }
    await this.prisma.fileObject.delete({ where: { id: file.id } });
    return { ok: true };
  }

  private readonly fileSelect = {
    id: true,
    documentId: true,
    entityType: true,
    entityId: true,
    fileType: true,
    category: true,
    displayName: true,
    originalName: true,
    storageKey: true,
    objectKey: true,
    storageProvider: true,
    mimeType: true,
    sizeBytes: true,
    expiresAt: true,
    createdAt: true,
    createdBy: true,
  } as const;

  private normalizeEntityType(value: string): FileEntityType {
    const normalized = value.trim().toUpperCase() as FileEntityType;
    if (!ENTITY_TYPES.has(normalized)) {
      throw new BadRequestException('Invalid file entity type');
    }
    return normalized;
  }

  private normalizeCategory(entityType: FileEntityType, value?: string) {
    const normalized = value?.trim().toUpperCase() || 'OTRO';
    const allowed = CATEGORIES_BY_ENTITY[entityType];
    if (!allowed.has(normalized)) {
      throw new BadRequestException(`Invalid category for ${entityType}`);
    }
    return normalized;
  }

  private async assertEntityAccess(
    entityType: string,
    entityId: string,
    user: { id: string; role: Role },
    mode: 'read' | 'write',
  ) {
    if (user.role === Role.OPERATOR) {
      if (entityType !== 'ASSET') {
        throw new ForbiddenException('Operators can only access asset evidence');
      }
      const ownAsset = await this.prisma.asset.findFirst({
        where: {
          id: entityId,
          warehouseOwner: { type: 'OWN' },
          sku: { chargeType: 'HOUR' },
        },
        select: { id: true },
      });
      if (!ownAsset) {
        throw new ForbiddenException('Operators can only access assets from own warehouses');
      }
      return;
    }

    if (mode === 'write' && user.role === Role.DRIVER) {
      if (entityType !== 'DOCUMENT') {
        throw new ForbiddenException(
          'Drivers can only upload document evidence',
        );
      }
    }

    if (entityType === 'DOCUMENT') {
      const document = await this.prisma.document.findUnique({
        where: { id: entityId },
        select: { id: true, type: true, createdBy: true },
      });
      if (!document) throw new NotFoundException('Document not found');
      if (
        document.type !== DocumentType.REMISSION &&
        document.type !== DocumentType.RETURN
      ) {
        throw new BadRequestException(
          'Files are only available for remissions and returns',
        );
      }
      if (user.role === Role.DRIVER && document.createdBy !== user.id) {
        throw new ForbiddenException(
          'Drivers can only access their own document files',
        );
      }
      return;
    }

    if (entityType === 'EMPLOYEE') {
      const found = await this.prisma.employee.findUnique({
        where: { id: entityId },
        select: { id: true },
      });
      if (!found) throw new NotFoundException('Employee not found');
      return;
    }

    if (entityType === 'VEHICLE') {
      const found = await this.prisma.vehicle.findUnique({
        where: { id: entityId },
        select: { id: true },
      });
      if (!found) throw new NotFoundException('Vehicle not found');
      return;
    }

    if (entityType === 'CUSTOMER') {
      const found = await this.prisma.customer.findUnique({
        where: { id: entityId },
        select: { id: true },
      });
      if (!found) throw new NotFoundException('Customer not found');
      return;
    }

    if (entityType === 'ASSET') {
      const found = await this.prisma.asset.findUnique({
        where: { id: entityId },
        select: { id: true },
      });
      if (!found) throw new NotFoundException('Asset not found');
      return;
    }

    throw new BadRequestException('Invalid file entity type');
  }

  private validateFile(file: UploadedBusinessFile) {
    if (!file.buffer?.length) {
      throw new BadRequestException('File is empty');
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('Files must be 100 MB or smaller');
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('File type is not allowed');
    }
    if (!this.hasExpectedSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException(
        'File content does not match the declared type',
      );
    }
  }

  private hasExpectedSignature(buffer: Buffer, mimetype: string) {
    if (mimetype === 'image/png') {
      return buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (mimetype === 'image/jpeg') {
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mimetype === 'image/webp') {
      return (
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }
    if (mimetype === 'application/pdf') {
      return buffer.subarray(0, 4).toString('ascii') === '%PDF';
    }
    if (mimetype.includes('openxmlformats-officedocument')) {
      return buffer.subarray(0, 2).toString('ascii') === 'PK';
    }
    if (
      mimetype === 'application/msword' ||
      mimetype === 'application/vnd.ms-excel'
    ) {
      return buffer
        .subarray(0, 4)
        .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
    }
    return mimetype === 'text/plain' || mimetype === 'text/csv';
  }

  private parseOptionalDate(value: string | undefined, fieldName: string) {
    const raw = value?.trim();
    if (!raw) return null;
    const parsed = new Date(raw.length === 10 ? `${raw}T12:00:00.000Z` : raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} is invalid`);
    }
    return parsed;
  }

  private formatCategoryLabel(value: string) {
    return value
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private inferExtension(fileName: string) {
    const match = fileName
      .trim()
      .toLowerCase()
      .match(/\.([a-z0-9]{1,8})$/);
    return match?.[1] ?? 'bin';
  }

  private sanitizeMetadataValue(value: string) {
    return value.replace(/[^\x20-\x7e]/g, '').slice(0, 256);
  }

  private createR2Client(config: ReturnType<FilesService['getR2Config']>) {
    return new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  private getR2Config() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET;
    const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, '');

    if (
      !accountId ||
      !accessKeyId ||
      !secretAccessKey ||
      !bucket ||
      !publicBaseUrl
    ) {
      throw new InternalServerErrorException('R2 storage is not configured');
    }

    return {
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      publicBaseUrl,
    };
  }
}
