import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateProviderPickupDto } from './dto/create-provider-pickup.dto';
import { ProviderPickupsService } from './provider-pickups.service';

type JwtPayload = { sub: string; role: Role };

@Controller('provider-pickups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
export class ProviderPickupsController {
  constructor(private readonly service: ProviderPickupsService) {}

  @Get('options')
  options() {
    return this.service.listOptions();
  }

  @Get('stock')
  stock(
    @Query('providerWarehouseId', new ParseUUIDPipe())
    providerWarehouseId: string,
  ) {
    return this.service.listProviderStock(providerWarehouseId);
  }

  @Get('recent')
  recent(@Req() request: Request & { user: JwtPayload }) {
    return this.service.listRecent({
      id: request.user.sub,
      role: request.user.role,
    });
  }

  @Post()
  create(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateProviderPickupDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.service.createDraft(payload, {
      id: request.user.sub,
      role: request.user.role,
    });
  }

  @Post(':documentId/confirm')
  confirm(
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.service.confirm(documentId, {
      id: request.user.sub,
      role: request.user.role,
    });
  }
}
