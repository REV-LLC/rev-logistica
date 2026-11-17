import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmployeesService } from '../transport/employees.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceStorageService } from './attendance-storage.service';
import { FaceClientService } from './face-client.service';
@Module({
  imports: [AuthModule],
  controllers: [AttendanceController],
  exports: [AttendanceService],
  providers: [
    AttendanceService,
    AttendanceStorageService,
    FaceClientService,
    EmployeesService,
  ],
})
export class AttendanceModule {}
