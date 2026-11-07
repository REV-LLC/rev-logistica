import { Body, Controller, Get, Header, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AnnexBillingOverviewService } from './annex-billing-overview.service';
import { AnnexBillingRemindersService } from './annex-billing-reminders.service';

@Controller('annexes/billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class AnnexBillingController {
  constructor(
    private readonly billing: AnnexBillingOverviewService,
    private readonly reminders: AnnexBillingRemindersService,
  ) {}

  @Get('overview')
  @Header('Cache-Control', 'no-store')
  overview() {
    return this.billing.status();
  }

  @Get('reminders')
  @Header('Cache-Control', 'no-store')
  configuration() {
    return this.reminders.configuration();
  }

  @Put('reminders')
  configure(@Body() body: unknown) {
    return this.reminders.configure(body);
  }
}
