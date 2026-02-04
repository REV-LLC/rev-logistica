import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  listVehicles() {
    return this.vehiclesService.listVehicles();
  }

  @Post()
  createVehicle(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateVehicleDto,
  ) {
    return this.vehiclesService.createVehicle(payload);
  }

  @Patch(':vehicleId')
  updateVehicle(
    @Param('vehicleId', new ParseUUIDPipe()) vehicleId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: UpdateVehicleDto,
  ) {
    return this.vehiclesService.updateVehicle(vehicleId, payload);
  }

  @Delete(':vehicleId')
  deleteVehicle(@Param('vehicleId', new ParseUUIDPipe()) vehicleId: string) {
    return this.vehiclesService.deleteVehicle(vehicleId);
  }
}
