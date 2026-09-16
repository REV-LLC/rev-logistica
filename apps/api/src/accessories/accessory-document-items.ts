import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Capture catalogue labels server-side. Drafts do not reserve or move stock. */
export async function prepareAccessoryDocumentItems(
  tx: Prisma.TransactionClient,
  items: Prisma.DocumentItemCreateManyInput[],
) {
  const lines = items.filter((item) => item.accessoryId);
  if (!lines.length) return items;
  const accessories = await tx.accessory.findMany({
    where: { id: { in: lines.map((item) => item.accessoryId!) } },
  });
  const parents = await tx.asset.findMany({
    where: {
      id: {
        in: lines
          .map((item) => item.componentParentAssetId)
          .filter((id): id is string => !!id),
      },
    },
    select: { id: true, publicCode: true },
  });
  return items.map((line) => {
    if (!line.accessoryId) return line;
    const accessory = accessories.find((item) => item.id === line.accessoryId);
    const parent = parents.find(
      (asset) => asset.id === line.componentParentAssetId,
    );
    const quantity = Number(line.quantity);
    if (
      !accessory ||
      !parent ||
      !line.accessorySourceBalanceId ||
      line.skuId ||
      line.assetId ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 1000000 ||
      (accessory.kind === 'INDIVIDUAL' && quantity !== 1)
    ) {
      throw new BadRequestException(
        'El accesorio requiere equipo asociado, origen y cantidad válida.',
      );
    }
    return {
      ...line,
      condition: accessory.ownerWarehouseId,
      accessoryName: accessory.name,
      accessoryCode: accessory.internalCode,
      accessoryKind: accessory.kind,
      requestedTag: `${accessory.name}${accessory.internalCode ? ` · ${accessory.internalCode}` : accessory.kind === 'RETURNABLE' ? ' · Retornable por cantidad' : ' · Consumible'} · Accesorio de ${parent.publicCode}`,
    };
  });
}
