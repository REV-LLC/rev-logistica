import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CommercialProfilesService } from './commercial-profiles.service';
import { CommercialProfilesController } from './commercial-profiles.controller';
@Module({
  imports: [AuthModule, PrismaModule],
  providers: [CommercialProfilesService],
  controllers: [CommercialProfilesController],
  exports: [CommercialProfilesService],
})
export class CommercialProfilesModule {}
