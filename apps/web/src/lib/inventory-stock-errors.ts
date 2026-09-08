export type InventoryStockShortage = {
  skuId: string;
  ownerWarehouseId: string;
  warehouseId?: string;
  requestedQuantity: number;
  availableQuantity: number;
  missingQuantity: number;
  existsInWarehouse: boolean;
};

type InventoryStockErrorData = {
  code?: unknown;
  shortages?: unknown;
};

function isInventoryStockShortage(value: unknown): value is InventoryStockShortage {
  if (!value || typeof value !== 'object') return false;
  const shortage = value as Partial<InventoryStockShortage>;
  return (
    typeof shortage.skuId === 'string' &&
    typeof shortage.ownerWarehouseId === 'string' &&
    (shortage.warehouseId == null || typeof shortage.warehouseId === 'string') &&
    typeof shortage.requestedQuantity === 'number' &&
    typeof shortage.availableQuantity === 'number' &&
    typeof shortage.missingQuantity === 'number' &&
    typeof shortage.existsInWarehouse === 'boolean'
  );
}

export function extractInventoryStockShortages(data: unknown) {
  if (!data || typeof data !== 'object') return [];
  const response = data as InventoryStockErrorData;
  if (response.code !== 'INSUFFICIENT_STOCK' || !Array.isArray(response.shortages)) {
    return [];
  }
  return response.shortages.filter(isInventoryStockShortage);
}

export function getStockShortageReviewAction({
  ownerWarehouseId,
  warehouseId,
  warehouseType,
}: { ownerWarehouseId?: string | null; warehouseId?: string | null; warehouseType?: string | null }) {
  if (warehouseId && ownerWarehouseId && warehouseId === ownerWarehouseId) {
    const params = new URLSearchParams({ ownerWarehouseId, warehouseId });
    return { label: 'Crear o ajustar existencias', href: `/inventory/bulk-adjustments?${params.toString()}` };
  }
  if (warehouseId && warehouseType === 'OWN') {
    return { label: 'Revisar inventario de origen', href: '/inventory/warehouse?scope=own&view=bulk' };
  }
  if (warehouseId && warehouseType === 'ALLY') {
    return { label: 'Revisar inventario de origen', href: `/inventory/warehouse/provider/${encodeURIComponent(warehouseId)}?providerView=available&view=bulk` };
  }
  return { label: 'Volver y revisar el origen', href: null };
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(value);
}

export function buildInventoryStockShortageMessage(
  shortages: InventoryStockShortage[],
  getSkuName: (skuId: string) => string,
  getWarehouseName: (warehouseId: string) => string,
) {
  const totalMissing = shortages.reduce(
    (total, shortage) => total + shortage.missingQuantity,
    0,
  );
  const itemLabel = shortages.length === 1 ? 'ítem' : 'ítems';
  const unitLabel = totalMissing === 1 ? 'unidad' : 'unidades';
  const lines = shortages.map((shortage) => {
    const skuName = getSkuName(shortage.skuId);
    const ownerName = getWarehouseName(shortage.ownerWarehouseId);
    const location = shortage.warehouseId
      ? `en "${getWarehouseName(shortage.warehouseId)}"`
      : 'en el origen físico del documento';
    const identity = `${skuName} (propietario: ${ownerName})`;
    const requested = formatQuantity(shortage.requestedQuantity);
    const missing = formatQuantity(shortage.missingQuantity);
    if (!shortage.existsInWarehouse) {
      return `- ${identity}: sin existencias ${location}. Solicitadas: ${requested}; faltan: ${missing}.`;
    }
    return `- ${identity}: disponibles ${formatQuantity(shortage.availableQuantity)} de ${requested} ${location}; faltan: ${missing}.`;
  });

  return [
    `No se puede aprobar la remisión: hay ${shortages.length} ${itemLabel} con faltantes (${formatQuantity(totalMissing)} ${unitLabel} en total).`,
    '',
    ...lines,
  ].join('\n');
}
