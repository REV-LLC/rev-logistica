import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessoriesController } from './accessories.controller';
import { AccessoriesService } from './accessories.service';
import { AccessoryDocumentsService } from './accessory-documents.service';
import { AccessoryProviderReturnsService } from './accessory-provider-returns.service';
import { EquipmentConfigurationService } from './equipment-configuration.service';
import { EquipmentConfigurationController } from './equipment-configuration.controller';
import { EquipmentMotorsController } from './equipment-motors.controller';
import { EquipmentMotorsService } from './equipment-motors.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AccessoriesController, EquipmentConfigurationController, EquipmentMotorsController],
  providers: [
    AccessoriesService,
    AccessoryDocumentsService,
    AccessoryProviderReturnsService,
    EquipmentConfigurationService,
    EquipmentMotorsService,
  ],
  exports: [AccessoryDocumentsService, AccessoryProviderReturnsService, EquipmentConfigurationService],
})
export class AccessoriesModule {}
