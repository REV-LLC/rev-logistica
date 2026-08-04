import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationTransportService } from './notification-transport.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsappWebhookService } from './whatsapp-webhook.service';

@Module({
  imports: [PrismaModule, AuthModule, MailModule],
  controllers: [NotificationsController, WhatsappWebhookController],
  providers: [
    NotificationsService,
    NotificationTransportService,
    NotificationSchedulerService,
    WhatsappWebhookService,
  ],
  exports: [NotificationsService, NotificationTransportService],
})
export class NotificationsModule {}
