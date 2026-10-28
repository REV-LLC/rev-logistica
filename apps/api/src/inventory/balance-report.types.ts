export type BalanceReportRow = {
  itemKey: string;
  reference: string;
  identification: string;
  controlType: 'BULK' | 'SERIAL';
  isImplement: boolean;
  ownerId: string | null;
  ownerName: string;
  ownerCategory: string | null;
  ownerWarehouseId: string | null;
  ownerWarehouseName: string;
  locationType: 'WAREHOUSE' | 'WORKSITE' | 'TRANSIT' | 'UNKNOWN';
  locationId: string | null;
  locationName: string;
  customerId: string | null;
  customerName: string;
  worksiteName: string;
  worksiteAlias: string;
  quantity: number;
  source: 'INVENTORY' | 'LEGACY_IMPLEMENT';
};

/** Fields shared by the live warehouse and worksite projections. */
export type BalanceReportSource = {
  bulk: {
    skuId: string;
    skuName?: string | null;
    ownerWarehouseId: string | null;
    ownerWarehouseName?: string | null;
    isImplement?: boolean;
    isConsumable?: boolean;
    quantity: number;
  }[];
  serial: {
    assetId: string;
    skuName?: string | null;
    description?: string | null;
    serialOrEngine?: string | null;
    internalNumber?: number | null;
    ownerWarehouseId: string | null;
    ownerWarehouseName?: string | null;
    isImplement?: boolean;
    status?: string;
    location?: { type: string; name: string | null };
    quantity: number;
  }[];
};
