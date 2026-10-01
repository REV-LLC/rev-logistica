/** Presentation only: identities and relationships always use their original IDs. */
export function assetDisplayName(asset?: {
  description?: string | null;
  internalNumber?: number | null;
  sku?: { name?: string | null } | null;
  warehouseOwner?: { name?: string | null } | null;
} | null) {
  const name = asset?.description?.trim() || asset?.sku?.name?.trim() || 'Equipo';
  const number = asset?.internalNumber != null ? ` #${asset.internalNumber}` : '';
  const owner = asset?.warehouseOwner?.name?.trim();
  return `${name}${number}${owner ? ` · ${owner}` : ''}`;
}
