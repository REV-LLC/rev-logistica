import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { EmployeeAffiliationsService } from './employee-affiliations.service';
import { MiRevMedicalService } from './mirev-medical.service';
import { MiRevPortalService } from './mirev-portal.service';

@Controller('employee-portal')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.OPERATOR, Role.EMPLOYEE)
export class MiRevPortalController {
  constructor(private readonly portal: MiRevPortalService, private readonly medical: MiRevMedicalService, private readonly affiliations: EmployeeAffiliationsService) {}
  @Get('medical-leave/today')
  @Header('Cache-Control', 'private, no-store')
  today(@Req() request: { user: { sub: string } }) { return this.medical.today(request.user.sub); }

  @Post('medical-leave')
  @UseInterceptors(FileInterceptor('selfie', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 8 } }))
  createLeave(@Req() request: { user: { sub: string } }, @Body() body: Record<string, unknown>, @UploadedFile() file?: { buffer: Buffer }) { return this.medical.create(request.user.sub, body, file?.buffer); }

  @Post('medical-leave/:id/diagnosis')
  @UseInterceptors(FileInterceptor('diagnosis', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } }))
  diagnosis(@Req() request: { user: { sub: string } }, @Param('id', new ParseUUIDPipe()) id: string, @UploadedFile() file?: { buffer: Buffer; originalname: string; mimetype: string }) { return this.medical.diagnosis(request.user.sub, id, file); }

  @Get('office/employees')
  @Roles(Role.ADMIN, Role.OFFICE)
  @Header('Cache-Control', 'private, no-store')
  office(@Req() request: { user: { sub: string } }) { return this.affiliations.employees(request.user.sub); }

  @Patch('office/employees/:id/affiliations')
  @Roles(Role.ADMIN, Role.OFFICE)
  assignAffiliations(@Req() request: { user: { sub: string } }, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: { epsId?: unknown; arlId?: unknown }) { return this.affiliations.assign(request.user.sub, id, body); }

  @Get('office/affiliation-providers')
  @Roles(Role.ADMIN, Role.OFFICE)
  @Header('Cache-Control', 'private, no-store')
  catalog(@Req() request: { user: { sub: string } }) { return this.affiliations.catalog(request.user.sub); }

  @Post('office/affiliation-providers')
  @Roles(Role.ADMIN, Role.OFFICE)
  createProvider(@Req() request: { user: { sub: string } }, @Body() body: { kind?: unknown; name?: unknown }) { return this.affiliations.create(request.user.sub, body); }

  @Patch('office/affiliation-providers/:id')
  @Roles(Role.ADMIN, Role.OFFICE)
  updateProvider(@Req() request: { user: { sub: string } }, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: { name?: unknown; active?: unknown }) { return this.affiliations.update(request.user.sub, id, body); }

  @Get('documents')
  @Header('Cache-Control', 'private, no-store')
  documents(@Req() request: { user: { sub: string } }) { return this.portal.documents(request.user.sub); }

  @Get('documents/:id/download')
  async download(@Req() request: { user: { sub: string } }, @Param('id', new ParseUUIDPipe()) id: string, @Res() response: Response) {
    const file = await this.portal.document(request.user.sub, id);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Type', file.type);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    response.send(Buffer.from(file.body));
  }
}
