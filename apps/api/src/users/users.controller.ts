import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  listUsers(@Query('active') active?: string, @Query('role') role?: Role) {
    let parsedActive: boolean | undefined;
    if (active !== undefined) {
      if (active === 'true') parsedActive = true;
      else if (active === 'false') parsedActive = false;
      else throw new BadRequestException('Invalid active');
    }

    if (role && !Object.values(Role).includes(role)) {
      throw new BadRequestException('Invalid role');
    }

    return this.usersService.listUsers({ active: parsedActive, role });
  }
}
