import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentItemBillingStatus,
  DocumentStatus,
  DocumentType,
  NotificationChannel,
  Prisma,
  Role,
} from '@prisma/client';
import { DocumentCustomerEmailsService } from '../document-emails/document-customer-emails.service';
import { DocumentCustomerMessagesService } from '../document-messages/document-customer-messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { normalizeRequiredColombianPhone } from '../messaging/colombian-phone';
import { DocumentPdfService } from './document-pdf.service';

const REMISSION_ITEMS_PER_DOCUMENT = 20;

export function assertCanViewDocument(
  document: { createdBy: string },
  requester?: { role: Role; userId: string },
) {
  if (
    requester?.role === Role.DRIVER &&
    document.createdBy !== requester.userId
  ) {
    throw new ForbiddenException(
      'Drivers can only view their own documents',
    );
  }
}

@Injectable()
export class DocumentsService {
  private readonly businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly documentEmails: DocumentCustomerEmailsService,
    private readonly documentMessages: DocumentCustomerMessagesService,
    private readonly documentPdf: DocumentPdfService,
  ) {}

  private getConsecutivePrefix(type: DocumentType) {
    if (type === DocumentType.REMISSION) return 'RM';
    if (type === DocumentType.RETURN) return 'DV';
    return null;
  }

  private normalizeRequestedConsecutive(
    type: DocumentType,
    requested?: string,
  ) {
    const prefix = this.getConsecutivePrefix(type);
    const raw = requested?.trim() ?? '';
    if (!raw) return null;
    if (!prefix) return raw;
    const cleaned = raw.replace(/^(RM|DV)[\s\-_]*/i, '').trim();
    if (!cleaned) return null;
    if (!/^\d+$/.test(cleaned)) {
      throw new BadRequestException('El consecutivo debe ser numérico');
    }
    return `${prefix}${cleaned.padStart(6, '0')}`;
  }

  private parseConsecutiveSuffix(value: string, prefix: string) {
    const match = value
      .trim()
      .toUpperCase()
      .match(new RegExp(`^${prefix}(\\d+)$`));
    if (!match) return null;
    return Number(match[1]);
  }

  private async generateNextConsecutive(
    type: DocumentType,
    tx: Prisma.TransactionClient,
  ) {
    const prefix = this.getConsecutivePrefix(type);
    if (!prefix) return null;

    const rows = await tx.document.findMany({
      where: {
        type,
        consecutive: {
          startsWith: prefix,
        },
      },
      select: { consecutive: true },
    });

    let max = 0;
    rows.forEach((row) => {
      const value = row.consecutive ?? '';
      const suffix = this.parseConsecutiveSuffix(value, prefix);
      if (suffix && suffix > max) max = suffix;
    });

    const next = max + 1;
    return `${prefix}${String(next).padStart(6, '0')}`;
  }

  private async resolveConsecutive(
    type: DocumentType,
    tx: Prisma.TransactionClient,
    requested?: string,
  ) {
    const normalized = this.normalizeRequestedConsecutive(type, requested);
    if (normalized) return normalized;
    return this.generateNextConsecutive(type, tx);
  }

  private isConsecutiveConflict(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code !== 'P2002') return false;
    const targets = Array.isArray(error.meta?.target)
      ? error.meta.target.map((value) => String(value))
      : [String(error.meta?.target ?? '')];
    return targets.some((target) => target.includes('consecutive'));
  }

  private async buildRejectedConsecutive(
    tx: Prisma.TransactionClient,
    currentConsecutive?: string | null,
  ) {
    const normalized = currentConsecutive?.trim();
    if (!normalized) return null;

    const base = `RJ-${normalized.toUpperCase()}`;
    const rows = await tx.document.findMany({
      where: {
        consecutive: {
          startsWith: base,
        },
      },
      select: { consecutive: true },
    });

    const used = new Set(
      rows
        .map((row) => row.consecutive?.trim().toUpperCase())
        .filter((value): value is string => Boolean(value)),
    );

    if (!used.has(base)) return base;

    let attempt = 2;
    while (used.has(`${base}-${attempt}`)) {
      attempt += 1;
    }
    return `${base}-${attempt}`;
  }

  private chunkItems<T>(items: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private buildDocumentItemCreateManyData(
    documentId: string,
    items: Array<{
      skuId: string | null;
      assetId: string | null;
      quantity: Prisma.Decimal | null;
      requestedTag: string | null;
      condition: string | null;
      conditionNote: string | null;
      damageCostEstimate?: Prisma.Decimal | null;
      billingCutoffDate?: Date | null;
      returnedAt?: Date | null;
      billingStatus?: DocumentItemBillingStatus;
      billingNote?: string | null;
      billingUpdatedAt?: Date | null;
      billingUpdatedBy?: string | null;
    }>,
  ) {
    return items.map((item) => ({
      documentId,
      skuId: item.skuId ?? null,
      assetId: item.assetId ?? null,
      quantity: item.quantity ?? (item.skuId ? 1 : null),
      requestedTag: item.requestedTag?.trim() || null,
      condition: item.condition?.trim() || null,
      conditionNote: item.conditionNote?.trim() || null,
      damageCostEstimate: item.damageCostEstimate ?? null,
      billingCutoffDate: item.billingCutoffDate ?? null,
      returnedAt: item.returnedAt ?? null,
      billingStatus: item.billingStatus ?? DocumentItemBillingStatus.OPEN,
      billingNote: item.billingNote?.trim() || null,
      billingUpdatedAt: item.billingUpdatedAt ?? null,
      billingUpdatedBy: item.billingUpdatedBy ?? null,
    }));
  }

  private async splitRemissionDraftDocument(document: {
    id: string;
    type: DocumentType;
    status: DocumentStatus;
    consecutive: string | null;
    warehouseId: string | null;
    customerWorksiteId: string | null;
    createdBy: string;
    docDate: Date;
    notes: string | null;
    officeModifiedAt?: Date | null;
    officeModifiedBy?: string | null;
    items: Array<{
      id: string;
      skuId: string | null;
      assetId: string | null;
      quantity: Prisma.Decimal | null;
      requestedTag: string | null;
      condition: string | null;
      conditionNote: string | null;
      damageCostEstimate: Prisma.Decimal | null;
      billingCutoffDate: Date | null;
      returnedAt: Date | null;
      billingStatus: DocumentItemBillingStatus;
      billingNote: string | null;
      billingUpdatedAt: Date | null;
      billingUpdatedBy: string | null;
    }>;
    files: Array<{
      fileType: string;
      storageKey: string;
      mimeType: string | null;
      objectKey?: string | null;
      originalName?: string | null;
      displayName?: string | null;
      sizeBytes?: number | null;
      expiresAt?: Date | null;
    }>;
  }) {
    const chunks = this.chunkItems(
      document.items,
      REMISSION_ITEMS_PER_DOCUMENT,
    );
    if (chunks.length <= 1) return [document.id];

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const createdDocumentIds: string[] = [document.id];

          await tx.documentItem.deleteMany({
            where: { documentId: document.id },
          });
          await tx.documentItem.createMany({
            data: this.buildDocumentItemCreateManyData(document.id, chunks[0]),
          });

          for (const chunk of chunks.slice(1)) {
            const consecutive = await this.resolveConsecutive(
              document.type,
              tx,
            );
            const created = await tx.document.create({
              data: {
                type: document.type,
                status: DocumentStatus.DRAFT,
                consecutive,
                warehouseId: document.warehouseId,
                customerWorksiteId: document.customerWorksiteId,
                createdBy: document.createdBy,
                docDate: document.docDate,
                notes: document.notes,
                officeModifiedAt: document.officeModifiedAt ?? null,
                officeModifiedBy: document.officeModifiedBy ?? null,
              },
              select: { id: true },
            });

            await tx.documentItem.createMany({
              data: this.buildDocumentItemCreateManyData(created.id, chunk),
            });

            if (document.files.length) {
              await tx.fileObject.createMany({
                data: document.files.map((file) => ({
                  documentId: created.id,
                  entityType: 'DOCUMENT',
                  entityId: created.id,
                  fileType: file.fileType,
                  category: file.fileType,
                  displayName: file.displayName ?? null,
                  originalName: file.originalName ?? null,
                  storageKey: file.storageKey,
                  objectKey: file.objectKey ?? null,
                  mimeType: file.mimeType ?? null,
                  sizeBytes: file.sizeBytes ?? null,
                  expiresAt: file.expiresAt ?? null,
                  createdBy: document.createdBy,
                })),
              });
            }

            createdDocumentIds.push(created.id);
          }

          return createdDocumentIds;
        });
      } catch (error) {
        if (this.isConsecutiveConflict(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException(
      'No se pudo dividir la remisión con consecutivos únicos',
    );
  }

  private async approveLoadedRequestDocument(
    document: {
      id: string;
      type: DocumentType;
      status: DocumentStatus;
      warehouseId: string | null;
      customerWorksiteId: string | null;
      docDate: Date;
      notes: string | null;
      items: Array<{
        skuId: string | null;
        assetId: string | null;
        quantity: Prisma.Decimal | null;
        condition: string | null;
        requestedTag?: string | null;
      }>;
    },
    userId: string,
  ) {
    const items = await this.mapDocumentItemsToMovementItems(document.items);

    if (document.type === DocumentType.REMISSION) {
      if (!document.customerWorksiteId) {
        throw new BadRequestException('La remisión no tiene obra destino');
      }
      const deliveryMode = this.parseDeliveryMode(document.notes);
      if (deliveryMode === 'ON_SITE') {
        await this.inventoryService.moveOnSite(
          {
            customerWorksiteId: document.customerWorksiteId,
            items,
            documentId: document.id,
          },
          userId,
        );
      } else {
        if (!document.warehouseId) {
          throw new BadRequestException(
            'La remisión no tiene bodega de ubicación',
          );
        }
        await this.inventoryService.moveOut(
          {
            warehouseId: document.warehouseId,
            customerWorksiteId: document.customerWorksiteId,
            items,
            documentId: document.id,
          },
          userId,
        );
      }
    } else {
      if (!document.customerWorksiteId) {
        throw new BadRequestException('La devolución requiere obra');
      }

      const ownerWarehouseIds = [
        ...new Set(items.map((item) => item.ownerWarehouseId)),
      ];
      const providerWarehouses = ownerWarehouseIds.length
        ? await this.prisma.warehouse.findMany({
            where: {
              id: { in: ownerWarehouseIds },
              type: 'ALLY',
              active: true,
            },
            select: { id: true },
          })
        : [];
      const providerWarehouseIds = new Set(
        providerWarehouses.map((warehouse) => warehouse.id),
      );
      const providerItems = items.filter((item) =>
        providerWarehouseIds.has(item.ownerWarehouseId),
      );
      const ownItems = items.filter(
        (item) => !providerWarehouseIds.has(item.ownerWarehouseId),
      );

      if (ownItems.length) {
        if (!document.warehouseId) {
          throw new BadRequestException(
            'La devolución de equipos propios requiere bodega REV',
          );
        }
        await this.inventoryService.moveIn(
          {
            warehouseId: document.warehouseId,
            customerWorksiteId: document.customerWorksiteId,
            items: ownItems,
            documentId: document.id,
          },
          userId,
        );
      }

      if (providerItems.length) {
        await this.inventoryService.moveReturnTransit(
          {
            customerWorksiteId: document.customerWorksiteId,
            items: providerItems,
            documentId: document.id,
          },
          userId,
        );
      }
      await this.prisma.documentItem.updateMany({
        where: {
          documentId: document.id,
          billingCutoffDate: null,
        },
        data: {
          billingCutoffDate: document.docDate,
          billingStatus: DocumentItemBillingStatus.CUT,
        },
      });
    }

    return this.prisma.document.update({
      where: { id: document.id },
      data: {
        status: DocumentStatus.CONFIRMED,
        voidReason: null,
        voidedAt: null,
        voidedBy: null,
      },
      select: { id: true, status: true, consecutive: true },
    });
  }

  private parseSignatureMimeType(signatureDataUrl: string) {
    const match = signatureDataUrl.match(/^data:([^;]+);base64,/i);
    return match?.[1] ?? 'image/png';
  }

  private parseBillingDate(
    value: string | null | undefined,
    fieldName: string,
  ): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const raw = value.trim();
    if (!raw) return null;
    const isoDayMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const localDayMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const normalizedDay = isoDayMatch
      ? `${isoDayMatch[1]}-${isoDayMatch[2]}-${isoDayMatch[3]}`
      : localDayMatch
        ? `${localDayMatch[3]}-${localDayMatch[2]}-${localDayMatch[1]}`
        : null;
    const parsed = normalizedDay
      ? new Date(`${normalizedDay}T12:00:00.000Z`)
      : new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} inválida`);
    }
    return parsed;
  }

  private getBusinessDateKey(value: Date) {
    return this.businessDateFormatter.format(value);
  }

  private getBillingStatus(cutoff: Date | null, returnedAt: Date | null) {
    if (returnedAt) return DocumentItemBillingStatus.CLOSED;
    if (cutoff) return DocumentItemBillingStatus.CUT;
    return DocumentItemBillingStatus.OPEN;
  }

  private parseDocumentDateFromNotes(notes?: string | null) {
    if (!notes) return undefined;
    const parts = notes.split('|').map((value) => value.trim());
    const entry = parts.find((part) =>
      part.toLowerCase().startsWith('fecha documento:'),
    );
    if (!entry) return undefined;
    const [, ...rest] = entry.split(':');
    const rawDate = rest.join(':').trim();
    return this.parseBillingDate(rawDate, 'Fecha documento') ?? undefined;
  }

  private async saveReceivedSignature(
    tx: Prisma.TransactionClient,
    documentId: string,
    createdBy: string,
    signatureDataUrl?: string,
  ) {
    if (signatureDataUrl === undefined) return;
    const normalized = signatureDataUrl.trim();
    await tx.fileObject.deleteMany({
      where: {
        documentId,
        fileType: 'SIGNATURE_RECEIVED',
      },
    });
    if (!normalized) return;
    await tx.fileObject.create({
      data: {
        documentId,
        entityType: 'DOCUMENT',
        entityId: documentId,
        fileType: 'SIGNATURE_RECEIVED',
        category: 'SIGNATURE_RECEIVED',
        storageKey: normalized,
        mimeType: this.parseSignatureMimeType(normalized),
        createdBy,
      },
      select: { id: true },
    });
  }

  async createDocument(payload: {
    type: string;
    status?: string;
    number?: string;
    warehouseId?: string;
    customerWorksiteId?: string;
    notes?: string;
    recipientPhone?: string;
    recipientPhones?: string[];
    createdBy: string;
  }) {
    const type = payload.type as DocumentType;
    const status =
      (payload.status as DocumentStatus | undefined) ?? DocumentStatus.DRAFT;
    const recipientPhones = this.normalizeDocumentRecipientPhones(
      payload.recipientPhones,
      payload.recipientPhone,
    );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const document = await this.prisma.$transaction(async (tx) => {
          const consecutive = await this.resolveConsecutive(
            type,
            tx,
            payload.number,
          );
          return tx.document.create({
            data: {
              type,
              status,
              consecutive,
              warehouseId: payload.warehouseId ?? null,
              customerWorksiteId: payload.customerWorksiteId ?? null,
              notes: payload.notes ?? null,
              recipientPhone: recipientPhones[0],
              recipientPhones,
              createdBy: payload.createdBy,
            },
          });
        });
        await this.safeSendDraftMessages(document.id);
        return document;
      } catch (error) {
        if (this.isConsecutiveConflict(error) && !payload.number) {
          continue;
        }
        if (this.isConsecutiveConflict(error)) {
          throw new BadRequestException('El consecutivo ya existe');
        }
        throw error;
      }
    }

    throw new BadRequestException('No se pudo generar consecutivo automático');
  }

  async createRequestDocument(payload: {
    type: string;
    number?: string;
    warehouseId?: string;
    customerWorksiteId?: string;
    notes?: string;
    recipientPhone?: string;
    recipientPhones?: string[];
    receivedSignature?: string;
    createdBy: string;
    items: Array<{
      skuId?: string;
      assetId?: string;
      ownerWarehouseId?: string;
      quantity?: number;
      requestedTag?: string;
      conditionNote?: string;
    }>;
  }) {
    const type = payload.type as DocumentType;
    const recipientPhones = this.normalizeDocumentRecipientPhones(
      payload.recipientPhones,
      payload.recipientPhone,
    );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const document = await this.prisma.$transaction(async (tx) => {
          const consecutive = await this.resolveConsecutive(
            type,
            tx,
            payload.number,
          );
          const documentDate =
            this.parseDocumentDateFromNotes(payload.notes) ?? new Date();
          const defaultBillingCutoffDate =
            type === DocumentType.RETURN ? documentDate : null;
          const document = await tx.document.create({
            data: {
              type,
              status: DocumentStatus.DRAFT,
              consecutive,
              warehouseId: payload.warehouseId ?? null,
              customerWorksiteId: payload.customerWorksiteId ?? null,
              docDate: documentDate,
              notes: payload.notes ?? null,
              recipientPhone: recipientPhones[0],
              recipientPhones,
              createdBy: payload.createdBy,
            },
          });

          if (payload.items.length) {
            await tx.documentItem.createMany({
              data: payload.items.map((item) => ({
                documentId: document.id,
                skuId: item.skuId ?? null,
                assetId: item.assetId ?? null,
                quantity: item.quantity ?? (item.skuId ? 1 : null),
                requestedTag: item.requestedTag?.trim() || null,
                condition: item.ownerWarehouseId ?? null,
                conditionNote: item.conditionNote?.trim() || null,
                billingCutoffDate: defaultBillingCutoffDate,
                billingStatus: this.getBillingStatus(
                  defaultBillingCutoffDate,
                  null,
                ),
              })),
            });
          }

          await this.saveReceivedSignature(
            tx,
            document.id,
            payload.createdBy,
            payload.receivedSignature,
          );

          return document;
        });
        return document;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          !payload.number
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException('No se pudo generar consecutivo automático');
  }

  async updateRequestDocument(
    documentId: string,
    payload: {
      type?: string;
      number?: string;
      warehouseId?: string;
      customerWorksiteId?: string;
      notes?: string;
      recipientPhone?: string;
      recipientPhones?: string[];
      receivedSignature?: string;
      items: Array<{
        skuId?: string;
        assetId?: string;
        ownerWarehouseId?: string;
        quantity?: number;
        requestedTag?: string;
        conditionNote?: string;
      }>;
    },
    userId: string,
  ) {
    const existing = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        createdBy: true,
        status: true,
        type: true,
        consecutive: true,
        warehouseId: true,
        customerWorksiteId: true,
        notes: true,
        recipientPhone: true,
        recipientPhones: true,
        docDate: true,
      },
    });
    if (!existing) throw new NotFoundException('Document not found');
    if (existing.status !== DocumentStatus.DRAFT) {
      throw new BadRequestException(
        'Solo se puede editar un documento en estado DRAFT',
      );
    }

    const nextType =
      (payload.type as DocumentType | undefined) ?? existing.type;
    if (
      nextType !== DocumentType.REMISSION &&
      nextType !== DocumentType.RETURN
    ) {
      throw new BadRequestException(
        'Solo se permiten solicitudes de remisión o devolución',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const consecutive =
          payload.number !== undefined
            ? await this.resolveConsecutive(nextType, tx, payload.number)
            : existing.consecutive;
        const nextNotes =
          payload.notes !== undefined
            ? (payload.notes ?? null)
            : existing.notes;
        const nextDocDate =
          this.parseDocumentDateFromNotes(nextNotes) ?? existing.docDate;
        const defaultBillingCutoffDate =
          nextType === DocumentType.RETURN ? nextDocDate : null;
        const recipientsWereUpdated =
          payload.recipientPhones !== undefined ||
          payload.recipientPhone !== undefined;
        const nextRecipientPhones = recipientsWereUpdated
          ? this.normalizeDocumentRecipientPhones(
              payload.recipientPhones,
              payload.recipientPhone,
            )
          : existing.recipientPhones.length
            ? existing.recipientPhones
            : existing.recipientPhone
              ? [existing.recipientPhone]
              : [];
        const updated = await tx.document.update({
          where: { id: documentId },
          data: {
            type: nextType,
            consecutive,
            warehouseId:
              payload.warehouseId !== undefined
                ? (payload.warehouseId ?? null)
                : existing.warehouseId,
            customerWorksiteId:
              payload.customerWorksiteId !== undefined
                ? (payload.customerWorksiteId ?? null)
                : existing.customerWorksiteId,
            docDate: nextDocDate,
            notes: nextNotes,
            recipientPhone: nextRecipientPhones[0] ?? null,
            recipientPhones: nextRecipientPhones,
            officeModifiedAt: new Date(),
            officeModifiedBy: userId,
          },
          select: { id: true },
        });

        await tx.documentItem.deleteMany({
          where: { documentId },
        });

        if (payload.items.length) {
          await tx.documentItem.createMany({
            data: payload.items.map((item) => ({
              documentId,
              skuId: item.skuId ?? null,
              assetId: item.assetId ?? null,
              quantity: item.quantity ?? (item.skuId ? 1 : null),
              requestedTag: item.requestedTag?.trim() || null,
              condition: item.ownerWarehouseId ?? null,
              conditionNote: item.conditionNote?.trim() || null,
              billingCutoffDate: defaultBillingCutoffDate,
              billingStatus: this.getBillingStatus(
                defaultBillingCutoffDate,
                null,
              ),
            })),
          });
        }

        await this.saveReceivedSignature(
          tx,
          documentId,
          existing.createdBy,
          payload.receivedSignature,
        );

        return updated;
      });
    } catch (error) {
      if (this.isConsecutiveConflict(error)) {
        throw new BadRequestException('El consecutivo ya existe');
      }
      throw error;
    }
  }

  async updateDocumentItemBilling(
    documentId: string,
    itemId: string,
    payload: {
      billingCutoffDate?: string | null;
      returnedAt?: string | null;
      note?: string;
    },
    userId: string,
  ) {
    const cutoffInput = this.parseBillingDate(
      payload.billingCutoffDate,
      'billingCutoffDate',
    );
    const returnedInput = this.parseBillingDate(
      payload.returnedAt,
      'returnedAt',
    );
    if (
      cutoffInput !== undefined &&
      returnedInput !== undefined &&
      cutoffInput &&
      returnedInput &&
      cutoffInput.getTime() > returnedInput.getTime()
    ) {
      throw new BadRequestException(
        'billingCutoffDate no puede ser posterior a returnedAt',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const document = await tx.document.findUnique({
        where: { id: documentId },
        select: {
          id: true,
          type: true,
          status: true,
          docDate: true,
        },
      });
      if (!document) throw new NotFoundException('Document not found');
      if (document.type !== DocumentType.RETURN) {
        throw new BadRequestException(
          'Solo aplica para documentos de devolución',
        );
      }

      const item = await tx.documentItem.findFirst({
        where: {
          id: itemId,
          documentId,
        },
      });
      if (!item) {
        throw new NotFoundException('Document item not found');
      }

      const nextCutoff =
        cutoffInput !== undefined ? cutoffInput : item.billingCutoffDate;
      const nextReturned =
        returnedInput !== undefined ? returnedInput : item.returnedAt;
      if (
        nextCutoff &&
        nextReturned &&
        nextCutoff.getTime() > nextReturned.getTime()
      ) {
        throw new BadRequestException(
          'billingCutoffDate no puede ser posterior a returnedAt',
        );
      }

      const note =
        payload.note !== undefined
          ? payload.note?.trim() || null
          : item.billingNote;
      const updated = await tx.documentItem.update({
        where: { id: item.id },
        data: {
          billingCutoffDate: nextCutoff ?? null,
          returnedAt: nextReturned ?? null,
          billingStatus: this.getBillingStatus(
            nextCutoff ?? null,
            nextReturned ?? null,
          ),
          billingNote: note,
          billingUpdatedAt: new Date(),
          billingUpdatedBy: userId,
        },
      });

      return { updatedItem: updated, splitItem: null };
    });
  }

  async listDocuments(params: {
    role: Role;
    userId: string;
    status?: DocumentStatus;
    type?: DocumentType;
    take?: number;
  }) {
    const where: Prisma.DocumentWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.type) where.type = params.type;
    if (params.role === Role.DRIVER) {
      where.createdBy = params.userId;
    }

    const documents = await this.prisma.document.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: params.take ?? 100,
      select: {
        id: true,
        type: true,
        status: true,
        consecutive: true,
        createdAt: true,
        docDate: true,
        notes: true,
        createdBy: true,
        warehouse: { select: { id: true, name: true } },
        customerWorksite: {
          select: {
            id: true,
            alias: true,
            customer: { select: { id: true, name: true } },
            worksite: { select: { id: true, name: true } },
          },
        },
        _count: { select: { items: true } },
      },
    });

    const creatorIds = [
      ...new Set(
        documents.map((document) => document.createdBy).filter(Boolean),
      ),
    ];
    const creators = creatorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: {
            id: true,
            email: true,
            role: true,
            employee: { select: { name: true, lastName: true } },
          },
        })
      : [];
    const creatorById = new Map(
      creators.map((creator) => [creator.id, creator]),
    );

    return documents.map((document) => ({
      ...document,
      creator: (() => {
        const creator = creatorById.get(document.createdBy);
        if (!creator) return null;
        return {
          id: creator.id,
          email: creator.email,
          role: creator.role,
          name: creator.employee
            ? `${creator.employee.name} ${creator.employee.lastName}`.trim()
            : creator.email,
        };
      })(),
    }));
  }

  private parseDeliveryMode(notes?: string | null): 'WAREHOUSE' | 'ON_SITE' {
    if (!notes) return 'WAREHOUSE';
    const parts = notes.split('|').map((value) => value.trim());
    const entry = parts.find((part) =>
      part.toLowerCase().startsWith('entrega:'),
    );
    if (!entry) return 'WAREHOUSE';
    const [, modeRaw = ''] = entry.split(':');
    const mode = modeRaw.trim().toUpperCase();
    return mode === 'ON_SITE' ? 'ON_SITE' : 'WAREHOUSE';
  }

  private async mapDocumentItemsToMovementItems(
    items: Array<{
      skuId: string | null;
      assetId: string | null;
      quantity: Prisma.Decimal | null;
      condition: string | null;
      requestedTag?: string | null;
    }>,
  ) {
    if (!items.length) {
      throw new BadRequestException(
        'El documento no tiene items para ejecutar',
      );
    }

    const skuIds = [
      ...new Set(
        items
          .map((item) => item.skuId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const skuControlTypeById = new Map<string, string>();
    if (skuIds.length) {
      const skus = await this.prisma.sku.findMany({
        where: { id: { in: skuIds } },
        select: {
          id: true,
          assetFamily: { select: { controlType: true } },
        },
      });
      skus.forEach((sku) => {
        skuControlTypeById.set(sku.id, sku.assetFamily.controlType);
      });
    }

    return Promise.all(
      items.map(async (item, index) => {
        const ownerWarehouseId = item.condition?.trim();
        if (!ownerWarehouseId) {
          throw new BadRequestException(
            `Item ${index + 1} sin bodega dueña (ownerWarehouseId)`,
          );
        }
        if (item.skuId && item.assetId) {
          throw new BadRequestException(
            `Item ${index + 1} inválido: no puede tener sku y asset`,
          );
        }
        if (!item.skuId && !item.assetId) {
          if (item.requestedTag?.trim()) {
            throw new BadRequestException(
              `Item ${index + 1} (${item.requestedTag}) sin resolver: mapéalo a SKU o equipo antes de aprobar`,
            );
          }
          throw new BadRequestException(
            `Item ${index + 1} inválido: falta sku/asset`,
          );
        }
        if (item.skuId) {
          const controlType = skuControlTypeById.get(item.skuId) ?? 'BULK';
          if (controlType === 'SERIAL') {
            const internalFromTag = (() => {
              const tag = item.requestedTag?.trim() ?? '';
              const match = tag.match(/#\s*(\d+)/);
              if (!match) return null;
              const parsed = Number(match[1]);
              return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
            })();

            const assets = await this.prisma.asset.findMany({
              where: {
                skuId: item.skuId,
                warehouseOwnerId: ownerWarehouseId,
                warehouseCurrentId: ownerWarehouseId,
                active: true,
              },
              select: {
                id: true,
                internalNumber: true,
                serialOrEngine: true,
              },
              orderBy: { internalNumber: 'asc' },
            });

            if (!assets.length) {
              throw new BadRequestException(
                `Item ${index + 1} (${item.requestedTag ?? 'serial'}) sin equipo disponible en bodega`,
              );
            }

            const availableNumbers = assets
              .map((asset) => `#${asset.internalNumber}`)
              .join(', ');
            if (internalFromTag == null) {
              throw new BadRequestException(
                `Item ${index + 1} (${item.requestedTag ?? 'serial'}) debe incluir número interno (#). Disponibles: ${availableNumbers}`,
              );
            }

            const resolvedAsset = assets.find(
              (asset) => asset.internalNumber === internalFromTag,
            );
            if (!resolvedAsset) {
              throw new BadRequestException(
                `Item ${index + 1} pidió #${internalFromTag}, pero no existe en esa bodega. Disponibles: ${availableNumbers}`,
              );
            }

            return {
              assetId: resolvedAsset.id,
              ownerWarehouseId,
            };
          }

          const quantity = Number(item.quantity ?? 0);
          if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new BadRequestException(
              `Item ${index + 1} inválido: cantidad debe ser > 0`,
            );
          }
          return {
            skuId: item.skuId,
            quantity,
            ownerWarehouseId,
          };
        }
        return {
          assetId: item.assetId as string,
          ownerWarehouseId,
        };
      }),
    );
  }

  async approveRequestDocument(documentId: string, userId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        items: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        files: {
          where: {
            fileType: {
              in: [
                'SIGNATURE_RECEIVED',
                'PHOTO_EVIDENCE',
                'COMPROBANTE_SALIDA_PROVEEDOR',
              ],
            },
          },
          select: {
            id: true,
            fileType: true,
            category: true,
            displayName: true,
            originalName: true,
            storageKey: true,
            objectKey: true,
            mimeType: true,
            sizeBytes: true,
            expiresAt: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
      },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.status !== DocumentStatus.DRAFT) {
      throw new BadRequestException(
        'Solo se puede aprobar un documento en estado DRAFT',
      );
    }
    if (
      document.type !== DocumentType.REMISSION &&
      document.type !== DocumentType.RETURN
    ) {
      throw new BadRequestException(
        'Solo se pueden aprobar remisiones o devoluciones',
      );
    }

    if (document.type === DocumentType.REMISSION) {
      const ownerWarehouseIds = [
        ...new Set(
          document.items
            .map((item) => item.condition?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ];
      const providerOwner = ownerWarehouseIds.length
        ? await this.prisma.warehouse.findFirst({
            where: { id: { in: ownerWarehouseIds }, type: 'ALLY' },
            select: { id: true },
          })
        : null;
      if (
        providerOwner &&
        !document.files.some(
          (file) => file.category === 'COMPROBANTE_SALIDA_PROVEEDOR',
        )
      ) {
        throw new BadRequestException(
          'La remisión incluye equipos de proveedor y requiere la foto de la remisión física entregada por el proveedor',
        );
      }
    }

    if (
      document.type === DocumentType.REMISSION &&
      document.items.length > REMISSION_ITEMS_PER_DOCUMENT
    ) {
      const splitDocumentIds = await this.splitRemissionDraftDocument(document);
      const confirmedDocuments: Array<{
        id: string;
        status: DocumentStatus;
        consecutive: string | null;
      }> = [];
      for (const splitDocumentId of splitDocumentIds) {
        const splitDocument = await this.prisma.document.findUnique({
          where: { id: splitDocumentId },
          include: {
            items: true,
          },
        });
        if (!splitDocument) {
          throw new NotFoundException('Document not found after split');
        }
        confirmedDocuments.push(
          await this.approveLoadedRequestDocument(splitDocument, userId),
        );
        await this.documentEmails.sendFinalIfNeeded(splitDocumentId);
      }
      return {
        id: confirmedDocuments[0]?.id ?? document.id,
        status: DocumentStatus.CONFIRMED,
        splitDocumentIds: confirmedDocuments.map((entry) => entry.id),
        splitConsecutives: confirmedDocuments
          .map((entry) => entry.consecutive)
          .filter(Boolean),
      };
    }

    const confirmed = await this.approveLoadedRequestDocument(document, userId);
    await this.documentEmails.sendFinalIfNeeded(confirmed.id);
    return {
      id: confirmed.id,
      status: confirmed.status,
      splitDocumentIds: [confirmed.id],
      splitConsecutives: confirmed.consecutive ? [confirmed.consecutive] : [],
    };
  }

  async rejectRequestDocument(
    documentId: string,
    userId: string,
    reason?: string,
  ) {
    const existing = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, status: true, consecutive: true },
    });
    if (!existing) throw new NotFoundException('Document not found');
    if (existing.status !== DocumentStatus.DRAFT) {
      throw new BadRequestException(
        'Solo se puede rechazar un documento en estado DRAFT',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const rejectedConsecutive = await this.buildRejectedConsecutive(
        tx,
        existing.consecutive,
      );
      const updated = await tx.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.VOID,
          consecutive: rejectedConsecutive,
          voidReason: reason?.trim() || null,
          voidedBy: userId,
          voidedAt: new Date(),
        },
        select: { id: true, status: true },
      });
      return updated;
    });
  }

  async getDocument(
    documentId: string,
    requester?: { role: Role; userId: string },
  ) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        warehouse: {
          select: { id: true, name: true },
        },
        customerWorksite: {
          select: {
            id: true,
            alias: true,
            customer: { select: { id: true, name: true } },
            worksite: { select: { id: true, name: true, address: true } },
          },
        },
        creator: {
          select: {
            id: true,
            email: true,
            employee: { select: { name: true, lastName: true } },
          },
        },
        messageDeliveries: {
          where: { channel: NotificationChannel.WHATSAPP },
          select: {
            id: true,
            phone: true,
            status: true,
            sentAt: true,
            error: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
        files: {
          select: {
            id: true,
            fileType: true,
            category: true,
            displayName: true,
            originalName: true,
            storageKey: true,
            objectKey: true,
            mimeType: true,
            sizeBytes: true,
            expiresAt: true,
            createdAt: true,
          },
          where: {
            fileType: { in: ['SIGNATURE_RECEIVED', 'PHOTO_EVIDENCE'] },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
        items: {
          include: {
            sku: { select: { id: true, name: true } },
            asset: {
              select: {
                id: true,
                serialOrEngine: true,
                description: true,
                internalNumber: true,
                sku: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        ledger: {
          include: {
            sku: { select: { id: true, name: true } },
            asset: {
              select: {
                id: true,
                serialOrEngine: true,
                description: true,
                internalNumber: true,
                sku: { select: { id: true, name: true } },
              },
            },
            ownerWarehouse: {
              select: {
                id: true,
                name: true,
                ownerCompany: { select: { name: true } },
              },
            },
            warehouse: { select: { id: true, name: true } },
            customerWorksite: {
              select: {
                id: true,
                alias: true,
                customer: { select: { id: true, name: true } },
                worksite: { select: { id: true, name: true, address: true } },
              },
            },
            creator: {
              select: {
                id: true,
                email: true,
                employee: { select: { name: true, lastName: true } },
              },
            },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }
    assertCanViewDocument(document, requester);

    return {
      ...document,
      creator: document.creator
        ? {
            id: document.creator.id,
            email: document.creator.email,
            name: document.creator.employee
              ? `${document.creator.employee.name} ${document.creator.employee.lastName}`.trim()
              : document.creator.email,
          }
        : null,
      ledger: document.ledger.map((entry) => ({
        ...entry,
        creator: entry.creator
          ? {
              id: entry.creator.id,
              email: entry.creator.email,
              name: entry.creator.employee
                ? `${entry.creator.employee.name} ${entry.creator.employee.lastName}`.trim()
                : entry.creator.email,
            }
          : null,
      })),
    };
  }

  async getSharedDocument(shareToken: string) {
    const document = await this.prisma.document.findUnique({
      where: { shareToken },
      select: {
        id: true,
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
            id: true,
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
            id: true,
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
    if (!document) throw new NotFoundException('Documento compartido no encontrado');
    const responsibleIds = this.parseDocumentResponsibleIds(document.notes);
    const employeeIds = [
      responsibleIds.driverId,
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
    const preparedBy = document.creator.employee
      ? `${document.creator.employee.name} ${document.creator.employee.lastName}`.trim()
      : document.creator.email;
    const isOnSite = this.parseDeliveryMode(document.notes) === 'ON_SITE';
    return {
      ...document,
      creator: undefined,
      responsibles: {
        preparedBy,
        transportedBy: isOnSite
          ? (driverName ?? 'Sin conductor asignado')
          : 'No aplica · retiro en bodega',
        deliveredBy: isOnSite
          ? (driverName ?? 'Sin conductor asignado')
          : (dispatcherName ?? 'Sin despachador asignado'),
      },
    };
  }

  async getSharedDocumentPdf(shareToken: string) {
    const document = await this.getSharedDocument(shareToken);
    return {
      buffer: await this.documentPdf.render(document),
      fileName: this.documentPdf.fileName(document),
    };
  }

  sendDraftCustomerEmail(documentId: string) {
    return this.documentEmails.sendDraftIfNeeded(documentId);
  }

  sendFinalCustomerEmail(documentId: string) {
    return this.documentEmails.sendFinalIfNeeded(documentId);
  }

  sendDraftCustomerMessages(documentId: string) {
    return this.documentMessages.sendDraft(documentId);
  }

  private async safeSendDraftMessages(documentId: string) {
    try {
      await this.documentMessages.sendDraft(documentId);
    } catch {
      // Document creation must remain successful if an external provider is unavailable.
    }
  }

  private parseDocumentResponsibleIds(notes?: string | null) {
    const values = new Map<string, string>();
    notes
      ?.split('|')
      .map((value) => value.trim())
      .forEach((entry) => {
        const [key, ...rest] = entry.split(':');
        if (key && rest.length) {
          values.set(key.trim().toLowerCase(), rest.join(':').trim());
        }
      });
    return {
      driverId: values.get('conductor') || null,
      dispatcherId: values.get('despachador') || null,
    };
  }

  private normalizeDocumentRecipientPhones(
    recipientPhones?: string[],
    recipientPhone?: string,
  ) {
    const normalized = [
      ...(recipientPhones ?? []),
      ...(recipientPhone ? [recipientPhone] : []),
    ].map((phone) => normalizeRequiredColombianPhone(phone));
    const unique = [...new Set(normalized)];
    if (!unique.length) {
      throw new BadRequestException(
        'Agrega al menos un destinatario de WhatsApp',
      );
    }
    return unique;
  }
}
