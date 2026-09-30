import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccessoriesModule } from '../accessories/accessories.module';
import { DocumentEmailsModule } from '../document-emails/document-emails.module';
import { DocumentMessagesModule } from '../document-messages/document-messages.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { PublicDocumentsController } from './public-documents.controller';
import { LegacyEquipmentOriginsController } from './legacy-equipment-origins.controller';
import { LegacyEquipmentOriginsService } from './legacy-equipment-origins.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AccessoriesModule,
    InventoryModule,
    DocumentEmailsModule,
    DocumentMessagesModule,
  ],
  controllers: [DocumentsController, PublicDocumentsController, LegacyEquipmentOriginsController],
  providers: [DocumentsService, LegacyEquipmentOriginsService],
})
export class DocumentsModule {}
