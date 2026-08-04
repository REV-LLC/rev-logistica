import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, DocumentType, MovementType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProviderReturnDto } from './dto/create-provider-return.dto';

const EVIDENCE_CATEGORY = 'EVIDENCIA_ENTREGA_PROVEEDOR';
const PROOF_CATEGORY = 'COMPROBANTE_RECEPCION_PROVEEDOR';

@Injectable()
export class ProviderReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPending(user: { id: string; role: Role }) {
    const rows = await this.prisma.stockLedger.findMany({
      where: {
        movementType: { in: [MovementType.TRANSIT, MovementType.IN] },
        refDocumentType: DocumentType.RETURN,
        document: user.role === Role.DRIVER ? { createdBy: user.id } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        sku: { select: { id: true, name: true, assetFamily: { select: { controlType: true } } } },
        asset: { select: { id: true, publicCode: true, serialOrEngine: true, description: true, sku: { select: { name: true } } } },
        ownerWarehouse: { select: { id: true, name: true, type: true } },
        warehouse: { select: { id: true, name: true, type: true } },
        document: { select: {
          id: true, consecutive: true, docDate: true, createdBy: true,
          customerWorksite: { select: { id: true, customer: { select: { name: true } }, worksite: { select: { name: true } } } },
        } },
        providerReceiptItems: {
          where: { receiptDocument: { status: DocumentStatus.CONFIRMED } },
          select: { quantity: true },
        },
      },
    });

