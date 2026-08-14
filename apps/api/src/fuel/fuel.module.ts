import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FuelController } from './fuel.controller';
import { FuelService } from './fuel.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FuelController],
  providers: [FuelService],
})
export class FuelModule {}
