export function getDocumentRequestNumber(
  value: string,
  docType: 'REMISSION' | 'RETURN',
  savedConsecutive: string | null,
) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^(RM|DV)-APP-\d+$/i.test(trimmed)) {
    const generated = trimmed.toUpperCase();
    // Leave an existing APP series to the server, even when the document type changes.
    return generated === savedConsecutive ? undefined : generated;
  }
  const prefix = docType === 'REMISSION' ? 'RM' : 'DV';
  return `${prefix}${trimmed.replace(/^(RM|DV)[\s\-_]*/i, '')}`;
}
