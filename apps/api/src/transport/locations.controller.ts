import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { LocationsService } from './locations.service';

@Controller('locations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get('departments')
  listDepartments() {
    return this.locationsService.listDepartments();
  }

  @Get('cities')
  listCities(@Query('state') stateIso2: string) {
    return this.locationsService.listCities(stateIso2);
  }
}
