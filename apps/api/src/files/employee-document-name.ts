const extensions: Record<string, readonly string[]> = {
  'application/pdf': ['pdf'], 'image/jpeg': ['jpg','jpeg'], 'image/png': ['png'], 'image/webp': ['webp'],
  'application/msword': ['doc'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'text/plain': ['txt'], 'text/csv': ['csv'],
};
function filenamePart(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}
export function employeeDocumentFilename(employee: { name: string; lastName?: string | null }, category: string, file: { originalname: string; mimetype: string }) {
  const person = filenamePart(`${employee.name} ${employee.lastName || ''}`).slice(0,140) || 'empleado';
  const tag = filenamePart(category).slice(0,50) || 'documento';
  const originalExtension = /\.([a-z0-9]+)$/i.exec(file.originalname)?.[1].toLowerCase();
  const permitted = extensions[file.mimetype] || ['bin'];
  const extension = originalExtension && permitted.includes(originalExtension) ? originalExtension : permitted[0];
  return `${person}_${tag}.${extension}`;
}
