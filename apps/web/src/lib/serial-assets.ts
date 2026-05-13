export type SerialDisplayItem = {
  assetId?: string | null;
  skuName?: string | null;
  brand?: string | null;
  model?: string | null;
  description?: string | null;
  serialOrEngine?: string | null;
  internalNumber?: string | number | null;
};

export function getSerialDisplayName(item: SerialDisplayItem) {
  const manualDescription = item.description?.trim();
  if (manualDescription) {
    const internal = item.internalNumber != null ? ` #${item.internalNumber}` : '';
    return `${manualDescription}${internal}`.trim();
  }

  const parts = [item.skuName, item.brand, item.model]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const base = parts.length > 0 ? parts.join(' ') : item.serialOrEngine ?? item.assetId ?? '-';
  const internal = item.internalNumber != null ? ` #${item.internalNumber}` : '';
  return `${base}${internal}`.trim();
}
