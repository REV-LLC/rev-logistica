import { Body, Controller, Get, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateAssetFuelingDto } from './dto/create-asset-fueling.dto';
import { CreateVehicleFuelingDto } from './dto/create-vehicle-fueling.dto';
import { CreateWorksiteFuelReceiptDto } from './dto/create-worksite-fuel-receipt.dto';
import { FuelService } from './fuel.service';

type AuthenticatedRequest = Request & { user: { sub: string } };
const fuelRoles = [Role.ADMIN, Role.DRIVER, Role.OPERATOR];
const strictValidation = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@Controller('fuel')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...fuelRoles)
export class FuelController {
  constructor(private readonly fuelService: FuelService) {}

  @Get('dashboard')
  getDashboard() {
    return this.fuelService.getDashboard();
  }

  @Get('options')
  getOptions() {
    return this.fuelService.getOptions();
  }

  @Post('worksite-receipts')
  createWorksiteReceipt(@Body(strictValidation) body: CreateWorksiteFuelReceiptDto, @Req() req: AuthenticatedRequest) {
    return this.fuelService.createWorksiteReceipt(body, req.user.sub);
  }

  @Post('asset-fillings')
  createAssetFueling(@Body(strictValidation) body: CreateAssetFuelingDto, @Req() req: AuthenticatedRequest) {
    return this.fuelService.createAssetFueling(body, req.user.sub);
  }

  @Post('vehicle-fillings')
  createVehicleFueling(@Body(strictValidation) body: CreateVehicleFuelingDto, @Req() req: AuthenticatedRequest) {
    return this.fuelService.createVehicleFueling(body, req.user.sub);
  }
}
