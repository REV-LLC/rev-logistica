import { Controller, Get, Param, Post, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { Matches } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';

class ReleaseParams {
  @Matches(/^[a-f0-9]{64}$/) releaseId!: string;
}
type AuthenticatedRequest = { user: { sub: string } };

@Controller('auth/releases')
@UseGuards(JwtAuthGuard)
export class ReleasesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':releaseId')
  async status(@Param(new ValidationPipe({ whitelist: true })) params: ReleaseParams, @Req() req: AuthenticatedRequest) {
    const entry = await this.prisma.releaseAcknowledgement.findUnique({
      where: { userId_releaseId: { userId: req.user.sub, releaseId: params.releaseId } },
      select: { acknowledgedAt: true },
    });
    return { acknowledged: Boolean(entry) };
  }

  @Post(':releaseId/acknowledge')
  async acknowledge(@Param(new ValidationPipe({ whitelist: true })) params: ReleaseParams, @Req() req: AuthenticatedRequest) {
    await this.prisma.releaseAcknowledgement.upsert({
      where: { userId_releaseId: { userId: req.user.sub, releaseId: params.releaseId } },
      create: { userId: req.user.sub, releaseId: params.releaseId },
      update: {},
    });
    return { acknowledged: true };
  }
}
