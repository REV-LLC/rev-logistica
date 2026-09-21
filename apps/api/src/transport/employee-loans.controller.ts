import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { IsIn, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { EmployeeLoansService, type LoanInput } from './employee-loans.service';
class LoanEntryDto implements LoanInput {
  @IsIn(['OPENING','CHARGE','PAYMENT']) type!: LoanInput['type'];
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @IsString() @Matches(/\S/) @MaxLength(500) detail!: string;
  @Matches(/^\d{1,12}(\.\d{1,2})?$/) amount!: string;
  @IsUUID() requestId!: string;
}
@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class EmployeeLoansController {
  constructor(private readonly loans: EmployeeLoansService) {}
  @Get('loans') list() { return this.loans.list(); }
  @Get(':employeeId/loans') get(@Param('employeeId', new ParseUUIDPipe()) id: string) { return this.loans.get(id); }
  @Post(':employeeId/loans') add(@Param('employeeId', new ParseUUIDPipe()) id: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) body: LoanEntryDto,
    @Req() req: { user: { sub: string } }) { return this.loans.add(id, body, req.user.sub); }
}
