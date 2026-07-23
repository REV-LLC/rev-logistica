import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { TransportCostController } from './transport-cost.controller';
import { TransportCostService } from './transport-cost.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  controllers: [EmployeesController, VehiclesController, TransportCostController, LocationsController],
  providers: [EmployeesService, VehiclesService, TransportCostService, LocationsService],
})
export class TransportModule {}
