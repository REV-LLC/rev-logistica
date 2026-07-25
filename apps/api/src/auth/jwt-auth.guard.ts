import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private bypassUser?: { sub: string; email: string; role: string };
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();

    if (this.localBypassEnabled()) {
      request['user'] = await this.resolveBypassUser();
      return true;
    }

    const header = request.headers.authorization;

    if (!header) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid Authorization header');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      request['user'] = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private localBypassEnabled() {
    return process.env.NODE_ENV !== 'production'
      && process.env.AUTH_BYPASS_LOCAL?.trim().toLowerCase() === 'true';
  }

  private async resolveBypassUser() {
    if (this.bypassUser) return this.bypassUser;

    const configuredEmail = process.env.AUTH_BYPASS_USER_EMAIL?.trim().toLowerCase();
    const user = configuredEmail
      ? await this.prisma.user.findFirst({
          where: { email: configuredEmail, active: true },
          select: { id: true, email: true, role: true },
        })
      : await this.prisma.user.findFirst({
          where: { active: true, role: 'ADMIN' },
          orderBy: { createdAt: 'asc' },
          select: { id: true, email: true, role: true },
        });

    if (!user) {
      throw new UnauthorizedException('Local auth bypass requires an active user');
    }

    this.bypassUser = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.bypassUser;
  }
}
