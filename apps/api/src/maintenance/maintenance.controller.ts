import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards, ValidationPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CompleteMaintenanceDto,
  CreateMaintenanceItemDto,
  CreateMaintenancePlanDto,
  RecordAssetHoursDto,
  UpdateMaintenanceItemDto,
  UpdateMaintenancePlanDto,
} from './dto/maintenance.dto';
import { MaintenanceService } from './maintenance.service';

interface JwtPayload { sub: string; email: string; role: Role }
const validation = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

@Controller('maintenance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.OPERATOR)
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get('operator/assets')
  @Roles(Role.OFFICE, Role.OPERATOR)
  listOperatorAssets() {
    return this.maintenance.listOwnWarehouseAssets();
  }

  @Post('plans')
  @Roles(Role.ADMIN, Role.OFFICE)
  createPlan(@Body(validation) payload: CreateMaintenancePlanDto) {
    return this.maintenance.createPlan(payload);
  }

  @Patch('plans/:planId')
  @Roles(Role.ADMIN, Role.OFFICE)
  updatePlan(
    @Param('planId', new ParseUUIDPipe()) planId: string,
    @Body(validation) payload: UpdateMaintenancePlanDto,
  ) {
    return this.maintenance.updatePlan(planId, payload);
  }

  @Delete('plans/:planId')
  @Roles(Role.ADMIN, Role.OFFICE)
  deletePlan(@Param('planId', new ParseUUIDPipe()) planId: string) {
    return this.maintenance.deletePlan(planId);
  }

  @Post('plans/:planId/items')
  @Roles(Role.ADMIN, Role.OFFICE)
  addItem(
    @Param('planId', new ParseUUIDPipe()) planId: string,
    @Body(validation) payload: CreateMaintenanceItemDto,
  ) {
    return this.maintenance.addItem(planId, payload);
  }

  @Patch('items/:itemId')
  @Roles(Role.ADMIN, Role.OFFICE)
  updateItem(
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body(validation) payload: UpdateMaintenanceItemDto,
  ) {
    return this.maintenance.updateItem(itemId, payload);
  }

  @Delete('items/:itemId')
  @Roles(Role.ADMIN, Role.OFFICE)
  deleteItem(@Param('itemId', new ParseUUIDPipe()) itemId: string) {
    return this.maintenance.deleteItem(itemId);
  }

  @Get('assets/:assetId')
  @Roles(Role.ADMIN, Role.OFFICE)
  getAssetMaintenance(@Param('assetId', new ParseUUIDPipe()) assetId: string) {
    return this.maintenance.getAssetMaintenance(assetId);
  }

  @Post('assets/:assetId/hours')
  @Roles(Role.ADMIN, Role.OFFICE, Role.OPERATOR)
  recordHours(
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Body(validation) payload: RecordAssetHoursDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.maintenance.recordAssetHours(assetId, payload, request.user.sub, request.user.role);
  }

  @Get('vehicles/:vehicleId')
  @Roles(Role.ADMIN, Role.OFFICE)
  getVehicleMaintenance(@Param('vehicleId', new ParseUUIDPipe()) vehicleId: string) {
    return this.maintenance.getVehicleMaintenance(vehicleId);
  }

  @Post('vehicles/:vehicleId/hours')
  @Roles(Role.ADMIN, Role.OFFICE)
  recordVehicleHours(
    @Param('vehicleId', new ParseUUIDPipe()) vehicleId: string,
    @Body(validation) payload: RecordAssetHoursDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.maintenance.recordVehicleHours(vehicleId, payload, request.user.sub);
  }

  @Post('items/:itemId/completions')
  @Roles(Role.ADMIN, Role.OFFICE)
  completeItem(
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body(validation) payload: CompleteMaintenanceDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.maintenance.completeItem(itemId, payload, request.user.sub);
  }

}
