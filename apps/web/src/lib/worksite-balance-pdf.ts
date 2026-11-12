import { documentBranding, type DocumentBranding } from './document-branding';

export const balancePdfColumns = [
  { key: 'type', label: 'Tipo', weight: 20 },
  { key: 'reference', label: 'Referencia', weight: 76 },
  { key: 'identifier', label: 'Identificación', weight: 35 },
  { key: 'owner', label: 'Dueño / procedencia', weight: 42 },
  { key: 'quantity', label: 'Saldo', weight: 20 },
] as const;
export type BalancePdfColumn = (typeof balancePdfColumns)[number]['key'];
export const defaultBalancePdfColumns: BalancePdfColumn[] = ['type', 'reference', 'identifier', 'quantity'];
export type WorksiteBalancePdfData = {
  customerName: string;
  worksiteName: string;
  worksiteAlias?: string | null;
  address?: string | null;
  bulk: { skuId?: string; skuName: string | null; ownerWarehouseName?: string | null; quantity: number }[];
  serial: { serialOrEngine: string | null; description: string | null; skuName?: string | null; ownerWarehouseName?: string | null; quantity: number }[];
};
type BalanceRow = { type: string; reference: string; identifier: string; owner: string; quantity: number };

export function balancePdfRows(data: WorksiteBalancePdfData, showOwner: boolean): BalanceRow[] {
  const bulk = new Map<string, BalanceRow>();
  data.bulk.forEach((item, index) => {
    const key = !showOwner && item.skuId ? item.skuId : `row:${index}`;
    const current = bulk.get(key);
    if (current) current.quantity += item.quantity;
    else bulk.set(key, {
      type: 'Masivo', reference: item.skuName?.trim() || 'Sin referencia', identifier: '-',
      owner: showOwner ? item.ownerWarehouseName?.trim() || 'Sin registrar' : '', quantity: item.quantity,
    });
  });
  return [...bulk.values(), ...data.serial.map(item => ({
    type: 'Equipo', reference: item.description?.trim() || item.skuName?.trim() || 'Equipo sin referencia',
    identifier: item.serialOrEngine?.trim() || '-', owner: showOwner ? item.ownerWarehouseName?.trim() || 'Sin registrar' : '', quantity: item.quantity,
  }))].sort((a, b) => a.reference.localeCompare(b.reference, 'es', { numeric: true }));
}

export function worksiteBalancePdfFilename(data: WorksiteBalancePdfData) {
  const name = (data.worksiteAlias || data.worksiteName).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return `saldo-obra-${name || 'obra'}.pdf`;
}

