import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import PDFDocument from 'pdfkit';

// Same legal identity used by REV's existing document PDF renderer.
export const REV_PAYROLL_COMPANY = { name: 'RENTA EQUIPOS DEL VALLE S.A.S.', nit: '901.062.058-0', address: 'Cra. 22 No. 5A-07 B/ Alameda', phone: '310 533 2297' };
const cop = (value: unknown) => '$ ' + new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(value));
@Injectable()
export class PayrollPdfService {
  private async logo() {
    for (const path of [resolve(process.cwd(), 'assets/rev-logo.png'), resolve(process.cwd(), 'apps/api/assets/rev-logo.png'), resolve(__dirname, '../../assets/rev-logo.png'), resolve(__dirname, '../../../assets/rev-logo.png')]) {
      try { return await readFile(path); } catch { /* try bundled asset */ }
    }
    return null;
  }
  async render(data: Record<string, unknown>): Promise<Buffer> {
    const logo = await this.logo();
    const employee = data.employee as Record<string, string>;
    const company = data.company as typeof REV_PAYROLL_COMPANY;
    const pdf = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 32, info: { Title: 'Comprobante de nómina', Author: company.name } });
    const chunks: Buffer[] = [];
    const result = new Promise<Buffer>((resolveBuffer, reject) => { pdf.on('data', c => chunks.push(c)); pdf.on('end', () => resolveBuffer(Buffer.concat(chunks))); pdf.on('error', reject); });
    const width = 728;
    if (logo) pdf.image(logo, 32, 26, { fit: [125, 75], align: 'center', valign: 'center' });
    pdf.font('Helvetica-Bold').fontSize(13).text(company.name, 180, 32, { width: 365 });
    pdf.font('Helvetica').fontSize(10).text(`NIT ${company.nit}\n${company.address}\n${company.phone}`, 180, 52, { width: 365, lineGap: 2 });
    pdf.font('Helvetica-Bold').fontSize(13).text('COMPROBANTE DE NÓMINA', 540, 32, { width: 220, align: 'right' });
    pdf.font('Helvetica').fontSize(8).text(`No. ${String(data.id)}\nEmitido: ${String(data.createdAt).slice(0, 10)}`, 540, 57, { width: 220, align: 'right' });
    pdf.font('Helvetica-Bold').fontSize(12).text(`PERÍODO: ${String(data.from)} AL ${String(data.to)}`, 32, 118, { width, align: 'center' });
    const columns = [180, 100, 95, 45, 100, 100, 108];
    const labels = ['NOMBRE DEL EMPLEADO', 'CÉDULA', 'SALARIO MENSUAL', 'DÍAS', 'SALARIO DEVENGADO', 'AUXILIO TRANSPORTE', 'TOTAL DEVENGADO'];
    const values = [`${employee.name} ${employee.lastName}`, employee.documentId, cop(data.monthlySalary), String(data.days), cop(data.salaryEarned), cop(data.transportEarned), cop(data.totalEarned)];
    let x = 32;
    pdf.font('Helvetica').fontSize(9);
    const rowHeight = Math.max(40, pdf.heightOfString(values[0], { width: columns[0] - 12 }) + 16);
    for (let i = 0; i < columns.length; i++) {
      pdf.rect(x, 144, columns[i], 35).fillAndStroke('#eef2f5', '#82909b');
      pdf.fillColor('#1c252d').font('Helvetica-Bold').fontSize(8).text(labels[i], x + 5, 151, { width: columns[i] - 10, align: 'center' });
      pdf.rect(x, 179, columns[i], rowHeight).stroke('#82909b');
      pdf.font('Helvetica').fontSize(9).text(values[i], x + 6, 191, { width: columns[i] - 12, align: i === 0 ? 'left' : 'center' });
      x += columns[i];
    }
    let y = 179 + rowHeight + 24;
    pdf.font('Helvetica-Bold').fontSize(10).text('DEDUCCIONES DEL EMPLEADO', 32, y);
    pdf.font('Helvetica').fontSize(10).text(`Salud (4%): ${cop(data.healthDeduction)}     Pensión (4%): ${cop(data.pensionDeduction)}`, 32, y + 21, { width: 440 });
    pdf.text(`Total deducciones: ${cop(data.totalDeductions)}`, 32, y + 39, { width: 440 });
    pdf.rect(515, y - 4, 245, 59).fillAndStroke('#eef2f5', '#82909b');
    pdf.fillColor('#1c252d').font('Helvetica-Bold').fontSize(11).text('NETO A PAGAR', 525, y + 5, { width: 225, align: 'center' });
    pdf.fontSize(19).text(cop(data.netPay), 525, y + 24, { width: 225, align: 'center' });
    y += 76;
    pdf.font('Helvetica').fontSize(8).text('Base de salud y pensión: salario devengado, sin auxilio de transporte. Valores redondeados al peso por concepto.', 32, y, { width });
    y += 24;
    pdf.font('Helvetica-Bold').fontSize(10).text('OBSERVACIONES', 32, y);
    y += 17;
    pdf.font('Helvetica').fontSize(9);
    const observations = String(data.observations || 'Sin observaciones.');
    const height = pdf.heightOfString(observations, { width: width - 16 }) + 16;
    if (y + height > 485) { pdf.addPage(); y = 48; }
    pdf.rect(32, y, width, height).stroke('#82909b');
    pdf.text(observations, 40, y + 8, { width: width - 16 });
    y += height + 58;
    if (y + 58 > 560) { pdf.addPage(); y = 90; }
    for (const [index, label] of ['AUTORIZADO', 'REVISADO', 'RECIBIDO'].entries()) {
      const sx = 32 + index * 250;
      pdf.moveTo(sx, y).lineTo(sx + 210, y).stroke('#82909b');
      pdf.font('Helvetica-Bold').fontSize(9).text(label, sx, y + 8, { width: 210, align: 'center' });
      pdf.font('Helvetica').fontSize(8).text('Nombre y firma', sx, y + 23, { width: 210, align: 'center' });
    }
    pdf.font('Helvetica').fontSize(8).text('Este comprobante documenta la liquidación. El pago no está registrado en este módulo.', 32, y + 47, { width, align: 'center' });
    pdf.end();
    return result;
  }
}
