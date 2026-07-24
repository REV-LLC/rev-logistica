import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();

    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.LOCAL_AUTH_BYPASS === 'true'
    ) {
      const localUser = await this.prisma.user.findFirst({
        where: { active: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true },
      });
      if (!localUser) {
        throw new UnauthorizedException('Local auth bypass requires an active user');
      }
      request['user'] = {
        sub: localUser.id,
        email: localUser.email,
        role: Role.ADMIN,
      };
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
}
