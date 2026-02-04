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
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehousesService } from './warehouses.service';

@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  listWarehouses() {
    return this.warehousesService.listWarehouses();
  }

  @Get(':warehouseId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  getWarehouse(@Param('warehouseId', new ParseUUIDPipe()) warehouseId: string) {
    return this.warehousesService.getWarehouse(warehouseId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  createWarehouse(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateWarehouseDto,
  ) {
    return this.warehousesService.createWarehouse(payload);
  }

  @Patch(':warehouseId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  updateWarehouse(
    @Param('warehouseId', new ParseUUIDPipe()) warehouseId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: UpdateWarehouseDto,
  ) {
    return this.warehousesService.updateWarehouse(warehouseId, payload);
  }

  @Delete(':warehouseId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  deleteWarehouse(@Param('warehouseId', new ParseUUIDPipe()) warehouseId: string) {
    return this.warehousesService.deleteWarehouse(warehouseId);
  }
}
