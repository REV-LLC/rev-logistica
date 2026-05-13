import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BillingService } from './billing.service';

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('prefactura')
  buildPrefactura(
    @Query('customerWorksiteId') customerWorksiteId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('ivaRate') ivaRate?: string,
  ) {
    if (!customerWorksiteId?.trim()) {
      throw new BadRequestException('customerWorksiteId es obligatorio');
    }
    return this.billingService.buildPrefactura({
      customerWorksiteId: customerWorksiteId.trim(),
      from,
      to,
      ivaRate,
    });
  }
}
