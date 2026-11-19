import { Controller, Get, Header, Param, ParseUUIDPipe, Req, Res, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { EmployeeDocumentsService } from './employee-documents.service';
@Controller('employee-portal/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.OPERATOR, Role.EMPLOYEE)
export class EmployeeDocumentsController {
  constructor(private readonly documents: EmployeeDocumentsService) {}
  @Get() @Header('Cache-Control', 'private, no-store')
  list(@Req() request: { user: { sub: string } }) { return this.documents.documents(request.user.sub); }
  @Get(':id/download')
  async download(@Req() request: { user: { sub: string } }, @Param('id', new ParseUUIDPipe()) id: string, @Res() response: Response) {
    const file = await this.documents.document(request.user.sub, id);
    response.setHeader('Cache-Control', 'private, no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Type', file.type); response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    response.send(Buffer.from(file.body));
  }
}
