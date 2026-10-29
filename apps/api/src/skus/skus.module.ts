import { InventoryModule } from '../inventory/inventory.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SkusController } from './skus.controller';
import { SkusService } from './skus.service';
import { SkuPricingService } from './sku-pricing.service';

@Module({
  imports: [PrismaModule, AuthModule, InventoryModule],
  controllers: [SkusController],
  providers: [SkusService, SkuPricingService],
})
export class SkusModule {}
