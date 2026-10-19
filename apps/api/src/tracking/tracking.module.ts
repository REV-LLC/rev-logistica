import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
@Module({ imports: [AuthModule, PrismaModule], controllers: [TrackingController], providers: [TrackingService] })
export class TrackingModule {}
