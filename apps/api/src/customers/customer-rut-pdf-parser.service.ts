import { BadRequestException, Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';

export type CustomerRutPdfUpload = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export type ParsedCustomerRutData = {
  name: string | null;
  nitOrId: string | null;
  phone: string | null;
};

export const CUSTOMER_RUT_PDF_MAX_SIZE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class CustomerRutPdfParserService {
  async parse(file?: CustomerRutPdfUpload): Promise<ParsedCustomerRutData> {
    this.validatePdf(file);

    let text = '';
    const parser = new PDFParse({ data: file.buffer });
    try {
      const result = await parser.getText();
      text = result.text ?? '';
    } catch {
      throw new BadRequestException('No se pudo leer el PDF del RUT');
    } finally {
      await parser.destroy();
    }

    const normalizedText = this.normalizeRutText(text);
    if (!normalizedText) {
      throw new BadRequestException(
        'El PDF no contiene texto legible. Sube el RUT descargado de la DIAN, no una imagen escaneada.',
      );
    }

    const parsed = {
      name: this.extractRutName(normalizedText),
      nitOrId: this.extractRutNit(normalizedText),
      phone: this.extractRutPhone(normalizedText),
    };

    if (!parsed.name && !parsed.nitOrId && !parsed.phone) {
      throw new BadRequestException(
        'No se encontraron datos de cliente en el PDF. Verifica que sea un RUT válido.',
      );
    }

    return parsed;
  }

  private validatePdf(file?: CustomerRutPdfUpload): asserts file is CustomerRutPdfUpload {
    if (!file) {
      throw new BadRequestException('El archivo RUT es obligatorio');
    }
    if (file.size > CUSTOMER_RUT_PDF_MAX_SIZE_BYTES) {
      throw new BadRequestException('El PDF del RUT debe pesar máximo 5 MB');
    }
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('El RUT debe ser un PDF');
    }
    if (!file.buffer?.length) {
      throw new BadRequestException('El PDF del RUT está vacío');
    }
    if (file.buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
      throw new BadRequestException('El archivo no parece ser un PDF válido');
    }
  }

  private normalizeRutText(text: string) {
    return text
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  }

  private extractRutNit(text: string) {
    const labelWindow = this.extractTextWindow(
      text,
      /(?:n[uú]mero de identificaci[oó]n tributaria|nit\b)/i,
      180,
    );
    const fromLabel = labelWindow ? this.findNitCandidate(labelWindow) : null;
    if (fromLabel) return fromLabel;

    return this.findNitCandidate(text);
  }

  private findNitCandidate(text: string) {
    const compactText = text.replace(/\s+/g, ' ');
    const candidates = [...compactText.matchAll(/\b(?:\d[\s.-]?){6,12}(?:-\s?\d)?\b/g)]
      .map((match) => match[0])
      .map((value) => value.replace(/\s+/g, ''))
      .filter((value) => {
        const digits = value.replace(/\D/g, '');
        return digits.length >= 6 && digits.length <= 12;
      });

    const preferred = candidates.find((candidate) => candidate.includes('-')) ?? candidates[0];
    if (!preferred) return null;

    const [base, dv] = preferred.split('-').map((part) => part.replace(/\D/g, ''));
    if (!base) return null;
    return dv ? `${base}-${dv}` : base;
  }

  private extractRutName(text: string) {
    const businessName =
      this.extractValueAfterLabel(text, /(?:raz[oó]n social|nombre o raz[oó]n social)/i) ??
      this.extractValueAfterLabel(text, /nombre comercial/i);
    if (businessName) return businessName;

    const parts = [
      this.extractValueAfterLabel(text, /primer apellido/i),
      this.extractValueAfterLabel(text, /segundo apellido/i),
      this.extractValueAfterLabel(text, /primer nombre/i),
      this.extractValueAfterLabel(text, /otros nombres/i),
    ].filter(Boolean);

    return parts.length ? parts.join(' ') : null;
  }

  private extractRutPhone(text: string) {
    const window = this.extractTextWindow(text, /tel[eé]fono/i, 140);
    const phone = window?.match(/\b(?:\+?57\s*)?(?:\d[\s().-]?){7,12}\b/);
    if (!phone) return null;

    const normalized = phone[0].replace(/[^\d+]/g, '');
    return normalized.length >= 7 ? normalized : null;
  }

  private extractValueAfterLabel(text: string, label: RegExp) {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const labelIndex = lines.findIndex((line) => label.test(line));
    if (labelIndex === -1) return null;

    const sameLine = lines[labelIndex]
      .replace(label, '')
      .replace(/^\s*\d+\s*[.:)-]?\s*/, '')
      .trim();
    if (this.isUsefulRutValue(sameLine)) return this.cleanRutValue(sameLine);

    for (const line of lines.slice(labelIndex + 1, labelIndex + 6)) {
      const value = line.replace(/^\s*\d+\s*[.:)-]?\s*/, '').trim();
      if (this.isRutLabel(value)) break;
      if (this.isUsefulRutValue(value)) return this.cleanRutValue(value);
    }

    return null;
  }

  private extractTextWindow(text: string, label: RegExp, length: number) {
    const match = label.exec(text);
    if (!match) return null;
    return text.slice(match.index, match.index + length);
  }

  private isUsefulRutValue(value: string) {
    if (!value) return false;
    if (value.length < 3 || value.length > 140) return false;
    if (/^\d+$/.test(value)) return false;
    return !this.isRutLabel(value);
  }

  private isRutLabel(value: string) {
    return /\b(?:nit|dv|direcci[oó]n|tel[eé]fono|correo|municipio|departamento|actividad|responsabilidades|primer apellido|segundo apellido|primer nombre|otros nombres|raz[oó]n social)\b/i.test(
      value,
    );
  }

  private cleanRutValue(value: string) {
    return value
      .replace(/\s+/g, ' ')
      .replace(/\s*[|:;]\s*$/, '')
      .trim()
      .toUpperCase();
  }
}
