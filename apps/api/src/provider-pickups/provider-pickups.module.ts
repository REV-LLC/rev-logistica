import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProviderPickupsController } from './provider-pickups.controller';
import { ProviderPickupsService } from './provider-pickups.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ProviderPickupsController],
  providers: [ProviderPickupsService],
})
export class ProviderPickupsModule {}
