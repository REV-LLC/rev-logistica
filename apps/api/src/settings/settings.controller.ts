import { Body, Controller, Get, Patch, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('branding')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.OPERATOR)
  async branding() {
    return { serviceName: await this.settings.get<string>('branding.service_name') };
  }

  @Get()
  list(@Query('category') category?: string) { return this.settings.list(category); }

  @Patch()
  update(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })) payload: UpdateSettingsDto,
    @Req() request: Request & { user: { sub: string } },
  ) { return this.settings.update(payload.values, request.user.sub); }
}
