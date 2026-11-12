import { Module } from '@nestjs/common';
import { WorksiteLossController } from './worksite-loss.controller';
import { WorksiteLossService } from './worksite-loss.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { AccessoriesModule } from '../accessories/accessories.module';
import { BalanceReportsController } from './balance-reports.controller';
import { BalanceReportsService } from './balance-reports.service';

@Module({
  imports: [PrismaModule, AuthModule, AccessoriesModule],
  controllers: [InventoryController, BalanceReportsController, WorksiteLossController],
  providers: [InventoryService, BalanceReportsService, WorksiteLossService],
  exports: [InventoryService, WorksiteLossService],
})
export class InventoryModule {}
