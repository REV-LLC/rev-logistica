import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(params: { active?: boolean; role?: Role }) {
    const where: Prisma.UserWhereInput = {};

    if (params.active !== undefined) {
      where.active = params.active;
    }

    if (params.role) {
      where.role = params.role;
    }

    const users = await this.prisma.user.findMany({
      where,
      orderBy: { email: 'asc' },
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        employee: {
          select: { name: true, lastName: true, phone: true },
        },
      },
    });

    return users.map((user) => ({
      id: user.id,
      name: user.employee ? `${user.employee.name} ${user.employee.lastName}`.trim() : user.email,
      email: user.email,
      role: user.role,
      active: user.active,
      phone: user.employee?.phone ?? null,
    }));
  }
}
