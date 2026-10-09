import { Controller, Header, Post, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TrackingIdentity, TrackingService } from './tracking.service';

@Controller('tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}
  @Post('session')
  @Header('Cache-Control', 'no-store')
  createSession(@Req() request: { user: TrackingIdentity }) {
    return this.tracking.createSession(request.user);
  }
}
