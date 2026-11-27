import { TrackingAddressStoreService } from './tracking-address-store.service';
import { TrackingLocationsService } from './tracking-locations.service';
import { TrackingMatchingService } from './tracking-matching.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TrackingController } from './tracking.controller';
import { TrackingMapService } from './tracking-map.service';
import { TrackingService } from './tracking.service';
@Module({ imports: [AuthModule, PrismaModule], controllers: [TrackingController], providers: [TrackingService, TrackingMapService, TrackingMatchingService, TrackingLocationsService, TrackingAddressStoreService], exports: [TrackingAddressStoreService] })
export class TrackingModule {}
