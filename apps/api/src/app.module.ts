import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { PartnersModule } from './partners/partners.module';
import { CustomersModule } from './customers/customers.module';
import { DocumentsModule } from './documents/documents.module';
import { InventoryModule } from './inventory/inventory.module';
import { FilesModule } from './files/files.module';
import { PrismaModule } from './prisma/prisma.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { TransportModule } from './transport/transport.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';
import { AssetsModule } from './assets/assets.module';
import { SkusModule } from './skus/skus.module';

@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60,
        limit: 60,
      },
    ]),
    PrismaModule,
    AuthModule,
    CatalogModule,
    PartnersModule,
    CustomersModule,
    DocumentsModule,
    InventoryModule,
    FilesModule,
    WarehousesModule,
    TransportModule,
    TasksModule,
    UsersModule,
    AssetsModule,
    SkusModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
