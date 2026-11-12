import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { WorksiteLossService } from './worksite-loss.service';

@Controller('inventory/worksite-losses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class WorksiteLossController {
  constructor(private readonly losses: WorksiteLossService) {}
  @Post()
  create(@Body() input: unknown, @Req() request: { user: { sub: string } }) {
    return this.losses.create(input, request.user.sub);
  }
  @Get(':siteId')
  list(@Param('siteId', new ParseUUIDPipe()) siteId: string, @Query('skuId') skuId?: string) {
    return this.losses.list(siteId, skuId);
  }
}
