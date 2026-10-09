import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessoriesController } from './accessories.controller';
import { AccessoriesService } from './accessories.service';
import { AccessoryDocumentsService } from './accessory-documents.service';
import { AccessoryProviderReturnsService } from './accessory-provider-returns.service';
import { EquipmentConfigurationService } from './equipment-configuration.service';
import { EquipmentConfigurationController } from './equipment-configuration.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AccessoriesController, EquipmentConfigurationController],
  providers: [
    AccessoriesService,
    AccessoryDocumentsService,
    AccessoryProviderReturnsService,
    EquipmentConfigurationService,
  ],
  exports: [AccessoryDocumentsService, AccessoryProviderReturnsService, EquipmentConfigurationService],
})
export class AccessoriesModule {}
