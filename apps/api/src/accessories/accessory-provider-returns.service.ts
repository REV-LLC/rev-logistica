import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessoriesService } from './accessories.service';
import { Location, locationKey } from './accessory-rules';

export type AccessoryReceiptSelection = {
  sourceMovementId: string;
  quantity: number;
};

@Injectable()
export class AccessoryProviderReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessories: AccessoriesService,
  ) {}

  async listPending(user: { id: string; role: Role }) {
    const rows = await this.prisma.accessoryMovement.findMany({
      where: {
        type: { in: ['RETURN', 'TRANSIT'] },
        accessory: { ownerWarehouse: { type: 'ALLY' } },
        document: {
          type: 'RETURN',
          status: 'CONFIRMED',
          ...(user.role === 'DRIVER' ? { createdBy: user.id } : {}),
        },
      },
      include: {
        accessory: { include: { ownerWarehouse: true } },
        document: {
          include: {
            warehouse: true,
            customerWorksite: { include: { customer: true, worksite: true } },
            items: true,
          },
        },
        providerReceiptItems: {
          where: { receiptDocument: { status: 'CONFIRMED' } },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.flatMap((row) => {
      const pendingQuantity =
        row.quantity -
        row.providerReceiptItems.reduce((sum, item) => sum + item.quantity, 0);
      if (pendingQuantity <= 0 || !row.document) return [];
      const snapshot = row.document.items.find(
        (item) =>
          item.accessoryId === row.accessoryId &&
          item.componentParentAssetId === (row.from as Location).assetId,
      );
      return [
        {
          sourceLedgerId: row.id,
          sourceAccessoryMovementId: row.id,
          sourceDocumentId: row.document.id,
          consecutive: row.document.consecutive,
          docDate: row.document.docDate,
          customer: row.document.customerWorksite?.customer.name ?? null,
          worksite: row.document.customerWorksite?.worksite.name ?? null,
          providerWarehouse: row.accessory.ownerWarehouse,
          custodyWarehouse:
            row.type === 'TRANSIT' ? null : row.document.warehouse,
          logisticsStatus:
            row.type === 'TRANSIT' ? 'TRANSIT' : 'IN_REV_WAREHOUSE',
          type: row.accessory.kind === 'INDIVIDUAL' ? 'SERIAL' : 'BULK',
          skuId: null,
          assetId: null,
          skuName: snapshot?.requestedTag ?? row.accessory.name,
          publicCode: snapshot?.accessoryCode ?? row.accessory.internalCode,
          serialOrEngine: null,
          description: 'Accesorio',
          pendingQuantity,
        },
      ];
    });
  }

  async prepare(
    tx: Prisma.TransactionClient,
    sourceDocumentId: string,
    providerId: string,
    selections: AccessoryReceiptSelection[],
  ) {
    if (!selections.length) return [];
    if (
      new Set(selections.map((item) => item.sourceMovementId)).size !==
      selections.length
    )
      throw new BadRequestException(
        'Hay accesorios repetidos en la recepción.',
      );
    const prepared: Array<{
      sourceMovementId: string;
      quantity: number;
      documentItem: Prisma.DocumentItemUncheckedCreateWithoutDocumentInput;
    }> = [];
    for (const selection of selections) {
      const movement = await tx.accessoryMovement.findUnique({
        where: { id: selection.sourceMovementId },
        include: {
          accessory: true,
          document: { include: { items: true } },
          providerReceiptItems: {
            where: { receiptDocument: { status: 'CONFIRMED' } },
          },
        },
      });
      if (
        !movement ||
        !['RETURN', 'TRANSIT'].includes(movement.type) ||
        movement.documentId !== sourceDocumentId ||
        movement.document?.status !== 'CONFIRMED' ||
        movement.accessory.ownerWarehouseId !== providerId
      )
        throw new BadRequestException(
          'El accesorio no corresponde a esta devolución y proveedor.',
        );
      const pending =
        movement.quantity -
        movement.providerReceiptItems.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );
      if (
        !Number.isSafeInteger(selection.quantity) ||
        selection.quantity < 1 ||
        selection.quantity > pending ||
        (movement.accessory.kind === 'INDIVIDUAL' && selection.quantity !== 1)
      )
        throw new BadRequestException(
          'La cantidad supera los accesorios pendientes de recibir.',
        );
      const destination = movement.to as Location;
      const balance = await tx.accessoryBalance.findUnique({
        where: {
          accessoryId_locationKey: {
            accessoryId: movement.accessoryId,
            locationKey: locationKey(destination),
          },
        },
      });
      const parentId = (movement.from as Location).assetId;
      const snapshot = movement.document.items.find(
        (item) =>
          item.accessoryId === movement.accessoryId &&
          item.componentParentAssetId === parentId,
      );
      if (!balance || !snapshot)
        throw new BadRequestException(
          'No se encontró la trazabilidad del accesorio devuelto.',
        );
      prepared.push({
        sourceMovementId: movement.id,
        quantity: selection.quantity,
        documentItem: {
          accessoryId: movement.accessoryId,
          accessorySourceBalanceId: balance.id,
          accessoryName: snapshot.accessoryName,
          accessoryCode: snapshot.accessoryCode,
          accessoryKind: snapshot.accessoryKind,
          componentParentAssetId: parentId,
          requestedTag: snapshot.requestedTag,
          quantity: selection.quantity,
          condition: providerId,
        },
      });
    }
    return prepared;
  }

  async confirm(
    tx: Prisma.TransactionClient,
    receipt: {
      id: string;
      warehouseId: string;
      providerSourceDocumentId: string | null;
    },
    userId: string,
  ) {
    const items = await tx.accessoryProviderReceiptItem.findMany({
      where: { receiptDocumentId: receipt.id },
      include: { sourceMovement: true },
    });
    if (!items.length) return;
    for (const id of [
      ...new Set(items.map((item) => item.sourceMovement.accessoryId)),
    ].sort())
      await tx.$queryRaw`SELECT id FROM "Accessory" WHERE id = ${id} FOR UPDATE`;
    await this.prepare(
      tx,
      receipt.providerSourceDocumentId!,
      receipt.warehouseId,
      items,
    );
    for (const item of items) {
      const from = item.sourceMovement.to as Location;
      await this.accessories.moveInTransaction(
        tx,
        item.sourceMovement.accessoryId,
        {
          requestId: `receipt:${receipt.id}:accessory:${item.id}`,
          type: 'PROVIDER_RECEIVE',
          quantity: item.quantity,
          from: {
            ...(from.warehouseId
              ? { warehouseId: from.warehouseId }
              : {
                  assetId: from.assetId!,
                  transitDocumentId: from.transitDocumentId,
                }),
          },
          to: { warehouseId: receipt.warehouseId },
          note: `Recepción de proveedor ${receipt.id}`,
        },
        userId,
        receipt.id,
      );
    }
  }
}
