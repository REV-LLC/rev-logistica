import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentCustomerEmailsService } from './document-customer-emails.service';

@Module({
  imports: [PrismaModule, MailModule],
  providers: [DocumentCustomerEmailsService],
  exports: [DocumentCustomerEmailsService],
})
export class DocumentEmailsModule {}
