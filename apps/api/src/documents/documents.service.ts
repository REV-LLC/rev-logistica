import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createDocument(payload: {
    type: string;
    status?: string;
    number?: string;
    warehouseId?: string;
    customerWorksiteId?: string;
    notes?: string;
    createdBy: string;
  }) {
    return this.prisma.document.create({
      data: {
        type: payload.type as any,
        status: payload.status as any,
        consecutive: payload.number ?? null,
        warehouseId: payload.warehouseId ?? null,
        customerWorksiteId: payload.customerWorksiteId ?? null,
        notes: payload.notes ?? null,
        createdBy: payload.createdBy,
      },
    });
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
          select: { id: true, email: true, name: true },
        },
        items: {
          include: {
            sku: { select: { id: true, name: true } },
            asset: {
              select: {
                id: true,
                serialOrEngine: true,
                description: true,
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
                sku: { select: { id: true, name: true } },
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
            creator: { select: { id: true, email: true, name: true } },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return document;
  }
}
