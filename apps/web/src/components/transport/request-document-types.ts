import type {
  InventoryItemPickerBulkItem,
  InventoryItemPickerSerialItem,
} from '@/components/InventoryItemPickerModal';

export type RequestDocumentDetail = {
  id: string;
  type: 'REMISSION' | 'RETURN' | string;
  status: string;
  consecutive: string | null;
  docDate: string;
  notes: string | null;
  recipientPhone?: string | null;
  recipientPhones?: string[];
  warehouse?: { id: string; name: string } | null;
  customerWorksite?: {
    id: string;
    alias: string | null;
    customer?: { id: string; name: string } | null;
    worksite?: { id: string; name: string } | null;
  } | null;
  files?: Array<{
    id: string;
    fileType: string;
    storageKey: string;
    mimeType?: string | null;
    createdAt: string;
  }>;
  items: Array<{
    id: string;
    skuId?: string | null;
    assetId?: string | null;
    componentParentAssetId?: string | null;
    quantity?: string | number | null;
    condition?: string | null;
    conditionNote?: string | null;
    requestedTag?: string | null;
    billingCutoffDate?: string | null;
    sku?: { id: string; name: string } | null;
    asset?: {
      id: string;
      serialOrEngine?: string | null;
      description?: string | null;
      kind?: 'STANDARD' | 'MOTOR' | string | null;
      assignedMotorId?: string | null;
      assignedToMixer?: { id: string } | null;
      sku?: { id: string; name: string } | null;
    } | null;
  }>;
};

export type SkuOption = {
  id: string;
  name: string;
  assetFamilyId: string;
  controlType: 'BULK' | 'SERIAL';
  category?: string | null;
};

export type ResolveInventoryByOwner = Record<
  string,
  {
    bulk: InventoryItemPickerBulkItem[];
    serial: InventoryItemPickerSerialItem[];
  }
>;
