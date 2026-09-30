import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LegacyEquipmentOriginsService } from './legacy-equipment-origins.service';

export class ReviewLegacyOriginDto {
  @IsUUID() sourceLedgerId: string;
  @IsOptional() @IsUUID() parentOriginId?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveFrom: string;
  @Matches(/^[a-f0-9]{64}$/) fingerprint: string;
  @IsString() @Length(10, 1000) note: string;
}
@Controller('legacy-equipment-origins')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class LegacyEquipmentOriginsController {
  constructor(private readonly origins: LegacyEquipmentOriginsService) {}
  @Get('active')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.WAREHOUSE_TABLET)
  active(@Query('customerWorksiteId', ParseUUIDPipe) siteId: string) { return this.origins.active(siteId); }
  @Get('inspect/:sourceLedgerId')
  inspect(@Param('sourceLedgerId', ParseUUIDPipe) id: string, @Query('effectiveFrom') effectiveFrom = '2026-10-01') {
    return this.origins.inspect(id, effectiveFrom);
  }
  @Post('review')
  review(@Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) input: ReviewLegacyOriginDto,
    @Req() request: { user: { sub: string } }) { return this.origins.review(input, request.user.sub); }
}
