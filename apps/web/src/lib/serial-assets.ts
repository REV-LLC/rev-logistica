export type SerialDisplayItem = {
  assetId?: string | null;
  skuName?: string | null;
  brand?: string | null;
  model?: string | null;
  description?: string | null;
  serialOrEngine?: string | null;
  internalNumber?: string | number | null;
};

const normalizeDisplayPart = (value: string) =>
  value
    .trim()
    .toLocaleUpperCase('es-CO')
    .replace(/\s+/g, ' ');

const appendUniqueDisplayPart = (parts: string[], value?: string | null) => {
  const cleaned = value?.trim();
  if (!cleaned) return;

  const normalized = normalizeDisplayPart(cleaned);
  if (parts.some((part) => normalizeDisplayPart(part).includes(normalized))) {
    return;
  }
  parts.push(cleaned);
};

export function getSerialDisplayName(item: SerialDisplayItem) {
  const manualDescription = item.description?.trim();
  if (manualDescription) {
    const internal = item.internalNumber != null ? ` #${item.internalNumber}` : '';
    return `${manualDescription}${internal}`.trim();
  }

  const parts: string[] = [];
  appendUniqueDisplayPart(parts, item.skuName);
  appendUniqueDisplayPart(parts, item.brand);
  appendUniqueDisplayPart(parts, item.model);
  const base = parts.length > 0 ? parts.join(' ') : item.serialOrEngine ?? item.assetId ?? '-';
  const internal = item.internalNumber != null ? ` #${item.internalNumber}` : '';
  return `${base}${internal}`.trim();
}
