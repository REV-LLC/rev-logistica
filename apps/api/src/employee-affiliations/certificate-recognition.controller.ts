import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CertificateRecognitionService } from './certificate-recognition.service';
@Controller('employee-affiliations/certificates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class CertificateRecognitionController {
  constructor(private readonly service: CertificateRecognitionService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Req() request: { user: { sub: string } }) {
    return this.service.list(request.user.sub);
  }
  @Post(':id/review')
  review(
    @Req() request: { user: { sub: string } },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body()
    body: {
      action?: unknown;
      providerId?: unknown;
      expectedCurrentId?: unknown;
      confirmed?: unknown;
    },
  ) {
    return this.service.review(request.user.sub, id, body);
  }
}
