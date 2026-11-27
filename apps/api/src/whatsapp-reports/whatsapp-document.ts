export const DOCUMENT_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
};
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export function cleanDocumentName(name?: string | null) {
  return (
    name
      ?.normalize('NFKC')
      .split(/[\\/]/)
      .pop()
      ?.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '')
      .trim()
      .slice(0, 180) || 'Documento'
  );
}
export function safeDownloadName(
  name: string | null | undefined,
  extension: string,
) {
  const base =
    cleanDocumentName(name)
      .replace(/\.[^.]*$/, '')
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .trim()
      .slice(0, 100) || 'documento';
  return `${base}.${extension}`;
}
export function validDocument(buffer: Buffer, mime: string) {
  if (!buffer.length) return false;
  if (mime === 'application/pdf')
    return buffer.subarray(0, 5).toString() === '%PDF-';
  if (mime === 'text/plain') return !buffer.includes(0);
  if (mime.includes('openxmlformats'))
    return buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  return buffer
    .subarray(0, 8)
    .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
}
