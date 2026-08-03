import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Role, SkuControlType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateSkuDto } from './dto/create-sku.dto';
import { UpdateSkuDto } from './dto/update-sku.dto';
import { SkusService } from './skus.service';

@Controller('skus')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class SkusController {
  constructor(private readonly skusService: SkusService) {}

  @Get()
  listSkus(
    @Query('search') search?: string,
    @Query('controlType') controlType?: SkuControlType,
    @Query('assetFamilyId') assetFamilyId?: string,
    @Query('assetSubfamilyId') assetSubfamilyId?: string,
  ) {
    if (controlType && !Object.values(SkuControlType).includes(controlType)) {
      throw new BadRequestException('Invalid controlType');
    }
    return this.skusService.listSkus({ search, controlType, assetFamilyId, assetSubfamilyId });
  }

  @Get('units')
  listUnits() {
    return this.skusService.listUnits();
  }

  @Post()
  createSku(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateSkuDto,
  ) {
    return this.skusService.createSku(payload);
  }

  @Patch(':skuId')
  updateSku(
    @Param('skuId', new ParseUUIDPipe()) skuId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: UpdateSkuDto,
  ) {
    return this.skusService.updateSku(skuId, payload);
  }

  @Delete(':skuId')
  deleteSku(@Param('skuId', new ParseUUIDPipe()) skuId: string) {
    return this.skusService.deleteSku(skuId);
  }
}
