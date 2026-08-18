export type RequestInventoryAudience = 'DRIVER' | 'STAFF';

export type BulkInventoryRow = {
  skuId: string;
  ownerWarehouseId: string | null;
  ownerWarehouseName?: string | null;
  quantity: number;
};

export type SerialInventoryRow = {
  ownerWarehouseId: string | null;
  ownerWarehouseName?: string | null;
};

export function projectInventoryForRequest<
  TBulk extends BulkInventoryRow,
  TSerial extends SerialInventoryRow,
>(
  inventory: {
    customerWorksiteId: string;
    bulk: TBulk[];
    serial: TSerial[];
  },
  audience: RequestInventoryAudience,
) {
  if (audience === 'STAFF') {
    return {
      ...inventory,
      bulk: inventory.bulk.map((item) => ({
        ...item,
        allocationStatus: 'ASSIGNED' as const,
      })),
      serial: inventory.serial.map((item) => ({
        ...item,
        allocationStatus: 'ASSIGNED' as const,
      })),
      presentation: { showOwnerWarehouse: true },
    };
  }

  const bulkBySku = new Map<string, TBulk[]>();
  inventory.bulk.forEach((item) => {
    const group = bulkBySku.get(item.skuId);
    if (group) {
      group.push(item);
    } else {
      bulkBySku.set(item.skuId, [item]);
    }
  });

  const bulk = Array.from(bulkBySku.values()).map((items) => {
    const first = items[0];
    const ownerIds = new Set(items.map((item) => item.ownerWarehouseId));
    const hasMultipleOwners = ownerIds.size > 1;
    const allocationIsPending = hasMultipleOwners || first.ownerWarehouseId === null;

    return {
      ...first,
      ownerWarehouseId: hasMultipleOwners ? null : first.ownerWarehouseId,
      ownerWarehouseName: null,
      quantity: items.length === 1
        ? first.quantity
        : items.reduce((total, item) => total + Math.max(0, item.quantity), 0),
      allocationStatus: allocationIsPending ? 'PENDING' as const : 'ASSIGNED' as const,
    };
  });

  return {
    ...inventory,
    bulk,
    serial: inventory.serial.map((item) => ({
      ...item,
      ownerWarehouseName: null,
      allocationStatus: 'ASSIGNED' as const,
    })),
    presentation: { showOwnerWarehouse: false },
  };
}
