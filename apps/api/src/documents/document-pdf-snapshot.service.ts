import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  DocumentPdfService,
  type SharedDocument,
} from './document-pdf.service';

export const GENERATED_DOCUMENT_PDF = 'GENERATED_DOCUMENT_PDF';

type StoredPdfSnapshot = {
  id: string;
  documentId: string | null;
  storageKey: string;
  objectKey: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

@Injectable()
export class DocumentPdfSnapshotService {
  private readonly logger = new Logger(DocumentPdfSnapshotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentPdf: DocumentPdfService,
  ) {}

  async refresh(documentId: string) {
    const document = await this.loadDocument(documentId);
    const buffer = await this.documentPdf.render(document);
    const fileName = this.documentPdf.fileName(document);
    const config = this.getR2Config();
    const storage = this.createR2Client(config);
    const objectKey = `document/${document.id}/generated-pdf/${randomUUID()}.pdf`;

    await storage.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: 'application/pdf',
        Metadata: {
          documentId: document.id,
          generatedBy: 'rev-logistica',
        },
      }),
    );

    const previous = await this.prisma.fileObject.findMany({
      where: { documentId, fileType: GENERATED_DOCUMENT_PDF },
      select: { id: true, objectKey: true },
    });
    const publicUrl = `${config.publicBaseUrl}/${objectKey}`;
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.fileObject.deleteMany({
        where: { documentId, fileType: GENERATED_DOCUMENT_PDF },
      });
      return tx.fileObject.create({
        data: {
          documentId,
          entityType: 'DOCUMENT',
          entityId: documentId,
          fileType: GENERATED_DOCUMENT_PDF,
          category: GENERATED_DOCUMENT_PDF,
          displayName: fileName,
          originalName: fileName,
          storageKey: publicUrl,
          objectKey,
          storageProvider: 'R2',
          mimeType: 'application/pdf',
          sizeBytes: buffer.length,
          createdBy: document.createdBy,
        },
        select: this.snapshotSelect,
      });
    });

    await Promise.all(
      previous.flatMap((file) =>
        file.objectKey
          ? [
              storage
                .send(
                  new DeleteObjectCommand({
                    Bucket: config.bucket,
                    Key: file.objectKey,
                  }),
                )
                .catch((error) => {
                  const message =
                    error instanceof Error ? error.message : String(error);
                  this.logger.warn(
                    `No se pudo eliminar el PDF anterior ${file.id}: ${message}`,
                  );
                }),
            ]
          : [],
      ),
    );

    return created;
  }

  async getOrCreate(documentId: string) {
    const existing = await this.getStored(documentId);
    return existing ?? this.refresh(documentId);
  }

  async read(documentId: string) {
    const snapshot = await this.getOrCreate(documentId);
    if (!snapshot.objectKey) {
      throw new InternalServerErrorException(
        'El PDF guardado no tiene objectKey',
      );
    }
    const config = this.getR2Config();
    const response = await this.createR2Client(config).send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: snapshot.objectKey,
      }),
    );
    if (!response.Body)
      throw new NotFoundException('PDF guardado no encontrado');
    const bytes = await response.Body.transformToByteArray();
    return {
      buffer: Buffer.from(bytes),
      fileName: snapshot.originalName ?? 'documento.pdf',
    };
  }

  private getStored(documentId: string): Promise<StoredPdfSnapshot | null> {
    return this.prisma.fileObject.findFirst({
      where: { documentId, fileType: GENERATED_DOCUMENT_PDF },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: this.snapshotSelect,
    });
  }

  private async loadDocument(
    documentId: string,
  ): Promise<SharedDocument & { id: string; createdBy: string }> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        createdBy: true,
        type: true,
        status: true,
        consecutive: true,
        docDate: true,
        notes: true,
        creator: {
          select: {
            email: true,
            employee: { select: { name: true, lastName: true } },
          },
        },
        customerWorksite: {
          select: {
            alias: true,
            customer: { select: { name: true } },
            worksite: { select: { name: true, address: true } },
          },
        },
        items: {
          select: {
            quantity: true,
            requestedTag: true,
            conditionNote: true,
            sku: {
              select: {
                name: true,
                assetFamily: { select: { name: true } },
              },
            },
            asset: {
              select: {
                serialOrEngine: true,
                description: true,
                internalNumber: true,
                sku: {
                  select: {
                    name: true,
                    assetFamily: { select: { name: true } },
                  },
                },
              },
            },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        files: {
          select: {
            fileType: true,
            displayName: true,
            originalName: true,
            storageKey: true,
            mimeType: true,
          },
          where: {
            fileType: { in: ['SIGNATURE_RECEIVED', 'PHOTO_EVIDENCE'] },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!document) throw new NotFoundException('Document not found');

    const responsibleIds = this.parseResponsibleIds(document.notes);
    const employeeIds = [
      responsibleIds.driverId,
      responsibleIds.receiverId,
      responsibleIds.dispatcherId,
    ].filter((id): id is string => Boolean(id));
    const employees = employeeIds.length
      ? await this.prisma.employee.findMany({
          where: { id: { in: employeeIds } },
          select: { id: true, name: true, lastName: true },
        })
      : [];
    const employeeNameById = new Map(
      employees.map((employee) => [
        employee.id,
        `${employee.name} ${employee.lastName}`.trim(),
      ]),
    );
    const driverName = responsibleIds.driverId
      ? (employeeNameById.get(responsibleIds.driverId) ?? null)
      : null;
    const dispatcherName = responsibleIds.dispatcherId
      ? (employeeNameById.get(responsibleIds.dispatcherId) ?? null)
      : null;
    const receiverName = responsibleIds.receiverId
      ? (employeeNameById.get(responsibleIds.receiverId) ?? null)
      : null;
    const preparedBy = document.creator.employee
      ? `${document.creator.employee.name} ${document.creator.employee.lastName}`.trim()
      : document.creator.email;
    const isOnSite = this.parseDeliveryMode(document.notes) === 'ON_SITE';
    const { creator: _creator, ...pdfDocument } = document;

    return {
      ...pdfDocument,
      responsibles: {
        preparedBy,
        transportedBy: isOnSite
          ? (driverName ?? 'Sin conductor asignado')
          : 'No aplica - retiro en bodega',
        deliveredBy: isOnSite
          ? (driverName ?? 'Sin conductor asignado')
          : (dispatcherName ?? 'Sin despachador asignado'),
        receivedBy: receiverName,
      },
    };
  }

  private parseResponsibleIds(notes?: string | null) {
    const values = new Map<string, string>();
    notes
      ?.split('|')
      .map((value) => value.trim())
      .forEach((entry) => {
        const [key, ...rest] = entry.split(':');
        if (key && rest.length)
          values.set(key.trim().toLowerCase(), rest.join(':').trim());
      });
    return {
      driverId: values.get('conductor') || null,
      receiverId: values.get('recibe') || null,
      dispatcherId: values.get('despachador') || null,
    };
  }

  private parseDeliveryMode(notes?: string | null) {
    const entry = notes
      ?.split('|')
      .map((value) => value.trim())
      .find((value) => value.toLowerCase().startsWith('entrega:'));
    return entry?.split(':').slice(1).join(':').trim().toUpperCase() ===
      'ON_SITE'
      ? 'ON_SITE'
      : 'WAREHOUSE';
  }

  private readonly snapshotSelect = {
    id: true,
    documentId: true,
    storageKey: true,
    objectKey: true,
    originalName: true,
    mimeType: true,
    sizeBytes: true,
  } as const;

  private createR2Client(
    config: ReturnType<DocumentPdfSnapshotService['getR2Config']>,
  ) {
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
    return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
  }
}
