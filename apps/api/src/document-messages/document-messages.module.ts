import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentCustomerMessagesService } from './document-customer-messages.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [DocumentCustomerMessagesService],
  exports: [DocumentCustomerMessagesService],
})
export class DocumentMessagesModule {}
