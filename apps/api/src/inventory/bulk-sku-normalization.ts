type BulkSkuNameInput = {
  name?: string;
  lengthMeters?: number;
};

const TRAILING_LENGTH_PATTERN =
  /(?:\(\s*)?(\d+(?:[.,]\d+)?)\s*(?:M|MT|MTS|METRO|METROS)(?:\s*\))?\s*$/i;

const normalizeText = (value: string) =>
  value
    .trim()
    .toLocaleUpperCase('es-CO')
    .replace(/\s+/g, ' ');

export const normalizeBulkSkuInput = <T extends BulkSkuNameInput>(input: T): T => {
  if (!input.name?.trim()) return input;

  const normalizedName = normalizeText(input.name);
  const lengthMatch = normalizedName.match(TRAILING_LENGTH_PATTERN);
  const parsedLength = lengthMatch
    ? Number(lengthMatch[1].replace(',', '.'))
    : undefined;
  const lengthMeters = input.lengthMeters ?? parsedLength;
  const baseName = lengthMatch
    ? normalizedName.slice(0, lengthMatch.index).trim().replace(/[(-]+\s*$/, '').trim()
    : normalizedName;

  if (lengthMeters == null || !Number.isFinite(lengthMeters) || lengthMeters <= 0) {
    return { ...input, name: normalizedName };
  }

  return {
    ...input,
    name: `${baseName} (${lengthMeters.toFixed(2)} M)`,
    lengthMeters,
  };
};

export const bulkSkuCanonicalKey = (input: BulkSkuNameInput) =>
  (normalizeBulkSkuInput(input).name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
