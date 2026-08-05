import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentPdfService } from '../documents/document-pdf.service';
import { DocumentPdfSnapshotService } from '../documents/document-pdf-snapshot.service';
import { DocumentCustomerEmailsService } from './document-customer-emails.service';

@Module({
  imports: [PrismaModule, MailModule],
  providers: [
    DocumentCustomerEmailsService,
    DocumentPdfService,
    DocumentPdfSnapshotService,
  ],
  exports: [
    DocumentCustomerEmailsService,
    DocumentPdfService,
    DocumentPdfSnapshotService,
  ],
})
export class DocumentEmailsModule {}