    return rows.flatMap((row) => {
      const delivered = row.providerReceiptItems.reduce((sum, item) => sum + Number(item.quantity), 0);
      const pendingQuantity = Number(row.quantity) - delivered;
      const isTransit = row.movementType === MovementType.TRANSIT;
      const isInRevCustody =
        row.movementType === MovementType.IN &&
        row.warehouse?.type === 'OWN' &&
        row.warehouseId !== row.ownerWarehouseId;
      if (
        pendingQuantity <= 0 ||
        row.ownerWarehouse.type !== 'ALLY' ||
        !row.document ||
        (!isTransit && !isInRevCustody)
      ) return [];
      return [{
        sourceLedgerId: row.id,
        sourceDocumentId: row.document.id,
        consecutive: row.document.consecutive,
        docDate: row.document.docDate,
        customer: row.document.customerWorksite?.customer.name ?? null,
        worksite: row.document.customerWorksite?.worksite.name ?? null,
        providerWarehouse: row.ownerWarehouse,
        custodyWarehouse: row.warehouse,
        logisticsStatus: isTransit ? 'TRANSIT' : 'IN_REV_WAREHOUSE',
        type: row.assetId ? 'SERIAL' : 'BULK',
        skuId: row.skuId,
        skuName: row.sku?.name ?? row.asset?.sku.name ?? null,
        assetId: row.assetId,
        publicCode: row.asset?.publicCode ?? null,
        serialOrEngine: row.asset?.serialOrEngine ?? null,
        description: row.asset?.description ?? null,
        pendingQuantity,
      }];
    });
  }

  async createDraft(payload: CreateProviderReturnDto, user: { id: string; role: Role }) {
    return this.prisma.$transaction(async (tx) => {
      const sourceDocument = await tx.document.findUnique({
        where: { id: payload.sourceDocumentId },
        select: { id: true, type: true, createdBy: true },
      });
      if (!sourceDocument || sourceDocument.type !== DocumentType.RETURN) {
        throw new BadRequestException('La DV seleccionada no existe');
      }
      if (user.role === Role.DRIVER && sourceDocument.createdBy !== user.id) {
        throw new ForbiddenException('Solo puedes entregar devoluciones creadas por ti');
      }
      const provider = await tx.warehouse.findFirst({
        where: { id: payload.providerWarehouseId, type: 'ALLY', active: true }, select: { id: true },
      });
      if (!provider) throw new BadRequestException('La bodega proveedora no es válida');

      const requested = new Map(payload.items.map((item) => [item.sourceLedgerId, item.quantity]));
      if (requested.size !== payload.items.length) throw new BadRequestException('Hay ítems repetidos');
      const ledgers = await tx.stockLedger.findMany({
        where: { id: { in: [...requested.keys()] } },
        include: { providerReceiptItems: { where: { receiptDocument: { status: DocumentStatus.CONFIRMED } }, select: { quantity: true } } },
      });
      if (ledgers.length !== requested.size) throw new BadRequestException('Uno o más movimientos no existen');
      for (const ledger of ledgers) {
        const quantity = requested.get(ledger.id)!;
        const delivered = ledger.providerReceiptItems.reduce((sum, item) => sum + Number(item.quantity), 0);
        const isTransit = ledger.movementType === MovementType.TRANSIT;
        const isInRevCustody =
          ledger.movementType === MovementType.IN &&
          Boolean(ledger.warehouseId) &&
          ledger.warehouseId !== ledger.ownerWarehouseId;
        if ((!isTransit && !isInRevCustody) || ledger.refDocumentId !== sourceDocument.id ||
            ledger.ownerWarehouseId !== provider.id || quantity > Number(ledger.quantity) - delivered ||
            (ledger.assetId && quantity !== 1)) {
          throw new BadRequestException('La selección no coincide con los pendientes de esta DV y proveedor');
        }
      }

      const existing = await tx.document.findMany({
        where: { type: DocumentType.PROVIDER_RECEIPT, consecutive: { startsWith: 'RP' } }, select: { consecutive: true },
      });
      const next = existing.reduce((max, row) => Math.max(max, Number(row.consecutive?.replace(/^RP/, '')) || 0), 0) + 1;
      return tx.document.create({
        data: {
          type: DocumentType.PROVIDER_RECEIPT,
          status: DocumentStatus.DRAFT,
          consecutive: `RP${String(next).padStart(6, '0')}`,
          warehouseId: provider.id,
          providerSourceDocumentId: sourceDocument.id,
          createdBy: user.id,
          notes: payload.notes?.trim() || null,
          providerReceiptItems: { create: ledgers.map((ledger) => ({
            sourceDocumentId: sourceDocument.id,
            sourceLedgerId: ledger.id,
            skuId: ledger.skuId,
            assetId: ledger.assetId,
            quantity: new Prisma.Decimal(requested.get(ledger.id)!),
          })) },
        },
        select: { id: true, consecutive: true },
      });
    });
  }

  async confirm(receiptId: string, user: { id: string; role: Role }) {
    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.document.findUnique({
        where: { id: receiptId },
        include: { files: { select: { category: true } }, providerReceiptItems: { include: { sourceLedger: true } } },
      });
      if (!receipt || receipt.type !== DocumentType.PROVIDER_RECEIPT) throw new NotFoundException('Recepción no encontrada');
      if (receipt.status !== DocumentStatus.DRAFT) throw new BadRequestException('La recepción ya fue procesada');
      if (user.role === Role.DRIVER && receipt.createdBy !== user.id) throw new ForbiddenException('Esta recepción pertenece a otro conductor');
      if (!receipt.files.some((file) => file.category === EVIDENCE_CATEGORY) ||
          !receipt.files.some((file) => file.category === PROOF_CATEGORY)) {
        throw new BadRequestException('Debes adjuntar la evidencia de entrega y el comprobante del proveedor');
      }
      if (!receipt.warehouseId) throw new BadRequestException('La recepción no tiene bodega destino');

      for (const item of receipt.providerReceiptItems) {
        const other = await tx.providerReceiptItem.aggregate({
          where: { sourceLedgerId: item.sourceLedgerId, receiptDocumentId: { not: receipt.id }, receiptDocument: { status: DocumentStatus.CONFIRMED } },
          _sum: { quantity: true },
        });
        if (Number(other._sum.quantity ?? 0) + Number(item.quantity) > Number(item.sourceLedger.quantity)) {
          throw new BadRequestException('Uno de los ítems ya fue recibido en otra recepción');
        }
        if (item.sourceLedger.ownerWarehouseId !== receipt.warehouseId) {
          throw new BadRequestException('La bodega receptora no coincide con el propietario');
        }
      }

      const custodyItems = receipt.providerReceiptItems.filter(
        (item) =>
          item.sourceLedger.movementType === MovementType.IN &&
          item.sourceLedger.warehouseId &&
          item.sourceLedger.warehouseId !== item.sourceLedger.ownerWarehouseId,
      );
      await Promise.all(
        custodyItems.map((item) =>
          tx.stockLedger.create({
            data: {
              movementType: MovementType.OUT,
              warehouseId: item.sourceLedger.warehouseId!,
              customerWorksiteId: null,
              refDocumentId: receipt.id,
              refDocumentType: DocumentType.PROVIDER_RECEIPT,
              skuId: item.skuId,
              assetId: item.assetId,
              ownerWarehouseId: receipt.warehouseId!,
              quantity: item.quantity.negated(),
              createdBy: user.id,
            },
          }),
        ),
      );
      await Promise.all(receipt.providerReceiptItems.map((item) => tx.stockLedger.create({ data: {
        movementType: MovementType.IN,
        warehouseId: receipt.warehouseId!, customerWorksiteId: null,
        refDocumentId: receipt.id, refDocumentType: DocumentType.PROVIDER_RECEIPT,
        skuId: item.skuId, assetId: item.assetId,
        ownerWarehouseId: receipt.warehouseId!, quantity: item.quantity, createdBy: user.id,
      }})));
      const assetIds = receipt.providerReceiptItems.flatMap((item) => item.assetId ? [item.assetId] : []);
      if (assetIds.length) await tx.asset.updateMany({ where: { id: { in: assetIds } }, data: { warehouseCurrentId: receipt.warehouseId } });
      await tx.document.update({ where: { id: receipt.id }, data: { status: DocumentStatus.CONFIRMED, docDate: new Date() } });
      return { id: receipt.id, consecutive: receipt.consecutive, status: DocumentStatus.CONFIRMED };
    });
  }
}
