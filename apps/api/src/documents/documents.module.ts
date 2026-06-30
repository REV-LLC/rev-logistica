import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentEmailsModule } from '../document-emails/document-emails.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [PrismaModule, AuthModule, InventoryModule, DocumentEmailsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
