const SAS_SUFFIX_PATTERN = /\s+S\.?\s*A\.?\s*S\.?\s*$/i;

export function normalizeLegalName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(SAS_SUFFIX_PATTERN, ' S.A.S.');
}
