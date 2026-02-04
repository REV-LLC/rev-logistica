import {
  Body,
  Controller,
  Get,
  Query,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateInventoryAdjustDto } from './dto/create-inventory-adjust.dto';
import { CreateProviderReceiptDto } from './dto/create-provider-receipt.dto';
import { CreateInventoryInDto } from './dto/create-inventory-in.dto';
import { CreateInventoryOnSiteDto } from './dto/create-inventory-on-site.dto';
import { CreateInventoryOutDto } from './dto/create-inventory-out.dto';
import { GetInventoryLedgerDto } from './dto/get-inventory-ledger.dto';
import { GetInventorySummaryDto } from './dto/get-inventory-summary.dto';
import { InventoryService } from './inventory.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

@Controller('inventory')
@Throttle({ default: { limit: 120, ttl: 60 } })
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('adjust')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  adjustInventory(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateInventoryAdjustDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.inventoryService.adjustInventory(payload, request.user.sub);
  }

  @Post('provider-receipts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  createProviderReceipts(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateProviderReceiptDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.inventoryService.createProviderReceipts(payload, request.user.sub);
  }

  @Post('out')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  moveOut(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateInventoryOutDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.inventoryService.moveOut(payload, request.user.sub);
  }

  @Post('on-site')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  moveOnSite(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateInventoryOnSiteDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.inventoryService.moveOnSite(payload, request.user.sub);
  }

  @Post('in')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  moveIn(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateInventoryInDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.inventoryService.moveIn(payload, request.user.sub);
  }

  @Get('warehouse/:warehouseId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  getWarehouseInventory(@Param('warehouseId', new ParseUUIDPipe()) warehouseId: string) {
    return this.inventoryService.getWarehouseInventory(warehouseId);
  }

  @Get('on-site/:customerWorksiteId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  getOnSiteInventory(
    @Param('customerWorksiteId', new ParseUUIDPipe()) customerWorksiteId: string,
  ) {
    return this.inventoryService.getOnSiteInventory(customerWorksiteId);
  }

  @Get('ledger')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  getLedger(
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    query: GetInventoryLedgerDto,
  ) {
    return this.inventoryService.getLedger(query);
  }

  @Get('summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  getSummary(
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    query: GetInventorySummaryDto,
  ) {
    return this.inventoryService.getSummary(query);
  }
}
