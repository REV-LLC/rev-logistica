import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentsService } from './documents.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  createDocument(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateDocumentDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.documentsService.createDocument({
      ...payload,
      createdBy: request.user.sub,
    });
  }

  @Get(':documentId')
  getDocument(@Param('documentId', new ParseUUIDPipe()) documentId: string) {
    return this.documentsService.getDocument(documentId);
  }
}
