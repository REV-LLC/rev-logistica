import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { AccessoriesModule } from '../accessories/accessories.module';
import { BalanceReportsController } from './balance-reports.controller';
import { BalanceReportsService } from './balance-reports.service';

@Module({
  imports: [PrismaModule, AuthModule, AccessoriesModule],
  controllers: [InventoryController, BalanceReportsController],
  providers: [InventoryService, BalanceReportsService],
  exports: [InventoryService],
})
export class InventoryModule {}
