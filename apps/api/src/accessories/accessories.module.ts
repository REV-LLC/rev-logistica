import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessoriesController } from './accessories.controller';
import { AccessoriesService } from './accessories.service';
import { AccessoryDocumentsService } from './accessory-documents.service';
import { AccessoryProviderReturnsService } from './accessory-provider-returns.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AccessoriesController],
  providers: [
    AccessoriesService,
    AccessoryDocumentsService,
    AccessoryProviderReturnsService,
  ],
  exports: [AccessoryDocumentsService, AccessoryProviderReturnsService],
})
export class AccessoriesModule {}
