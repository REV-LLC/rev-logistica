import { Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Header, Injectable, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards, ValidationPipe } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeePayrollService } from './employee-payroll.service';
import type { SalaryInput, PreviewInput, ReceiptInput } from './employee-payroll.service';

export class SalaryDto implements SalaryInput {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveFrom!: string;
  @Matches(/^\d{1,10}(\.\d{1,2})?$/) monthlySalary!: string;
  @Matches(/^\d{1,10}(\.\d{1,2})?$/) transportAllowance!: string;
  @IsString() @Matches(/\S/) @MaxLength(500) note!: string;
  @IsInt() @Min(0) expectedRevision!: number;
  @IsOptional() @IsIn(['STANDARD', 'REVIEW_REQUIRED']) regime?: 'STANDARD' | 'REVIEW_REQUIRED';
}
export class PreviewDto implements PreviewInput {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) from!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) to!: string;
  @IsInt() @Min(1) @Max(15) days!: number;
  @IsOptional() @IsString() @MaxLength(1000) observations?: string;
}
export class ReceiptDto extends PreviewDto implements ReceiptInput {
  @IsInt() @Min(1) expectedSalaryRevision!: number;
  @IsUUID('4') idempotencyKey!: string;
}
@Injectable()
export class PayrollAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ user: { sub: string } }>();
    const user = await this.prisma.user.findUnique({ where: { id: request.user.sub }, select: { active: true, role: true } });
    if (!user?.active || !([Role.ADMIN, Role.OFFICE] as Role[]).includes(user.role)) throw new ForbiddenException('No tienes permiso vigente para consultar nómina');
    return true;
  }
}
const validation = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
@Controller('employee-payroll')
@UseGuards(JwtAuthGuard, RolesGuard, PayrollAccessGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class EmployeePayrollController {
  constructor(private readonly payroll: EmployeePayrollService) {}
  @Header('Cache-Control', 'private, no-store')
  @Get() list(@Query('date') date?: string) { return this.payroll.list(date); }
  @Header('Cache-Control', 'private, no-store')
  @Get('period') period(@Query('from') from: string, @Query('to') to: string) { return this.payroll.period(from, to); }
  @Header('Cache-Control', 'private, no-store')
  @Get('receipts/:receiptId/pdf') async pdf(@Param('receiptId', new ParseUUIDPipe()) id: string, @Res() response: Response) {
    const buffer = await this.payroll.receiptPdf(id);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="nomina-${id}.pdf"`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(buffer);
  }
  @Header('Cache-Control', 'private, no-store')
  @Post(':employeeId/salaries') save(@Param('employeeId', new ParseUUIDPipe()) id: string, @Body(validation) input: SalaryDto, @Req() req: { user: { sub: string } }) { return this.payroll.save(id, input, req.user.sub); }
  @Header('Cache-Control', 'private, no-store')
  @Post(':employeeId/preview') preview(@Param('employeeId', new ParseUUIDPipe()) id: string, @Body(validation) input: PreviewDto) { return this.payroll.preview(id, input); }
  @Header('Cache-Control', 'private, no-store')
  @Post(':employeeId/receipts') issue(@Param('employeeId', new ParseUUIDPipe()) id: string, @Body(validation) input: ReceiptDto, @Req() req: { user: { sub: string } }) { return this.payroll.issue(id, input, req.user.sub); }
  @Header('Cache-Control', 'private, no-store')
  @Get(':employeeId/receipts') receipts(@Param('employeeId', new ParseUUIDPipe()) id: string, @Query('from') from?: string, @Query('to') to?: string) { return this.payroll.receipts(id, from, to); }
}
