import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentEmailsModule } from '../document-emails/document-emails.module';
import { DocumentMessagesModule } from '../document-messages/document-messages.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsController } from './documents.controller';
import { DocumentPdfService } from './document-pdf.service';
import { DocumentsService } from './documents.service';
import { PublicDocumentsController } from './public-documents.controller';

@Module({
  imports: [PrismaModule, AuthModule, InventoryModule, DocumentEmailsModule, DocumentMessagesModule],
  controllers: [DocumentsController, PublicDocumentsController],
  providers: [DocumentsService, DocumentPdfService],
})
export class DocumentsModule {}
