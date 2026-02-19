import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role, SkuControlType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AssetsService } from './assets.service';

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
}
