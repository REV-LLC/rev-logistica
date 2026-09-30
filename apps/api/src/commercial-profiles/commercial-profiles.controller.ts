import {
  Body,
  Controller,
  Get,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CommercialProfilesService } from './commercial-profiles.service';
@Controller('commercial-profiles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class CommercialProfilesController {
  constructor(private readonly profiles: CommercialProfilesService) {}
  @Get() get(@Query('scopeType') type: string, @Query('scopeId') id: string) {
    return this.profiles.get(type, id);
  }
  @Put() save(@Body() body: unknown, @Req() req: { user: { sub: string } }) {
    return this.profiles.save(body, req.user.sub);
  }
}
