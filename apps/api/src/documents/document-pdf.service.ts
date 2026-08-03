import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';

type SharedDocumentFile = {
  fileType: string;
  displayName: string | null;
  originalName: string | null;
  storageKey: string;
  mimeType: string | null;
};

type SharedDocument = {
  type: string;
  status: string;
  consecutive: string | null;
  docDate: Date;
  notes: string | null;
  customerWorksite: {
    alias: string | null;
    customer: { name: string } | null;
    worksite: { name: string; address: string | null } | null;
  } | null;
  items: Array<{
    quantity: { toString(): string } | string | number | null;
    requestedTag: string | null;
    conditionNote: string | null;
    sku: { name: string } | null;
    asset: {
      serialOrEngine: string | null;
      description: string | null;
      internalNumber: number | null;
      sku: { name: string } | null;
    } | null;
  }>;
  files?: SharedDocumentFile[];
};

type PreparedImage = {
  buffer: Buffer;
  label: string;
};

type PreparedDocumentAssets = {
  logo: Buffer | null;
  evidence: PreparedImage[];
  signature: PreparedImage | null;
};

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 10_000;

const TERMS = [
  'Entre los suscritos a saber JESUS ALVARO GUERRERO VILLAMICENCIO, quien obra en este acto en representación de la empresa persona natural JESUS ALVARO GUERRERO VILLAMICENCIO, con establecimiento comercial denominado RENTA EQUIPOS DEL VALLE, identificada con la cédula de ciudadanía No 94.371.184, que en lo sucesivo para los efectos de este contrato se denominará LA ARRENDADORA, por una parte y quien firma el presente documento en nombre propio o en representación de la obra donde se remisiona el equipo en adelante se denominará LA ARRENDATARIA, acuerdan por medio del presente documento celebrar un contrato de arrendamiento de equipos para la construcción el cual se regirá por las siguientes cláusulas:',
  'PRIMERA: LA ARRENDADORA entrega a título de arrendamiento a LA ARRENDATARIA y esta recibe al mismo título los materiales o elementos para construcción que se relacionan en la remisión.',
  'SEGUNDA: El término de duración de este contrato será a partir del recibido de los equipos mediante la forma “remisión de equipos” y su terminación será hasta la devolución de los mismos.',
  'TERCERA: LA ARRENDATARIA declara recibir el equipo a entera satisfacción, perfectas condiciones y apto para el trabajo a que está destinado y se obliga a restituirlo en las mismas condiciones, salvo el deterioro normal por buen uso.',
  'CUARTA: Los equipos dados en arrendamiento deberán permanecer en la obra para la cual fueron contratados, en el caso en que LA ARRENDATARIA desee trasladar el lugar de los equipos deberá notificar a LA ARRENDADORA.',
  'QUINTA: LA ARRENDADORA se compromete a hacer el mantenimiento debido al equipo, con el fin de que este cumpla el servicio para el cual fue contratado.',
  'SEXTA: LA ARRENDATARIA es la única y directa responsable, así actúe como intermediaria o por contrato de administración delegada, de los equipos dados en arrendamiento y pagará el valor del respectivo equipo en caso de faltantes, hurto, pérdida parcial o total del equipo; de igual forma será de su cargo las reparaciones que deban efectuarse fuera del deterioro normal.',
  'SÉPTIMA: LA ARRENDADORA no asume ninguna responsabilidad por retrasos o demoras por estar el equipo en mantenimiento, ni se hace responsable de accidentes o daños por el mal uso o descuido en el manejo de equipos.',
  'OCTAVA: El equipo deberá ser devuelto una vez concluida la obra o en la fecha de terminación del presente contrato en las instalaciones de LA ARRENDADORA; los gastos de transporte serán por cuenta de LA ARRENDATARIA.',
  'PARÁGRAFO: LA ARRENDATARIA a quien LA ARRENDADORA designe, a retirar el equipo entregado en calidad de arrendamiento, del lugar donde este se encuentre, sin previa orden judicial o policiva, en los siguientes casos. LA ARRENDATARIA mediante el presente contrato acepta todas las facturas que se generen como consecuencia del arrendamiento de los equipos, prestación de servicios, faltantes, reparaciones e intereses por mora en el pago de dichas facturas.',
  'NOVENA: Este contrato junto con las facturas dejadas de cancelar prestan mérito ejecutivo y LA ARRENDADORA podrá iniciar acción judicial contra LA ARRENDATARIA por incumplimiento de algunas de las cláusulas pactadas en él.',
];

