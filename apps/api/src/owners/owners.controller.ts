import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { OwnersService } from './owners.service';

@Controller('owners')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  @Get()
  listOwners() {
    return this.ownersService.listOwners();
  }
}
