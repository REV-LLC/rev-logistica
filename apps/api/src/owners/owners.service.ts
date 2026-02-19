import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OwnersService {
  constructor(private readonly prisma: PrismaService) {}

  listOwners() {
    return this.prisma.owner.findMany({
      select: {
        id: true,
        name: true,
        active: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }
}