@Injectable()
export class DocumentPdfService {
  private readonly logger = new Logger(DocumentPdfService.name);

  async render(document: SharedDocument) {
    const assets = await this.prepareAssets(document.files ?? []);
    const pdf = new PDFDocument({
      size: 'A4',
      margins: { top: 36, right: 36, bottom: 36, left: 36 },
      bufferPages: true,
      info: {
        Title: this.documentTitle(document),
        Author: 'Renta Equipos del Valle S.A.S.',
      },
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    const completed = new Promise<Buffer>((resolve, reject) => {
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
    });

    this.drawHeader(pdf, document, assets.logo);
    this.drawCustomer(pdf, document);
    this.drawItems(pdf, document);
    this.drawNotes(pdf, document.notes);
    this.drawTerms(pdf);
    this.drawSignatures(pdf, assets.signature);
    this.drawEvidence(pdf, document, assets.evidence);
    this.addPageNumbers(pdf);
    pdf.end();
    return completed;
  }

  fileName(document: Pick<SharedDocument, 'type' | 'consecutive'>) {
    const kind = document.type === 'RETURN' ? 'devolucion' : 'remision';
    const number =
      document.consecutive?.replace(/[^a-zA-Z0-9_-]/g, '-') || 'documento';
    return `${kind}-${number}.pdf`;
  }

  private documentTitle(
    document: Pick<SharedDocument, 'type' | 'consecutive'>,
  ) {
    const kind = document.type === 'RETURN' ? 'Devolución' : 'Remisión';
    return `${kind} ${document.consecutive ?? ''}`.trim();
  }

  private drawHeader(
    pdf: PDFKit.PDFDocument,
    document: SharedDocument,
    logo: Buffer | null,
  ) {
    if (logo) {
      pdf.image(logo, 36, 28, {
        fit: [58, 58],
        align: 'center',
        valign: 'center',
      });
    }
    const textX = logo ? 108 : 36;
    pdf
      .font('Helvetica-Bold')
      .fontSize(18)
      .text('RENTA EQUIPOS DEL VALLE S.A.S.', textX, 37, {
        width: 559 - textX,
      });
    pdf
      .font('Helvetica')
      .fontSize(8)
      .text(
        'NIT 901.062.058-0 | Cra. 22 No. 5A-07 B/ Alameda | 310 533 2297',
        textX,
        63,
        { width: 559 - textX },
      );
    pdf.y = 91;
    pdf.moveDown(0.8);
    pdf.moveTo(36, pdf.y).lineTo(559, pdf.y).lineWidth(1.2).stroke('#111111');
    pdf.moveDown(0.7);
    pdf.font('Helvetica-Bold').fontSize(15).text(this.documentTitle(document));
    pdf
      .font('Helvetica')
      .fontSize(9)
      .text(
        `Fecha: ${new Intl.DateTimeFormat('es-CO', {
          timeZone: 'America/Bogota',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(document.docDate)}    Estado: ${document.status}`,
      );
    pdf.moveDown(0.8);
  }

  private drawCustomer(pdf: PDFKit.PDFDocument, document: SharedDocument) {
    this.sectionTitle(pdf, 'INFORMACIÓN DEL CLIENTE');
    const customer = document.customerWorksite?.customer?.name ?? '-';
    const worksite =
      document.customerWorksite?.alias ||
      document.customerWorksite?.worksite?.name ||
      '-';
    const address = document.customerWorksite?.worksite?.address ?? '-';
    pdf
      .font('Helvetica')
      .fontSize(9)
      .text(`Razón social: ${customer}`)
      .text(`Obra: ${worksite}`)
      .text(`Dirección de entrega: ${address}`);
    pdf.moveDown(0.8);
  }

  private drawItems(pdf: PDFKit.PDFDocument, document: SharedDocument) {
    this.sectionTitle(pdf, 'DETALLE DE EQUIPOS');
    this.itemHeader(pdf);
    document.items.forEach((item) => {
      if (pdf.y > 720) {
        pdf.addPage();
        this.drawContinuationHeader(pdf, document);
        this.itemHeader(pdf);
      }
      const y = pdf.y;
      const description =
        item.asset?.description ||
        item.asset?.sku?.name ||
        item.sku?.name ||
        item.requestedTag ||
        'Ítem';
      const equipment =
        item.asset?.internalNumber != null
          ? String(item.asset.internalNumber)
          : item.asset?.serialOrEngine || '-';
      const quantity = item.quantity == null ? '1' : item.quantity.toString();
      const note = item.conditionNote || '-';
      const rowHeight = Math.max(
        22,
        pdf.heightOfString(description, { width: 255 }) + 8,
        pdf.heightOfString(note, { width: 125 }) + 8,
      );
      pdf.rect(36, y, 523, rowHeight).stroke('#666666');
      [82, 345, 417].forEach((x) =>
        pdf
          .moveTo(x, y)
          .lineTo(x, y + rowHeight)
          .stroke('#666666'),
      );
      pdf
        .font('Helvetica')
        .fontSize(8)
        .text(quantity, 40, y + 6, { width: 38, align: 'center' })
        .text(description, 87, y + 6, { width: 253 })
        .text(equipment, 350, y + 6, { width: 62, align: 'center' })
        .text(note, 422, y + 6, { width: 132 });
      pdf.y = y + rowHeight;
    });
    pdf.moveDown(0.8);
  }

  private itemHeader(pdf: PDFKit.PDFDocument) {
    const y = pdf.y;
    pdf.rect(36, y, 523, 20).fill('#111111');
    pdf
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('CANT.', 40, y + 6, { width: 38, align: 'center' })
      .text('DESCRIPCIÓN', 87, y + 6, { width: 253 })
      .text('# EQ.', 350, y + 6, { width: 62, align: 'center' })
      .text('OBSERVACIÓN', 422, y + 6, { width: 132 });
    pdf.fillColor('#111111');
    pdf.y = y + 20;
  }

  private drawNotes(pdf: PDFKit.PDFDocument, notes: string | null) {
    this.ensureSpace(pdf, 80);
    this.sectionTitle(pdf, 'OBSERVACIONES');
    pdf
      .font('Helvetica')
      .fontSize(8)
      .text(notes?.trim() || 'Sin observaciones.');
    pdf.moveDown(0.8);
  }

  private drawTerms(pdf: PDFKit.PDFDocument) {
    this.ensureSpace(pdf, 180);
    this.sectionTitle(pdf, 'TÉRMINOS Y CONDICIONES');
    pdf.font('Helvetica').fontSize(7.2).lineGap(1.5);
    TERMS.forEach((term) => {
      if (pdf.y > 760) {
        pdf.addPage();
        this.sectionTitle(pdf, 'TÉRMINOS Y CONDICIONES · CONTINUACIÓN');
        pdf.font('Helvetica').fontSize(7.2).lineGap(1.5);
      }
      pdf.text(term, { align: 'justify' }).moveDown(0.35);
    });
    pdf.lineGap(0).moveDown(0.5);
  }

  private drawSignatures(
    pdf: PDFKit.PDFDocument,
    signature: PreparedImage | null,
  ) {
    this.ensureSpace(pdf, 105);
    const imageY = pdf.y;
    const y = imageY + 58;
    const columns = [36, 167, 298, 429];
    if (signature) {
      pdf.image(signature.buffer, columns[3] + 6, imageY, {
        fit: [100, 54],
        align: 'center',
        valign: 'bottom',
      });
    }
    [
      'ELABORADO POR',
      'TRANSPORTADO POR',
      'ENTREGADO POR',
      'RECIBIDO POR',
    ].forEach((label, index) => {
      const x = columns[index];
      pdf
        .moveTo(x, y)
        .lineTo(x + 112, y)
        .stroke('#333333');
      pdf
        .font('Helvetica-Bold')
        .fontSize(7)
        .text(label, x, y + 5, { width: 112, align: 'center' });
    });
    pdf.y = y + 22;
  }

  private drawEvidence(
    pdf: PDFKit.PDFDocument,
    document: SharedDocument,
    evidence: PreparedImage[],
  ) {
    if (!evidence.length) return;
    let index = 0;
    while (index < evidence.length) {
      pdf.addPage();
      this.drawContinuationHeader(pdf, document);
      this.sectionTitle(pdf, 'EVIDENCIA FOTOGRÁFICA');
      for (let slot = 0; slot < 2 && index < evidence.length; slot += 1) {
        const item = evidence[index];
        const top = pdf.y;
        pdf
          .font('Helvetica-Bold')
          .fontSize(8)
          .text(`${index + 1}. ${item.label}`, 36, top, { width: 523 });
        pdf.image(item.buffer, 36, top + 16, {
          fit: [523, 300],
          align: 'center',
          valign: 'center',
        });
        pdf.y = top + 324;
        index += 1;
      }
    }
  }

  private sectionTitle(pdf: PDFKit.PDFDocument, title: string) {
    const y = pdf.y;
    pdf.rect(36, y, 523, 17).fill('#111111');
    pdf
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(title, 41, y + 5);
    pdf.fillColor('#111111');
    pdf.y = y + 22;
  }

  private ensureSpace(pdf: PDFKit.PDFDocument, required: number) {
    if (pdf.y + required > 806) pdf.addPage();
  }

  private drawContinuationHeader(
    pdf: PDFKit.PDFDocument,
    document: SharedDocument,
  ) {
    pdf
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(`${this.documentTitle(document)} · continuación`);
    pdf.moveDown(0.5);
  }

  private addPageNumbers(pdf: PDFKit.PDFDocument) {
    const range = pdf.bufferedPageRange();
    for (
      let index = range.start;
      index < range.start + range.count;
      index += 1
    ) {
      pdf.switchToPage(index);
      pdf
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#666666')
        .text(`Página ${index + 1} de ${range.count}`, 36, 795, {
          width: 523,
          align: 'right',
          lineBreak: false,
        });
      pdf.fillColor('#111111');
    }
  }

  private async prepareAssets(
    files: SharedDocumentFile[],
  ): Promise<PreparedDocumentAssets> {
    const logo = await this.loadLogo();
    const evidenceFiles = files.filter(
      (file) => file.fileType === 'PHOTO_EVIDENCE',
    );
    const signatureFile = files.find(
      (file) => file.fileType === 'SIGNATURE_RECEIVED',
    );
    const evidence = (
      await Promise.all(
        evidenceFiles.map((file, index) =>
          this.prepareImage(
            file,
            file.displayName?.trim() ||
              file.originalName?.trim() ||
              `Evidencia ${index + 1}`,
            false,
          ),
        ),
      )
    ).filter((image): image is PreparedImage => Boolean(image));
    const signature = signatureFile
      ? await this.prepareImage(signatureFile, 'Firma de recibido', true)
      : null;
    return { logo, evidence, signature };
  }

  private async loadLogo() {
    const candidates = [
      resolve(process.cwd(), 'apps/api/assets/rev-logo.png'),
      resolve(process.cwd(), 'assets/rev-logo.png'),
      resolve(__dirname, '../../assets/rev-logo.png'),
      resolve(__dirname, '../../../assets/rev-logo.png'),
    ];
    for (const candidate of candidates) {
      try {
        return await readFile(candidate);
      } catch {
        // Try the next path because source and compiled layouts differ.
      }
    }
    this.logger.warn('Document PDF logo was not found');
    return null;
  }

  private async prepareImage(
    file: SharedDocumentFile,
    label: string,
    preserveTransparency: boolean,
  ): Promise<PreparedImage | null> {
    try {
      const source = await this.loadImageSource(file.storageKey);
      const pipeline = sharp(source).rotate().resize({
        width: 1800,
        height: 1800,
        fit: 'inside',
        withoutEnlargement: true,
      });
      const buffer = preserveTransparency
        ? await pipeline.png().toBuffer()
        : await pipeline
            .flatten({ background: '#ffffff' })
            .jpeg({ quality: 84 })
            .toBuffer();
      return { buffer, label };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Document PDF image skipped (${file.fileType}): ${detail}`,
      );
      return null;
    }
  }

  private async loadImageSource(storageKey: string) {
    const dataUrl = storageKey.match(
      /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/s,
    );
    if (dataUrl) {
      const buffer = Buffer.from(dataUrl[1], 'base64');
      if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
        throw new Error('invalid embedded image size');
      }
      return buffer;
    }

    const url = new URL(storageKey);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('unsupported image URL');
    }
    const response = await fetch(url, {
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    });
    if (!response.ok)
      throw new Error(`image download returned ${response.status}`);
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_IMAGE_BYTES) throw new Error('image is too large');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
      throw new Error('invalid downloaded image size');
    }
    return buffer;
  }
}
