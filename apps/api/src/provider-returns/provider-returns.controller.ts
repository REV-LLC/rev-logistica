import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateProviderReturnDto } from './dto/create-provider-return.dto';
import { ProviderReturnsService } from './provider-returns.service';

type JwtPayload = { sub: string; role: Role };

@Controller('provider-returns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
export class ProviderReturnsController {
  constructor(private readonly service: ProviderReturnsService) {}

  @Get('pending')
  pending(@Req() request: Request & { user: JwtPayload }) {
    return this.service.listPending({ id: request.user.sub, role: request.user.role });
  }

  @Post()
  create(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })) payload: CreateProviderReturnDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.service.createDraft(payload, { id: request.user.sub, role: request.user.role });
  }

  @Post(':receiptId/confirm')
  confirm(
    @Param('receiptId', new ParseUUIDPipe()) receiptId: string,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.service.confirm(receiptId, { id: request.user.sub, role: request.user.role });
  }
}
