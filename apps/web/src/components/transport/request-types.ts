import {
  type InventoryItemPickerBulkItem,
  type InventoryItemPickerSerialItem,
} from '@/components/InventoryItemPickerModal';
export type InventoryBulk = InventoryItemPickerBulkItem;

export type InventorySerial = InventoryItemPickerSerialItem;

export type RequestInventoryResponse = {
  bulk: InventoryBulk[];
  serial: InventorySerial[];
  presentation: { showOwnerWarehouse: boolean };
};

export type Employee = {
  id: string;
  name: string;
  lastName?: string | null;
  user?: {
    id: string;
    email: string;
    role: string;
    active: boolean;
  } | null;
};

export type Customer = { id: string; name: string; phone?: string | null };

export type CustomerWorksite = {
  id: string;
  alias: string | null;
  worksite: {
    id: string;
    name: string;
    address: string | null;
    phone?: string | null;
  };
};

export type Vehicle = {
  id: string;
  plate?: string | null;
  name?: string | null;
};

export type Warehouse = {
  id: string;
  name: string;
  type?: 'OWN' | 'ALLY' | string;
};

export type SelectedItem = {
  selectionId: string;
  type: 'bulk' | 'serial' | 'free';
  bulkKey?: string;
  skuId?: string;
  assetId?: string;
  name: string;
  requestedTag?: string;
  serial?: string | null;
  quantity?: number;
  availableQuantity?: number;
  ownerWarehouseId?: string | null;
  isDamaged?: boolean;
  damageDescription?: string;
  associatedMixerId?: string;
  componentParentAssetId?: string;
};

export type EvidencePhotoDraft = {
  id: string;
  file: File;
  previewUrl: string;
};

export type ProviderRemissionRequirement = {
  providerWarehouseId: string;
  providerName: string;
  itemCount: number;
  quantity: number;
  documentUploaded: boolean;
};

export type ProviderRemissionRequirements = {
  required: boolean;
  providers: ProviderRemissionRequirement[];
  missingProviders: ProviderRemissionRequirement[];
};

export type ProviderRemissionModalState = {
  mode: 'OPTIONAL' | 'REQUIRED';
  requirements: ProviderRemissionRequirements;
  documentId?: string;
};

export type GenerateFieldErrors = {
  customerId?: string;
  docDate?: string;
  docTime?: string;
  customerWorksiteId?: string;
  recipientPhones?: string;
  driverId?: string;
};

export type RequestDocument = {
  id: string;
  type: 'REMISSION' | 'RETURN' | string;
  status: string;
  consecutive: string | null;
  createdAt: string;
  docDate: string;
  creator?: { id: string; name: string | null; email: string | null } | null;
  customerWorksite?: {
    id: string;
    alias: string | null;
    customer?: { id: string; name: string } | null;
    worksite?: { id: string; name: string } | null;
  } | null;
  _count?: { items: number };
};

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

export type MixerMotorRecovery = {
  document: RequestDocumentDetail;
  mixer: InventorySerial;
  motors: InventorySerial[];
  ownerWarehouseId: string;
};

export type RecoverableApprovalError = {
  code?: string;
  recovery?: {
    type?: string;
    mixerAssetId?: string;
    ownerWarehouseId?: string | null;
  };
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
  { bulk: InventoryBulk[]; serial: InventorySerial[] }
>;

export type CreateSerializedAssetResponse = {
  asset: {
    id: string;
    internalNumber: number;
    skuId: string;
    warehouseOwnerId: string;
    warehouseCurrentId: string;
  };
};

export type SolicitudesTab = 'list' | 'generate';

export type RequestsPageMode = 'requests' | 'generate';

export type GenerateStep = 'info' | 'items' | 'sign';
