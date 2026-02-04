import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [WarehousesController],
  providers: [WarehousesService],
})
export class WarehousesModule {}
