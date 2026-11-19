import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { EmployeeAffiliationsService } from './employee-affiliations.service';
@Controller('employee-affiliations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class EmployeeAffiliationsController {
  constructor(private readonly affiliations: EmployeeAffiliationsService) {}
  @Get('employees') @Header('Cache-Control', 'private, no-store')
  employees(@Req() request: { user: { sub: string } }) { return this.affiliations.employees(request.user.sub); }
  @Get('providers') @Header('Cache-Control', 'private, no-store')
  catalog(@Req() request: { user: { sub: string } }) { return this.affiliations.catalog(request.user.sub); }
  @Post('providers')
  create(@Req() request: { user: { sub: string } }, @Body() body: { kind?: unknown; name?: unknown }) { return this.affiliations.create(request.user.sub, body); }
  @Patch('providers/:id')
  update(@Req() request: { user: { sub: string } }, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: { name?: unknown; active?: unknown }) { return this.affiliations.update(request.user.sub, id, body); }
  @Patch('employees/:id')
  assign(@Req() request: { user: { sub: string } }, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: { epsId?: unknown; arlId?: unknown }) { return this.affiliations.assign(request.user.sub, id, body); }
}
