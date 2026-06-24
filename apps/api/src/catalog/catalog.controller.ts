import { Body, Controller, Get, Param, Put, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CatalogService } from './catalog.service';
import { UpdateCatalogOptionsDto } from './dto/update-catalog-options.dto';

@Controller('catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('options')
  @Roles(Role.ADMIN, Role.OFFICE)
  listOptions(@Query('groupKey') groupKey?: string) {
    return this.catalogService.listOptions(groupKey);
  }

  @Put('options/:groupKey')
  @Roles(Role.ADMIN)
  replaceOptions(
    @Param('groupKey') groupKey: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: UpdateCatalogOptionsDto,
  ) {
    return this.catalogService.replaceOptions(groupKey, payload);
  }
}
