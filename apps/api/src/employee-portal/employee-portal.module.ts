import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TransportModule } from '../transport/transport.module';
import { EmployeeActivitiesModule } from '../employee-activities/employee-activities.module';
import { EmployeePortalController } from './employee-portal.controller';

@Module({ imports: [AuthModule, TransportModule, EmployeeActivitiesModule], controllers: [EmployeePortalController] })
export class EmployeePortalModule {}
