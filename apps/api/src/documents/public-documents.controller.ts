import { Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DocumentsService } from './documents.service';

@Controller('public/documents')
export class PublicDocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get(':shareToken')
  getSharedDocument(
    @Param('shareToken', new ParseUUIDPipe()) shareToken: string,
  ) {
    return this.documentsService.getSharedDocument(shareToken);
  }

  @Get(':shareToken/pdf')
  async getSharedDocumentPdf(
    @Param('shareToken', new ParseUUIDPipe()) shareToken: string,
    @Res() response: Response,
  ) {
    const pdf = await this.documentsService.getSharedDocumentPdf(shareToken);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(pdf.fileName)}"`,
    );
    response.setHeader('Content-Length', String(pdf.buffer.length));
    response.setHeader('Cache-Control', 'public, max-age=300');
    response.send(pdf.buffer);
  }
}
