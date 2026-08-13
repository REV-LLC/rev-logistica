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

const getExplicitBrandModelName = (brand?: string | null, model?: string | null) => {
  const cleanedBrand = brand?.trim();
  const cleanedModel = model?.trim();
  if (!cleanedBrand || !cleanedModel) return null;

  const brandWords = new Set(normalizeDisplayPart(cleanedBrand).split(' '));
  const modelWords = cleanedModel.split(/\s+/);
  while (
    modelWords.length > 1 &&
    brandWords.has(normalizeDisplayPart(modelWords[0]))
  ) {
    modelWords.shift();
  }

  const modelWithoutRepeatedBrand = modelWords.join(' ').trim();
  return [cleanedBrand, modelWithoutRepeatedBrand].filter(Boolean).join(' ');
};

export function getSerialDisplayName(item: SerialDisplayItem) {
  const manualDescription = item.description?.trim();
  if (manualDescription) {
    const internal = item.internalNumber != null ? ` #${item.internalNumber}` : '';
    return `${manualDescription}${internal}`.trim();
  }

  const explicitBrandModelName = getExplicitBrandModelName(item.brand, item.model);
  const parts: string[] = [];
  if (explicitBrandModelName) {
    parts.push(explicitBrandModelName);
  } else {
    appendUniqueDisplayPart(parts, item.skuName);
    appendUniqueDisplayPart(parts, item.brand);
    appendUniqueDisplayPart(parts, item.model);
  }
  const base = parts.length > 0 ? parts.join(' ') : item.serialOrEngine ?? item.assetId ?? '-';
  const internal = item.internalNumber != null ? ` #${item.internalNumber}` : '';
  return `${base}${internal}`.trim();
}
