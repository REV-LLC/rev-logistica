import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createDocument(payload: {
    type: string;
    number?: string;
    warehouseId?: string;
    customerWorksiteId?: string;
    notes?: string;
    createdBy: string;
  }) {
    return this.prisma.document.create({
      data: {
        type: payload.type as any,
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
        ledger: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return document;
  }
}
