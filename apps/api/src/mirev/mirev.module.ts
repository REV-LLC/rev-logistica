import { MiRevMedicalService } from './mirev-medical.service';
import { AttendanceStorageService } from '../attendance/attendance-storage.service';
import { MiRevPortalService } from './mirev-portal.service';
import { MiRevPortalController } from './mirev-portal.controller';
import { Module, Controller, Get, Param, ParseUUIDPipe, Query, Req, Res, UseGuards, ForbiddenException, Header, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AttendanceService } from '../attendance/attendance.service';
import { AttendanceModule } from '../attendance/attendance.module';
import { EmployeePortalController } from '../employee-portal/employee-portal.controller';
import { EmployeesService } from '../transport/employees.service';
import { EmployeeLoansService } from '../transport/employee-loans.service';
import { EmployeeActivitiesService } from '../employee-activities/employee-activities.service';
import { SettingsService } from '../settings/settings.service';

@Controller()
class MiRevHealthController {
  @Get('health') health() { return { ok: true, service: 'mirev-api' }; }
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.OPERATOR, Role.EMPLOYEE)
class MiRevPersonalController {
  constructor(private readonly employees: EmployeesService, private readonly settings: SettingsService, private readonly attendance: AttendanceService) {}

  @Get('attendance/face-enrollment')
  @Header('Cache-Control', 'private, no-store')
  enrollment(@Req() request: { user: { sub: string; role: Role } }) { return this.attendance.enrollmentStatus(request.user); }

  @Post('attendance/face-enrollment')
  @UseInterceptors(FileInterceptor('selfie', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } }))
  enroll(@Req() request: { user: { sub: string; role: Role } }, @UploadedFile() selfie?: { buffer: Buffer }) {
    return this.attendance.enrollFace(request.user, selfie?.buffer);
  }

  @Get('settings/loan-display')
  @Header('Cache-Control', 'private, no-store')
  async loanDisplay() { return { paymentsPositive: await this.settings.get<boolean>('loans.payments_positive') }; }

  @Get('employees/:id/photo')
  async photo(@Param('id', new ParseUUIDPipe()) id: string, @Query('variant') variant: string | undefined, @Req() request: { user: { sub: string } }, @Res() response: Response) {
    if (await this.employees.ownEmployeeId(request.user.sub) !== id) throw new ForbiddenException('Solo puedes consultar tu propia foto.');
    const photo = await this.employees.getEmployeePhoto(id, variant === 'thumbnail');
    response.setHeader('Content-Type', photo.contentType);
    response.setHeader('Cache-Control', 'private, no-store');
    photo.body.pipe(response);
  }
}

// Intentionally no scheduler, WhatsApp consumer, migrations or business modules.
@Module({
  imports: [CacheModule.register({ isGlobal: true }), ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 120 }]), PrismaModule, AuthModule, AttendanceModule],
  controllers: [MiRevHealthController, MiRevPersonalController, EmployeePortalController, MiRevPortalController],
  providers: [ MiRevMedicalService, AttendanceStorageService, MiRevPortalService, EmployeesService, EmployeeLoansService, EmployeeActivitiesService, SettingsService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class MiRevModule {}
