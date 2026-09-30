import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { IsInt, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { EmployeePayrollService, type SalaryInput } from './employee-payroll.service';

class SalaryDto implements SalaryInput {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveFrom!: string;
  @Matches(/^\d{1,10}(\.\d{1,2})?$/) monthlySalary!: string;
  @IsString() @Matches(/\S/) @MaxLength(500) note!: string;
  @IsInt() @Min(0) expectedRevision!: number;
}
@Controller('employee-payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class EmployeePayrollController {
  constructor(private readonly payroll: EmployeePayrollService) {}
  @Get() list(@Query('date') date?: string) { return this.payroll.list(date); }
  @Post(':employeeId/salaries') save(
    @Param('employeeId', new ParseUUIDPipe()) id: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) input: SalaryDto,
    @Req() req: { user: { sub: string } },
  ) { return this.payroll.save(id, input, req.user.sub); }
}
