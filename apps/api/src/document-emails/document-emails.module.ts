import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentPdfService } from '../documents/document-pdf.service';
import { DocumentCustomerEmailsService } from './document-customer-emails.service';

@Module({
  imports: [PrismaModule, MailModule],
  providers: [DocumentCustomerEmailsService, DocumentPdfService],
  exports: [DocumentCustomerEmailsService, DocumentPdfService],
})
export class DocumentEmailsModule {}
