import { BadRequestException, Injectable } from '@nestjs/common';
import { Document, DocumentItem, Prisma } from '@prisma/client';
import { AccessoriesService } from './accessories.service';
import { isCompatible, Location } from './accessory-rules';
import { resolveLatestSerializedMovements } from '../inventory/serialized-ledger-location';

type AccessoryDocument = Document & { items: DocumentItem[] };

@Injectable()
export class AccessoryDocumentsService {
  constructor(private readonly accessories: AccessoriesService) {}

  async apply(
    tx: Prisma.TransactionClient,
    document: AccessoryDocument,
    userId: string,
    deliveryMode: 'WAREHOUSE' | 'ON_SITE' = 'WAREHOUSE',
  ) {
    const lines = document.items.filter((item) => item.accessoryId);
    if (!lines.length) return;
    const siteId = document.customerWorksiteId;
    if (!siteId)
      throw new BadRequestException('Selecciona la obra de los accesorios.');
    const site = await tx.customerWorksite.findUnique({
      where: { id: siteId },
    });
    if (!site) throw new BadRequestException('La obra no existe.');
    const warehouse = document.warehouseId
      ? await tx.warehouse.findFirst({
          where: { id: document.warehouseId, active: true },
        })
      : null;
    if (document.type === 'RETURN' && !warehouse)
      throw new BadRequestException('Selecciona una bodega destino activa.');

    // Every route locks accessory rows before equipment rows, in stable order.
    for (const id of [
      ...new Set(lines.map((line) => line.accessoryId!)),
    ].sort()) {
      await tx.$queryRaw`SELECT id FROM "Accessory" WHERE id = ${id} FOR UPDATE`;
    }
    const parentIds = [
      ...new Set(lines.map((line) => line.componentParentAssetId!)),
    ].sort();
    const allEquipmentIds = [
      ...new Set([
        ...parentIds,
        ...document.items.flatMap((line) =>
          line.assetId ? [line.assetId] : [],
        ),
      ]),
    ].sort();
    for (const id of allEquipmentIds) {
      await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${id} FOR UPDATE`;
    }
    const parents = await tx.asset.findMany({
      where: { id: { in: parentIds } },
      include: { sku: true },
    });
    const selectedParents = new Set(
      document.items
        .filter((item) => !item.accessoryId)
        .map((item) => item.assetId),
    );

    for (const line of lines) {
      const accessory = await tx.accessory.findUniqueOrThrow({
        where: { id: line.accessoryId! },
        include: { subfamilies: true, assets: true },
      });
      const parent = parents.find(
        (asset) => asset.id === line.componentParentAssetId,
      );
      if (!parent || !parent.active || parent.deletedAt)
        throw new BadRequestException(
          'El equipo asociado al accesorio no está activo.',
        );
      if (accessory.ownerWarehouseId !== line.condition)
        throw new BadRequestException(
          'El propietario del accesorio no coincide con el documento.',
        );
      const source = await tx.accessoryBalance.findUnique({
        where: { id: line.accessorySourceBalanceId! },
      });
      if (
        !source ||
        source.transitDocumentId ||
        source.accessoryId !== accessory.id ||
        (source.assetId && source.assetId !== parent.id)
      ) {
        throw new BadRequestException(
          'El origen del accesorio no corresponde al equipo seleccionado.',
        );
      }
      const latestDocumentMovement = await tx.accessoryMovement.findFirst({
        where: {
          accessoryId: accessory.id,
          document: { docDate: { gt: document.docDate }, status: 'CONFIRMED' },
        },
        select: { id: true },
      });
      if (latestDocumentMovement)
        throw new BadRequestException(
          'El accesorio tiene un documento posterior. Revisa la fecha antes de aprobar.',
        );
      let to: Location;
      if (document.type === 'REMISSION') {
        if (
          !accessory.active ||
          !isCompatible(
            {
              ...accessory,
              subfamilyIds: accessory.subfamilies.map((s) => s.subfamilyId),
              assetIds: accessory.assets.map((a) => a.assetId),
            },
            parent,
          )
        ) {
          throw new BadRequestException(
            `El accesorio ${accessory.name} no es compatible con el equipo.`,
          );
        }
        if (source.customerWorksiteId)
          throw new BadRequestException(
            'El accesorio ya está en una obra. Devuélvelo antes de remitirlo nuevamente.',
          );
        if (
          source.warehouseId &&
          source.warehouseId !==
            (deliveryMode === 'ON_SITE'
              ? accessory.ownerWarehouseId
              : document.warehouseId)
        ) {
          throw new BadRequestException(
            'El accesorio no está en la bodega de origen del documento.',
          );
        }
        if (
          source.assetId &&
          (!parent.warehouseCurrentId ||
            parent.warehouseCurrentId !==
              (deliveryMode === 'ON_SITE'
                ? parent.warehouseOwnerId
                : document.warehouseId))
        ) {
          throw new BadRequestException(
            'El accesorio asignado no está con el equipo en la bodega de origen.',
          );
        }
        if (!selectedParents.has(parent.id)) {
          const history = await tx.stockLedger.findMany({
            where: { assetId: parent.id, reversedByDocumentId: null },
          });
          const resolved = resolveLatestSerializedMovements(history).get(parent.id);
          const latest = resolved?.locationMovement;
          if (
            !latest ||
            !['OUT', 'ON_SITE'].includes(latest.movementType) ||
            latest.customerWorksiteId !== siteId ||
            resolved!.latest.effectiveAt > document.docDate
          ) {
            throw new BadRequestException(
              'Incluye el equipo en la remisión o selecciona uno que ya esté en esta obra.',
            );
          }
        }
        to = { assetId: parent.id, customerWorksiteId: siteId };
      } else {
        if (
          source.customerWorksiteId !== siteId ||
          source.assetId !== parent.id
        ) {
          throw new BadRequestException(
            'Solo puedes devolver accesorios pendientes de esta obra y equipo.',
          );
        }
        if (
          warehouse!.type === 'ALLY' &&
          accessory.ownerWarehouseId !== warehouse!.id
        )
          throw new BadRequestException(
            'La devolución directa a proveedor solo puede incluir accesorios de ese propietario.',
          );
        to =
          warehouse!.type === 'ALLY'
            ? { assetId: parent.id, transitDocumentId: document.id }
            : { warehouseId: warehouse!.id };
      }
      await this.accessories.moveInTransaction(
        tx,
        accessory.id,
        {
          requestId: `document:${document.id}:item:${line.id}`,
          type:
            document.type === 'RETURN'
              ? warehouse!.type === 'ALLY'
                ? 'TRANSIT'
                : 'RETURN'
              : source.warehouseId
                ? 'ASSIGN'
                : 'TRANSFER',
          quantity: Number(line.quantity),
          from: {
            ...(source.warehouseId
              ? { warehouseId: source.warehouseId }
              : { assetId: source.assetId! }),
            ...(source.customerWorksiteId
              ? { customerWorksiteId: source.customerWorksiteId }
              : {}),
          },
          to,
          note: `${document.type === 'REMISSION' ? 'Remisión' : 'Devolución'} ${document.consecutive ?? document.id}`,
        },
        userId,
        document.id,
      );
    }
  }
}
