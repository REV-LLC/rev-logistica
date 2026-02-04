import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
