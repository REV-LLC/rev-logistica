import type { InventoryBulk, InventorySerial } from './request-types';

export type ReturnDocumentOrigin = {
  sourceDocumentItemId: string; parentSourceDocumentItemId?: string | null;
  parentLegacyOriginId?: string | null;
  assetId?: string | null; skuId?: string | null; accessoryId?: string | null;
  componentParentAssetId?: string | null; ownerWarehouseId?: string | null;
  quantity: number; consecutive: string | null;
  deliveryFuel?: 'ELECTRICO' | 'GASOLINA' | null;
};

export const returnOriginFields = (origin: ReturnDocumentOrigin) => ({
  deliveryFuel: origin.deliveryFuel ?? undefined,
  sourceDocumentItemId: origin.sourceDocumentItemId,
  parentSourceDocumentItemId: origin.parentSourceDocumentItemId ?? undefined,
  parentLegacyOriginId: origin.parentLegacyOriginId ?? undefined,
  componentParentAssetId: origin.componentParentAssetId ?? undefined,
  returnSourceLabel: origin.consecutive ?? 'Remisión de origen',
});

/** Keep distinct documentary lots selectable. Never choose a tariff-bearing origin by name. */
export function inventoryWithReturnOrigins<T extends { bulk: InventoryBulk[]; serial: InventorySerial[] }>(
  inventory: T, origins: ReturnDocumentOrigin[],
): T {
  return { ...inventory,
    serial: inventory.serial.map(item => {
      const lots = origins.filter(origin => origin.assetId === item.assetId);
      if (lots.length > 1) throw new Error(`Hay varias remisiones pendientes para ${item.skuName ?? 'el equipo'}. Office debe conciliar su origen.`);
      return lots.length ? { ...item, ...returnOriginFields(lots[0]) } : item;
    }),
    bulk: inventory.bulk.flatMap(item => {
      const lots = origins.filter(origin => !origin.assetId && !origin.accessoryId && origin.skuId === item.skuId &&
        (!item.ownerWarehouseId || origin.ownerWarehouseId === item.ownerWarehouseId));
      const total = lots.reduce((sum, origin) => sum + origin.quantity, 0);
      if (total > item.quantity) throw new Error(`El saldo de ${item.skuName ?? item.skuId} no coincide con sus remisiones. Office debe conciliarlo antes de devolver.`);
      return [
        ...lots.map(origin => ({ ...item, ...returnOriginFields(origin), quantity: origin.quantity,
          ownerWarehouseId: origin.ownerWarehouseId ?? item.ownerWarehouseId })),
        ...(item.quantity > total ? [{ ...item, quantity: item.quantity - total }] : []),
      ];
    }),
  };
}
