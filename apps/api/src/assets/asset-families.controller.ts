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
import { AssetsService } from './assets.service';
import { CreateAssetSubfamilyDto } from './dto/create-asset-subfamily.dto';
import { UpsertAssetFamilyComponentDto } from './dto/upsert-asset-family-component.dto';

@Controller('asset-families')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class AssetFamiliesController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  listAssetFamilies(@Query('controlType') controlType?: SkuControlType) {
    if (controlType && !Object.values(SkuControlType).includes(controlType)) {
      throw new BadRequestException('Invalid controlType');
    }
    return this.assetsService.listAssetFamilies({ controlType });
  }

  @Get('components')
  listComponentRules() {
    return this.assetsService.listAssetFamilyComponents();
  }

  @Post(':assetFamilyId/components')
  @Roles(Role.ADMIN)
  createComponentRule(
    @Param('assetFamilyId', new ParseUUIDPipe()) assetFamilyId: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    payload: UpsertAssetFamilyComponentDto,
  ) {
    return this.assetsService.createAssetFamilyComponent(assetFamilyId, payload);
  }

  @Patch('components/:componentRuleId')
  @Roles(Role.ADMIN)
  updateComponentRule(
    @Param('componentRuleId', new ParseUUIDPipe()) componentRuleId: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    payload: UpsertAssetFamilyComponentDto,
  ) {
    return this.assetsService.updateAssetFamilyComponent(componentRuleId, payload);
  }

  @Delete('components/:componentRuleId')
  @Roles(Role.ADMIN)
  deleteComponentRule(
    @Param('componentRuleId', new ParseUUIDPipe()) componentRuleId: string,
  ) {
    return this.assetsService.deleteAssetFamilyComponent(componentRuleId);
  }

  @Post(':assetFamilyId/subfamilies')
  createAssetSubfamily(
    @Param('assetFamilyId', new ParseUUIDPipe()) assetFamilyId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateAssetSubfamilyDto,
  ) {
    return this.assetsService.createAssetSubfamily(assetFamilyId, payload);
  }
}
