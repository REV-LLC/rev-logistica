import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        employee: {
          select: { name: true, lastName: true },
        },
      },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.assertPassword(password, user.passwordHash);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      user: this.mapUser(user),
    };
  }

  private async assertPassword(password: string, passwordHash: string) {
    const isValid = await bcrypt.compare(password, passwordHash);

    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  private mapUser(user: {
    id: string;
    email: string;
    role: Role;
    employee?: { name: string; lastName: string } | null;
  }) {
    const employeeName = user.employee ? `${user.employee.name} ${user.employee.lastName}`.trim() : null;
    return {
      id: user.id,
      name: employeeName ?? user.email,
      email: user.email,
      role: user.role,
    };
  }
}
