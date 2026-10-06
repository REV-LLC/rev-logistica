import { CommercialProfilesModule } from './commercial-profiles/commercial-profiles.module';
import { AnnexesModule } from './annexes/annexes.module';
import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
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
import { OwnersModule } from './owners/owners.module';
import { BackupsModule } from './backups/backups.module';
import { UppercaseBodyMiddleware } from './common/middleware/uppercase-body.middleware';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { SettingsModule } from './settings/settings.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MobilityGuidesModule } from './mobility-guides/mobility-guides.module';
import { ProviderReturnsModule } from './provider-returns/provider-returns.module';
import { ProviderPickupsModule } from './provider-pickups/provider-pickups.module';
import { FuelModule } from './fuel/fuel.module';
import { AccessoriesModule } from './accessories/accessories.module';
import { EmployeeActivitiesModule } from './employee-activities/employee-activities.module';
import { OfficeAssistantModule } from './office-assistant/office-assistant.module';
import { BulkKitsModule } from './bulk-kits/bulk-kits.module';

@Module({
  imports: [
    BulkKitsModule,
    CommercialProfilesModule,
    CacheModule.register({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60,
        limit: 60,
      },
    ]),
    PrismaModule,
    SettingsModule,
    AuthModule,
    AnnexesModule,
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
    OwnersModule,
    BackupsModule,
    MaintenanceModule,
    NotificationsModule,
    MobilityGuidesModule,
    ProviderReturnsModule,
    ProviderPickupsModule,
    FuelModule,
    AccessoriesModule,
    OfficeAssistantModule,
    EmployeeActivitiesModule,
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(UppercaseBodyMiddleware)
      .exclude(
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'commercial-profiles', method: RequestMethod.PUT },
        { path: 'annexes/preview', method: RequestMethod.POST },
        { path: 'annexes/select-mode', method: RequestMethod.POST },
        { path: 'annexes/drafts', method: RequestMethod.POST },
        { path: 'office-assistant/chat', method: RequestMethod.POST },
        { path: 'webhooks/whatsapp', method: RequestMethod.GET },
        { path: 'webhooks/whatsapp', method: RequestMethod.POST },
      )
      .forRoutes('*');
  }
}
