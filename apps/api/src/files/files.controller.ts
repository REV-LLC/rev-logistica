import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { FilesService, UploadedBusinessFile } from './files.service';

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 12;

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

@Controller('files')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get('categories/:entityType')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.OPERATOR)
  getCategories(@Param('entityType') entityType: string) {
    return this.filesService.getCategories(entityType);
  }

  @Get('provider-warehouses/:providerWarehouseId/remissions')
  @Roles(Role.ADMIN, Role.OFFICE)
  listProviderRemissions(
    @Param('providerWarehouseId', new ParseUUIDPipe()) providerWarehouseId: string,
  ) {
    return this.filesService.listProviderRemissions(providerWarehouseId);
  }

  @Get('entities/:entityType/:entityId')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.OPERATOR)
  listEntityFiles(
    @Param('entityType') entityType: string,
    @Param('entityId', new ParseUUIDPipe()) entityId: string,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.filesService.listEntityFiles(entityType, entityId, {
      id: request.user.sub,
      role: request.user.role,
    });
  }

  @Post('entities/:entityType/:entityId')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.OPERATOR)
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES_PER_UPLOAD, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_FILES_PER_UPLOAD },
    }),
  )
  uploadEntityFiles(
    @Param('entityType') entityType: string,
    @Param('entityId', new ParseUUIDPipe()) entityId: string,
    @Body() body: {
      category?: string;
      displayName?: string;
      expiresAt?: string;
      providerWarehouseId?: string;
    },
    @UploadedFiles() files: UploadedBusinessFile[] | undefined,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.filesService.uploadEntityFiles(entityType, entityId, files, body, {
      id: request.user.sub,
      role: request.user.role,
    });
  }

  @Post('documents/:documentId/evidence')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.OPERATOR)
  @UseInterceptors(
    FilesInterceptor('photos', MAX_FILES_PER_UPLOAD, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_FILES_PER_UPLOAD },
    }),
  )
  uploadDocumentEvidence(
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @UploadedFiles() files: UploadedBusinessFile[] | undefined,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.filesService.uploadDocumentEvidence(documentId, files, {
      id: request.user.sub,
      role: request.user.role,
    });
  }

  @Get(':fileId/download')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.OPERATOR)
  async downloadFile(
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
    @Req() request: Request & { user: JwtPayload },
    @Res() response: Response,
  ) {
    const file = await this.filesService.getFileDownload(fileId, {
      id: request.user.sub,
      role: request.user.role,
    });
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
    response.setHeader('Cache-Control', 'private, max-age=300');
    if (file.contentLength !== undefined) {
      response.setHeader('Content-Length', String(file.contentLength));
    }
    if (file.etag) {
      response.setHeader('ETag', file.etag);
    }
    file.body.pipe(response);
  }

  @Delete(':fileId')
  @Roles(Role.ADMIN, Role.OFFICE)
  deleteFile(
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.filesService.deleteFile(fileId, {
      id: request.user.sub,
      role: request.user.role,
    });
  }
}
