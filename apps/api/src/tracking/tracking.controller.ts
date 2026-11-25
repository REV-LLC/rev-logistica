import { Body, Controller, Get, Header, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
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
  @Get('events')
  async events(@Req() request: { user: TrackingIdentity }, @Res() response: Response) {
    await this.tracking.assertAccess(request.user);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-store, no-transform');
    response.setHeader('X-Accel-Buffering', 'no');
    const send = (event: Record<string, unknown>) => { if (!response.destroyed) response.write(`event: telemetry\ndata: ${JSON.stringify(event)}\n\n`); };
    const dispose = this.tracking.subscribeLive(send);
    response.flushHeaders();
    let checking = false;
    const timer = setInterval(async () => {
      if (checking) return; checking = true;
      try { await this.tracking.assertAccess(request.user); response.write(': keepalive\n\n'); }
      catch { send({denied:true}); response.end(); }
      finally { checking = false; }
    }, 15_000);
    response.on('close', () => { clearInterval(timer); dispose(); });
  }
  @Get('road-match')
  @Header('Cache-Control', 'no-store')
  matchRoads(@Req() request: { user: TrackingIdentity }, @Query('deviceId') id: string, @Query('from') from: string, @Query('to') to: string) {
    return this.tracking.matchRoads(request.user, id, from, to);
  }
  @Get('fleet')
  @Header('Cache-Control', 'no-store')
  getFleet(@Req() request: { user: TrackingIdentity }) {
    return this.tracking.getFleet(request.user);
  }
  @Get('history')
  @Header('Cache-Control', 'no-store')
  getHistory(@Req() request: { user: TrackingIdentity }, @Query('deviceId') id: string, @Query('from') from: string, @Query('to') to: string) {
    return this.tracking.getHistory(request.user, id, from, to);
  }
  @Get('map-config')
  @Header('Cache-Control', 'no-store')
  mapConfiguration(@Req() request: { user: TrackingIdentity }) {
    return this.tracking.mapConfiguration(request.user);
  }
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
