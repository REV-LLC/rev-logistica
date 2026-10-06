export type BulkKit = {
  id: string;
  reference: string;
  active: boolean;
  version: number;
  entries: Array<{
    skuId: string;
    quantity: number;
    sku: { name: string; active: boolean; assetFamily: { name: string } };
  }>;
};
export type BulkKitFamily = {
  id: string;
  name: string;
  bulkKitsEnabled?: boolean;
  bulkKitPrefix: string | null;
  bulkKitSettingsVersion: number;
  bulkKits: BulkKit[];
};
export function bulkKitName(
  family: Pick<BulkKitFamily, "bulkKitPrefix">,
  kit: Pick<BulkKit, "reference">,
) {
  return [family.bulkKitPrefix, kit.reference].filter(Boolean).join(" ");
}
