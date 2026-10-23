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

/** Serialized units retain their exact origin. BULK is selected by physical
 * reference/owner balance; documentary FIFO is resolved atomically by the API. */
export function inventoryWithReturnOrigins<T extends { bulk: InventoryBulk[]; serial: InventorySerial[] }>(
  inventory: T, origins: ReturnDocumentOrigin[],
): T {
  return { ...inventory,
    serial: inventory.serial.map(item => {
      const lots = origins.filter(origin => origin.assetId === item.assetId);
      if (lots.length > 1) throw new Error(`Hay varias remisiones pendientes para ${item.skuName ?? 'el equipo'}. Office debe conciliar su origen.`);
      return lots.length ? { ...item, ...returnOriginFields(lots[0]) } : item;
    }),
    bulk: inventory.bulk.map(item => {
      const { sourceDocumentItemId, parentSourceDocumentItemId, parentLegacyOriginId,
        componentParentAssetId, returnSourceLabel, ...balance } = item;
      return balance;
    }),
  };
}
