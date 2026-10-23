import { BadRequestException, Injectable } from '@nestjs/common';

// Keep the ESM-only PDF engine outside Nest's CommonJS module loading.
const loadEngine = () => import('ts-pdf-edit');
type PdfDocument = import('ts-pdf-edit').PdfDocument;

@Injectable()
export class PdfEditorService {
  async withDocument<T>(bytes: Uint8Array, operation: (doc: PdfDocument) => Promise<T>): Promise<T> {
    if (!bytes || Buffer.from(bytes.subarray(0, 1024)).indexOf('%PDF-') < 0) {
      throw new BadRequestException('Selecciona un archivo PDF válido.');
    }
    const { PdfDocument } = await loadEngine();
    let doc: PdfDocument | undefined;
    try {
      doc = await PdfDocument.open(new Uint8Array(bytes));
      if (doc.isEncrypted) throw new BadRequestException('Abre una copia sin contraseña para editar este PDF.');
      return await operation(doc);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof Error && error.name === 'TextFidelityError') throw new BadRequestException(error.message);
      if (error instanceof Error && error.name === 'NotEditableError') {
        throw new BadRequestException('Este fragmento usa una fuente o estructura de texto que todavía no admite edición. Prueba con otro fragmento.');
      }
      throw new BadRequestException('No se pudo procesar este PDF. Puede estar protegido, dañado o usar un formato de contenido no compatible.');
    } finally {
      await doc?.close();
    }
  }

  pageIndex(doc: PdfDocument, value: string) {
    const page = Number(value);
    if (!Number.isInteger(page) || page < 0 || page >= doc.pageCount) {
      throw new BadRequestException('La página no existe.');
    }
    return page;
  }

  inspect(bytes: Uint8Array, pageValue: string) {
    return this.withDocument(bytes, async (doc) => {
      const page = doc.getPage(this.pageIndex(doc, pageValue));
      const { inspectText } = await import('./pdf-content-adapter.mjs');
      return { pageCount: doc.pageCount, texts: await inspectText(doc, page.index) };
    });
  }

  edit(bytes: Uint8Array, fields: Record<string, string>) {
    return this.withDocument(bytes, async (doc) => {
      const pageIndex = this.pageIndex(doc, fields.page);
      if (fields.kind !== 'text') throw new BadRequestException('Este editor está dedicado a texto.');
      const index = Number(fields.index);
      if (!Number.isInteger(index) || index < 0) throw new BadRequestException('Selecciona un fragmento de texto válido.');
      if (typeof fields.original !== 'string' || typeof fields.replacement !== 'string' || fields.replacement.length > 5000) {
        throw new BadRequestException('El texto debe tener como máximo 5000 caracteres.');
      }
      const { rewriteTextFaithfully } = await import('./pdf-content-adapter.mjs');
      const report = await rewriteTextFaithfully(doc, pageIndex, index, fields.original, fields.replacement);
      const saved = await doc.save({ mode: 'full' });
      if (saved.bytes.length > 15 * 1024 * 1024) throw new BadRequestException('El documento editado supera 15 MB.');
      return { pdf: Buffer.from(saved.bytes).toString('base64'), warnings: report.warnings, typography: report };
    });
  }
}
