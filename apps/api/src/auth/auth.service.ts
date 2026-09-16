import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  identifier: string;
  email: string;
  name?: string;
  role: Role;
  warehouseId?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(identifier: string, password: string) {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedIdentifier },
      include: {
        warehouse: true,
        employee: {
          select: { name: true, lastName: true },
        },
      },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.assertPassword(password, user.passwordHash);
    if (user.role === Role.WAREHOUSE_TABLET && !user.warehouse?.active) {
      throw new UnauthorizedException('Este perfil no tiene una bodega activa asignada. Contacta a administración.');
    }

    const employeeName = user.employee
      ? `${user.employee.name} ${user.employee.lastName}`.trim()
      : '';
    const payload: JwtPayload = {
      sub: user.id,
      identifier: user.email,
      email: user.email,
      ...(employeeName ? { name: employeeName } : {}),
      role: user.role,
      ...(user.warehouseId ? { warehouseId: user.warehouseId } : {}),
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
      identifier: user.email,
      email: user.email,
      role: user.role,
    };
  }
}
