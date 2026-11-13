import { AttendanceJournalsService } from './attendance-journals.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationTransportService } from '../notifications/notification-transport.service';
import { WhatsappCloudService } from './whatsapp-cloud.service';
import { WhatsappInboxService } from './whatsapp-inbox.service';
import { WhatsappReportAiService } from './whatsapp-report-ai.service';
import { WhatsappReportRecordsService } from './whatsapp-report-records.service';
import { WhatsappReportsController } from './whatsapp-reports.controller';
import { WhatsappReportAlertsService } from './whatsapp-report-alerts.service';

@Module({
  imports: [PrismaModule, AuthModule, FilesModule, MailModule],
  controllers: [WhatsappReportsController],
  providers: [
    AttendanceJournalsService,
    WhatsappCloudService,
    WhatsappInboxService,
    WhatsappReportAiService,
    WhatsappReportRecordsService,
    WhatsappReportAlertsService,
    NotificationTransportService,
  ],
  exports: [WhatsappInboxService],
})
export class WhatsappReportsModule {}
