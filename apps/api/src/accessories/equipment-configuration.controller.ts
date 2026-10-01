import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { EquipmentConfigurationDto } from './dto/equipment-configuration.dto';
import { EquipmentConfigurationService } from './equipment-configuration.service';

@Controller('equipment-configurations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class EquipmentConfigurationController {
  constructor(private readonly configurations: EquipmentConfigurationService) {}
  @Get('return-origins')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.WAREHOUSE_TABLET)
  returnOrigins(@Query('customerWorksiteId', ParseUUIDPipe) customerWorksiteId: string) {
    return this.configurations.returnOrigins(customerWorksiteId);
  }
  @Get('assets/:id/motor-history') motorHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.configurations.motorHistory(id);
  }
  @Get('assets/:id/return-parts')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.WAREHOUSE_TABLET)
  returnParts(@Param('id', ParseUUIDPipe) id: string, @Query('customerWorksiteId', ParseUUIDPipe) customerWorksiteId: string) {
    return this.configurations.returnParts(id, customerWorksiteId);
  }
  @Get('asset-candidates') assetCandidates(
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
  ) {
    return this.configurations.assetCandidates(search, page);
  }
  @Get('assets/:id')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.WAREHOUSE_TABLET)
  getAsset(@Param('id', ParseUUIDPipe) id: string) {
    return this.configurations.get({ assetId: id });
  }
  @Get('accessories/:id')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.WAREHOUSE_TABLET)
  getAccessory(@Param('id', ParseUUIDPipe) id: string) {
    return this.configurations.get({ accessoryId: id });
  }
  @Put('assets/:id') saveAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: EquipmentConfigurationDto,
    @Req() request: { user: { sub: string } },
  ) {
    return this.configurations.save({ assetId: id }, dto, request.user.sub);
  }
  @Put('accessories/:id') saveAccessory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: EquipmentConfigurationDto,
    @Req() request: { user: { sub: string } },
  ) {
    return this.configurations.save({ accessoryId: id }, dto, request.user.sub);
  }
}
