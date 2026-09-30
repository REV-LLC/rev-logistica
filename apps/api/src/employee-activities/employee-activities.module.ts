import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EmployeeActivitiesController } from './employee-activities.controller';
import { EmployeeActivitiesService } from './employee-activities.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [EmployeeActivitiesController],
  providers: [EmployeeActivitiesService],
})
export class EmployeeActivitiesModule {}
