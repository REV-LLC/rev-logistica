export type EquipmentIdentity = {
  id: string;
  publicCode: string;
  displayName?: string;
  brand?: string | null;
  model?: string | null;
  description?: string | null;
  internalNumber: number;
  serialOrEngine?: string | null;
  imageUrl?: string | null;
  imageFileObject?: { storageKey: string } | null;
  sku: {
    name: string;
    imageUrl?: string | null;
    imageFileObject?: { storageKey: string } | null;
  };
  warehouseOwner?: { name: string };
};
export const equipmentLabel = (asset: EquipmentIdentity) =>
  `${equipmentName(asset)}${asset.warehouseOwner?.name ? ` · ${asset.warehouseOwner.name}` : ""}`;
export const equipmentName = (asset: EquipmentIdentity) =>
  asset.displayName || `${asset.description || asset.sku.name} #${asset.internalNumber}`;
export const equipmentImage = (asset: EquipmentIdentity) =>
  asset.imageUrl?.trim() ||
  asset.imageFileObject?.storageKey?.trim() ||
  asset.sku.imageFileObject?.storageKey?.trim() ||
  asset.sku.imageUrl?.trim() ||
  null;
