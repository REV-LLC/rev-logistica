import { Body, Controller, Get, Header, Post, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TrackingService } from './tracking.service';
import type { CreateTrackingPlace, TrackingIdentity } from './tracking.service';

@Controller('tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}
  @Get('places')
  @Header('Cache-Control', 'no-store')
  getPlaces(@Req() request: { user: TrackingIdentity }) {
    return this.tracking.getPlacesState(request.user);
  }
  @Post('places')
  @Header('Cache-Control', 'no-store')
  createPlace(@Req() request: { user: TrackingIdentity }, @Body() input: CreateTrackingPlace) {
    return this.tracking.createPlace(request.user, input);
  }
  @Post('session')
  @Header('Cache-Control', 'no-store')
  createSession(@Req() request: { user: TrackingIdentity }) {
    return this.tracking.createSession(request.user);
  }
}
