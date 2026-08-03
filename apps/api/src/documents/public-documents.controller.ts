import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
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
}
