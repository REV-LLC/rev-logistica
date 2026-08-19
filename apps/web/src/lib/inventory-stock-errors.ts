export type InventoryStockShortage = {
  skuId: string;
  ownerWarehouseId: string;
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
    const warehouseName = getWarehouseName(shortage.ownerWarehouseId);
    const requested = formatQuantity(shortage.requestedQuantity);
    const missing = formatQuantity(shortage.missingQuantity);
    if (!shortage.existsInWarehouse) {
      return `- ${skuName}: no existe en "${warehouseName}". Solicitadas: ${requested}; faltan: ${missing}.`;
    }
    return `- ${skuName}: disponibles ${formatQuantity(shortage.availableQuantity)} de ${requested}; faltan: ${missing}.`;
  });

  return [
    `No se puede aprobar la remisión: hay ${shortages.length} ${itemLabel} con faltantes (${formatQuantity(totalMissing)} ${unitLabel} en total).`,
    '',
    ...lines,
  ].join('\n');
}
