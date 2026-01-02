import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { PartnersModule } from './partners/partners.module';
import { CustomersModule } from './customers/customers.module';
import { DocumentsModule } from './documents/documents.module';
import { InventoryModule } from './inventory/inventory.module';
import { FilesModule } from './files/files.module';

@Module({
  imports: [AuthModule, CatalogModule, PartnersModule, CustomersModule, DocumentsModule, InventoryModule, FilesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
