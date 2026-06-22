import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentItemBillingStatus, DocumentStatus, DocumentType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';

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
  ) {}

  private getConsecutivePrefix(type: DocumentType) {
    if (type === DocumentType.REMISSION) return 'RM';
    if (type === DocumentType.RETURN) return 'DV';
    return null;
  }

  private normalizeRequestedConsecutive(type: DocumentType, requested?: string) {
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
    const match = value.trim().toUpperCase().match(new RegExp(`^${prefix}(\\d+)$`));
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
        fileType: 'SIGNATURE_RECEIVED',
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
    createdBy: string;
  }) {
    const type = payload.type as DocumentType;
    const status = (payload.status as DocumentStatus | undefined) ?? DocumentStatus.DRAFT;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const consecutive = await this.resolveConsecutive(type, tx, payload.number);
          return tx.document.create({
            data: {
              type,
              status,
              consecutive,
              warehouseId: payload.warehouseId ?? null,
              customerWorksiteId: payload.customerWorksiteId ?? null,
              notes: payload.notes ?? null,
              createdBy: payload.createdBy,
            },
          });
        });
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

  async createRequestDocument(payload: {
    type: string;
    number?: string;
    warehouseId?: string;
    customerWorksiteId?: string;
    notes?: string;
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

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const consecutive = await this.resolveConsecutive(type, tx, payload.number);
          const document = await tx.document.create({
            data: {
              type,
              status: DocumentStatus.DRAFT,
              consecutive,
              warehouseId: payload.warehouseId ?? null,
              customerWorksiteId: payload.customerWorksiteId ?? null,
              notes: payload.notes ?? null,
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
      },
    });
    if (!existing) throw new NotFoundException('Document not found');
    if (existing.status !== DocumentStatus.DRAFT) {
      throw new BadRequestException('Solo se puede editar un documento en estado DRAFT');
    }

    const nextType = (payload.type as DocumentType | undefined) ?? existing.type;
    if (nextType !== DocumentType.REMISSION && nextType !== DocumentType.RETURN) {
      throw new BadRequestException('Solo se permiten solicitudes de remisión o devolución');
    }

    return this.prisma.$transaction(async (tx) => {
      const consecutive =
        payload.number !== undefined
          ? await this.resolveConsecutive(nextType, tx, payload.number)
          : existing.consecutive;
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
          notes: payload.notes !== undefined ? payload.notes ?? null : existing.notes,
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
    const cutoffInput = this.parseBillingDate(payload.billingCutoffDate, 'billingCutoffDate');
    const returnedInput = this.parseBillingDate(payload.returnedAt, 'returnedAt');
    if (
      cutoffInput !== undefined &&
      returnedInput !== undefined &&
      cutoffInput &&
      returnedInput &&
      cutoffInput.getTime() > returnedInput.getTime()
    ) {
      throw new BadRequestException('billingCutoffDate no puede ser posterior a returnedAt');
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
        throw new BadRequestException('Solo aplica para documentos de devolución');
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

      const nextCutoff = cutoffInput !== undefined ? cutoffInput : item.billingCutoffDate;
      const nextReturned = returnedInput !== undefined ? returnedInput : item.returnedAt;
      if (nextCutoff && nextReturned && nextCutoff.getTime() > nextReturned.getTime()) {
        throw new BadRequestException('billingCutoffDate no puede ser posterior a returnedAt');
      }

      const note = payload.note !== undefined ? payload.note?.trim() || null : item.billingNote;
      const updated = await tx.documentItem.update({
        where: { id: item.id },
        data: {
          billingCutoffDate: nextCutoff ?? null,
          returnedAt: nextReturned ?? null,
          billingStatus: this.getBillingStatus(nextCutoff ?? null, nextReturned ?? null),
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

    const creatorIds = [...new Set(documents.map((document) => document.createdBy).filter(Boolean))];
    const creators = creatorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: {
            id: true,
            email: true,
            employee: { select: { name: true, lastName: true } },
          },
        })
      : [];
    const creatorById = new Map(creators.map((creator) => [creator.id, creator]));

    return documents.map((document) => ({
      ...document,
      creator: (() => {
        const creator = creatorById.get(document.createdBy);
        if (!creator) return null;
        return {
          id: creator.id,
          email: creator.email,
          name: creator.employee ? `${creator.employee.name} ${creator.employee.lastName}`.trim() : creator.email,
        };
      })(),
    }));
  }

  private parseDeliveryMode(notes?: string | null): 'WAREHOUSE' | 'ON_SITE' {
    if (!notes) return 'WAREHOUSE';
    const parts = notes.split('|').map((value) => value.trim());
    const entry = parts.find((part) => part.toLowerCase().startsWith('entrega:'));
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
      throw new BadRequestException('El documento no tiene items para ejecutar');
    }

    const skuIds = [...new Set(items.map((item) => item.skuId).filter((value): value is string => Boolean(value)))];
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

    return Promise.all(items.map(async (item, index) => {
      const ownerWarehouseId = item.condition?.trim();
      if (!ownerWarehouseId) {
        throw new BadRequestException(
          `Item ${index + 1} sin bodega dueña (ownerWarehouseId)`,
        );
      }
      if (item.skuId && item.assetId) {
        throw new BadRequestException(`Item ${index + 1} inválido: no puede tener sku y asset`);
      }
      if (!item.skuId && !item.assetId) {
        if (item.requestedTag?.trim()) {
          throw new BadRequestException(
            `Item ${index + 1} (${item.requestedTag}) sin resolver: mapéalo a SKU o equipo antes de aprobar`,
          );
        }
        throw new BadRequestException(`Item ${index + 1} inválido: falta sku/asset`);
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

          const availableNumbers = assets.map((asset) => `#${asset.internalNumber}`).join(', ');
          if (internalFromTag == null) {
            throw new BadRequestException(
              `Item ${index + 1} (${item.requestedTag ?? 'serial'}) debe incluir número interno (#). Disponibles: ${availableNumbers}`,
            );
          }

          const resolvedAsset = assets.find((asset) => asset.internalNumber === internalFromTag);
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
          throw new BadRequestException(`Item ${index + 1} inválido: cantidad debe ser > 0`);
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
    }));
  }

  async approveRequestDocument(documentId: string, userId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        items: true,
      },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.status !== DocumentStatus.DRAFT) {
      throw new BadRequestException('Solo se puede aprobar un documento en estado DRAFT');
    }
    if (document.type !== DocumentType.REMISSION && document.type !== DocumentType.RETURN) {
      throw new BadRequestException('Solo se pueden aprobar remisiones o devoluciones');
    }

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
          throw new BadRequestException('La remisión no tiene bodega de ubicación');
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
      if (!document.warehouseId || !document.customerWorksiteId) {
        throw new BadRequestException('La devolución requiere bodega y obra');
      }
      await this.inventoryService.moveIn(
        {
          warehouseId: document.warehouseId,
          customerWorksiteId: document.customerWorksiteId,
          items,
          documentId: document.id,
        },
        userId,
      );
    }

    return this.prisma.document.update({
      where: { id: document.id },
      data: {
        status: DocumentStatus.CONFIRMED,
        voidReason: null,
        voidedAt: null,
        voidedBy: null,
      },
      select: { id: true, status: true },
    });
  }

  async rejectRequestDocument(documentId: string, userId: string, reason?: string) {
    const updated = await this.prisma.document.updateMany({
      where: { id: documentId, status: DocumentStatus.DRAFT },
      data: {
        status: DocumentStatus.VOID,
        voidReason: reason?.trim() || null,
        voidedBy: userId,
        voidedAt: new Date(),
      },
    });
    if (!updated.count) {
      const found = await this.prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true, status: true },
      });
      if (!found) throw new NotFoundException('Document not found');
      throw new BadRequestException('Solo se puede rechazar un documento en estado DRAFT');
    }
    return { id: documentId, status: DocumentStatus.VOID };
  }

  async getDocument(documentId: string) {
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
        files: {
          select: {
            id: true,
            fileType: true,
            storageKey: true,
            mimeType: true,
            createdAt: true,
          },
          where: {
            fileType: 'SIGNATURE_RECEIVED',
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
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
}
