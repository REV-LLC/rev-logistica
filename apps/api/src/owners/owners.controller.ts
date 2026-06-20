import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { OwnersService } from './owners.service';
import type { OwnerLogoFile } from './owners.service';

const MAX_LOGO_SIZE_BYTES = 1 * 1024 * 1024;

@Controller('owners')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  @Get()
  listOwners() {
    return this.ownersService.listOwners();
  }

  @Post(':ownerId/logo')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_LOGO_SIZE_BYTES },
    }),
  )
  uploadOwnerLogo(
    @Param('ownerId', new ParseUUIDPipe()) ownerId: string,
    @UploadedFile() file?: OwnerLogoFile,
  ) {
    return this.ownersService.uploadLogo(ownerId, file);
  }
}
