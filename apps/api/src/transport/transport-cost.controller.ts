import { Body, Controller, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TransportCostEstimateDto } from './dto/transport-cost-estimate.dto';
import { TransportCostService } from './transport-cost.service';

@Controller('transport-cost')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class TransportCostController {
  constructor(private readonly transportCostService: TransportCostService) {}

  @Post('estimate')
  estimateCost(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: TransportCostEstimateDto,
  ) {
    return this.transportCostService.estimateCost(payload);
  }
}
