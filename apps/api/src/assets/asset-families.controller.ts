import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
