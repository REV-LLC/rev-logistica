import {
  Controller,
  Get,
  Header,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { GetBalanceReportDto } from './dto/get-balance-report.dto';
import { BalanceReportsService } from './balance-reports.service';

@Controller('inventory/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class BalanceReportsController {
  constructor(private readonly reports: BalanceReportsService) {}

  @Get('options')
  @Header('Cache-Control', 'private, no-store')
  options() {
    return this.reports.options();
  }

  @Get('balances')
  @Header('Cache-Control', 'private, no-store')
  balances(
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    query: GetBalanceReportDto,
  ) {
    return this.reports.balances(query);
  }
}