export async function createWorksiteBalancePdf(data: WorksiteBalancePdfData, options: {
  columns?: BalancePdfColumn[]; branding?: DocumentBranding; generatedAt?: Date;
} = {}): Promise<Blob> {
  const selected = new Set(options.columns ?? defaultBalancePdfColumns);
  const columns = balancePdfColumns.filter(column => selected.has(column.key));
  if (!columns.length) throw new Error('Selecciona al menos una columna para el PDF.');
  const brand = options.branding ?? documentBranding;
  const response = await fetch(brand.logoUrl);
  if (!response.ok) throw new Error('No se pudo cargar el logo de la empresa. Intenta nuevamente.');
  const logo = new Uint8Array(await response.arrayBuffer());
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title: `Saldo de inventario - ${data.customerName} - ${data.worksiteName}`, author: brand.companyName, creator: 'FINGE' });
  const dark: [number, number, number] = [28, 40, 49];
  const muted: [number, number, number] = [91, 105, 114];
  const left = 12, right = 198, width = right - left, bottom = 280;
  const stamp = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }).format(options.generatedAt ?? new Date());
  const fixed = columns.filter(column => column.key !== 'reference').reduce((sum, column) => sum + column.weight, 0);
  const hasReference = selected.has('reference');
  const weight = columns.reduce((sum, column) => sum + column.weight, 0);
  const widths = columns.map(column => hasReference
    ? column.key === 'reference' ? width - fixed : column.weight
    : width * column.weight / weight);
  let y = 0, tableTop = 0;
  const header = () => {
    pdf.setTextColor(...dark); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
    const image = pdf.getImageProperties(logo);
    const scale = Math.min(27 / image.width, 25 / image.height);
    pdf.addImage(logo, 'PNG', left, 8, image.width * scale, image.height * scale);
    const company = pdf.splitTextToSize(brand.companyName, 111) as string[];
    pdf.text(company, 45, 13);
    const headingY = 13 + company.length * 4;
    pdf.setFontSize(13); pdf.text('SALDO DE INVENTARIO', 45, headingY + 3);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...muted);
    pdf.text(`En obra | ${stamp}`, 45, headingY + 9);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(...dark);
    const byX = right - pdf.getTextWidth('FINGE') - 2;
    pdf.text('FINGE', right, 15, { align: 'right' });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.text('by', byX, 15, { align: 'right' });
    pdf.setFontSize(6); pdf.text('Finanzas · Inventario · Gestión', right, 20, { align: 'right' });
    const boxY = Math.max(35, headingY + 13);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
    const customer = pdf.splitTextToSize(data.customerName, 99) as string[];
    const site = pdf.splitTextToSize(data.worksiteAlias ? `${data.worksiteAlias} / ${data.worksiteName}` : data.worksiteName, 75) as string[];
    const height = 8 + Math.max(customer.length, site.length) * 3.8;
    pdf.setFillColor(...dark); pdf.roundedRect(left, boxY, width, height, 2, 2, 'F');
    pdf.setTextColor(192, 205, 215); pdf.setFontSize(6.5);
    pdf.text('CLIENTE', left + 3, boxY + 4); pdf.text('OBRA', 120, boxY + 4);
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(9);
    pdf.text(customer, left + 3, boxY + 8.5); pdf.text(site, 120, boxY + 8.5);
    y = boxY + height + 5;
    if (data.address?.trim()) {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...muted);
      const address = pdf.splitTextToSize(`Dirección: ${data.address.trim()}`, width) as string[];
      pdf.text(address, left, y); y += address.length * 3.5 + 3;
    }
    if (y > bottom - 25) throw new Error('Los datos del encabezado son demasiado extensos para el PDF.');
  };
  const tableHeader = () => {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
    const cells = columns.map((column, i) => pdf.splitTextToSize(column.label, widths[i] - 4) as string[]);
    const height = Math.max(...cells.map(cell => cell.length)) * 3.6 + 4;
    pdf.setFillColor(233, 238, 241); pdf.rect(left, y, width, height, 'F');
    pdf.setTextColor(...dark);
    let x = left;
    columns.forEach((column, i) => {
      const numeric = column.key === 'quantity';
      pdf.text(cells[i], numeric ? x + widths[i] - 2 : x + 2, y + 4.7, { align: numeric ? 'right' : 'left' });
      x += widths[i];
    });
    y += height; tableTop = y;
  };
  const nextPage = () => { pdf.addPage(); header(); tableHeader(); };
  header(); tableHeader();
  const rows = balancePdfRows(data, selected.has('owner'));
  if (!rows.length) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...muted);
    const lines = pdf.splitTextToSize('Esta obra no tiene inventario registrado actualmente.', width - 4) as string[];
    pdf.text(lines, left + 2, y + 7);
  }
  rows.forEach((row, index) => {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
    const cells = columns.map((column, i) => pdf.splitTextToSize(column.key === 'quantity'
      ? row.quantity.toLocaleString('es-CO', { maximumFractionDigits: 6 }) : row[column.key], widths[i] - 4) as string[]);
    const count = Math.max(...cells.map(cell => cell.length));
    const rowHeight = Math.max(8, count * 3.6 + 3);
    // Keep normal rows together; split exceptionally long text over repeated page headers.
    if (y + rowHeight > bottom && rowHeight <= bottom - tableTop) nextPage();
    let offset = 0;
    while (offset < count) {
      if (y + 8 > bottom) nextPage();
      const take = Math.min(count - offset, Math.max(1, Math.floor((bottom - y - 3) / 3.6)));
      const height = Math.max(8, take * 3.6 + 3);
      if (index % 2 === 1) { pdf.setFillColor(247, 249, 250); pdf.rect(left, y, width, height, 'F'); }
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...dark);
      let x = left;
      columns.forEach((column, i) => {
        const lines = cells[i].slice(offset, offset + take);
        if (lines.length) pdf.text(lines, column.key === 'quantity' ? x + widths[i] - 2 : x + 2, y + 4.8, { align: column.key === 'quantity' ? 'right' : 'left' });
        x += widths[i];
      });
      pdf.setDrawColor(218, 226, 231); pdf.setLineWidth(0.15); pdf.line(left, y + height, right, y + height);
      y += height; offset += take;
      if (offset < count) nextPage();
    }
  });
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setDrawColor(218, 226, 231); pdf.line(left, 284, right, 284);
    pdf.setTextColor(...muted); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
    pdf.text('Generado con FINGE | Saldo de inventario en obra', left, 289);
    pdf.text(`Página ${page} de ${pages}`, right, 289, { align: 'right' });
  }
  return pdf.output('blob');
}
