import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IdempotencyService } from '../common/idempotency.service';
import { AnnexBillingOverviewService } from './annex-billing-overview.service';
import { AnnexBillingRemindersService } from './annex-billing-reminders.service';
import { AnnexBillingController } from './annex-billing.controller';
import { AnnexSharingService } from './annex-sharing.service';
import { AnnexSourceService } from './annex-source.service';
import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AnnexesController } from './annexes.controller';
import { AnnexesService } from './annexes.service';
@Module({
  imports: [AuthModule, PrismaModule, MailModule, NotificationsModule, InventoryModule],
  controllers: [AnnexesController, AnnexBillingController],
  providers: [
    AnnexesService,
    AnnexBillingOverviewService,
    AnnexBillingRemindersService,
    AnnexSourceService,
    AnnexSharingService,
    IdempotencyService,
  ],
})
export class AnnexesModule {}
