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

    return this.prisma.user.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });
  }
}
